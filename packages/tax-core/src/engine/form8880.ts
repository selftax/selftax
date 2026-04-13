/**
 * Form 8880 — Credit for Qualified Retirement Savings Contributions (Saver's Credit)
 *
 * 50%/20%/10% of retirement contributions (up to $2,000/person)
 * based on AGI tiers. Nonrefundable credit.
 */

import { irsRound } from './form1040';
import type { FilingStatus } from './taxConstants';
import { getTaxYearConfig } from './taxYearConfigs';

export interface SaversCreditInput {
  filingStatus: FilingStatus;
  taxYear?: number;
  /** Total retirement contributions (401k, IRA, etc.) */
  contributions: number;
  /** AGI */
  agi: number;
  /** Number of eligible persons (1 for single, up to 2 for MFJ) */
  persons?: number;
}

export interface SaversCreditOutput {
  /** Credit percentage (0.50, 0.20, 0.10, or 0) */
  creditRate: number;
  /** Eligible contributions (capped at $2k/person) */
  eligibleContributions: number;
  /** Credit amount */
  credit: number;
}

export function calculateSaversCredit(input: SaversCreditInput): SaversCreditOutput {
  const config = getTaxYearConfig(input.taxYear);
  const tiers = config.saversCredit[input.filingStatus];
  const maxPerPerson = config.saversCreditMaxContribPerPerson;
  const persons = input.persons ?? (input.filingStatus === 'mfj' ? 2 : 1);

  const eligibleContributions = Math.min(input.contributions, maxPerPerson * persons);

  let creditRate: number;
  if (input.agi <= tiers.fifty) {
    creditRate = 0.50;
  } else if (input.agi <= tiers.twenty) {
    creditRate = 0.20;
  } else if (input.agi <= tiers.ten) {
    creditRate = 0.10;
  } else {
    creditRate = 0;
  }

  const credit = irsRound(eligibleContributions * creditRate);

  return { creditRate, eligibleContributions, credit };
}
