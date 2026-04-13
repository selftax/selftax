/**
 * Browser-Side Tax Calculator — Path 1 (no server, no LLM)
 *
 * When all documents are structured IRS forms, this runs the full
 * calculation pipeline in the browser:
 *   structuredFields → merge → Schedule A/E → Form 1040 → CA 540
 *   → buildTaxReturn → toFreeFileFieldMap → autofill
 *
 * Uses only tax-core functions (pure, deterministic).
 */

import {
  mergeStructuredExtractions,
  calculateForm1040,
  calculateScheduleA,
  calculateScheduleE,
  calculateForm2441,
  calculateForm540,
  buildTaxReturn,
  toFreeFileFieldMap,
  irsRound,
} from '@selftax/core';
import type {
  StructuredExtraction,
  MergedTaxInput,
  FormKey,
  FilingStatus,
  ScheduleEInput,
} from '@selftax/core';
import type { AnalyzeResult } from './analyzeService';
import type { LocalPII } from './analyzeService';

const ALL_FORM_KEYS: FormKey[] = [
  'w2', 'form1040', 'schedule1', 'schedule2', 'schedule3',
  'scheduleA', 'scheduleC', 'scheduleD', 'scheduleE', 'scheduleSE',
  'form2441', 'form4562', 'form6251',
  'form8812', 'form8863', 'form8880',
  'form8959', 'form8960', 'form8582', 'form8582p2', 'form8582p3', 'form8995', 'form5695',
  'ca540',
];

/** Server-extracted fields from /extract endpoint (CalculateTaxesInput shape) */
export interface ServerOverrides {
  wages?: number;
  federalWithholding?: number;
  stateWithholding?: number;
  otherIncome?: number;
  capitalLossCarryforward?: number;
  qbiIncome?: number;
  rentalIncome?: number;
  scheduleEInput?: ScheduleEInput;
  dependentCareExpenses?: number;
  careProvider?: {
    name?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    ein?: string;
    isHouseholdEmployee?: boolean;
  };
  primaryPropertyTax?: number;
  primaryMortgageInterest?: number;
  occupation?: string;
  qualifiedDividends?: number;
  ordinaryDividends?: number;
  [key: string]: unknown;
}

/**
 * Run the full tax calculation in the browser from structured fields.
 * No server call, no LLM — fully deterministic.
 *
 * Accepts optional `overrides` from the /extract endpoint (server-distilled
 * unstructured docs). These get merged with locally-extracted fields.
 */
