/**
 * California tax constants — backward-compatible re-exports from year configs.
 *
 * New code should use getTaxYearConfig(year) directly.
 */

import type { FilingStatus, TaxBracket } from './taxConstants';
import { getTaxYearConfig } from './taxYearConfigs';

const config2025 = getTaxYearConfig(2025);

export const CA_TAX_BRACKETS: Record<FilingStatus, TaxBracket[]> = config2025.caTaxBrackets;
export const CA_STANDARD_DEDUCTION: Record<FilingStatus, number> = config2025.caStandardDeduction;
export const CA_PERSONAL_EXEMPTION_CREDIT: Record<FilingStatus, number> = config2025.caPersonalExemptionCredit;
export const CA_MENTAL_HEALTH_THRESHOLD = config2025.caMentalHealthThreshold;
export const CA_MENTAL_HEALTH_RATE = config2025.caMentalHealthRate;
