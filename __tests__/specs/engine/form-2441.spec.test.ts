/**
 * Spec: Form 2441 (Dependent Care)
 *
 * Status: confirmed
 * Confirm: FSA exclusion correctly reduces dependent care credit
 * Invalidate: Credit phase-out calculation edge cases
 */

import { calculateForm2441, getDependentCarePercentage } from '@selftax/core';

describe('Form 2441 (Dependent Care)', () => {
  test('calculates dependent care credit from qualifying expenses', () => {
    const result = calculateForm2441({
      qualifyingExpenses: 6000,
      qualifyingPersons: 2,
      agi: 50000,
    });
    // $6,000 expenses × 20% = $1,200
    expect(result.credit).toBe(1200);
  });

  test('reduces qualifying expenses by FSA exclusion', () => {
    const result = calculateForm2441({
      qualifyingExpenses: 6000,
      qualifyingPersons: 2,
      fsaExclusion: 5000,
      agi: 50000,
    });
    // $6,000 - $5,000 FSA = $1,000 × 20% = $200
    expect(result.expensesAfterFSA).toBe(1000);
    expect(result.credit).toBe(200);
  });

  test('returns $0 credit when FSA covers all expenses', () => {
    const result = calculateForm2441({
      qualifyingExpenses: 5000,
      qualifyingPersons: 1,
      fsaExclusion: 5000,
      agi: 50000,
    });
    // $3,000 max (1 person) - $5,000 FSA → $0
    expect(result.expensesAfterFSA).toBe(0);
    expect(result.credit).toBe(0);
  });

  test('applies correct credit percentage based on AGI', () => {
    // AGI > $43,000 → 20%
    expect(getDependentCarePercentage(50000)).toBe(0.20);
    expect(getDependentCarePercentage(200000)).toBe(0.20);

    // AGI <= $15,000 → 35%
    expect(getDependentCarePercentage(15000)).toBe(0.35);
    expect(getDependentCarePercentage(10000)).toBe(0.35);

    // AGI $15,000-$43,000 → sliding scale
    const mid = getDependentCarePercentage(25000);
    expect(mid).toBeGreaterThan(0.20);
    expect(mid).toBeLessThan(0.35);
  });
});
