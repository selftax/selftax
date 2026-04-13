/**
 * Form 8960 — Net Investment Income Tax (NIIT)
 *
 * 3.8% surtax on the lesser of:
 *   (a) net investment income, or
 *   (b) MAGI exceeding the threshold
 *
 * Thresholds are statutory (not indexed): $250k MFJ, $200k single, $125k MFS.
 */

import { irsRound } from './form1040';
import type { FilingStatus } from './taxConstants';
import { getTaxYearConfig } from './taxYearConfigs';

export interface Form8960Input {
  filingStatus: FilingStatus;
  taxYear?: number;
  /** Modified Adjusted Gross Income (typically same as AGI for most filers) */
  magi: number;
  /** Net investment income: interest + dividends + capital gains + rental + other investment - expenses */
  netInvestmentIncome: number;
}

export interface Form8960Output {
  netInvestmentIncome: number;
  magiOverThreshold: number;
  niit: number;
  applies: boolean;
}

export function calculateNIIT(input: Form8960Input): Form8960Output {
  const config = getTaxYearConfig(input.taxYear);
  const threshold = config.niitThreshold[input.filingStatus];

  const magiOverThreshold = Math.max(0, input.magi - threshold);
  const taxableAmount = Math.min(input.netInvestmentIncome, magiOverThreshold);
  const niit = taxableAmount > 0 ? irsRound(taxableAmount * config.niitRate) : 0;

  return {
    netInvestmentIncome: input.netInvestmentIncome,
    magiOverThreshold,
    niit,
    applies: niit > 0,
  };
}
