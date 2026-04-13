/**
 * Constraint: Single Source of Truth for Tax Math
 *
 * Scope: packages/tax-core/src/engine/, packages/mcp/src/
 *
 * Decision: ALL tax calculations live in form1040.ts and its imported
 * schedule/form functions. No other layer duplicates tax math.
 *
 * REQUIRE: calculateForm1040 is the only entry point for tax computation
 * REQUIRE: httpServer never calls calculateForm1040 directly — goes through handleCalculateTaxes
 * REQUIRE: QBI deduction computed in form1040.ts (not merger or orchestrator)
 * REQUIRE: Schedule E computed in scheduleE.ts (not merger)
 * REQUIRE: Schedule A computed in scheduleA.ts (not merger)
 * DENY: Tax bracket calculations outside engine/
 * DENY: Net rental income calculations in merger
 * DENY: Parallel calculation paths (httpServer must not duplicate calculateTaxes logic)
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const httpServerSrc = readFileSync(join(__dirname, '../../packages/mcp/src/httpServer.ts'), 'utf-8');
const mergerSrc = readFileSync(join(__dirname, '../../packages/mcp/src/extractionMerger.ts'), 'utf-8');

describe('Constraint: Single Source of Truth for Tax Math', () => {

  test('httpServer goes through handleCalculateTaxes, not calculateForm1040', () => {
    expect(httpServerSrc).toContain('handleCalculateTaxes');
    expect(httpServerSrc).not.toMatch(/calculateForm1040\(/);
  });

  test('merger does not compute net rental or QBI', () => {
    expect(mergerSrc).not.toContain('netRental');
    expect(mergerSrc).not.toContain('calculateScheduleE');
  });

  test('merger does not import from tax engine', () => {
    expect(mergerSrc).not.toContain("from '@selftax/core'");
  });
});
