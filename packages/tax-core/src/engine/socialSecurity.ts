/**
 * Social Security Benefits Taxation
 *
 * Up to 85% of Social Security benefits may be taxable based on
 * "combined income" (AGI + nontaxable interest + 50% of SS benefits).
 *
 * Implements the IRS Social Security Benefits Worksheet (Form 1040 instructions).
 * Thresholds are statutory (unchanged since 1993, never indexed for inflation).
 */

import { irsRound } from './form1040';
import type { FilingStatus } from './taxConstants';
import { getTaxYearConfig } from './taxYearConfigs';

export interface SocialSecurityInput {
  filingStatus: FilingStatus;
  taxYear?: number;
  /** Gross Social Security benefits (from SSA-1099 Box 5) */
  socialSecurityBenefits: number;
  /** AGI computed WITHOUT Social Security (other income - adjustments) */
  agiWithoutSS: number;
  /** Tax-exempt interest (for combined income calculation) */
  nontaxableInterest?: number;
}

export interface SocialSecurityOutput {
  /** Combined income (AGI + nontaxable interest + 50% of SS) */
  combinedIncome: number;
  /** Taxable portion of Social Security benefits (1040 line 6b) */
  taxableAmount: number;
  /** Effective taxable percentage (0%, up to 50%, up to 85%) */
  taxablePercentage: number;
}

export function calculateTaxableSocialSecurity(input: SocialSecurityInput): SocialSecurityOutput {
  const benefits = input.socialSecurityBenefits;
  if (benefits <= 0) {
    return { combinedIncome: 0, taxableAmount: 0, taxablePercentage: 0 };
  }

  const config = getTaxYearConfig(input.taxYear);
  const thresholds = config.ssTaxabilityThresholds[input.filingStatus];

  const halfBenefits = benefits / 2;
  const combinedIncome = irsRound(
    input.agiWithoutSS + (input.nontaxableInterest ?? 0) + halfBenefits,
  );

  // Below lower threshold: 0% taxable
  if (combinedIncome <= thresholds.lower) {
    return { combinedIncome, taxableAmount: 0, taxablePercentage: 0 };
  }

  // Between lower and upper: up to 50% taxable
  // Taxable = min(50% of excess over lower threshold, 50% of benefits)
  const excessOverLower = combinedIncome - thresholds.lower;

  if (combinedIncome <= thresholds.upper) {
    const taxableAmount = irsRound(Math.min(excessOverLower * 0.5, benefits * 0.5));
    const taxablePercentage = benefits > 0 ? taxableAmount / benefits : 0;
    return { combinedIncome, taxableAmount, taxablePercentage };
  }

  // Above upper threshold: up to 85% taxable
  // IRS worksheet:
  //   A = 85% × (combined - upper threshold)
  //   B = lesser of: (50% calc from between-threshold range) or (upper - lower) × 50%
  //       The "between range" max = (upper - lower) / 2
  //   B = min(50% of benefits, (upper - lower) / 2)
  //   Taxable = min(A + B, 85% of benefits)
  const excessOverUpper = combinedIncome - thresholds.upper;
  const partA = excessOverUpper * 0.85;
  const rangeMax = (thresholds.upper - thresholds.lower) / 2;
  const partB = Math.min(benefits * 0.5, rangeMax);
  const taxableAmount = irsRound(Math.min(partA + partB, benefits * 0.85));
  const taxablePercentage = benefits > 0 ? taxableAmount / benefits : 0;

  return { combinedIncome, taxableAmount, taxablePercentage };
}
