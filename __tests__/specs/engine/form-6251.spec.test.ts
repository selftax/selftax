/**
 * Spec: Form 6251 (Alternative Minimum Tax)
 *
 * Status: confirmed
 * Confirm: AMT calculation correct for ISO exercise scenarios
 * Invalidate: AMT complexity requires more forms than initially scoped
 */

import { calculateForm6251 } from '@selftax/core';

describe('Form 6251 (AMT)', () => {
  test('calculates AMT income with ISO adjustment', () => {
    const result = calculateForm6251({
      filingStatus: 'mfj',
      taxableIncome: 200000,
      regularTax: 35000,
      isoSpread: 50000,
    });
    // AMTI = 200000 + 50000 = 250000
    expect(result.amti).toBe(250000);
  });

  test('applies AMT exemption amount', () => {
    const result = calculateForm6251({
      filingStatus: 'mfj',
      taxableIncome: 200000,
      regularTax: 35000,
      isoSpread: 50000,
    });
    // MFJ exemption: $137,000
    expect(result.exemption).toBe(137000);
    // AMTI after exemption: 250000 - 137000 = 113000
    expect(result.amtiAfterExemption).toBe(113000);
  });

  test('calculates tentative minimum tax', () => {
    const result = calculateForm6251({
      filingStatus: 'mfj',
      taxableIncome: 200000,
      regularTax: 35000,
      isoSpread: 50000,
    });
    // $113,000 × 26% = $29,380
    expect(result.tentativeMinimumTax).toBe(29380);
  });

  test('determines if AMT is owed (tentative min tax > regular tax)', () => {
    // Case where AMT does NOT apply (regular tax higher)
    const noAMT = calculateForm6251({
      filingStatus: 'mfj',
      taxableIncome: 200000,
      regularTax: 35000,
      isoSpread: 50000,
    });
    // TMT $29,380 < regular $35,000 → no AMT
    expect(noAMT.amt).toBe(0);
    expect(noAMT.amtApplies).toBe(false);

    // Case where AMT DOES apply (large ISO spread)
    const yesAMT = calculateForm6251({
      filingStatus: 'mfj',
      taxableIncome: 100000,
      regularTax: 12000,
      isoSpread: 200000,
    });
    // AMTI = 300000, after exemption = 163000
    // TMT = $163,000 × 26% = $42,380
    // AMT = $42,380 - $12,000 = $30,380
    expect(yesAMT.amtApplies).toBe(true);
    expect(yesAMT.amt).toBe(30380);
  });

  test('skips AMT calculation entirely for RSU-only situations', () => {
    // No ISO spread, no SALT add-back, no other adjustments
    const result = calculateForm6251({
      filingStatus: 'mfj',
      taxableIncome: 200000,
      regularTax: 35000,
    });
    expect(result.amt).toBe(0);
    expect(result.amtApplies).toBe(false);
  });
});
