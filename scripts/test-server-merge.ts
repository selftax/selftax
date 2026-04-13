/**
 * Simulate what the server merger does with our pre-merged + LLM extractions.
 * No actual server call — just runs the merger directly.
 */
import type { TaxDocumentExtraction } from '../packages/mcp/src/docDistiller';
import { mergeExtractions } from '../packages/mcp/src/extractionMerger';

// Pre-merged structured extraction (sent by browser)
const structuredPreMerged: TaxDocumentExtraction = {
  sourceDocument: 'w2-0',
  documentTaxYear: 2025,
  wages: 217176.44,
  federalWithholding: 30970.89,
  stateWithholding: 14026.86,
  capitalLossCarryforward: 114460,
  qbiIncome: 6775,
  primaryMortgageInterest: 14996.38,
  occupation: 'SOFTWARE ENGINEER',
  taxableInterest: 191.56,
  rentalMortgageInterest: 40890.07,
  rentalPropertyTax: 17007.07,
  rentalInsurance: 6332,
  depreciation: 32182,
  priorYearUnallowedLoss: 508,
};

// LLM extractions (from the server run)
const llmExtractions: TaxDocumentExtraction[] = [
  { sourceDocument: 'daycare-statement-0', documentTaxYear: 2025, dependentCareExpenses: 12025.05 },
  { sourceDocument: 'property-tax-bill-1', documentTaxYear: 2025, primaryPropertyTax: 13528.08 },
  { sourceDocument: 'xls-1', documentTaxYear: 2025, rentalUnits: [{ address: '718 Harris #1', grossRent: 26700, managementFees: 1602, repairs: 2325, utilities: 10004.09, insurance: 0, otherExpenses: 0 }] },
  { sourceDocument: 'xls-2', documentTaxYear: 2025, rentalUnits: [{ address: '718 Harris #2', grossRent: 31500, managementFees: 1890, repairs: 100, utilities: 0, insurance: 0, otherExpenses: 0 }] },
  { sourceDocument: 'xls-3', documentTaxYear: 2025, rentalUnits: [{ address: '718 Harris #3', grossRent: 28500, managementFees: 1710, repairs: 0, utilities: 0, insurance: 0, otherExpenses: 0 }] },
  { sourceDocument: 'xls-4', documentTaxYear: 2025, rentalUnits: [{ address: '718 Harris #4', grossRent: 34500, managementFees: 2070, repairs: 0, utilities: 0, insurance: 0, otherExpenses: 0 }] },
  { sourceDocument: 'property-tax-bill-6', documentTaxYear: 2024, rentalPropertyTax: 17442.56 },
  { sourceDocument: 'property-tax-bill-7', documentTaxYear: 2025, rentalPropertyTax: 8285.79 },
  { sourceDocument: 'w2-8', documentTaxYear: 2025 },
  { sourceDocument: '1099-b-10', documentTaxYear: 2025 },
];

const all = [structuredPreMerged, ...llmExtractions];
console.log(`Merging ${all.length} extractions...`);
const result = mergeExtractions(all as TaxDocumentExtraction[]);

console.log('\nMerged overrides:');
console.log(JSON.stringify(result, null, 2));

// Check the key fields
console.log('\n=== Key checks ===');
console.log(`primaryPropertyTax: ${result.primaryPropertyTax} (expected: 13528.08)`);
console.log(`primaryMortgageInterest: ${(result as any).primaryMortgageInterest} (expected: 14996.38)`);
console.log(`scheduleEInput.mortgageInterest: ${result.scheduleEInput?.mortgageInterest} (expected: 40890.07)`);
console.log(`scheduleEInput.propertyTaxes: ${result.scheduleEInput?.propertyTaxes} (expected: 17007.07)`);
console.log(`scheduleEInput.insurance: ${result.scheduleEInput?.insurance} (expected: 6332)`);
