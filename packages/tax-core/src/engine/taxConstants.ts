/**
 * Tax constants — backward-compatible re-exports from year configs.
 *
 * New code should use getTaxYearConfig(year) directly.
 * These exports exist so existing code that imports STANDARD_DEDUCTION,
 * TAX_BRACKETS, etc. continues to work (using 2025 defaults).
 */

import { getTaxYearConfig } from './taxYearConfigs';

export type FilingStatus = 'single' | 'mfj' | 'mfs' | 'hoh' | 'qw';

export interface TaxBracket {
  min: number;
  max: number;
  rate: number;
}

// Re-export year-aware config system
export { getTaxYearConfig, DEFAULT_TAX_YEAR, SUPPORTED_TAX_YEARS } from './taxYearConfigs';
export type { TaxYearConfig } from './taxYearConfigs';

// Backward-compatible 2025 defaults
const config2025 = getTaxYearConfig(2025);

/** Standard deduction amounts (2025) */
export const STANDARD_DEDUCTION = config2025.standardDeduction;

/** Additional standard deduction for age 65+ or blind (per person) */
export const ADDITIONAL_DEDUCTION_65_BLIND = config2025.additionalDeduction65Blind;

/** OBBBA senior bonus deduction for 65+ */
export const SENIOR_BONUS_DEDUCTION = config2025.seniorBonusDeduction;

/** Tax brackets for 2025 */
export const TAX_BRACKETS = config2025.taxBrackets;

/** Child Tax Credit (OBBBA 2025) */
export const CHILD_TAX_CREDIT = config2025.childTaxCredit;
export const CHILD_TAX_CREDIT_REFUNDABLE_MAX = config2025.childTaxCreditRefundableMax;

/** SALT deduction cap (OBBBA 2025) */
export const SALT_CAP = config2025.saltCap;
