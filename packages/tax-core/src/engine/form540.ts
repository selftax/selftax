/**
 * California Form 540 — State Income Tax Calculator
 *
 * Pure deterministic function. No LLM, no randomness.
 * Follows FTB Form 540 instructions.
 *
 * CA generally starts from federal AGI, with optional CA-specific
 * adjustments (e.g., differences in state/federal treatment of
 * certain deductions or income).
 */

import { irsRound } from './form1040';
import type { FilingStatus } from './taxConstants';
import { getTaxYearConfig } from './taxYearConfigs';

export interface Form540Input {
  filingStatus: FilingStatus;
  /** Tax year (defaults to 2025) */
  taxYear?: number;
  /** Federal AGI (from Form 1040 Line 11) */
  federalAGI: number;
  /** CA-specific adjustments (positive = add to income, negative = subtract) */
  caAdjustments?: number;
  /** CA itemized deductions — property tax + mortgage interest (no state tax deduction on CA return) */
  caItemizedDeductions?: number;
  /** CA state tax withheld (from W-2 Box 17, estimated payments, etc.) */
  caWithholding?: number;
  /** CA estimated tax payments */
  caEstimatedPayments?: number;
  /** Number of dependents (for CA dependent exemption credits) */
  dependentCount?: number;
  /** Primary residence property tax (for computing CA itemized if not provided) */
  primaryPropertyTax?: number;
  /** Primary residence mortgage interest (for computing CA itemized if not provided) */
  primaryMortgageInterest?: number;
}

export interface Form540Output {
  /** CA adjusted gross income */
  caAGI: number;
  /** Deduction used (CA standard or CA itemized) */
  deduction: number;
  deductionType: 'standard' | 'itemized';
  /** CA taxable income */
  taxableIncome: number;
  /** Tax from CA brackets (before credits and surcharge) */
  taxBeforeCredits: number;
  /** Mental Health Services Tax surcharge (1% over $1M) */
  mentalHealthSurcharge: number;
  /** Personal exemption credits */
  exemptionCredits: number;
  /** Total CA tax (bracket tax + surcharge - credits, floored at 0) */
  totalTax: number;
  /** Total payments (withholding + estimated) */
  totalPayments: number;
  /** Positive = refund, negative = amount owed */
  refundOrOwed: number;
  isRefund: boolean;
}

/** Calculate CA tax from state brackets */
export function calculateCATax(taxableIncome: number, filingStatus: FilingStatus, taxYear?: number): number {
  const config = getTaxYearConfig(taxYear);
  const brackets = config.caTaxBrackets[filingStatus];
  let tax = 0;

  for (const bracket of brackets) {
    if (taxableIncome <= bracket.min) break;
    const taxableInBracket = Math.min(taxableIncome, bracket.max) - bracket.min;
    tax += taxableInBracket * bracket.rate;
  }

  return irsRound(tax);
}

/** Calculate Mental Health Services Tax (1% on taxable income over $1M) */
export function calculateMentalHealthSurcharge(taxableIncome: number, taxYear?: number): number {
  const config = getTaxYearConfig(taxYear);
  if (taxableIncome <= config.caMentalHealthThreshold) return 0;
  return irsRound((taxableIncome - config.caMentalHealthThreshold) * config.caMentalHealthRate);
}

/** Full Form 540 calculation */
export function calculateForm540(input: Form540Input): Form540Output {
  const config = getTaxYearConfig(input.taxYear);

  // CA AGI: federal AGI +/- CA adjustments
  const caAGI = irsRound(input.federalAGI + (input.caAdjustments ?? 0));

  // Deduction: CA standard vs CA itemized
  // If CA itemized not explicitly provided, compute from property tax + mortgage
  // (CA doesn't allow deduction of state income tax on the state return)
  const standardDeduction = config.caStandardDeduction[input.filingStatus];
  let itemized = input.caItemizedDeductions ?? 0;
  if (itemized === 0 && (input.primaryPropertyTax || input.primaryMortgageInterest)) {
    itemized = irsRound((input.primaryPropertyTax ?? 0) + (input.primaryMortgageInterest ?? 0));
  }

  let deduction: number;
  let deductionType: 'standard' | 'itemized';
  if (itemized > standardDeduction) {
    deduction = irsRound(itemized);
    deductionType = 'itemized';
  } else {
    deduction = standardDeduction;
    deductionType = 'standard';
  }

  // CA taxable income (floored at 0)
  const taxableIncome = Math.max(0, irsRound(caAGI - deduction));

  // Tax from brackets
  const taxBeforeCredits = calculateCATax(taxableIncome, input.filingStatus, input.taxYear);

  // Mental Health Services Tax
  const mentalHealthSurcharge = calculateMentalHealthSurcharge(taxableIncome, input.taxYear);

  // Exemption credits: personal + dependents
  const personalExemption = config.caPersonalExemptionCredit[input.filingStatus];
  const dependentExemption = (input.dependentCount ?? 0) * config.caDependentExemptionCredit;
  const exemptionCredits = personalExemption + dependentExemption;

  // Total tax (bracket tax + surcharge - credits, floored at 0)
  const totalTax = Math.max(
    0,
    irsRound(taxBeforeCredits + mentalHealthSurcharge - exemptionCredits),
  );

  // Payments
  const totalPayments = irsRound(
    (input.caWithholding ?? 0) + (input.caEstimatedPayments ?? 0),
  );

  const refundOrOwed = irsRound(totalPayments - totalTax);

  return {
    caAGI,
    deduction,
    deductionType,
    taxableIncome,
    taxBeforeCredits,
    mentalHealthSurcharge,
    exemptionCredits,
    totalTax,
    totalPayments,
    refundOrOwed,
    isRefund: refundOrOwed >= 0,
  };
}
