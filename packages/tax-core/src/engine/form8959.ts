/**
 * Form 8959 — Additional Medicare Tax
 *
 * 0.9% surtax on wages exceeding threshold.
 * Also applies to self-employment income (reduced by wages already counted).
 *
 * Thresholds are statutory (not indexed): $250k MFJ, $200k single, $125k MFS.
 *
 * Note: Employers withhold 0.9% on wages over $200k regardless of filing status.
 * For MFJ filers under $250k, the excess withholding credits back.
 */

import { irsRound } from './form1040';
import type { FilingStatus } from './taxConstants';
import { getTaxYearConfig } from './taxYearConfigs';

export interface Form8959Input {
  filingStatus: FilingStatus;
  taxYear?: number;
  /** Total Medicare wages (W-2 Box 5) */
  wages: number;
  /** Self-employment income (if any) */
  selfEmploymentIncome?: number;
  /** Additional Medicare tax already withheld by employer (W-2 Box 6 minus regular 1.45% on all wages) */
  additionalMedicareWithheld?: number;
}

export interface Form8959Output {
  /** Additional Medicare tax on wages */
  additionalTaxOnWages: number;
  /** Additional Medicare tax on self-employment income */
  additionalTaxOnSE: number;
  /** Total additional Medicare tax */
  totalAdditionalTax: number;
  /** Excess withholding that credits back as payment */
  excessWithholding: number;
}

export function calculateAdditionalMedicare(input: Form8959Input): Form8959Output {
  const config = getTaxYearConfig(input.taxYear);
  const threshold = config.additionalMedicareThreshold[input.filingStatus];
  const rate = config.additionalMedicareRate;

  // Additional tax on wages
  const wagesOverThreshold = Math.max(0, input.wages - threshold);
  const additionalTaxOnWages = irsRound(wagesOverThreshold * rate);

  // Additional tax on SE income (threshold reduced by wages already counted)
  let additionalTaxOnSE = 0;
  if (input.selfEmploymentIncome && input.selfEmploymentIncome > 0) {
    const seThreshold = Math.max(0, threshold - input.wages);
    const seOverThreshold = Math.max(0, input.selfEmploymentIncome - seThreshold);
    additionalTaxOnSE = irsRound(seOverThreshold * rate);
  }

  const totalAdditionalTax = additionalTaxOnWages + additionalTaxOnSE;

  // Excess withholding: employer withholds at $200k regardless of filing status
  // If actual tax owed < withheld, the difference credits back
  const withheld = input.additionalMedicareWithheld ?? 0;
  const excessWithholding = Math.max(0, withheld - totalAdditionalTax);

  return {
    additionalTaxOnWages,
    additionalTaxOnSE,
    totalAdditionalTax,
    excessWithholding,
  };
}
