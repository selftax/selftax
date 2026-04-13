/**
 * Constraint: No Early Rounding
 *
 * Scope: packages/tax-core/src/forms/ (parsers), packages/mcp/src/ (extraction)
 *
 * Decision: Document parsers (W-2, 1098, 1099) must preserve exact cents.
 * Rounding to whole dollars (irsRound) only happens in the tax engine
 * (form1040.ts) and form-filling adapters — never during extraction or parsing.
 *
 * Learned: parseDollarAmount in w2Mapper and form1099Mapper was calling
 * irsRound, which truncated $14,996.38 to $14,996 and $30,970.89 to $30,971.
 * This caused wrong values flowing through the entire pipeline.
 *
 * REQUIRE: Parsers preserve decimal cents (parseDollarAmount returns exact float)
 * REQUIRE: irsRound only called in engine/ and form-filling adapters
 * DENY: irsRound in document parsers (w2Mapper, form1099Mapper)
 * DENY: Math.round in document parsers
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const w2Src = readFileSync(join(__dirname, '../../packages/tax-core/src/forms/w2Mapper.ts'), 'utf-8');
const f1099Src = readFileSync(join(__dirname, '../../packages/tax-core/src/forms/form1099Mapper.ts'), 'utf-8');

describe('Constraint: No Early Rounding', () => {

  test('W-2 parseDollarAmount does not call irsRound', () => {
    // Find the parseDollarAmount function in w2Mapper
    const funcMatch = w2Src.match(/function parseDollarAmount[\s\S]*?^}/m);
    expect(funcMatch).toBeTruthy();
    expect(funcMatch![0]).not.toContain('irsRound');
    expect(funcMatch![0]).not.toContain('Math.round');
  });

  test('1099/1098 parseDollarAmount does not call irsRound', () => {
    const funcMatch = f1099Src.match(/function parseDollarAmount[\s\S]*?^}/m);
    expect(funcMatch).toBeTruthy();
    expect(funcMatch![0]).not.toContain('irsRound');
    expect(funcMatch![0]).not.toContain('Math.round');
  });

  test('W-2 mapper does not round extracted values', () => {
    // irsRound should not appear in mapW2Fields or its helpers
    // (it can appear in aggregateW2s which is for final totals)
    const mapFunc = w2Src.slice(
      w2Src.indexOf('export function mapW2Fields'),
      w2Src.indexOf('export function aggregateW2s'),
    );
    expect(mapFunc).not.toContain('irsRound');
  });

  test('1099 mappers do not round extracted values', () => {
    // irsRound should not appear in any map*Fields function
    const mapFuncs = f1099Src.match(/export function map\w+Fields[\s\S]*?^}/gm);
    expect(mapFuncs).toBeTruthy();
    for (const func of mapFuncs!) {
      expect(func).not.toContain('irsRound');
    }
  });
});
