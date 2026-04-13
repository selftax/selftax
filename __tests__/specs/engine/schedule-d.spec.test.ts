/**
 * Spec: Schedule D + Form 8949 (Capital Gains)
 *
 * Status: confirmed
 * Confirm: Stock sale calculations match brokerage 1099-B data
 * Invalidate: Wash sale tracking requires trade-by-trade state too complex for V1
 */

import {
  calculateScheduleD,
  calculateGainLoss,
  isLongTerm,
} from '@selftax/core';
import type { StockTransaction } from '@selftax/core';

describe('Schedule D + Form 8949', () => {
  test('classifies short-term gains (held < 1 year)', () => {
    expect(isLongTerm('2025-03-01', '2025-09-01')).toBe(false);
  });

  test('classifies long-term gains (held >= 1 year)', () => {
    expect(isLongTerm('2024-01-15', '2025-03-01')).toBe(true);
  });

  test('calculates gain/loss per lot', () => {
    const tx: StockTransaction = {
      description: '100 shares ACME',
      dateAcquired: '2024-01-01',
      dateSold: '2025-06-01',
      proceeds: 10000,
      costBasis: 8000,
    };
    expect(calculateGainLoss(tx)).toBe(2000);
  });

  test('corrects RSU cost basis (Box 1e may be $0 on 1099-B)', () => {
    // Brokerage reports $0 basis, but RSU vested at $50/share × 100 = $5,000
    const tx: StockTransaction = {
      description: '100 shares RSU',
      dateAcquired: '2024-06-15',
      dateSold: '2025-06-15',
      proceeds: 6000,
      costBasis: 0, // Wrong basis from brokerage
      adjustment: 5000, // Corrected: already taxed as income at vest
      adjustmentCode: 'B',
    };
    expect(calculateGainLoss(tx)).toBe(1000);
  });

  test('handles wash sales (disallowed loss)', () => {
    const tx: StockTransaction = {
      description: '50 shares ACME',
      dateAcquired: '2025-01-01',
      dateSold: '2025-02-01',
      proceeds: 4000,
      costBasis: 5000,
      adjustment: 500, // Disallowed wash sale loss added to basis
      adjustmentCode: 'W',
    };
    // Proceeds $4,000 - adjusted basis ($5,000 + $500) = -$1,500
    expect(calculateGainLoss(tx)).toBe(-1500);
  });

  test('aggregates into Schedule D summary lines', () => {
    const transactions: StockTransaction[] = [
      {
        description: 'Short-term gain',
        dateAcquired: '2025-03-01',
        dateSold: '2025-09-01',
        proceeds: 5000,
        costBasis: 3000,
      },
      {
        description: 'Long-term gain',
        dateAcquired: '2024-01-01',
        dateSold: '2025-06-01',
        proceeds: 10000,
        costBasis: 8000,
      },
      {
        description: 'Long-term loss',
        dateAcquired: '2023-06-01',
        dateSold: '2025-01-01',
        proceeds: 3000,
        costBasis: 5000,
      },
    ];
    const result = calculateScheduleD(transactions);
    expect(result.shortTermNet).toBe(2000);
    expect(result.longTermNet).toBe(0); // 2000 gain + -2000 loss
    expect(result.netCapitalGainLoss).toBe(2000);
  });

  test('applies $3,000 capital loss limitation', () => {
    const transactions: StockTransaction[] = [
      {
        description: 'Big loss',
        dateAcquired: '2024-01-01',
        dateSold: '2025-06-01',
        proceeds: 2000,
        costBasis: 12000,
      },
    ];
    const result = calculateScheduleD(transactions);
    expect(result.netCapitalGainLoss).toBe(-10000);
    expect(result.capitalLossDeduction).toBe(3000);
    expect(result.carryforwardLoss).toBe(7000);
  });
});
