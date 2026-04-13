/**
 * Spec: Two 1098s — Primary vs Rental Mortgage
 *
 * Status: hypothesis — when a user has two 1098 forms (one for primary
 * residence, one for rental property), the merger must assign each to
 * the correct destination: primary → Schedule A, rental → Schedule E.
 *
 * Problem: The structured extractor puts both as primaryMortgageInterest
 * because it can't tell which property the 1098 is for. The "last wins"
 * merge logic picks the wrong one, causing:
 *   - Primary mortgage ($14,996) overwritten by rental mortgage ($40,890)
 *   - Rental mortgage ($40,890) goes to Schedule A instead of Schedule E
 *   - Schedule E gets $0 mortgage interest
 *   - Total income inflated by ~$55k (rental expenses understated)
 *
 * Confirm: Primary and rental 1098s are correctly separated.
 * Invalidate: Merger assigns both to the same destination.
 */

import { mergeStructuredExtractions } from '@selftax/core';
import type { StructuredExtraction } from '@selftax/core';

// Two 1098 forms: one for primary residence (Elm), one for rental (Harris)
const PRIMARY_1098: StructuredExtraction = {
  formType: '1098',
  documentTaxYear: 2025,
  primaryMortgageInterest: 14996.38,
  outstandingMortgagePrincipal: 552134.57,
};

const RENTAL_1098: StructuredExtraction = {
  formType: '1098',
  documentTaxYear: 2025,
  primaryMortgageInterest: 40890.07,  // BUG: this is rental, not primary
  outstandingMortgagePrincipal: 869143.49,
  primaryPropertyTax: 17007.07,  // BUG: this is rental property tax from escrow
};

const W2: StructuredExtraction = {
  formType: 'w2',
  documentTaxYear: 2025,
  wages: 217176.44,
  federalWithholding: 30970.89,
  stateWithholding: 14026.86,
};

const PRIOR_YEAR: StructuredExtraction = {
  formType: 'prior-year-return',
  documentTaxYear: 2024,
  capitalLossCarryforward: 114460,
  depreciation: 31353,
  amortization: 829,
  rentalInsurance: 700,
  rentalMortgageInterest: 41736,
  rentalPropertyTax: 17622,
  priorYearUnallowedLoss: 508,
  qbiIncome: 6520,
  occupation: 'SOFTWARE ENGINEER',
};

describe('Two-1098 merge: primary vs rental mortgage', () => {

  test('with one 1098 (primary only), mortgage goes to Schedule A', () => {
    const merged = mergeStructuredExtractions(
      [W2, PRIMARY_1098],
      'mfj',
      2025,
    );
    expect(merged.primaryMortgageInterest).toBe(14996.38);
    expect(merged.scheduleEInput).toBeUndefined();
  });

  test('with two 1098s, smaller goes to primary (Schedule A) and larger to rental (Schedule E)', () => {
    // This is the key test that should pass after the fix.
    // Heuristic: when there are 2+ 1098s, the one with the higher mortgage
    // is likely the rental (rentals often have larger loans), OR we use
    // the prior-year return's rentalMortgageInterest to identify which is which.
    const merged = mergeStructuredExtractions(
      [W2, PRIMARY_1098, RENTAL_1098, PRIOR_YEAR],
      'mfj',
      2025,
    );

    // Primary residence mortgage → Schedule A
    expect(merged.primaryMortgageInterest).toBeCloseTo(14996.38, 0);

    // Rental mortgage → Schedule E
    expect(merged.scheduleEInput).toBeDefined();
    expect(merged.scheduleEInput!.mortgageInterest).toBeCloseTo(40890.07, 0);

    // Rental property tax from escrow → Schedule E (not primary)
    expect(merged.scheduleEInput!.propertyTaxes).toBeCloseTo(17007.07, 0);
  });

  test('prior-year rentalMortgageInterest helps identify which 1098 is rental', () => {
    // The prior-year return shows rentalMortgageInterest: 41,736
    // The current-year 1098 with $40,890 is closest → that's the rental 1098
    const merged = mergeStructuredExtractions(
      [W2, PRIMARY_1098, RENTAL_1098, PRIOR_YEAR],
      'mfj',
      2025,
    );

    // The rental 1098's primaryPropertyTax (17,007) should become rentalPropertyTax
    expect(merged.primaryPropertyTax).toBeUndefined(); // or the Elm property tax
    expect(merged.scheduleEInput!.propertyTaxes).toBeCloseTo(17007.07, 0);
  });

  test('without prior-year hint, last 1098 still wins (no way to distinguish)', () => {
    // Without prior-year rentalMortgageInterest, we can't tell them apart
    const merged = mergeStructuredExtractions(
      [W2, PRIMARY_1098, RENTAL_1098],
      'mfj',
      2025,
    );

    // Without hint, last 1098 wins — this is expected when no prior-year data
    expect(merged.primaryMortgageInterest).toBe(40890.07);
  });
});
