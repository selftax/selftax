import { create } from 'zustand';
import {
  calculateForm1040,
  calculateForm540,
  determineRequiredForms,
  mapW2Fields,
  aggregateW2s,
  buildTaxReturn,
  toFreeFileFieldMap,
} from '@selftax/core';
import type {
  Form1040Input,
  Form1040Output,
  Form540Output,
  FilingStatus,
  TaxFormType,
  TaxSituation,
  TaxReturnData,
  FormKey,
} from '@selftax/core';
import { buildForm1040Input } from '../services/taxDataBuilder';
import type { TaxProfileData } from '../services/taxDataBuilder';
import type { DocumentEntry } from './documentStore';

/** Summary of a required form with key display fields */
export interface FormSummaryEntry {
  formType: TaxFormType;
  label: string;
  keyFields: { name: string; value: string | number }[];
}

export interface TaxReturnState {
  /** User's input that feeds the 1040 calculation */
  input: Form1040Input;
  /** Computed 1040 output */
  result: Form1040Output | null;
  /** Computed CA Form 540 output (null if not in CA) */
  form540Result: Form540Output | null;
  /** Canonical tax return data — feeds PDF + Free File adapters */
  taxReturn: TaxReturnData | null;
  /** Required forms determined from the tax situation */
  requiredForms: TaxFormType[];
  /** Per-form summaries for display */
  formSummaries: FormSummaryEntry[];
  /** Whether the computation has been run */
  computed: boolean;

  /** Set the Form 1040 input data */
  setInput: (input: Form1040Input) => void;
  /** Run the tax computation and populate results */
  compute: () => void;
  /** Build Form1040Input from documents + profile, compute 1040 (and 540 if CA) */
  computeFromDocuments: (documents: DocumentEntry[], profile: TaxProfileData) => void;
  /** Set the tax situation to determine required forms */
  setRequiredForms: (situation: TaxSituation) => void;
  /** Add a form summary entry */
  addFormSummary: (entry: FormSummaryEntry) => void;
  /** Clear all form summaries and set new ones */
  setFormSummaries: (entries: FormSummaryEntry[]) => void;
  /** Reset the store */
  reset: () => void;
}

const FORM_LABELS: Record<TaxFormType, string> = {
  '1040': 'Form 1040 - U.S. Individual Income Tax Return',
  'schedule-a': 'Schedule A - Itemized Deductions',
  'schedule-b': 'Schedule B - Interest and Dividends',
  'schedule-d': 'Schedule D - Capital Gains and Losses',
  'schedule-e': 'Schedule E - Rental and Royalty Income',
  'form-8949': 'Form 8949 - Sales of Capital Assets',
  'form-4562': 'Form 4562 - Depreciation and Amortization',
  'form-2441': 'Form 2441 - Child and Dependent Care Expenses',
  'form-6251': 'Form 6251 - Alternative Minimum Tax',
  'ca-540': 'CA Form 540 - California Resident Income Tax Return',
};

export function getFormLabel(formType: TaxFormType): string {
  return FORM_LABELS[formType] ?? formType;
}

const DEFAULT_INPUT: Form1040Input = {
  filingStatus: 'single' as FilingStatus,
};

export const useTaxReturnStore = create<TaxReturnState>((set, get) => ({
  input: { ...DEFAULT_INPUT },
  result: null,
  form540Result: null,
  taxReturn: null,
  requiredForms: [],
  formSummaries: [],
  computed: false,

  setInput: (input: Form1040Input) => {
    set({ input, computed: false, result: null, form540Result: null, taxReturn: null });
  },

  compute: () => {
    const { input } = get();
    const result = calculateForm1040(input);
    set({ result, computed: true });
  },

  computeFromDocuments: (documents: DocumentEntry[], profile: TaxProfileData) => {
    const input = buildForm1040Input(documents, profile);
    const result = calculateForm1040(input);

    // Compute CA Form 540 if in California
    let form540Result: Form540Output | null = null;
    let caWithholding: number | undefined;
    if (profile.stateOfResidence.toUpperCase() === 'CA') {
      const w2Docs = documents.filter((d) => d.type === 'w2');
      const w2FieldsList = w2Docs.map((d) => mapW2Fields(d.extractedText));
      const w2Agg = aggregateW2s(w2FieldsList);
      caWithholding = w2Agg.totalStateTax || undefined;

      form540Result = calculateForm540({
        filingStatus: input.filingStatus,
        federalAGI: result.agi,
        caWithholding,
      });
    }

    // Build canonical TaxReturnData
    const taxReturn = buildTaxReturn({
      taxYear: 2025,
      filingStatus: input.filingStatus,
      pii: {
        primary: { firstName: '', lastName: '', ssn: '' },
        dependents: profile.dependents.map((d) => ({
          firstName: d.firstName,
          lastName: d.lastName,
          ssn: d.ssn,
          relationship: d.relationship,
        })),
        address: { street: '', city: '', state: profile.stateOfResidence, zip: '' },
        filingStatus: input.filingStatus,
      },
      form1040: result,
      wages: input.wages ?? 0,
      taxableInterest: 0,
      qualifiedDividends: input.qualifiedDividends,
      ordinaryDividends: input.ordinaryDividends,
      capitalLossDeduction: input.capitalGains && input.capitalGains < 0
        ? Math.min(3000, Math.abs(input.capitalGains)) : undefined,
      w2Withholding: input.federalWithholding,
      form540: form540Result ?? undefined,
      caWithholding,
    });

    set({ input, result, form540Result, taxReturn, computed: true });

    // Persist to chrome.storage for popup autofill (extension only)
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const allFormKeys: FormKey[] = [
        'form1040', 'schedule1', 'schedule2', 'schedule3',
        'scheduleA', 'scheduleD', 'scheduleE',
        'form2441', 'form4562', 'ca540',
      ];
      const fieldMaps: Record<string, Record<string, string | number>> = {};
      for (const fk of allFormKeys) {
        const map = toFreeFileFieldMap(taxReturn, fk);
        if (Object.keys(map).length > 0) fieldMaps[fk] = map;
      }

      const primaryName = profile.dependents.length > 0
        ? `${profile.filingStatus === 'mfj' ? 'Joint' : ''} Return`
        : 'Tax Return';

      chrome.storage.local.set({
        taxReturn,
        fieldMaps,
        savedReturn: {
          taxYear: 2025,
          name: primaryName || 'Tax Return',
          filingStatus: input.filingStatus,
          refundOrOwed: result.refundOrOwed,
          isRefund: result.isRefund,
          forms: allFormKeys.filter((k) => fieldMaps[k]),
        },
      });
    }
  },

  setRequiredForms: (situation: TaxSituation) => {
    const forms = determineRequiredForms(situation);
    set({ requiredForms: forms });
  },

  addFormSummary: (entry: FormSummaryEntry) => {
    set((state) => ({
      formSummaries: [...state.formSummaries, entry],
    }));
  },

  setFormSummaries: (entries: FormSummaryEntry[]) => {
    set({ formSummaries: entries });
  },

  reset: () => {
    set({
      input: { ...DEFAULT_INPUT },
      result: null,
      form540Result: null,
      taxReturn: null,
      requiredForms: [],
      formSummaries: [],
      computed: false,
    });
  },
}));
