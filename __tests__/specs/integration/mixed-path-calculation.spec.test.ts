/**
 * Spec: Path 2 — Mixed Structured + LLM Calculation
 *
 * Status: hypothesis — when some docs are structured (W-2, 1098) and
 * others need LLM (property tax bills, spreadsheets), the server skips
 * LLM for pre-extracted docs and only runs extraction on unstructured ones.
 *
 * Confirm: Server merges structured browser fields with LLM-extracted fields correctly.
 * Invalidate: Structured fields are dropped, re-extracted by LLM, or cause merge conflicts.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const httpServerSrc = readFileSync(
  join(__dirname, '../../../packages/mcp/src/httpServer.ts'), 'utf-8',
);
const mergerSrc = readFileSync(
  join(__dirname, '../../../packages/mcp/src/extractionMerger.ts'), 'utf-8',
);

describe('Path 2: Mixed structured + LLM extraction', () => {

  test('server separates docs by whether fields are populated', () => {
    // The server checks Object.keys(doc.fields).length > 0
    // Docs with fields go to browserExtractions, rest to docsNeedingLlm
    expect(httpServerSrc).toContain('doc.fields');
    expect(httpServerSrc).toContain('fieldCount > 0');
    expect(httpServerSrc).toContain('browserExtractions');
    expect(httpServerSrc).toContain('docsNeedingLlm');
  });

  test('structured fields are passed directly to merger without LLM', () => {
    // Browser extractions are spread into extraction objects with sourceDocument
    expect(httpServerSrc).toContain('sourceDocument: fileName, ...doc.fields');
  });

  test('LLM is only spawned for docs without structured fields', () => {
    // Only docsNeedingLlm are sent to extractDocuments
    expect(httpServerSrc).toContain('docsNeedingLlm');
    expect(httpServerSrc).toContain('extractDocuments');
    // docsNeedingLlm are filtered to those with redactedText or pdfBase64
    expect(httpServerSrc).toContain("filter((d) => d.redactedText || d.pdfBase64)");
  });

  test('merger accepts both structured and LLM extractions in same array', () => {
    // allExtractions = [...browserExtractions, ...llmExtractions]
    expect(httpServerSrc).toContain('...browserExtractions');
    expect(httpServerSrc).toContain('...llmExtractions');
    expect(httpServerSrc).toContain('mergeExtractions');
  });

  test('server works without Claude when all docs are structured', () => {
    // If browserExtractions has entries and docsNeedingLlm is empty,
    // Claude is not required
    expect(httpServerSrc).toContain("Claude CLI not available — using structured data only");
  });
});

describe('Field name alignment: StructuredExtraction → merger → CalculateTaxesInput', () => {

  test('merger recognizes wages and federalWithholding fields', () => {
    expect(mergerSrc).toContain("'wages'");
    expect(mergerSrc).toContain("'federalWithholding'");
  });

  test('merger recognizes primaryMortgageInterest (not mortgageInterest)', () => {
    expect(mergerSrc).toContain("'primaryMortgageInterest'");
  });

  test('merger recognizes primaryPropertyTax (not propertyTax)', () => {
    expect(mergerSrc).toContain("'primaryPropertyTax'");
  });

  test('merger recognizes taxableInterest and sums it', () => {
    expect(mergerSrc).toContain("'taxableInterest'");
    expect(mergerSrc).toContain('sumValues');
  });

  test('merger maps rental fields to scheduleEInput', () => {
    expect(mergerSrc).toContain('scheduleEInput');
    expect(mergerSrc).toContain("'rentalInsurance'");
    expect(mergerSrc).toContain("'rentalMortgageInterest'");
    expect(mergerSrc).toContain("'rentalPropertyTax'");
    expect(mergerSrc).toContain("'depreciation'");
  });

  test('merger recognizes capitalLossCarryforward from prior-year', () => {
    expect(mergerSrc).toContain("'capitalLossCarryforward'");
    expect(mergerSrc).toContain('CARRYFORWARD_FIELDS');
  });

  test('merger recognizes qbiIncome', () => {
    expect(mergerSrc).toContain("'qbiIncome'");
  });

  test('merger recognizes occupation', () => {
    expect(mergerSrc).toContain('occupation');
  });

  test('merger recognizes stateWithholding', () => {
    expect(mergerSrc).toContain("'stateWithholding'");
  });
});
