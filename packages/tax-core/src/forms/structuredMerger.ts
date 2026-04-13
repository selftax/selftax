/**
 * Structured Merger — transforms StructuredExtraction[] into Form1040Input.
 *
 * This is the browser-side equivalent of extractionMerger.ts (server-side).
 * It takes multiple structured extractions (W-2, 1099-INT, 1098, prior-year 1040)
 * and produces a single input object for calculateForm1040.
 *
 * Pure functions — no I/O, no LLM. Lives in tax-core so browser can use it.
 */

import type { StructuredExtraction } from './structuredExtractor';
import type { FilingStatus } from '../engine/taxConstants';

/** Output of mergeStructuredExtractions — compatible with Form1040Input + Schedule E/A */
export interface MergedTaxInput {
  filingStatus: FilingStatus;
  taxYear?: number;
  wages?: number;
  federalWithholding?: number;
  stateWithholding?: number;
  otherIncome?: number;
  capitalLossCarryforward?: number;
  qbiIncome?: number;
  occupation?: string;
  // Schedule A (itemized deductions)
  primaryMortgageInterest?: number;
  primaryPropertyTax?: number;
  // Schedule E (rental)
  scheduleEInput?: {
    grossRentalIncome?: number;
    insurance?: number;
    mortgageInterest?: number;
    propertyTaxes?: number;
    depreciation?: number;
    priorYearUnallowedLoss?: number;
    managementFees?: number;
    repairs?: number;
    utilities?: number;
    otherExpenses?: number;
  };
  // Rental property address (from prior year Schedule E)
  rentalAddress?: string;
  rentalCity?: string;
  rentalState?: string;
  rentalZip?: string;
  // Dependent care
  dependentCareExpenses?: number;
}

/**
 * Merge multiple structured extractions into a single tax input.
 *
 * Rules:
 * - Prior-year docs (documentTaxYear < current year): only carryforward fields used
 * - Current-year docs: all fields used, last non-null wins for single-source fields
 * - Taxable interest: summed across all current-year 1099-INTs
 * - Rental fields: assembled from prior-year carryforwards + current-year 1098s
 */
