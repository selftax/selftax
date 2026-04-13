/**
 * Extraction Merger — deterministic merge of per-document extractions.
 *
 * Combines TaxDocumentExtraction[] from parallel distillers into a
 * single CalculateTaxesInput. Pure TypeScript — no LLM needed.
 */

import type { CalculateTaxesInput } from './tools/calculateTaxes.js';
import type { TaxDocumentExtraction } from './docDistiller.js';
import { validateExtractions } from './extractionValidator.js';

/** Fields that carry forward from prior-year returns (OK to use from any year) */
const CARRYFORWARD_FIELDS = new Set<keyof TaxDocumentExtraction>([
  'depreciation', 'amortization', 'capitalLossCarryforward', 'rentalInsurance', 'priorYearUnallowedLoss',
]);


/** Get the highest non-null numeric value (for fields where annual total > installments) */
function maxValue(extractions: TaxDocumentExtraction[], field: keyof TaxDocumentExtraction): number {
  let max = 0;
  for (const ext of extractions) {
    const val = ext[field];
    if (typeof val === 'number' && val > max) max = val;
  }
  return max;
}

/** Sum a numeric field across all extractions */
function sumValues(extractions: TaxDocumentExtraction[], field: keyof TaxDocumentExtraction): number {
  return extractions.reduce((sum, ext) => {
    const val = ext[field];
    return sum + (typeof val === 'number' ? val : 0);
  }, 0);
}


