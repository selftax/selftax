/**
 * Constraint: Pipeline Layer Separation
 *
 * Scope: packages/mcp/src/
 *
 * Decision: Each pipeline layer has ONE job. No layer does another's work.
 *   - Distiller: extract values from ONE document → JSON (no cross-doc logic)
 *     Uses per-document-type templates for focused extraction.
 *     Classifies ambiguous docs (receipt/other) before extracting.
 *     Retries failed extractions; aborts if any doc fails completely.
 *   - Validator: clean bad data, tag prior-year docs (no tax calculations)
 *   - Merger: combine extractions (sum, last-wins, max) — no tax calculations
 *   - calculateTaxes: derive values (QBI, Schedule A), run engine
 *   - form1040: all tax math (single source of truth)
 *
 * REQUIRE: Merger has no tax calculation imports (no calculateScheduleE, etc.)
 * REQUIRE: Merger has no Math operations beyond summing/maxing extracted values
 * REQUIRE: Validator has no engine imports
 * REQUIRE: Distiller has no cross-document logic (no imports from merger/validator)
 * REQUIRE: Distiller uses per-type templates (TYPE_TEMPLATES), not one generic prompt
 * REQUIRE: Distiller retries failed extractions (MAX_RETRIES)
 * DENY: Tax calculations in merger (net rental, QBI derivation, bracket math)
 * DENY: Merger importing from engine/
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const mergerSrc = readFileSync(join(__dirname, '../../packages/mcp/src/extractionMerger.ts'), 'utf-8');
const validatorSrc = readFileSync(join(__dirname, '../../packages/mcp/src/extractionValidator.ts'), 'utf-8');
const distillerSrc = readFileSync(join(__dirname, '../../packages/mcp/src/docDistiller.ts'), 'utf-8');

describe('Constraint: Pipeline Layer Separation', () => {

  test('merger has no engine imports', () => {
    expect(mergerSrc).not.toContain("from '@selftax/core'");
    expect(mergerSrc).not.toContain('calculateScheduleE');
    expect(mergerSrc).not.toContain('calculateForm1040');
    expect(mergerSrc).not.toContain('calculateScheduleA');
  });

  test('merger has no tax calculations (only summing/merging)', () => {
    // No net rental calculation
    expect(mergerSrc).not.toContain('netRental');
    // No bracket math
    expect(mergerSrc).not.toContain('bracket');
    expect(mergerSrc).not.toContain('irsRound');
  });

  test('validator has no engine imports', () => {
    expect(validatorSrc).not.toContain("from '@selftax/core'");
    expect(validatorSrc).not.toContain('calculateForm1040');
  });

  test('distiller has no cross-document imports', () => {
    expect(distillerSrc).not.toContain('extractionMerger');
    expect(distillerSrc).not.toContain('extractionValidator');
    expect(distillerSrc).not.toContain('mergeExtractions');
  });

  test('distiller uses per-type templates', () => {
    expect(distillerSrc).toContain('TYPE_TEMPLATES');
    expect(distillerSrc).toContain('buildExtractionPrompt');
    expect(distillerSrc).toContain('documentType');
  });

  test('distiller retries failed extractions before aborting', () => {
    expect(distillerSrc).toContain('MAX_RETRIES');
    expect(distillerSrc).toContain('throw new Error');
  });
});