export function mergeStructuredExtractions(
  extractions: StructuredExtraction[],
  filingStatus: FilingStatus,
  currentTaxYear = 2025,
): MergedTaxInput {
  const result: MergedTaxInput = { filingStatus, taxYear: currentTaxYear };

  // Separate prior-year vs current-year
  // Safety net: formType 'prior-year-return' is always prior year even if year regex failed
  const priorYear = extractions.filter((e) =>
    (e.documentTaxYear != null && e.documentTaxYear < currentTaxYear) ||
    e.formType === 'prior-year-return',
  );
  const currentYear = extractions.filter((e) =>
    !priorYear.includes(e),
  );

  // Carryforward fields — values that carry from prior year to current year.
  // These are either IRS-mandated carryforwards or MACRS-scheduled amounts.
  const CARRYFORWARD_FIELDS = new Set([
    'capitalLossCarryforward',   // Schedule D loss carries forward
    'priorYearUnallowedLoss',    // Passive loss carries forward
    'depreciation',              // MACRS schedule continues each year
    'amortization',              // MACRS schedule continues each year
  ]);

  // Helper: last non-null value from current-year extractions (+ carryforward from prior-year)
  function lastVal(field: keyof StructuredExtraction): number | undefined {
    const isCarryforward = CARRYFORWARD_FIELDS.has(field);
    let val: number | undefined;
    for (const ext of extractions) {
      const fv = ext[field];
      if (fv != null && typeof fv === 'number' && fv !== 0) {
        const isPrior = priorYear.includes(ext);
        if (!isCarryforward && isPrior) continue;
        val = fv;
      }
    }
    return val;
  }

  // Single-source fields
  result.wages = lastVal('wages');
  result.federalWithholding = lastVal('federalWithholding');
  result.stateWithholding = lastVal('stateWithholding');
  result.capitalLossCarryforward = lastVal('capitalLossCarryforward');
  result.qbiIncome = lastVal('qbiIncome');

  // Override values set when we detect a rental 1098
  let rentalMortgageOverride: number | undefined;
  let rentalPropTaxOverride: number | undefined;

  // ── 1098 separation: primary vs rental ──
  // When there are multiple 1098s, we need to figure out which is the primary
  // residence and which is a rental property. Use prior-year rentalMortgageInterest
  // as a HINT only — the 1098 closest to that amount is the rental.
  const current1098s = currentYear.filter((e) => e.formType === '1098' && e.primaryMortgageInterest);
  // Read prior-year rental mortgage directly for hint (NOT through lastVal — it's not a carryforward)
  let priorRentalMortgage = 0;
  for (const ext of priorYear) {
    if (ext.rentalMortgageInterest && ext.rentalMortgageInterest > 0) {
      priorRentalMortgage = ext.rentalMortgageInterest;
    }
  }

  if (current1098s.length >= 2 && priorRentalMortgage > 0) {
    // Find which 1098 is closest to the prior-year rental mortgage
    let rental1098: StructuredExtraction | undefined;
    let bestDiff = Infinity;

    for (const e of current1098s) {
      const diff = Math.abs((e.primaryMortgageInterest ?? 0) - priorRentalMortgage);
      if (diff < bestDiff) {
        bestDiff = diff;
        rental1098 = e;
      }
    }
    const primary1098 = current1098s.find((e) => e !== rental1098);

    result.primaryMortgageInterest = primary1098?.primaryMortgageInterest;
    rentalMortgageOverride = rental1098?.primaryMortgageInterest ?? 0;

    // Rental 1098's primaryPropertyTax is actually rental escrow property tax
    if (rental1098?.primaryPropertyTax) {
      rentalPropTaxOverride = rental1098.primaryPropertyTax;
    }

    // Primary property tax: only from non-rental 1098 or other sources
    // Scan all extractions EXCEPT the rental 1098
    let primaryPropTax: number | undefined;
    for (const ext of extractions) {
      if (ext === rental1098) continue;
      if (ext.primaryPropertyTax != null && typeof ext.primaryPropertyTax === 'number' && ext.primaryPropertyTax > 0) {
        const isPrior = priorYear.includes(ext);
        if (!isPrior) primaryPropTax = ext.primaryPropertyTax;
      }
    }
    result.primaryPropertyTax = primaryPropTax;
  } else {
    // Single 1098 or no prior-year hint — use as-is
    result.primaryMortgageInterest = lastVal('primaryMortgageInterest');
    result.primaryPropertyTax = lastVal('primaryPropertyTax');
  }

  // Occupation: last non-empty string
  for (const ext of extractions) {
    if (ext.occupation && ext.occupation.length > 1) {
      result.occupation = ext.occupation;
    }
  }

  // Rental address: from any extraction (prior year or current)
  for (const ext of extractions) {
    if (ext.rentalAddress) {
      result.rentalAddress = ext.rentalAddress;
      result.rentalCity = ext.rentalCity;
      result.rentalState = ext.rentalState;
      result.rentalZip = ext.rentalZip;
    }
  }

  // Taxable interest: sum across current-year 1099-INTs
  let totalInterest = 0;
  for (const ext of currentYear) {
    if (ext.taxableInterest != null && ext.taxableInterest > 0) {
      totalInterest += ext.taxableInterest;
    }
  }
  if (totalInterest > 0) result.otherIncome = totalInterest;

  // Rental data: assemble from carryforward fields + current-year 1098 data
  const rentalMortgage = rentalMortgageOverride ?? lastVal('rentalMortgageInterest') ?? 0;
  const rentalPropTax = rentalPropTaxOverride ?? lastVal('rentalPropertyTax') ?? 0;
  const rentalInsurance = lastVal('rentalInsurance') ?? 0;
  const depreciation = lastVal('depreciation') ?? 0;
  const amortization = lastVal('amortization') ?? 0;
  const priorYearUnallowedLoss = lastVal('priorYearUnallowedLoss');

  if (rentalMortgage > 0 || rentalPropTax > 0 || rentalInsurance > 0 || depreciation > 0 || amortization > 0) {
    result.scheduleEInput = {
      grossRentalIncome: 0, // Comes from spreadsheets (LLM path)
      insurance: rentalInsurance,
      mortgageInterest: rentalMortgage,
      propertyTaxes: rentalPropTax,
      depreciation,
      otherExpenses: amortization > 0 ? amortization : undefined,
      priorYearUnallowedLoss,
      managementFees: 0,
      repairs: 0,
      utilities: 0,
    };
  }

  // Clean undefined
  for (const key of Object.keys(result)) {
    if ((result as unknown as Record<string, unknown>)[key] === undefined) {
      delete (result as unknown as Record<string, unknown>)[key];
    }
  }

  return result;
}