export function calculateInBrowser(
  extractions: StructuredExtraction[],
  filingStatus: FilingStatus,
  stateOfResidence: string,
  dependentCount: number,
  pii?: LocalPII,
  overrides?: ServerOverrides,
): AnalyzeResult {
  // 1. Merge all structured extractions
  const merged = mergeStructuredExtractions(extractions, filingStatus, 2025);

  // 1b. Apply server-extracted overrides (from /extract endpoint)
  // The server receives BOTH structured fields (for context) and unstructured docs.
  // Its merged result includes structured fields we already have locally.
  // Only apply fields that are NEW — don't add if local already has a value.
  if (overrides) {
    if (overrides.wages != null && !merged.wages) merged.wages = overrides.wages;
    if (overrides.federalWithholding != null && !merged.federalWithholding) merged.federalWithholding = overrides.federalWithholding;
    if (overrides.stateWithholding != null && !merged.stateWithholding) merged.stateWithholding = overrides.stateWithholding;
    if (overrides.otherIncome != null && !merged.otherIncome) merged.otherIncome = overrides.otherIncome;
    if (overrides.capitalLossCarryforward != null && !merged.capitalLossCarryforward) merged.capitalLossCarryforward = overrides.capitalLossCarryforward;
    if (overrides.qbiIncome != null && !merged.qbiIncome) merged.qbiIncome = overrides.qbiIncome;
    // Property tax and mortgage: server may provide additional amounts from unstructured docs
    // (e.g., primary residence property tax bill) — ADD only the delta beyond what local has
    if (overrides.primaryPropertyTax != null) merged.primaryPropertyTax = overrides.primaryPropertyTax;
    if (overrides.primaryMortgageInterest != null && !merged.primaryMortgageInterest) merged.primaryMortgageInterest = overrides.primaryMortgageInterest;
    if (overrides.dependentCareExpenses != null) merged.dependentCareExpenses = overrides.dependentCareExpenses;
    if (overrides.occupation && !merged.occupation) merged.occupation = overrides.occupation;
    // Merge Schedule E inputs — server provides rental income/expenses,
    // local structured provides mortgage from 1098. Combine both.
    if (overrides.scheduleEInput) {
      if (merged.scheduleEInput) {
        // Merge server fields into existing (local 1098-based) scheduleEInput.
        // 1098 escrow is authoritative for mortgage, property tax, and insurance
        // (actual disbursements). Server-extracted bills overlap — don't add.
        const se = merged.scheduleEInput;
        const ov = overrides.scheduleEInput;
        se.grossRentalIncome = (se.grossRentalIncome ?? 0) + (ov.grossRentalIncome ?? 0);
        if (ov.insurance && !se.insurance) se.insurance = ov.insurance; // 1098 escrow wins
        if (ov.mortgageInterest && !se.mortgageInterest) se.mortgageInterest = ov.mortgageInterest;
        if (ov.repairs) se.repairs = (se.repairs ?? 0) + ov.repairs;
        if (ov.propertyTaxes && !se.propertyTaxes) se.propertyTaxes = ov.propertyTaxes; // 1098 escrow wins
        if (ov.depreciation) se.depreciation = (se.depreciation ?? 0) + ov.depreciation;
        if (ov.managementFees) se.managementFees = (se.managementFees ?? 0) + ov.managementFees;
        if (ov.utilities) se.utilities = (se.utilities ?? 0) + ov.utilities;
        if (ov.otherExpenses) se.otherExpenses = (se.otherExpenses ?? 0) + ov.otherExpenses;
        if (ov.priorYearUnallowedLoss) se.priorYearUnallowedLoss = ov.priorYearUnallowedLoss;
      } else {
        merged.scheduleEInput = overrides.scheduleEInput;
      }
    }
    // Also apply top-level rentalIncome if server provides it directly
    // (some orchestrator paths return rentalIncome instead of scheduleEInput)
    if (overrides.rentalIncome != null && !merged.scheduleEInput?.grossRentalIncome) {
      if (!merged.scheduleEInput) merged.scheduleEInput = {};
      merged.scheduleEInput.grossRentalIncome = overrides.rentalIncome;
    }
    // Depreciation and amortization from server
    if ((overrides as Record<string, unknown>).depreciation != null && merged.scheduleEInput) {
      merged.scheduleEInput.depreciation = (merged.scheduleEInput.depreciation ?? 0) + Number((overrides as Record<string, unknown>).depreciation);
    }
  }

  // 2. Schedule E (rental)
  const scheduleEInput = merged.scheduleEInput
    ? { grossRentalIncome: 0, ...merged.scheduleEInput }
    : undefined;
  let rentalIncome: number | undefined;
  let seOutput;
  if (scheduleEInput && (scheduleEInput.grossRentalIncome || scheduleEInput.mortgageInterest || scheduleEInput.depreciation)) {
    // Preliminary AGI for passive activity loss limitation (Form 8582)
    const prelimAgi = irsRound((merged.wages ?? 0) + (merged.otherIncome ?? 0));
    seOutput = calculateScheduleE(scheduleEInput, {
      agi: prelimAgi,
      activeParticipant: true, // rental real estate with active participation
    });
    rentalIncome = seOutput.amountFor1040;
  }

  // 3. Schedule A (itemized deductions)
  const scheduleAInput = {
    filingStatus,
    stateIncomeTax: merged.stateWithholding || undefined,
    primaryPropertyTax: merged.primaryPropertyTax || undefined,
    mortgageInterest: merged.primaryMortgageInterest ? irsRound(merged.primaryMortgageInterest) : undefined,
  };
  const scheduleAOutput = calculateScheduleA(scheduleAInput);

  // 4. Dependent care (Form 2441)
  let form2441Output;
  if (merged.dependentCareExpenses && merged.dependentCareExpenses > 0) {
    const roughAgi = irsRound(
      (merged.wages ?? 0) + (rentalIncome ?? 0) + (merged.otherIncome ?? 0),
    );
    form2441Output = calculateForm2441({
      qualifyingExpenses: merged.dependentCareExpenses,
      qualifyingPersons: Math.max(1, dependentCount),
      agi: roughAgi,
    });
  }

  // 5. Form 1040
  const form1040Input = {
    filingStatus,
    taxYear: 2025,
    wages: merged.wages,
    otherIncome: merged.otherIncome,
    rentalIncome,
    capitalLossCarryforward: merged.capitalLossCarryforward,
    qbiIncome: merged.qbiIncome ?? (rentalIncome && rentalIncome > 0 ? rentalIncome : undefined),
    itemizedDeductions: scheduleAOutput.shouldItemize ? scheduleAOutput.totalItemized : undefined,
    federalWithholding: merged.federalWithholding,
    qualifyingChildren: dependentCount > 0 ? dependentCount : undefined,
    dependentCareCredit: form2441Output?.credit,
    occupation: merged.occupation,
  };
  const form1040 = calculateForm1040(form1040Input);

  // 6. CA Form 540
  let form540;
  if (stateOfResidence.toUpperCase() === 'CA') {
    form540 = calculateForm540({
      filingStatus,
      federalAGI: form1040.agi,
      caWithholding: merged.stateWithholding || undefined,
      dependentCount,
      primaryPropertyTax: merged.primaryPropertyTax,
      primaryMortgageInterest: merged.primaryMortgageInterest ? irsRound(merged.primaryMortgageInterest) : undefined,
    });
  }

  // 7. Build TaxReturnData
  // Capital loss: calculateForm1040 caps at $3,000 — mirror for buildTaxReturn line 7
  const capitalLossCarryforward = merged.capitalLossCarryforward ?? 0;
  const capitalLossDeduction = capitalLossCarryforward > 0
    ? Math.min(capitalLossCarryforward, 3000)
    : undefined;

  // Schedule D: capital loss carryforward goes on line 14 (long-term)
  const scheduleDOutput = capitalLossCarryforward > 0 ? {
    shortTermNet: 0,
    longTermNet: irsRound(-capitalLossCarryforward),
    netCapitalGainLoss: irsRound(-capitalLossCarryforward),
    capitalLossDeduction: capitalLossDeduction ?? 0,
    carryforwardLoss: irsRound(capitalLossCarryforward - (capitalLossDeduction ?? 0)),
    shortTermGains: 0,
    shortTermLosses: 0,
    longTermGains: 0,
    longTermLosses: 0,
  } : undefined;

  const taxReturn = buildTaxReturn({
    taxYear: 2025,
    filingStatus,
    pii: {
      primary: { firstName: pii?.primary.firstName ?? '', lastName: pii?.primary.lastName ?? '', ssn: pii?.primary.ssn ?? '' },
      occupation: merged.occupation,
      spouse: pii?.spouse,
      dependents: pii?.dependents ?? [],
      address: pii?.address ?? { street: '', city: '', state: stateOfResidence, zip: '' },
      filingStatus,
    },
    form1040,
    wages: merged.wages ?? 0,
    taxableInterest: merged.otherIncome,
    capitalLossDeduction,
    scheduleD: scheduleDOutput,
    qbiDeduction: form1040.qbiDeduction,
    qbiIncome: merged.qbiIncome,
    scheduleA: scheduleAOutput.shouldItemize ? { input: scheduleAInput, output: scheduleAOutput } : undefined,
    rentalProperties: scheduleEInput && seOutput ? [{
      address: merged.rentalAddress ?? pii?.rentalAddresses?.[0]?.[0] ?? 'Rental Property',
      city: merged.rentalCity ?? pii?.rentalAddresses?.[0]?.[1],
      state: merged.rentalState ?? pii?.rentalAddresses?.[0]?.[2],
      zip: merged.rentalZip ?? pii?.rentalAddresses?.[0]?.[3],
      propertyType: '2',
      fairRentalDays: 365,
      personalUseDays: 0,
      input: scheduleEInput,
      output: seOutput,
    }] : undefined,
    scheduleEAggregate: seOutput,
    form2441: form2441Output,
    form540,
    totalDepreciation: scheduleEInput?.depreciation,
    w2Withholding: merged.federalWithholding,
    caWithholding: merged.stateWithholding,
    qualifyingChildren: dependentCount > 0 ? dependentCount : undefined,
  });

  // 8. Generate FreeFile field maps
  const fieldMaps: Record<string, Record<string, string | number>> = {};
  for (const fk of ALL_FORM_KEYS) {
    const map = toFreeFileFieldMap(taxReturn, fk);
    if (Object.keys(map).length > 0) fieldMaps[fk] = map;
  }

  // 9. W-2 form fields (needed for Step 2 withholding verification)
  const w2Ext = extractions.find((e) => e.formType === 'w2' && e.wages);
  if (w2Ext) {
    const w2Fields: Record<string, string | number> = {};
    if (w2Ext.wages) w2Fields.txtWagesTips = irsRound(w2Ext.wages);
    if (merged.federalWithholding) w2Fields.txtFedIncTaxWithheld = irsRound(merged.federalWithholding);
    if (w2Ext.socialSecurityWages) w2Fields.txtSocSecWages = irsRound(w2Ext.socialSecurityWages);
    if (w2Ext.socialSecurityTaxWithheld) w2Fields.txtSocSecTaxWithheld = irsRound(w2Ext.socialSecurityTaxWithheld);
    if (w2Ext.medicareWages) w2Fields.txtMedicareWagesTips = irsRound(w2Ext.medicareWages);
    if (w2Ext.medicareTaxWithheld) w2Fields.txtMedicareTaxWithheld = irsRound(w2Ext.medicareTaxWithheld);
    if (w2Ext.stateWithholding) w2Fields.txtSt1IncTax = irsRound(w2Ext.stateWithholding);
    if (w2Ext.wages) w2Fields.txtSt1WagesTips = irsRound(w2Ext.wages);
    if (w2Ext.dependentCareBenefits) w2Fields.txtDepCareBenefits = irsRound(w2Ext.dependentCareBenefits);
    // Employer info from structured extraction
    if (w2Ext.employerEin) w2Fields.txtEmployerIdNum = w2Ext.employerEin;
    if (w2Ext.employerName) w2Fields.txtEmployerName = w2Ext.employerName;
    if (w2Ext.employerAddress) w2Fields.txtEmployerAddress = w2Ext.employerAddress;
    if (w2Ext.employerCity) w2Fields.txtEmployerCity = w2Ext.employerCity;
    if (w2Ext.employerState) w2Fields.cboEmployerState = w2Ext.employerState;
    if (w2Ext.employerZip) w2Fields.txtEmployerZip = w2Ext.employerZip;
    if (w2Ext.stateEmployerId) w2Fields.txtSt1EmployerId = w2Ext.stateEmployerId;
    // Box 12 entries (up to 4: a, b, c, d)
    if (w2Ext.box12) {
      const slots = ['A', 'B', 'C', 'D'];
      for (let i = 0; i < Math.min(w2Ext.box12.length, 4); i++) {
        const entry = w2Ext.box12[i];
        w2Fields[`cboBox12${slots[i]}Code`] = entry.code;
        w2Fields[`txtBox12${slots[i]}Amount`] = entry.amount;
      }
    }
    // Employee PII
    if (pii) {
      w2Fields.txtEmpFirstName = pii.primary.firstName;
      w2Fields.txtEmpLastName = pii.primary.lastName;
      w2Fields.txtEmplyerSSN = pii.primary.ssn;
      w2Fields.txtEmpAddress = pii.address.street;
      w2Fields.txtEmpCity = pii.address.city;
      w2Fields.cboEmpState = pii.address.state;
      w2Fields.txtEmpZip = pii.address.zip;
      w2Fields.cboW2State1 = pii.address.state;
    }
    fieldMaps.w2 = w2Fields;
  }

  // 9b. Form 2441 care provider info
  // Only use prior year provider if:
  //   a) There are current-year dependent care expenses (proof of childcare this year)
  //   b) The daycare statement mentions a name that matches the prior year provider
  // If the daycare statement has full provider info, use that directly.
  let careProvider = overrides?.careProvider;
  if (!careProvider?.ein && merged.dependentCareExpenses && merged.dependentCareExpenses > 0) {
    // Have childcare expenses but no provider details from daycare statement
    // Check prior year for matching provider to fill the gaps
    const priorProvider = extractions.find((e) => e.careProvider?.ein)?.careProvider;
    if (priorProvider) {
      if (careProvider?.name) {
        // Daycare statement has a name — only use prior year if names overlap
        const normalize = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
        const daycareNorm = normalize(careProvider.name);
        const priorNorm = normalize(priorProvider.name || '');
        if (daycareNorm.includes(priorNorm) || priorNorm.includes(daycareNorm)) {
          // Same provider — merge prior year details into daycare statement
          careProvider = { ...priorProvider, ...careProvider };
        }
      } else {
        // No provider name from daycare — use prior year as-is
        careProvider = priorProvider;
      }
    }
  }
  if (careProvider && fieldMaps.form2441) {
    const cp = careProvider;
    const f = fieldMaps.form2441;
    if (cp.name) {
      // Organizations (daycares): full name in "Last or Business", First empty
      // Individuals: split into first/last
      const isOrg = cp.ein || cp.isHouseholdEmployee === false;
      if (isOrg) {
        f.txtCarePersonLname1 = cp.name;
      } else {
        const parts = cp.name.split(/\s+/);
        f.txtCarePersonFname1 = parts[0] || '';
        f.txtCarePersonLname1 = parts.slice(1).join(' ') || parts[0] || '';
      }
    }
    if (cp.address) f.txtCarePersonAddr1 = cp.address;
    if (cp.city) f.txtCarePersonCity1 = cp.city;
    if (cp.state) f.cboCarePersonState1 = cp.state;
    if (cp.zip) f.txtCarePersonZip1 = cp.zip;
    if (cp.ein) f.txtCarePersonEIN1 = cp.ein;
    // (d) Household employee checkbox — "No" for daycares/organizations
    if (cp.isHouseholdEmployee === false) f.chkCarePersonHH1No = 1;
    else if (cp.isHouseholdEmployee === true) f.chkCarePersonHH1Yes = 1;
  }
  // Amount paid is always set when Form 2441 exists, even without provider details
  if (fieldMaps.form2441 && merged.dependentCareExpenses) {
    fieldMaps.form2441.txtCarePersonAmount1 = irsRound(merged.dependentCareExpenses);
  }

  // 10. E-file signing fields (Step 4 on FreeFile)
  const today = new Date();
  const todayStr = `${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}/${today.getFullYear()}`;
  const efileFields: Record<string, string | number> = {
    txtSignatureDate: todayStr,
  };
  // Prior year AGI from structured extraction
  const priorAgi = extractions.find((e) => e.priorYearAgi)?.priorYearAgi;
  if (priorAgi) {
    efileFields.txtPriorAgi = priorAgi;
    efileFields.txtPriorSpAgi = priorAgi; // same if filed jointly
  }
  // Phone, DOB, PIN from vault PII
  if (pii?.phone) efileFields.txtphone = pii.phone;
  if (pii?.primaryDob) efileFields.txtPrDob = pii.primaryDob;
  if (pii?.spouseDob) efileFields.txtSpDob = pii.spouseDob;
  if (pii?.efilePin) efileFields.txtPin = pii.efilePin;
  if (pii?.spouseEfilePin) efileFields.txtSpPin = pii.spouseEfilePin;
  fieldMaps.efile = efileFields;

  return {
    taxReturn: taxReturn as unknown,
    fieldMaps,
    summary: {
      taxYear: 2025,
      name: pii ? `${pii.primary.firstName} ${pii.primary.lastName}` : 'Taxpayer',
      filingStatus,
      refundOrOwed: form1040.refundOrOwed,
      isRefund: form1040.isRefund,
      forms: Object.keys(fieldMaps),
      totalIncome: form1040.totalIncome,
      agi: form1040.agi,
      totalTax: form1040.totalTax,
    },
  };
}
