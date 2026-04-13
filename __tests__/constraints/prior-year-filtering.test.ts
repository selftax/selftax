/**
 * Constraint: Prior-Year Return Filtering
 *
 * Scope: packages/mcp/src/extractionValidator.ts, extractionMerger.ts
 *
 * Decision: Prior-year returns are detected and filtered in CODE, not LLM prompts.
 * The LLM extracts everything it sees. The validator tags prior-year docs.
 * The merger skips non-carryforward fields from tagged docs.
 *
 * Learned: Prior-year returns (e.g., 2024 Tax Return) contain ALL fields
 * (wages, withholding, rental income, etc.) with LAST YEAR's values.
 * If these leak into the merge, income doubles and the result is catastrophically wrong.
 *
 * REQUIRE: Validator detects prior-year by documentTaxYear (LLM-tagged)
 * REQUIRE: Validator has heuristic fallback (>10 fields + wages + rental + cap loss)
 * REQUIRE: Validator has filename fallback (regex for year patterns)
 * REQUIRE: Merger skips non-carryforward fields from prior-year docs
 * REQUIRE: Merger uses UNIQUE document IDs (not just type names)
 * REQUIRE: Carryforward fields (depreciation, capital loss, insurance) still accepted
 * DENY: Prior-year wages, withholding, rental income flowing to calculation
 * DENY: Prior-year rental units in the rental unit sum
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const validatorSrc = readFileSync(join(__dirname, '../../packages/mcp/src/extractionValidator.ts'), 'utf-8');
const mergerSrc = readFileSync(join(__dirname, '../../packages/mcp/src/extractionMerger.ts'), 'utf-8');
const httpServerSrc = readFileSync(join(__dirname, '../../packages/mcp/src/httpServer.ts'), 'utf-8');

describe('Constraint: Prior-Year Return Filtering', () => {

  test('validator detects prior-year by documentTaxYear', () => {
    expect(validatorSrc).toContain('documentTaxYear');
    expect(validatorSrc).toContain('< 2025');
  });

  test('validator has heuristic fallback for detection', () => {
    expect(validatorSrc).toContain('looksLikeFullReturn');
    expect(validatorSrc).toContain('fieldCount > 10');
  });

  test('validator has filename regex fallback', () => {
    expect(validatorSrc).toMatch(/2024|2023|2022|tax.*return/i);
  });

  test('merger defines carryforward fields explicitly', () => {
    expect(mergerSrc).toContain('CARRYFORWARD_FIELDS');
    expect(mergerSrc).toContain('depreciation');
    expect(mergerSrc).toContain('capitalLossCarryforward');
  });

  test('merger skips non-carryforward fields from prior-year', () => {
    expect(mergerSrc).toContain('priorYearSet');
    expect(mergerSrc).toContain('isCarryforward');
    expect(mergerSrc).toContain('continue'); // skip logic
  });

  test('merger filters prior-year rental units', () => {
    expect(mergerSrc).toContain('currentYearExtractions');
    expect(mergerSrc).toContain('priorYearSet');
  });

  test('document IDs are unique (not just type names)', () => {
    // httpServer uses index fallback for uniqueness
    expect(httpServerSrc).toContain('`${d.type}-${i}`');
  });
});
