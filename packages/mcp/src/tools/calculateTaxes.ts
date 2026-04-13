/**
 * calculate_taxes Tool
 *
 * Builds Form1040Input from session documents and user overrides,
 * runs the deterministic tax calculation engine, returns results.
 *
 * All Form1040Input fields can be passed as overrides. The tool
 * merges document-extracted data with overrides, then calls
 * calculateForm1040() — the single source of truth for all tax math.
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  calculateForm1040,
  calculateForm540,
  calculateScheduleE,
  calculateScheduleA,
  calculateForm2441,
  determineRequiredForms,
  generateGuidance,
  mapW2Fields,
  aggregateW2s,
  irsRound,
} from '@selftax/core';
import type { TaxSituation, ScheduleEInput, Form1040Input } from '@selftax/core';
import type { Session } from '../session.js';
import { getAllDocuments, setCalculationResult } from '../session.js';
import { buildForm1040InputFromSession } from '../taxDataBuilder.js';

/**
 * All overrides for the calculate_taxes tool.
 *
 * Includes every Form1040Input field (for direct overrides) plus
 * schedule-level inputs (scheduleEInput, dependentCareExpenses)
 * and extraction aids (stateWithholding, primaryPropertyTax).
 */
export interface CalculateTaxesInput extends Partial<Form1040Input> {
  /** Schedule E detailed rental property input */
  scheduleEInput?: {
    grossRentalIncome?: number;
    insurance?: number;
    mortgageInterest?: number;
    repairs?: number;
    propertyTaxes?: number;
    depreciation?: number;
    otherExpenses?: number;
    managementFees?: number;
    utilities?: number;
    advertising?: number;
    autoTravel?: number;
    cleaningMaintenance?: number;
    commissions?: number;
    legalFees?: number;
    otherInterest?: number;
    supplies?: number;
    priorYearUnallowedLoss?: number;
  };
  /** Dependent care expenses for Form 2441 */
  dependentCareExpenses?: number;
  /** Care provider info for Form 2441 Part I */
  careProvider?: {
    name?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    ein?: string;
    isHouseholdEmployee?: boolean;
  };
  /** Primary residence property tax (if paid outside escrow) */
  primaryPropertyTax?: number;
  /** Primary residence mortgage interest (overrides regex-parsed value) */
  primaryMortgageInterest?: number;
  /** State income tax withheld override (if W-2 parsing is wrong) */
  stateWithholding?: number;
}

