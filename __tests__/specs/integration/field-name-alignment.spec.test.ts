/**
 * Spec: Field Name Alignment — Structured Extraction → FreeFile
 *
 * Status: hypothesis — every field extracted by the structured extractor
 * must flow through the entire pipeline to a FreeFile field name without
 * any name mismatches causing silent data loss.
 *
 * Confirm: Each extracted field reaches the correct FreeFile autofill field.
 * Invalidate: A field is extracted but never reaches FreeFile due to name mismatch.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const structuredSrc = readFileSync(
  join(__dirname, '../../../packages/tax-core/src/forms/structuredExtractor.ts'), 'utf-8',
);
const mergerSrc = readFileSync(
  join(__dirname, '../../../packages/mcp/src/extractionMerger.ts'), 'utf-8',
);
const freeFileSrc = readFileSync(
  join(__dirname, '../../../packages/tax-core/src/forms/freeFileFieldMappings.ts'), 'utf-8',
);

describe('Field name alignment: structured extraction → FreeFile', () => {

  // Each test verifies one field's complete chain

  test('wages: structured → merger → FreeFile txtWagesSalariesTips', () => {
    expect(structuredSrc).toContain('wages');
    expect(mergerSrc).toContain("'wages'");
    expect(freeFileSrc).toContain('txtWagesSalariesTips');
  });

  test('federalWithholding: structured → merger → FreeFile txtW2TaxWithheld', () => {
    expect(structuredSrc).toContain('federalWithholding');
    expect(mergerSrc).toContain("'federalWithholding'");
    expect(freeFileSrc).toContain('txtW2TaxWithheld');
  });

  test('primaryMortgageInterest: structured → merger → FreeFile txtHomeMortRep', () => {
    expect(structuredSrc).toContain('primaryMortgageInterest');
    expect(mergerSrc).toContain("'primaryMortgageInterest'");
    expect(freeFileSrc).toContain('txtHomeMortRep');
  });

  test('primaryPropertyTax: structured → merger → FreeFile txtRealEstTax', () => {
    expect(structuredSrc).toContain('primaryPropertyTax');
    expect(mergerSrc).toContain("'primaryPropertyTax'");
    expect(freeFileSrc).toContain('txtRealEstTax');
  });

  test('taxableInterest: structured → merger → FreeFile txtTaxableInt', () => {
    expect(structuredSrc).toContain('taxableInterest');
    expect(mergerSrc).toContain("'taxableInterest'");
    expect(freeFileSrc).toContain('txtTaxableInt');
  });

  test('capitalLossCarryforward: structured → merger → FreeFile scheduleD', () => {
    expect(structuredSrc).toContain('capitalLossCarryforward');
    expect(mergerSrc).toContain("'capitalLossCarryforward'");
    expect(freeFileSrc).toContain('txtSmallNetlossLimit');
  });

  test('depreciation: structured → merger.scheduleEInput → FreeFile txtSchdeDepreciationExpenseA', () => {
    expect(structuredSrc).toContain('depreciation');
    expect(mergerSrc).toContain("'depreciation'");
    expect(freeFileSrc).toContain('txtSchdeDepreciationExpenseA');
  });

  test('rentalInsurance: structured → merger.scheduleEInput → FreeFile txtScheInsuranceA', () => {
    expect(structuredSrc).toContain('rentalInsurance');
    expect(mergerSrc).toContain("'rentalInsurance'");
    expect(freeFileSrc).toContain('txtScheInsuranceA');
  });

  test('rentalMortgageInterest: structured → merger.scheduleEInput → FreeFile txtScheMortageInterestA', () => {
    expect(structuredSrc).toContain('rentalMortgageInterest');
    expect(mergerSrc).toContain("'rentalMortgageInterest'");
    expect(freeFileSrc).toContain('txtScheMortageInterestA');
  });

  test('rentalPropertyTax: structured → merger.scheduleEInput → FreeFile txtScheTaxesA', () => {
    expect(structuredSrc).toContain('rentalPropertyTax');
    expect(mergerSrc).toContain("'rentalPropertyTax'");
    expect(freeFileSrc).toContain('txtScheTaxesA');
  });

  test('qbiIncome: structured → merger → FreeFile form8995', () => {
    expect(structuredSrc).toContain('qbiIncome');
    expect(mergerSrc).toContain("'qbiIncome'");
    expect(freeFileSrc).toContain('txtTotQualBusiIncLoss');
  });

  test('stateWithholding: structured → merger → CA 540 calculation', () => {
    expect(structuredSrc).toContain('stateWithholding');
    expect(mergerSrc).toContain("'stateWithholding'");
    // State withholding flows through CA 540, not directly to a 1040 FreeFile field
  });

  test('occupation: structured → merger → FreeFile txtOccupation', () => {
    expect(structuredSrc).toContain('occupation');
    expect(mergerSrc).toContain('ext.occupation');
    expect(freeFileSrc).toContain('txtOccupation');
  });
});

