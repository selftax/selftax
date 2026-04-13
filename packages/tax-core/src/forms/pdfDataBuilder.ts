import type { UserProfile, TaxFormType } from '../types';
import type { Form1040Output } from '../engine/form1040';
import type { ScheduleAOutput } from '../engine/scheduleA';
import type { ScheduleDOutput, StockTransaction } from '../engine/scheduleD';
import type { ScheduleEOutput, ScheduleEInput } from '../engine/scheduleE';
import type { Form540Output } from '../engine/form540';

/** Field mapping for a single PDF form — field name → value */
export type PDFFormData = Record<string, string | number | boolean>;

/** A complete tax return package ready for PDF generation */
export interface TaxReturnPackage {
  forms: Array<{
    formType: TaxFormType;
    fields: PDFFormData;
  }>;
  /** PII fields — only merged at final PDF generation time */
  piiFields: {
    name: string;
    ssn: string;
    address: string;
    cityStateZip: string;
  };
}

/** Build Form 1040 PDF field data */
export function build1040Fields(
  output: Form1040Output,
  extras?: { filingStatus?: string },
): PDFFormData {
  return {
    'f1-1': extras?.filingStatus ?? '', // Filing status checkbox
    'f1-7': output.totalIncome, // Line 9: Total income
    'f1-8': output.agi, // Line 11: AGI
    'f1-10': output.deduction, // Line 13: Deductions
    'f1-11': output.taxableIncome, // Line 15: Taxable income
    'f1-12': output.tax, // Line 16: Tax
    'f1-16': output.totalCredits, // Line 21: Total credits
    'f1-18': output.totalTax, // Line 24: Total tax
    'f1-25': output.totalPayments, // Line 33: Total payments
    'f1-26': output.isRefund ? output.refundOrOwed : 0, // Line 34: Overpaid
    'f1-30': output.isRefund ? 0 : Math.abs(output.refundOrOwed), // Line 37: Amount owed
  };
}

/** Build Schedule A PDF field data */
export function buildScheduleAFields(output: ScheduleAOutput): PDFFormData {
  return {
    'sa-1': output.saltDeduction, // Line 5d: SALT
    'sa-4': output.mortgageInterest, // Line 10: Interest
    'sa-6': output.charitableTotal, // Line 14: Charitable
    'sa-7': output.totalItemized, // Line 17: Total
  };
}

/** Build Schedule D PDF field data */
export function buildScheduleDFields(output: ScheduleDOutput): PDFFormData {
  return {
    'sd-1': output.shortTermNet, // Part I total
    'sd-5': output.longTermNet, // Part II total
    'sd-7': output.netCapitalGainLoss, // Line 16: Net
    'sd-8': output.capitalLossDeduction > 0 ? -output.capitalLossDeduction : output.netCapitalGainLoss, // Line 21
  };
}

/** Build Schedule E PDF field data */
export function buildScheduleEFields(
  input: ScheduleEInput,
  output: ScheduleEOutput,
): PDFFormData {
  return {
    'se-3': output.grossIncome, // Line 3: Rents received
    'se-9': input.insurance ?? 0, // Line 9: Insurance
    'se-12': input.mortgageInterest ?? 0, // Line 12: Mortgage interest
    'se-14': input.repairs ?? 0, // Line 14: Repairs
    'se-16': input.propertyTaxes ?? 0, // Line 16: Taxes
    'se-18': input.depreciation ?? 0, // Line 18: Depreciation
    'se-20': output.totalExpenses, // Line 20: Total expenses
    'se-21': output.netRentalIncome, // Line 21: Net
  };
}

/** Build Form 8949 PDF field data from stock transactions */
export function buildForm8949Fields(
  transactions: StockTransaction[],
): PDFFormData[] {
  // Each Form 8949 page holds ~14 transactions
  const pages: PDFFormData[] = [];
  const ROWS_PER_PAGE = 14;

  for (let i = 0; i < transactions.length; i += ROWS_PER_PAGE) {
    const pageTransactions = transactions.slice(i, i + ROWS_PER_PAGE);
    const fields: PDFFormData = {};

    pageTransactions.forEach((tx, idx) => {
      const prefix = `f8949-${idx}`;
      fields[`${prefix}-a`] = tx.description;
      fields[`${prefix}-b`] = tx.dateAcquired;
      fields[`${prefix}-c`] = tx.dateSold;
      fields[`${prefix}-d`] = tx.proceeds;
      fields[`${prefix}-e`] = tx.costBasis;
      if (tx.adjustment) {
        fields[`${prefix}-f`] = tx.adjustmentCode ?? '';
        fields[`${prefix}-g`] = tx.adjustment;
      }
      fields[`${prefix}-h`] = tx.proceeds - tx.costBasis - (tx.adjustment ?? 0);
    });

    pages.push(fields);
  }

  return pages;
}

/** Build CA Form 540 PDF field data */
export function buildForm540Fields(output: Form540Output): PDFFormData {
  return {
    'ca540-1': output.caAGI,
    'ca540-2': output.deduction,
    'ca540-3': output.taxableIncome,
    'ca540-4': output.taxBeforeCredits,
    'ca540-5': output.mentalHealthSurcharge,
    'ca540-6': output.exemptionCredits,
    'ca540-7': output.totalTax,
    'ca540-8': output.totalPayments,
    'ca540-9': output.isRefund ? output.refundOrOwed : 0,
    'ca540-10': output.isRefund ? 0 : Math.abs(output.refundOrOwed),
  };
}

/** Build PII fields from user profile — only used at final PDF generation */
export function buildPIIFields(profile: UserProfile): TaxReturnPackage['piiFields'] {
  return {
    name: `${profile.firstName} ${profile.lastName}`,
    ssn: profile.ssn,
    address: profile.address.street,
    cityStateZip: `${profile.address.city}, ${profile.address.state} ${profile.address.zip}`,
  };
}

/** Assemble a complete tax return package */
export function assembleTaxReturn(
  profile: UserProfile,
  formDataList: Array<{ formType: TaxFormType; fields: PDFFormData }>,
): TaxReturnPackage {
  return {
    forms: formDataList,
    piiFields: buildPIIFields(profile),
  };
}
