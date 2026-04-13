/**
 * Constraint: Extraction Accuracy Rules
 *
 * Scope: packages/mcp/src/extractionMerger.ts, docDistiller.ts
 *
 * Decision: Specific rules for resolving ambiguous extracted values,
 * learned from production bugs.
 *
 * REQUIRE: Rental property tax/mortgage/insurance prefer 1098 source over tax bills
 *   (1098 escrow = what was PAID, tax bill = what was BILLED — can differ)
 * REQUIRE: Taxable interest sums across docs but EXCLUDES prior-year
 * REQUIRE: Capital loss carryforward prompt asks for AFTER $3k deduction
 * REQUIRE: Retirement contributions prompt excludes 401k deferrals (W-2 Box 12)
 * DENY: maxValue for rental fields picking tax bill over 1098
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const mergerSrc = readFileSync(join(__dirname, '../../packages/mcp/src/extractionMerger.ts'), 'utf-8');
const distillerSrc = readFileSync(join(__dirname, '../../packages/mcp/src/docDistiller.ts'), 'utf-8');

describe('Constraint: Extraction Accuracy Rules', () => {

  test('rental fields prefer 1098 source over property tax bills', () => {
    // Merger identifies 1098 docs (have rentalMortgageInterest) and prefers their values
    expect(mergerSrc).toContain('is1098');
    expect(mergerSrc).toContain('rental1098s');
  });

  test('taxable interest excludes prior-year documents', () => {
    expect(mergerSrc).toContain('currentYearExtractions');
    expect(mergerSrc).toMatch(/taxableInterest.*currentYear/);
  });

  test('capital loss prompt asks for carryforward (after deduction)', () => {
    expect(distillerSrc).toContain('CARRYFORWARD');
    expect(distillerSrc).toContain('after');
    expect(distillerSrc).toContain('3,000');
  });

  test('retirement contributions prompt excludes 401k', () => {
    expect(distillerSrc).toContain('NOT 401k');
  });
});
