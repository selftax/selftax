import { irsRound } from './form1040';
import type { FilingStatus } from './taxConstants';
import { getTaxYearConfig } from './taxYearConfigs';

export interface ScheduleAInput {
  filingStatus: FilingStatus;
  /** Tax year (defaults to 2025) */
  taxYear?: number;
  /** State and local income taxes paid */
  stateIncomeTax?: number;
  /** Property taxes on PRIMARY residence only (rental goes on Schedule E) */
  primaryPropertyTax?: number;
  /** Other state/local taxes */
  otherStateLocalTax?: number;
  /** Mortgage interest on primary residence (from 1098) */
  mortgageInterest?: number;
  /** Charitable contributions — cash */
  charitableCash?: number;
  /** Charitable contributions — non-cash */
  charitableNonCash?: number;
  /** Medical and dental expenses (before AGI floor) */
  medicalExpenses?: number;
  /** AGI (needed for medical deduction 7.5% floor) */
  agi?: number;
  /** Other itemized deductions */
  otherDeductions?: number;
}

export interface ScheduleAOutput {
  /** Line 4: Medical deduction (expenses minus 7.5% AGI floor) */
  medicalDeduction: number;
  /** Line 5d: SALT deduction (capped) */
  saltDeduction: number;
  /** Uncapped SALT total (for reference) */
  saltTotal: number;
  /** Line 10: Total mortgage interest */
  mortgageInterest: number;
  /** Line 14: Total charitable contributions */
  charitableTotal: number;
  /** Line 17: Total itemized deductions */
  totalItemized: number;
  /** Whether itemizing beats the standard deduction */
  shouldItemize: boolean;
  /** Standard deduction amount for comparison */
  standardDeduction: number;
  /** How much more/less than standard deduction */
  savingsOverStandard: number;
}

export function calculateScheduleA(input: ScheduleAInput): ScheduleAOutput {
  const config = getTaxYearConfig(input.taxYear);

  // Medical: expenses minus 7.5% of AGI floor
  let medicalDeduction = 0;
  if (input.medicalExpenses && input.medicalExpenses > 0 && input.agi) {
    const floor = irsRound(input.agi * config.medicalDeductionFloor);
    medicalDeduction = Math.max(0, irsRound(input.medicalExpenses - floor));
  }

  // SALT: state income tax + primary property tax + other, capped per year
  const saltTotal = irsRound(
    (input.stateIncomeTax ?? 0) +
    (input.primaryPropertyTax ?? 0) +
    (input.otherStateLocalTax ?? 0),
  );
  const saltDeduction = Math.min(saltTotal, config.saltCap);

  const mortgageInterest = irsRound(input.mortgageInterest ?? 0);

  const charitableTotal = irsRound(
    (input.charitableCash ?? 0) + (input.charitableNonCash ?? 0),
  );

  const otherDeductions = irsRound(input.otherDeductions ?? 0);

  const totalItemized = irsRound(
    medicalDeduction + saltDeduction + mortgageInterest + charitableTotal + otherDeductions,
  );

  const standardDeduction = config.standardDeduction[input.filingStatus];
  const shouldItemize = totalItemized > standardDeduction;
  const savingsOverStandard = totalItemized - standardDeduction;

  return {
    medicalDeduction,
    saltDeduction,
    saltTotal,
    mortgageInterest,
    charitableTotal,
    totalItemized,
    shouldItemize,
    standardDeduction,
    savingsOverStandard,
  };
}
