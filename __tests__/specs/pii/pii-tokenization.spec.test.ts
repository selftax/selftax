/**
 * Spec: PII Tokenization — replaces PII with semantic tokens
 * Status: confirmed
 */

import { tokenizePII, buildTokenProfile } from '@selftax/core';
import type { TokenizationProfile } from '@selftax/core';

const profile: TokenizationProfile = {
  selfNames: ['Jane', 'Doe'],
  spouseNames: ['John', 'Doe'],
  dependentNames: [['Kid', 'Doe'], ['Baby', 'Doe']],
  homeAddress: ['123 Main St', 'Anytown', '90210'],
  rentalAddresses: [['456 Oak Ave', 'Othertown', '90211']],
  ssns: ['111-22-3333', '444-55-6666', '777-88-9999', '000-11-2222'],
  accountNumbers: ['9876543210'],
};

describe('PII Tokenization', () => {

  test('replaces primary filer name with [SELF]', () => {
    const text = 'W-2 for Jane Doe, wages $100,000';
    const result = tokenizePII(text, profile);
    expect(result).toContain('[SELF]');
    expect(result).not.toContain('Jane');
    expect(result).not.toContain('Doe');
  });

  test('replaces spouse name with [SPOUSE]', () => {
    const text = 'Spouse: John Doe, SSN 444-55-6666';
    const result = tokenizePII(text, profile);
    expect(result).toContain('[SPOUSE]');
    expect(result).not.toContain('John');
  });

  test('replaces dependent names with [DEP_N]', () => {
    const text = 'Dependent 1: Kid Doe. Dependent 2: Baby Doe';
    const result = tokenizePII(text, profile);
    expect(result).toContain('[DEP_1]');
    expect(result).toContain('[DEP_2]');
    expect(result).not.toContain('Kid');
    expect(result).not.toContain('Baby');
  });

  test('replaces home address with [HOME_ADDRESS]', () => {
    const text = 'Property at 123 Main St, Anytown, CA 90210';
    const result = tokenizePII(text, profile);
    expect(result).toContain('[HOME_ADDRESS]');
    expect(result).not.toContain('123 Main St');
  });

  test('replaces rental address with [RENTAL_1_ADDRESS]', () => {
    const text = 'Rental property: 456 Oak Ave, Othertown, CA 90211';
    const result = tokenizePII(text, profile);
    expect(result).toContain('[RENTAL_1_ADDRESS]');
    expect(result).not.toContain('456 Oak Ave');
  });

  test('replaces SSNs with labeled tokens', () => {
    const text = 'SSN: 111-22-3333, Spouse SSN: 444-55-6666';
    const result = tokenizePII(text, profile);
    expect(result).toContain('[SELF_SSN]');
    expect(result).toContain('[SPOUSE_SSN]');
    expect(result).not.toContain('111-22-3333');
  });

  test('replaces account numbers with [REDACTED_ACCT]', () => {
    const text = 'Account: 9876543210';
    const result = tokenizePII(text, profile);
    expect(result).toContain('[REDACTED_ACCT]');
    expect(result).not.toContain('9876543210');
  });

  test('preserves dollar amounts', () => {
    const text = 'Jane Doe earned $217,176.44 in wages';
    const result = tokenizePII(text, profile);
    expect(result).toContain('$217,176.44');
    expect(result).not.toContain('Jane');
  });

  test('case insensitive matching', () => {
    const text = 'JANE DOE at 123 MAIN ST';
    const result = tokenizePII(text, profile);
    expect(result).toContain('[SELF]');
    expect(result).toContain('[HOME_ADDRESS]');
  });

  test('handles address abbreviation variants (CT vs COURT, ST vs STREET)', () => {
    const p: TokenizationProfile = {
      selfNames: [], spouseNames: [], dependentNames: [],
      homeAddress: ['123 Main St'],
      rentalAddresses: [['456 Oak Ct']],
      ssns: [], accountNumbers: [],
    };
    // "STREET" should match even though profile has "St"
    expect(tokenizePII('Property at 123 Main Street', p)).toContain('[HOME_ADDRESS]');
    expect(tokenizePII('Property at 123 Main St', p)).toContain('[HOME_ADDRESS]');
    // "COURT" should match even though profile has "Ct"
    expect(tokenizePII('Rental at 456 Oak Court', p)).toContain('[RENTAL_1_ADDRESS]');
    expect(tokenizePII('Rental at 456 Oak Ct', p)).toContain('[RENTAL_1_ADDRESS]');
  });

  test('buildTokenProfile creates profile from LocalPII', () => {
    const pii = {
      primary: { firstName: 'Jane', lastName: 'Doe', ssn: '111-22-3333' },
      spouse: { firstName: 'John', lastName: 'Doe', ssn: '444-55-6666' },
      address: { street: '123 Main St', city: 'Anytown', state: 'CA', zip: '90210' },
      dependents: [{ firstName: 'Kid', lastName: 'Doe', ssn: '777-88-9999' }],
    };
    const tp = buildTokenProfile(pii);
    expect(tp.selfNames).toEqual(['Jane', 'Doe']);
    expect(tp.spouseNames).toEqual(['John', 'Doe']);
    expect(tp.homeAddress).toContain('123 Main St');
    expect(tp.ssns).toContain('111-22-3333');
  });
});