/** Merge multiple extractions into a single CalculateTaxesInput */
export function mergeExtractions(rawExtractions: TaxDocumentExtraction[]): CalculateTaxesInput {
  // Validate and identify prior-year returns
  const { validated: extractions, priorYearDocs } = validateExtractions(rawExtractions);
  const priorYearSet = new Set(priorYearDocs);

  const result: CalculateTaxesInput = {};

  // ── Single-source fields: last non-null wins, skip prior-year for non-carryforward ──
  const v = (field: keyof TaxDocumentExtraction): number | undefined => {
    const isCarryforward = CARRYFORWARD_FIELDS.has(field);
    let val: number | undefined;
    for (const ext of extractions) {
      const fv = ext[field];
      if (fv != null && typeof fv === 'number' && fv !== 0) {
        if (!isCarryforward && priorYearSet.has(ext.sourceDocument)) continue;
        val = fv;
      }
    }
    return val;
  };

  if (v('wages')) result.wages = v('wages');
  if (v('federalWithholding')) result.federalWithholding = v('federalWithholding');
  if (v('stateWithholding')) result.stateWithholding = v('stateWithholding');
  if (v('qualifiedDividends')) result.qualifiedDividends = v('qualifiedDividends');
  if (v('ordinaryDividends')) result.ordinaryDividends = v('ordinaryDividends');
  if (v('longTermCapitalGains')) result.longTermCapitalGains = v('longTermCapitalGains');
  if (v('shortTermCapitalGains')) result.shortTermCapitalGains = v('shortTermCapitalGains');
  if (v('taxableIraDistributions')) result.taxableIraDistributions = v('taxableIraDistributions');
  if (v('taxablePensions')) result.taxablePensions = v('taxablePensions');
  if (v('socialSecurityBenefits')) result.socialSecurityBenefits = v('socialSecurityBenefits');
  if (v('selfEmploymentIncome')) result.selfEmploymentIncome = v('selfEmploymentIncome');
  if (v('unemploymentCompensation')) result.unemploymentCompensation = v('unemploymentCompensation');
  if (v('alimonyReceived')) result.alimonyReceived = v('alimonyReceived');
  if (v('farmIncome')) result.farmIncome = v('farmIncome');
  if (v('k1OrdinaryIncome')) result.k1OrdinaryIncome = v('k1OrdinaryIncome');
  if (v('k1RentalIncome')) result.k1RentalIncome = v('k1RentalIncome');
  if (v('form4797Gain')) result.form4797Gain = v('form4797Gain');
  if (v('primaryPropertyTax')) result.primaryPropertyTax = v('primaryPropertyTax');
  if (v('dependentCareExpenses')) result.dependentCareExpenses = v('dependentCareExpenses');
  // Care provider info from daycare extraction
  const providerExt = extractions.find((e) => e.careProvider?.name);
  if (providerExt?.careProvider) result.careProvider = providerExt.careProvider;
  if (v('capitalLossCarryforward')) result.capitalLossCarryforward = v('capitalLossCarryforward');
  if (v('hsaDeduction')) result.hsaDeduction = v('hsaDeduction');
  if (v('studentLoanInterest')) result.studentLoanInterest = v('studentLoanInterest');
  if (v('educationExpenses')) result.educationExpenses = v('educationExpenses');
  if (v('foreignTaxCredit')) result.foreignTaxCredit = v('foreignTaxCredit');
  if (v('premiumTaxCredit')) result.premiumTaxCredit = v('premiumTaxCredit');
  if (v('retirementContributions')) result.retirementContributions = v('retirementContributions');
  if (v('cleanEnergyCredit')) result.cleanEnergyCredit = v('cleanEnergyCredit');
  if (v('energyImprovementCredit')) result.energyImprovementCredit = v('energyImprovementCredit');
  if (v('educatorExpenses')) result.educatorExpenses = v('educatorExpenses');
  // Primary mortgage flows to Schedule A
  const primaryMortgage = v('primaryMortgageInterest');
  if (primaryMortgage) (result as Record<string, unknown>).primaryMortgageInterest = primaryMortgage;
  if (v('estimatedPayments')) result.estimatedPayments = v('estimatedPayments');

  // String fields: last non-empty wins
  let occupation: string | undefined;
  for (const ext of extractions) {
    if (ext.occupation && typeof ext.occupation === 'string' && ext.occupation.length > 1) {
      occupation = ext.occupation;
    }
  }
  if (occupation) (result as Record<string, unknown>).occupation = occupation;

  // Current-year extractions: exclude prior-year returns for income/rental data
  const currentYearExtractions = extractions.filter((e) => !priorYearSet.has(e.sourceDocument));

  // Fix misclassified primary property tax: if no primaryPropertyTax was found,
  // check for documents that have rentalPropertyTax but NO valid rental units
  // AND no other rental indicators (mortgage, insurance). These are likely
  // primary residence tax bills misclassified as rental by the LLM.
  if (!result.primaryPropertyTax) {
    for (const ext of currentYearExtractions) {
      if (ext.rentalPropertyTax && ext.rentalPropertyTax > 0) {
        const hasValidRental = (ext.rentalUnits ?? []).some((u) => u.grossRent > 0);
        const hasRentalIndicators = (ext.rentalMortgageInterest && ext.rentalMortgageInterest > 0)
          || (ext.rentalInsurance && ext.rentalInsurance > 0);
        if (!hasValidRental && !hasRentalIndicators) {
          result.primaryPropertyTax = ext.rentalPropertyTax;
          console.log(`[Merge] Reclassified rentalPropertyTax $${ext.rentalPropertyTax} from ${ext.sourceDocument} as primaryPropertyTax (no rental units or rental indicators in doc)`);
          break;
        }
      }
    }
  }

  // Taxable interest is additive (multiple 1099-INTs) — skip prior-year
  const taxableInterest = sumValues(currentYearExtractions, 'taxableInterest');
  if (taxableInterest > 0) result.otherIncome = taxableInterest;

  // ── Rental: concat units + combine with 1098 data ──
  const allRentalUnits = currentYearExtractions.flatMap((e) => e.rentalUnits ?? []);

  // For rental mortgage/tax/insurance, prefer 1098 source (escrow = what was PAID)
  // over property tax bills (what was BILLED, which may differ).
  // A 1098 doc is one that also has rentalMortgageInterest.
  const is1098 = (e: TaxDocumentExtraction) => e.rentalMortgageInterest != null && e.rentalMortgageInterest > 0;
  const rental1098s = currentYearExtractions.filter(is1098);
  const rentalMortgage = rental1098s.length > 0
    ? maxValue(rental1098s, 'rentalMortgageInterest')
    : maxValue(currentYearExtractions, 'rentalMortgageInterest');
  const rentalPropTax = rental1098s.length > 0
    ? maxValue(rental1098s, 'rentalPropertyTax')
    : maxValue(currentYearExtractions, 'rentalPropertyTax');
  const rentalInsurance = rental1098s.length > 0
    ? maxValue(rental1098s, 'rentalInsurance')
    : maxValue(extractions, 'rentalInsurance');
  const depreciation = v('depreciation') ?? 0;
  const amortization = v('amortization') ?? 0;

  if (allRentalUnits.length > 0 || rentalMortgage > 0 || rentalPropTax > 0 || rentalInsurance > 0 || depreciation > 0 || amortization > 0) {
    const unitOtherExp = allRentalUnits.reduce((s, u) => s + (u.otherExpenses ?? 0), 0);
    result.scheduleEInput = {
      grossRentalIncome: allRentalUnits.reduce((s, u) => s + (u.grossRent ?? 0), 0),
      managementFees: allRentalUnits.reduce((s, u) => s + (u.managementFees ?? 0), 0),
      repairs: allRentalUnits.reduce((s, u) => s + (u.repairs ?? 0), 0),
      utilities: allRentalUnits.reduce((s, u) => s + (u.utilities ?? 0), 0),
      insurance: rentalInsurance + allRentalUnits.reduce((s, u) => s + (u.insurance ?? 0), 0),
      mortgageInterest: rentalMortgage,
      propertyTaxes: rentalPropTax,
      depreciation,
      otherExpenses: amortization + unitOtherExp,
      priorYearUnallowedLoss: v('priorYearUnallowedLoss'),
    };
  }

  // QBI: pass through if explicitly extracted (from prior-year return)
  // Otherwise, calculateTaxes.ts derives it from Schedule E net rental
  if (v('qbiIncome')) result.qbiIncome = v('qbiIncome');

  // Log
  const filledFields = Object.keys(result).filter((k) => (result as Record<string, unknown>)[k] != null);
  console.log(`[Merge] ${extractions.length} extractions → ${filledFields.length} fields: ${filledFields.join(', ')}`);

  return result;
}
