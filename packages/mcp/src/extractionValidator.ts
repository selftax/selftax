/**
 * Extraction Validator — post-extraction checks on each document's output.
 *
 * Catches bad data before it hits the merger:
 * - String values where numbers expected
 * - Negative values where only positive make sense
 * - Description strings left from the prompt template
 * - Rental units with missing grossRent
 *
 * Also tags extractions with metadata the merger can use:
 * - Whether the document appears to be a prior-year return
 */

import type { TaxDocumentExtraction } from './docDistiller.js';

export interface ValidationResult {
  extraction: TaxDocumentExtraction;
  warnings: string[];
  isPriorYearReturn: boolean;
}

/** Validate and clean a single extraction */
export function validateExtraction(extraction: TaxDocumentExtraction): ValidationResult {
  const warnings: string[] = [];
  const cleaned = { ...extraction };

  // ── Detect prior-year return ──
  // Primary signal: documentTaxYear from LLM extraction (most reliable)
  // Fallback: filename matching
  const src = (extraction.sourceDocument ?? '').toLowerCase();
  const yearFromLLM = extraction.documentTaxYear;
  // Heuristic: if a single doc has > 10 fields AND includes wages + rental + withholding,
  // it's probably a full tax return (not a single form like a W-2 or 1098)
  const fieldCount = Object.keys(extraction).filter(
    (k) => k !== 'sourceDocument' && k !== 'documentTaxYear' && extraction[k as keyof TaxDocumentExtraction] != null,
  ).length;
  const looksLikeFullReturn = fieldCount > 10 &&
    extraction.wages != null && extraction.rentalUnits != null && extraction.capitalLossCarryforward != null;

  const isPriorYearReturn = (yearFromLLM != null && yearFromLLM < 2025) ||
    looksLikeFullReturn ||
    /prior|2024|2023|2022|tax\s*return/i.test(src);

  if (isPriorYearReturn) {
    console.log(`[Validate] ${extraction.sourceDocument}: PRIOR YEAR detected (year=${yearFromLLM}, fullReturn=${looksLikeFullReturn}, fieldCount=${fieldCount}, filename=${src})`);
  }

  // ── Remove string values where numbers expected ──
  const numericFields: (keyof TaxDocumentExtraction)[] = [
    'wages', 'federalWithholding', 'stateWithholding',
    'qualifiedDividends', 'ordinaryDividends',
    'longTermCapitalGains', 'shortTermCapitalGains',
    'taxableInterest', 'taxableIraDistributions', 'taxablePensions',
    'socialSecurityBenefits', 'selfEmploymentIncome',
    'unemploymentCompensation', 'alimonyReceived', 'farmIncome',
    'k1OrdinaryIncome', 'k1RentalIncome', 'form4797Gain',
    'primaryMortgageInterest', 'primaryPropertyTax',
    'rentalMortgageInterest', 'rentalPropertyTax', 'rentalInsurance',
    'dependentCareExpenses', 'capitalLossCarryforward',
    'depreciation', 'amortization', 'qbiIncome',
    'hsaDeduction', 'studentLoanInterest', 'educationExpenses',
    'foreignTaxCredit', 'premiumTaxCredit', 'retirementContributions',
    'cleanEnergyCredit', 'energyImprovementCredit',
    'educatorExpenses', 'estimatedPayments',
    'medicareWages', 'medicareTaxWithheld',
    'iraDistributions', 'pensionDistributions',
  ];

  for (const field of numericFields) {
    const val = cleaned[field];
    if (val !== undefined && val !== null) {
      if (typeof val === 'string') {
        // Try to parse numeric strings like "$14,026.86"
        const parsed = parseFloat(String(val).replace(/[$,]/g, ''));
        if (!isNaN(parsed)) {
          (cleaned as Record<string, unknown>)[field] = parsed;
          warnings.push(`${field}: converted string "${val}" to ${parsed}`);
        } else {
          // Description string left from template — remove it
          delete (cleaned as Record<string, unknown>)[field];
          warnings.push(`${field}: removed non-numeric string`);
        }
      }
    }
  }

  // ── Validate rental units ──
  if (cleaned.rentalUnits) {
    cleaned.rentalUnits = cleaned.rentalUnits.filter((u) => {
      if (!u.grossRent || u.grossRent <= 0) {
        warnings.push(`rentalUnit ${u.address ?? 'unknown'}: removed (no grossRent)`);
        return false;
      }
      return true;
    });
    if (cleaned.rentalUnits.length === 0) delete cleaned.rentalUnits;
  }

  // ── Fields that should always be positive ──
  const positiveOnly: (keyof TaxDocumentExtraction)[] = [
    'wages', 'federalWithholding', 'stateWithholding',
    'primaryPropertyTax', 'capitalLossCarryforward',
    'depreciation', 'dependentCareExpenses',
  ];
  for (const field of positiveOnly) {
    const val = cleaned[field];
    if (typeof val === 'number' && val < 0) {
      warnings.push(`${field}: removed negative value ${val}`);
      delete (cleaned as Record<string, unknown>)[field];
    }
  }

  // ── Log ──
  if (warnings.length > 0) {
    console.log(`[Validate] ${extraction.sourceDocument}: ${warnings.join('; ')}`);
  }

  return { extraction: cleaned, warnings, isPriorYearReturn };
}

/** Validate all extractions and return cleaned results + prior-year flags */
export function validateExtractions(
  extractions: TaxDocumentExtraction[],
): { validated: TaxDocumentExtraction[]; priorYearDocs: string[] } {
  const validated: TaxDocumentExtraction[] = [];
  const priorYearDocs: string[] = [];

  for (const ext of extractions) {
    const result = validateExtraction(ext);
    validated.push(result.extraction);
    if (result.isPriorYearReturn) {
      priorYearDocs.push(ext.sourceDocument);
    }
  }

  if (priorYearDocs.length > 0) {
    console.log(`[Validate] Prior-year returns detected: ${priorYearDocs.join(', ')}`);
  }

  return { validated, priorYearDocs };
}
