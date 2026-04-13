/**
 * Spec: Schedule E (Rental Income)
 *
 * Status: confirmed
 * Confirm: Rental income/expense calculations match CPA-prepared returns
 * Invalidate: Passive activity loss rules too complex for deterministic engine
 */

import {
  calculateScheduleE,
  calculateRentalExpenses,
  calculatePassiveActivityAllowance,
  calculateRentalDepreciation,
} from '@selftax/core';
import type { ScheduleEInput } from '@selftax/core';

const baseRental: ScheduleEInput = {
  grossRentalIncome: 24000,
  mortgageInterest: 8000,
  propertyTaxes: 4000,
  insurance: 1800,
  repairs: 3200,
  managementFees: 2400,
  depreciation: 9091,
};

describe('Schedule E (Rental Income)', () => {
  test('calculates gross rental income (Line 3)', () => {
    const result = calculateScheduleE(baseRental);
    expect(result.grossIncome).toBe(24000);
  });

  test('deducts mortgage interest (Line 12)', () => {
    const expenses = calculateRentalExpenses(baseRental);
    expect(expenses).toBeGreaterThanOrEqual(8000);
  });

  test('deducts property taxes for rental property (Line 16)', () => {
    // Rental property taxes are NOT subject to SALT cap
    const expensesWithHighTax = calculateRentalExpenses({
      ...baseRental,
      propertyTaxes: 50000, // Way over SALT cap, but Schedule E doesn't care
    });
    expect(expensesWithHighTax).toBeGreaterThanOrEqual(50000);
  });

  test('deducts repairs and maintenance (Line 14)', () => {
    const expenses = calculateRentalExpenses(baseRental);
    expect(expenses).toBeGreaterThanOrEqual(3200);
  });

  test('deducts insurance (Line 9)', () => {
    const expenses = calculateRentalExpenses(baseRental);
    expect(expenses).toBeGreaterThanOrEqual(1800);
  });

  test('deducts property management fees (Line 18 - Other)', () => {
    const expenses = calculateRentalExpenses(baseRental);
    expect(expenses).toBeGreaterThanOrEqual(2400);
  });

  test('calculates depreciation via Form 4562 (Line 18)', () => {
    // $250,000 building basis / 27.5 years = $9,091/year
    const depreciation = calculateRentalDepreciation(250000);
    expect(depreciation).toBe(9091);
  });

  test('calculates net rental income or loss (Line 21)', () => {
    const result = calculateScheduleE(baseRental);
    // 24000 income - 28491 expenses = -4491 loss
    expect(result.totalExpenses).toBe(28491);
    expect(result.netRentalIncome).toBe(-4491);
  });

  test('applies passive activity loss rules', () => {
    // AGI <= $100k: up to $25k allowed
    const lowAGI = calculatePassiveActivityAllowance(-10000, {
      agi: 80000,
      activeParticipant: true,
    });
    expect(lowAGI.allowedLoss).toBe(10000);
    expect(lowAGI.suspendedLoss).toBe(0);

    // AGI $100k-$150k: phased out
    const midAGI = calculatePassiveActivityAllowance(-10000, {
      agi: 120000,
      activeParticipant: true,
    });
    // Max allowance: 25000 - (120000-100000)/2 = 25000 - 10000 = 15000
    expect(midAGI.allowedLoss).toBe(10000); // Loss is less than allowance
    expect(midAGI.suspendedLoss).toBe(0);

    // AGI > $150k: fully suspended
    const highAGI = calculatePassiveActivityAllowance(-10000, {
      agi: 200000,
      activeParticipant: true,
    });
    expect(highAGI.allowedLoss).toBe(0);
    expect(highAGI.suspendedLoss).toBe(10000);
  });

  test('tracks suspended passive losses for carryforward', () => {
    const result = calculateScheduleE(baseRental, {
      agi: 200000,
      activeParticipant: true,
    });
    // Net loss of $4,491, but AGI > $150k → fully suspended
    expect(result.netRentalIncome).toBe(-4491);
    expect(result.allowedLoss).toBe(0);
    expect(result.suspendedLoss).toBe(4491);
    expect(result.amountFor1040).toBe(0); // No loss flows to 1040
  });
});
