/**
 * Constraint: Two-Path Architecture
 *
 * Scope: packages/tax-core/, packages/mcp/, packages/extension/
 *
 * Decision: Two calculation paths share one engine.
 *   Path 1 (all structured): Browser extracts fields → browser calculates → FreeFile autofill. No server, no LLM.
 *   Path 2 (mixed): Browser sends structured fields + tokenized text → server skips LLM for pre-extracted docs → merges → calculates.
 *
 * REQUIRE: calculateForm1040, buildTaxReturn, toFreeFileFieldMap are all in tax-core (browser-accessible)
 * REQUIRE: StructuredExtraction field names match CalculateTaxesInput / merger field names
 * REQUIRE: Server pipeline recognizes pre-extracted docs (populated fields) and skips LLM for them
 * REQUIRE: structuredExtractor.ts is in tax-core (pure, no I/O, no LLM)
 * DENY: Server re-extracting docs that already have structured fields
 * DENY: Browser-side calculation depending on server/LLM packages
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const structuredExtractorSrc = readFileSync(
  join(__dirname, '../../packages/tax-core/src/forms/structuredExtractor.ts'), 'utf-8',
);
const httpServerSrc = readFileSync(
  join(__dirname, '../../packages/mcp/src/httpServer.ts'), 'utf-8',
);

describe('Constraint: Two-Path Architecture', () => {

  test('structuredExtractor is in tax-core (browser-accessible, no I/O)', () => {
    // No server/LLM imports
    expect(structuredExtractorSrc).not.toContain("from 'pdf-lib'");
    expect(structuredExtractorSrc).not.toContain('claudeRunner');
    expect(structuredExtractorSrc).not.toContain('import { readFileSync');
    expect(structuredExtractorSrc).not.toContain("from 'fs'");
  });

  test('calculateForm1040, buildTaxReturn, toFreeFileFieldMap are all exported from tax-core', () => {
    const engineSrc = readFileSync(
      join(__dirname, '../../packages/tax-core/src/engine/form1040.ts'), 'utf-8',
    );
    const formsSrc = readFileSync(
      join(__dirname, '../../packages/tax-core/src/forms/index.ts'), 'utf-8',
    );
    expect(engineSrc).toContain('export function calculateForm1040');
    expect(formsSrc).toContain('buildTaxReturn');
    expect(formsSrc).toContain('toFreeFileFieldMap');
  });

  test('server pipeline separates structured docs from LLM docs', () => {
    expect(httpServerSrc).toContain('browserExtractions');
    expect(httpServerSrc).toContain('docsNeedingLlm');
  });

  test('server skips LLM when all docs have structured fields', () => {
    // When no docs need LLM, Claude should not be required
    expect(httpServerSrc).toContain('browserExtractions.length === 0');
    expect(httpServerSrc).toContain('using structured data only');
  });

  test('structured extraction field names align with merger/calculator', () => {
    // These field names must exist in StructuredExtraction AND be recognized by the merger
    const requiredFields = [
      'wages', 'federalWithholding', 'stateWithholding',
      'primaryMortgageInterest', 'primaryPropertyTax', 'taxableInterest',
      'capitalLossCarryforward', 'depreciation', 'rentalInsurance',
      'rentalMortgageInterest', 'rentalPropertyTax', 'qbiIncome',
      'priorYearUnallowedLoss', 'amortization', 'occupation',
    ];
    for (const field of requiredFields) {
      expect(structuredExtractorSrc).toContain(field);
    }
  });
});
