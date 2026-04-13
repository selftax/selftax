/**
 * Constraint: Generic PII Sweep
 *
 * Scope: packages/tax-core/src/pii/tokenizePII.ts
 *
 * Decision: After semantic tokens are placed ([SELF], [HOME_ADDRESS], etc.),
 * a generic sweep must catch ALL remaining PII patterns:
 *   - Phone numbers (all formats)
 *   - Email addresses
 *   - SSNs (any remaining)
 *   - EINs (employer ID numbers)
 *
 * This prevents third-party PII (CPA names/phones, employer EINs) from
 * being sent to the LLM even though they're not in the user's profile.
 *
 * REQUIRE: tokenizePII catches phone numbers in all common formats
 * REQUIRE: tokenizePII catches email addresses
 * REQUIRE: tokenizePII catches EINs (XX-XXXXXXX)
 * REQUIRE: tokenizePII catches remaining SSN patterns
 * DENY: Raw phone numbers in tokenized output
 * DENY: Raw email addresses in tokenized output
 */

import { tokenizePII } from '@selftax/core';
import type { TokenizationProfile } from '@selftax/core/pii/tokenizePII';

const EMPTY_PROFILE: TokenizationProfile = {
  selfNames: [],
  spouseNames: [],
  dependentNames: [],
  homeAddress: [],
  rentalAddresses: [],
  ssns: [],
  accountNumbers: [],
};

