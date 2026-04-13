/**
 * Earned Income Tax Credit (EITC)
 *
 * Refundable credit for low-to-moderate income workers.
 * Amount depends on filing status, number of qualifying children,
 * earned income, AGI, and investment income.
 *
 * The credit phases in at a credit rate up to an earned income amount,
 * then plateaus, then phases out. Parameters vary by child count and year.
 */

import { irsRound } from './form1040';
import type { FilingStatus } from './taxConstants';
import { getTaxYearConfig } from './taxYearConfigs';

export interface EITCInput {
  filingStatus: FilingStatus;
  taxYear?: number;
  /** Earned income (wages + net SE income) */
  earnedIncome: number;
  /** Adjusted gross income */
  agi: number;
  /** Number of qualifying children (0, 1, 2, or 3+) */
  qualifyingChildren: number;
  /** Investment income (for the investment income test) */
  investmentIncome?: number;
}

export interface EITCOutput {
  credit: number;
  maxCredit: number;
  inPhaseout: boolean;
}

export function calculateEITC(input: EITCInput): EITCOutput {
  const config = getTaxYearConfig(input.taxYear);

  // Investment income test
  if ((input.investmentIncome ?? 0) > config.eitcInvestmentIncomeLimit) {
    return { credit: 0, maxCredit: 0, inPhaseout: false };
  }

  // Look up table by number of children (cap at 3)
  const childKey = Math.min(input.qualifyingChildren, 3);
  const params = config.eitcTable[childKey];
  if (!params) {
    return { credit: 0, maxCredit: 0, inPhaseout: false };
  }

  const phaseoutStart = params.phaseoutStart[input.filingStatus];
  const maxCredit = irsRound(params.earnedIncomeAmount * params.creditRate);

  // Phase-in: credit increases at creditRate up to earnedIncomeAmount
  const earnedCredit = irsRound(Math.min(input.earnedIncome, params.earnedIncomeAmount) * params.creditRate);

  // Phase-out: credit decreases at phaseoutRate starting at phaseoutStart
  // Use the greater of earned income or AGI for phaseout calculation
  const phaseoutIncome = Math.max(input.earnedIncome, input.agi);
  let phaseoutReduction = 0;
  let inPhaseout = false;
  if (phaseoutIncome > phaseoutStart) {
    inPhaseout = true;
    phaseoutReduction = irsRound((phaseoutIncome - phaseoutStart) * params.phaseoutRate);
  }

  const credit = Math.max(0, earnedCredit - phaseoutReduction);

  return { credit, maxCredit, inPhaseout };
}
