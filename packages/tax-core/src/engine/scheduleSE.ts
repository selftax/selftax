/**
 * Schedule SE — Self-Employment Tax
 *
 * Calculates Social Security (12.4%) and Medicare (2.9%) taxes on
 * 92.35% of net self-employment income. Social Security portion
 * caps at the wage base minus any W-2 wages.
 *
 * Deductible half of SE tax reduces AGI (Schedule 1 line 15).
 * Full SE tax adds to total tax (Schedule 2 Part II line 6).
 */

import { irsRound } from './form1040';
import { getTaxYearConfig } from './taxYearConfigs';

export interface ScheduleSEInput {
  /** Net self-employment income (from Schedule C line 31) */
  netSEIncome: number;
  /** W-2 wages (for Social Security wage base calculation) */
  wages?: number;
  /** Tax year */
  taxYear?: number;
}

export interface ScheduleSEOutput {
  /** SE tax base (92.35% of net SE income) */
  seTaxBase: number;
  /** Social Security portion of SE tax */
  socialSecurityTax: number;
  /** Medicare portion of SE tax */
  medicareTax: number;
  /** Total self-employment tax */
  seTax: number;
  /** Deductible half of SE tax (Schedule 1 line 15) */
  deductibleHalf: number;
}

export function calculateScheduleSE(input: ScheduleSEInput): ScheduleSEOutput {
  if (input.netSEIncome <= 0) {
    return { seTaxBase: 0, socialSecurityTax: 0, medicareTax: 0, seTax: 0, deductibleHalf: 0 };
  }

  const config = getTaxYearConfig(input.taxYear);

  // SE tax base: 92.35% of net SE income
  const seTaxBase = irsRound(input.netSEIncome * config.selfEmploymentTaxMultiplier);

  // Social Security: 12.4% up to (wage base - W-2 wages)
  const wageBaseRemaining = Math.max(0, config.socialSecurityWageBase - (input.wages ?? 0));
  const ssTaxableAmount = Math.min(seTaxBase, wageBaseRemaining);
  const socialSecurityTax = irsRound(ssTaxableAmount * config.socialSecurityRate);

  // Medicare: 2.9% on all SE tax base (no cap)
  const medicareTax = irsRound(seTaxBase * config.medicareRate);

  const seTax = socialSecurityTax + medicareTax;
  const deductibleHalf = irsRound(seTax / 2);

  return {
    seTaxBase,
    socialSecurityTax,
    medicareTax,
    seTax,
    deductibleHalf,
  };
}