describe('Constraint: Generic PII Sweep', () => {

  test('redacts phone numbers in (XXX) XXX-XXXX format', () => {
    const result = tokenizePII('Call us at (510) 272-6800 for info', EMPTY_PROFILE);
    expect(result).not.toContain('510');
    expect(result).not.toContain('272-6800');
    expect(result).toContain('[REDACTED_PHONE]');
  });

  test('redacts phone numbers in 1-XXX-XXX-XXXX format', () => {
    const result = tokenizePII('Call 1-800-848-9136 for support', EMPTY_PROFILE);
    expect(result).not.toContain('800-848-9136');
    expect(result).toContain('[REDACTED_PHONE]');
  });

  test('redacts phone numbers in XXX-XXX-XXXX format', () => {
    const result = tokenizePII('Phone: 415-867-0568', EMPTY_PROFILE);
    expect(result).not.toContain('415-867-0568');
    expect(result).toContain('[REDACTED_PHONE]');
  });

  test('redacts email addresses', () => {
    const result = tokenizePII('Email: janedoe@example.com for questions', EMPTY_PROFILE);
    expect(result).not.toContain('janedoe@example.com');
    expect(result).toContain('[REDACTED_EMAIL]');
  });

  test('redacts EINs (XX-XXXXXXX)', () => {
    const result = tokenizePII('Firm EIN: 81-1069930', EMPTY_PROFILE);
    expect(result).not.toContain('81-1069930');
    expect(result).toContain('[REDACTED_EIN]');
  });

  test('redacts unknown SSNs', () => {
    const result = tokenizePII('SSN: 999-88-7777 on file', EMPTY_PROFILE);
    expect(result).not.toContain('999-88-7777');
    expect(result).toContain('[UNKNOWN_SSN]');
  });

  test('does NOT redact dollar amounts', () => {
    const result = tokenizePII('Box 1 Wages: $217,176.44', EMPTY_PROFILE);
    expect(result).toContain('217,176.44');
  });

  test('does NOT redact zip codes (5 digits)', () => {
    const result = tokenizePII('Testville CA 90210', EMPTY_PROFILE);
    expect(result).toContain('90210');
  });

  test('does NOT redact tax form numbers', () => {
    const result = tokenizePII('Form 1040 Schedule D line 14', EMPTY_PROFILE);
    expect(result).toContain('1040');
    expect(result).toContain('14');
  });

  test('redacts street addresses (123 MAIN ST format)', () => {
    const result = tokenizePII('Office at 9999 OAKWOOD AVE STE A', EMPTY_PROFILE);
    expect(result).not.toContain('9999 OAKWOOD');
    expect(result).toContain('[REDACTED_ADDRESS]');
  });

  test('redacts street addresses with common suffixes', () => {
    const result = tokenizePII('Located at 642 HARRISON STREET', EMPTY_PROFILE);
    expect(result).not.toContain('642 HARRISON');
    expect(result).toContain('[REDACTED_ADDRESS]');
  });

  test('redacts truncated addresses (456 MAPLE C)', () => {
    const result = tokenizePII('Property: 456 MAPLE C SCH E', EMPTY_PROFILE);
    expect(result).not.toContain('456 MAPLE C');
    expect(result).toContain('[REDACTED_ADDRESS]');
  });

  test('redacts street addresses with DRIVE, COURT, etc.', () => {
    const texts = [
      '350 BUSH STREET 18TH FLOOR',
      '8950 CYPRESS WATERS BLVD',
      '3415 VISION DRIVE OH4-7214',
    ];
    for (const t of texts) {
      const result = tokenizePII(t, EMPTY_PROFILE);
      expect(result).toContain('[REDACTED_ADDRESS]');
    }
  });

  test('redacts preparer/firm names after known labels', () => {
    const result = tokenizePII("Firm's name WHO'S YOUR TAX MAN", EMPTY_PROFILE);
    expect(result).not.toContain("WHO'S YOUR TAX MAN");
  });

  test('redacts preparer name after Preparer label', () => {
    const result = tokenizePII("Preparer's name JOHN SMITH", EMPTY_PROFILE);
    expect(result).toContain('[REDACTED_NAME]');
    expect(result).not.toContain('JOHN SMITH');
  });

  test('redacts ERO signature names', () => {
    const result = tokenizePII("ERO's signature JOHN SMITH Date", EMPTY_PROFILE);
    expect(result).toContain('[REDACTED_NAME]');
    expect(result).not.toContain('JOHN SMITH');
  });

  test('final sweep catches orphaned first names', () => {
    const profile: TokenizationProfile = {
      ...EMPTY_PROFILE,
      selfNames: ['JANE', 'DOE'],
    };
    // Simulate case where last name was replaced by dependent token
    // leaving first name orphaned
    const result = tokenizePII('JANE [DEP_1] filed taxes', profile);
    expect(result).not.toContain('JANE');
    expect(result).toContain('[SELF]');
  });

  test('catches truncated rental addresses', () => {
    const profile: TokenizationProfile = {
      ...EMPTY_PROFILE,
      rentalAddresses: [['456 MAPLE COURT']],
    };
    const result = tokenizePII('Property: 456 MAPLE C in worksheet', profile);
    expect(result).not.toContain('456 MAPLE C');
    expect(result).toContain('[RENTAL_1_ADDRESS]');
  });

  test('shared last name maps to [SELF] not [DEP_1]', () => {
    const profile: TokenizationProfile = {
      ...EMPTY_PROFILE,
      selfNames: ['JANE', 'DOE'],
      dependentNames: [['KID', 'DOE'], ['TOT', 'DOE']],
    };
    // "DOE" appears in both self and dependent names
    // Must map to [SELF], not [DEP_1]
    const result = tokenizePII('Filed by DOE family', profile);
    expect(result).toContain('[SELF]');
    expect(result).not.toContain('[DEP_1]');
    expect(result).not.toContain('DOE');
  });

  test('full name "JANE DOE" maps to [SELF] not individual tokens', () => {
    const profile: TokenizationProfile = {
      ...EMPTY_PROFILE,
      selfNames: ['JANE', 'DOE'],
      dependentNames: [['KID', 'DOE']],
    };
    const result = tokenizePII('Taxpayer: JANE DOE', profile);
    expect(result).toContain('[SELF]');
    expect(result).not.toContain('JANE');
    expect(result).not.toContain('DOE');
    // Should NOT have [DEP_1] anywhere
    expect(result).not.toContain('[DEP_1]');
  });

  test('first name alone is redacted even when last name is in a different column', () => {
    const profile: TokenizationProfile = {
      ...EMPTY_PROFILE,
      selfNames: ['JANE', 'DOE'],
      dependentNames: [['KID', 'DOE']],
    };
    // Simulate W-2 where first/last name have extra whitespace between them
    const result = tokenizePII('Your first name JANE     DOE Your SSN', profile);
    expect(result).not.toContain('JANE');
    expect(result).not.toContain('DOE');
  });

  test('first name redacted when it appears without last name nearby', () => {
    const profile: TokenizationProfile = {
      ...EMPTY_PROFILE,
      selfNames: ['JANE', 'DOE'],
    };
    // Name appears standalone (last name on a different line)
    const result = tokenizePII('Employee: JANE\nOther fields here', profile);
    expect(result).not.toContain('JANE');
    expect(result).toContain('[SELF]');
  });

  test('all profile names are caught by final sweep', () => {
    const profile: TokenizationProfile = {
      ...EMPTY_PROFILE,
      selfNames: ['JANE', 'DOE'],
      spouseNames: ['JOHN', 'DOE'],
      dependentNames: [['ALICE', 'DOE'], ['BOB', 'DOE']],
    };
    const text = 'Filed by JANE and JOHN with kids ALICE and BOB';
    const result = tokenizePII(text, profile);
    expect(result).not.toContain('JANE');
    expect(result).not.toContain('JOHN');
    expect(result).not.toContain('ALICE');
    expect(result).not.toContain('BOB');
  });

  test('preserves semantic tokens that were already placed', () => {
    const result = tokenizePII(
      '[SELF] lives at [HOME_ADDRESS] with SSN [SELF_SSN]',
      EMPTY_PROFILE,
    );
    expect(result).toContain('[SELF]');
    expect(result).toContain('[HOME_ADDRESS]');
    expect(result).toContain('[SELF_SSN]');
  });
});