export function handleCalculateTaxes(
  session: Session,
  input: CalculateTaxesInput,
): CallToolResult {
  if (!session.profile) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'Profile not set. Call set_profile first.' }) }],
      isError: true,
    };
  }

  const documents = getAllDocuments(session);
  if (documents.length === 0) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'No documents loaded. Call scan_tax_folder first.' }) }],
      isError: true,
    };
  }

  // Build base from documents, then overlay all overrides
  const form1040Input = buildForm1040InputFromSession(documents, session.profile);

  // Apply all Form1040Input overrides (any field from the interface)
  const formFields: (keyof Form1040Input)[] = [
    'taxYear', 'wages', 'qualifiedDividends', 'ordinaryDividends',
    'capitalGains', 'longTermCapitalGains', 'shortTermCapitalGains',
    'rentalIncome', 'otherIncome', 'adjustments', 'itemizedDeductions',
    'qualifyingChildren', 'dependentCareCredit', 'otherCredits',
    'federalWithholding', 'estimatedPayments', 'additionalMedicareWithheld',
    'selfEmploymentIncome', 'socialSecurityBenefits', 'nontaxableInterest',
    'iraDistributions', 'taxableIraDistributions', 'pensionDistributions',
    'taxablePensions', 'hsaDeduction', 'studentLoanInterest',
    'educationExpenses', 'educationCreditType', 'numberOfStudents',
    'earnedIncome', 'qualifyingChildrenForEITC', 'investmentIncomeForEITC',
    'premiumTaxCredit', 'foreignTaxCredit', 'retirementContributions',
    'form4797Gain', 'k1OrdinaryIncome', 'k1RentalIncome',
    'cleanEnergyCredit', 'energyImprovementCredit',
    'educatorExpenses', 'unemploymentCompensation', 'alimonyReceived',
    'farmIncome', 'qbiIncome', 'qbiW2Wages', 'qbiPropertyBasis',
    'isQbiSSTB', 'capitalLossCarryforward', 'isSenior',
  ];
  for (const key of formFields) {
    if (input[key] !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (form1040Input as any)[key] = input[key];
    }
  }

  // Schedule E: run calculation and set rental income
  let rentalMortgage = 0;
  let rentalPropertyTax = 0;
  if (input.scheduleEInput) {
    const seInput: ScheduleEInput = {
      grossRentalIncome: input.scheduleEInput.grossRentalIncome ?? 0,
      ...input.scheduleEInput,
    };
    const seOutput = calculateScheduleE(seInput);
    form1040Input.rentalIncome = seOutput.amountFor1040;
    rentalMortgage = irsRound(input.scheduleEInput.mortgageInterest ?? 0);
    rentalPropertyTax = irsRound(input.scheduleEInput.propertyTaxes ?? 0);

    // Derive QBI from net rental if not explicitly provided
    if (!form1040Input.qbiIncome && seOutput.amountFor1040 > 0) {
      form1040Input.qbiIncome = seOutput.amountFor1040;
    }
  }

  // Rebuild Schedule A: separate rental items, add SALT with overrides
  const w2Docs = documents.filter((d) => d.documentType === 'w2');
  const w2FieldsList = w2Docs.map((d) => mapW2Fields(d.rawText));
  const w2Agg = aggregateW2s(w2FieldsList);

  // Primary mortgage: use extraction value if provided, otherwise derive from regex baseline
  let primaryMortgage: number;
  if (input.primaryMortgageInterest) {
    primaryMortgage = irsRound(input.primaryMortgageInterest);
  } else {
    const baseMortgage = form1040Input.itemizedDeductions ?? 0;
    primaryMortgage = irsRound(baseMortgage - rentalMortgage - rentalPropertyTax);
  }

  const stateWithholding = input.stateWithholding ?? w2Agg.totalStateTax;
  const scheduleAOut = calculateScheduleA({
    filingStatus: form1040Input.filingStatus,
    stateIncomeTax: stateWithholding || undefined,
    primaryPropertyTax: input.primaryPropertyTax || undefined,
    mortgageInterest: primaryMortgage > 0 ? primaryMortgage : undefined,
  });
  form1040Input.itemizedDeductions = scheduleAOut.shouldItemize
    ? scheduleAOut.totalItemized : undefined;

  // Dependent care credit (Form 2441)
  if (input.dependentCareExpenses && input.dependentCareExpenses > 0) {
    const agi = irsRound(
      (form1040Input.wages ?? 0) +
      (form1040Input.rentalIncome ?? 0) +
      (form1040Input.capitalGains ?? 0) +
      (form1040Input.selfEmploymentIncome ?? 0) +
      (form1040Input.otherIncome ?? 0),
    );
    const form2441Out = calculateForm2441({
      qualifyingExpenses: input.dependentCareExpenses,
      qualifyingPersons: Math.max(1, session.profile.dependents.length),
      agi,
    });
    form1040Input.dependentCareCredit = form2441Out.credit;
  }

  // Calculate Form 1040
  const form1040 = calculateForm1040(form1040Input);

  // CA Form 540
  let form540 = undefined;
  if (session.profile.stateOfResidence.toUpperCase() === 'CA') {
    const caWithholding = input.stateWithholding ?? w2Agg.totalStateTax;
    form540 = calculateForm540({
      filingStatus: form1040Input.filingStatus,
      federalAGI: form1040.agi,
      caWithholding: caWithholding || undefined,
      dependentCount: session.profile.dependents.length,
      primaryPropertyTax: input.primaryPropertyTax,
      primaryMortgageInterest: input.primaryMortgageInterest ? irsRound(input.primaryMortgageInterest) : undefined,
    });
  }

  // Required forms
  const hasStockSales = documents.some((d) => d.documentType === '1099-b');
  const hasRental = form1040Input.rentalIncome !== undefined;

  const situation: TaxSituation = {
    filingStatus: form1040Input.filingStatus,
    approximateAGI: form1040.agi,
    hasW2Income: documents.some((d) => d.documentType === 'w2'),
    hasRentalProperty: hasRental,
    hasStockSales,
    hasISOs: false,
    hasDependentCareFSA: false,
    stateOfResidence: session.profile.stateOfResidence,
  };

  const requiredForms = determineRequiredForms(situation);
  const guidance = generateGuidance(situation);

  setCalculationResult(session, { form1040, form540, requiredForms, guidance });

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        form1040: {
          totalIncome: form1040.totalIncome,
          agi: form1040.agi,
          deduction: form1040.deduction,
          deductionType: form1040.deductionType,
          taxableIncome: form1040.taxableIncome,
          tax: form1040.tax,
          totalCredits: form1040.totalCredits,
          totalTax: form1040.totalTax,
          totalPayments: form1040.totalPayments,
          refundOrOwed: form1040.refundOrOwed,
          isRefund: form1040.isRefund,
        },
        ...(form540 ? { form540: {
          caAGI: form540.caAGI,
          taxableIncome: form540.taxableIncome,
          totalTax: form540.totalTax,
          totalPayments: form540.totalPayments,
          refundOrOwed: form540.refundOrOwed,
          isRefund: form540.isRefund,
        }} : {}),
        requiredForms,
        guidance,
      }, null, 2),
    }],
  };
}
