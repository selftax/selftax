import { irsRound } from './form1040';
import type { FilingStatus } from './taxConstants';

export interface Form6251Input {
  filingStatus: FilingStatus;
  /** Regular taxable income (from Form 1040 Line 15) */
  taxableIncome: number;
  /** Regular tax (from Form 1040 Line 16) */
  regularTax: number;
  /** ISO spread: FMV at exercise - exercise price × shares */
  isoSpread?: number;
  /** State/local tax deduction taken on Schedule A (add back for AMT) */
  stateLocalTaxDeduction?: number;
  /** Other AMT adjustments */
  otherAdjustments?: number;
}

export interface Form6251Output {
  /** Alternative Minimum Taxable Income */
  amti: number;
  /** AMT exemption amount */
  exemption: number;
  /** AMTI after exemption */
  amtiAfterExemption: number;
  /** Tentative minimum tax */
  tentativeMinimumTax: number;
  /** AMT owed (0 if regular tax >= tentative minimum tax) */
  amt: number;
  /** Whether AMT applies */
  amtApplies: boolean;
}

/** AMT exemption amounts (2025) */
const AMT_EXEMPTION: Record<FilingStatus, number> = {
  single: 88100,
  mfj: 137000,
  mfs: 68500,
  hoh: 88100,
  qw: 137000,
};

/** AMT exemption phase-out threshold */
const AMT_PHASEOUT_THRESHOLD: Record<FilingStatus, number> = {
  single: 609350,
  mfj: 1218700,
  mfs: 609350,
  hoh: 609350,
  qw: 1218700,
};

/** AMT tax rate thresholds */
const AMT_28_THRESHOLD: Record<FilingStatus, number> = {
  single: 232600,
  mfj: 232600,
  mfs: 116300,
  hoh: 232600,
  qw: 232600,
};

export function calculateForm6251(input: Form6251Input): Form6251Output {
  // Skip entirely if no ISO spread and no other AMT items
  if (!input.isoSpread && !input.stateLocalTaxDeduction && !input.otherAdjustments) {
    return {
      amti: input.taxableIncome,
      exemption: AMT_EXEMPTION[input.filingStatus],
      amtiAfterExemption: 0,
      tentativeMinimumTax: 0,
      amt: 0,
      amtApplies: false,
    };
  }

  // AMTI = taxable income + AMT preference items + adjustments
  const amti = irsRound(
    input.taxableIncome +
    (input.isoSpread ?? 0) +
    (input.stateLocalTaxDeduction ?? 0) +
    (input.otherAdjustments ?? 0),
  );

  // Exemption (phased out at 25 cents per dollar over threshold)
  let exemption = AMT_EXEMPTION[input.filingStatus];
  const threshold = AMT_PHASEOUT_THRESHOLD[input.filingStatus];
  if (amti > threshold) {
    const phaseout = Math.floor((amti - threshold) * 0.25);
    exemption = Math.max(0, exemption - phaseout);
  }

  const amtiAfterExemption = Math.max(0, amti - exemption);

  // Tentative minimum tax: 26% up to threshold, 28% above
  const rate28Threshold = AMT_28_THRESHOLD[input.filingStatus];
  let tentativeMinimumTax: number;
  if (amtiAfterExemption <= rate28Threshold) {
    tentativeMinimumTax = irsRound(amtiAfterExemption * 0.26);
  } else {
    tentativeMinimumTax = irsRound(
      rate28Threshold * 0.26 +
      (amtiAfterExemption - rate28Threshold) * 0.28,
    );
  }

  // AMT = excess of tentative minimum tax over regular tax
  const amt = Math.max(0, irsRound(tentativeMinimumTax - input.regularTax));

  return {
    amti,
    exemption,
    amtiAfterExemption,
    tentativeMinimumTax,
    amt,
    amtApplies: amt > 0,
  };
}
