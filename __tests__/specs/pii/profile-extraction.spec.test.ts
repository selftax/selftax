/**
 * Spec: Profile extraction from tax document text
 *
 * Tests extractProfileFromTexts() which runs pure regex in the browser
 * to extract name, SSN, address, spouse, dependents, filing status
 * from 1040 and W-2 text.
 *
 * All data is synthetic — no real PII.
 */

import { extractProfileFromTexts } from '@selftax/core/pii/profileExtractor';

// Simulates real PDF extraction layout where 1040 header fields
// end up on one long line (common with pdfjs-dist)
const FAKE_1040_TEXT = [
  'FOR TAX YEAR 2024 JANE DOE & JOHN DOE ACME TAX PREP 100 MAIN ST STE B Anytown, CA 90000 (555)555-1234',
  'Department of the Treasury-Internal Revenue Service 1040 U.S. Individual Income Tax Return 2024 Form OMB No. 1545-0074',
  'IRS Use Only-Do not write or staple in this space. For the year Jan. 1–Dec. 31, 2024, or other tax year beginning , 2024, ending See separate instructions.',
  'Your first name and middle initial Last name Your social security number JANE DOE 000-00-1111',
  'If joint return, spouse\'s first name and middle initial Last name Spouse\'s social security number JOHN Q DOE 000-00-2222',
  'Home address (number and street). If you have a P.O. box, see instructions. Apt. no. Presidential Election Campaign',
  '456 ELM AVE Check here if you, or your',
  'City, town, or post office. If you have a foreign address, also complete spaces below. spouse if filing jointly, want $3 State ZIP code to go to this fund.',
  'Springfield CA 90210',
  'Filing Status Single Head of household (HOH)',
  'X Married filing jointly (even if only one had income)',
  'Check only one box. Married filing separately (MFS) Qualifying surviving spouse (QSS)',
  'Dependents Social security (3) Relationship (4) Check if qualifies for (see instructions):',
  'First name number (1) to you Last name Child tax credit Credit for other dependents',
  'If more than four ALICE DOE 000-00-3333 Daughter X',
  'dependents, BOB DOE 000-00-4444 Son X',
  'see instructions and check here .',
  '1a Total amount from Form(s) W-2, box 1 (see instructions) . . . 1a 100,000',
].join('\n');

// Simulates W-2 extracted text
const FAKE_W2_TEXT = [
  'Form W-2 Wage and Tax Statement 2024',
  'a Employee\'s social security number 000-00-1111',
  'b Employer identification number 12-3456789',
  'c Employer\'s name ACME CORP',
  'e Employee\'s first name Last name',
  'JANE DOE',
  'f Employee\'s address',
  '456 ELM AVE',
  'Springfield CA 90210',
  '1 Wages 100000 2 Federal tax withheld 15000',
  '15 State CA 16 State wages 100000 17 State income tax 7000',
].join('\n');

// Single long line layout (worst case from PDF extraction)
const FAKE_1040_SINGLE_LINE = [
  'Department of the Treasury Form 1040 U.S. Individual Income Tax Return 2024',
  'Your first name and middle initial Last name Your social security number MARY SMITH 000-00-5555 If joint return, spouse\'s first name and middle initial Last name Spouse\'s social security number JAMES SMITH 000-00-6666 Home address 789 OAK BLVD Springfield CA 90210 Filing Status X Married filing jointly Dependents TOMMY SMITH 000-00-7777 Son X SALLY SMITH 000-00-8888 Daughter X',
].join('\n');

describe('extractProfileFromTexts — profile from 1040', () => {
  test('extracts primary name and SSN', () => {
    const result = extractProfileFromTexts([{ text: FAKE_1040_TEXT, type: 'other' }]);
    expect(result.primary.firstName).toBe('Jane');
    expect(result.primary.lastName).toBe('Doe');
    expect(result.primary.ssn).toBe('000-00-1111');
  });

  test('extracts spouse name and SSN', () => {
    const result = extractProfileFromTexts([{ text: FAKE_1040_TEXT, type: 'other' }]);
    expect(result.spouse).toBeDefined();
    expect(result.spouse!.firstName).toBe('John');
    expect(result.spouse!.lastName).toBe('Doe');
    expect(result.spouse!.ssn).toBe('000-00-2222');
  });

  test('extracts filing status as MFJ', () => {
    const result = extractProfileFromTexts([{ text: FAKE_1040_TEXT, type: 'other' }]);
    expect(result.filingStatus).toBe('mfj');
  });

  test('extracts dependents with name, SSN, and relationship', () => {
    const result = extractProfileFromTexts([{ text: FAKE_1040_TEXT, type: 'other' }]);
    expect(result.dependents.length).toBeGreaterThanOrEqual(2);
    const alice = result.dependents.find((d) => d.firstName === 'Alice');
    expect(alice).toBeDefined();
    expect(alice!.ssn).toBe('000-00-3333');
    expect(alice!.relationship).toBe('DAUGHTER');
    const bob = result.dependents.find((d) => d.firstName === 'Bob');
    expect(bob).toBeDefined();
    expect(bob!.ssn).toBe('000-00-4444');
    expect(bob!.relationship).toBe('SON');
  });

  test('extracts address', () => {
    const result = extractProfileFromTexts([{ text: FAKE_1040_TEXT, type: 'other' }]);
    expect(result.primary.address).toBeDefined();
    expect(result.primary.address!.street).toContain('ELM');
    expect(result.primary.address!.state).toBe('CA');
    expect(result.primary.address!.zip).toBe('90210');
  });

  test('does NOT match "Form" or "W-" as a person name', () => {
    const result = extractProfileFromTexts([{ text: FAKE_1040_TEXT, type: 'other' }]);
    expect(result.primary.firstName).not.toBe('Form');
    expect(result.primary.lastName).not.toBe('W-');
  });

  test('sets stateOfResidence from address', () => {
    const result = extractProfileFromTexts([{ text: FAKE_1040_TEXT, type: 'other' }]);
    expect(result.stateOfResidence).toBe('CA');
  });
});

describe('extractProfileFromTexts — W-2 fallback', () => {
  test('extracts name from W-2 when no 1040 present', () => {
    const result = extractProfileFromTexts([{ text: FAKE_W2_TEXT, type: 'w2' }]);
    expect(result.primary.firstName).toBe('Jane');
    expect(result.primary.lastName).toBe('Doe');
  });

  test('extracts SSN from W-2', () => {
    const result = extractProfileFromTexts([{ text: FAKE_W2_TEXT, type: 'w2' }]);
    expect(result.primary.ssn).toBe('000-00-1111');
  });

  test('extracts state from W-2 box 15', () => {
    const result = extractProfileFromTexts([{ text: FAKE_W2_TEXT, type: 'w2' }]);
    expect(result.stateOfResidence).toBe('CA');
  });
});

describe('extractProfileFromTexts — single-line PDF layout', () => {
  test('extracts all fields from worst-case single-line layout', () => {
    const result = extractProfileFromTexts([{ text: FAKE_1040_SINGLE_LINE, type: 'other' }]);
    expect(result.primary.firstName).toBe('Mary');
    expect(result.primary.lastName).toBe('Smith');
    expect(result.primary.ssn).toBe('000-00-5555');
    expect(result.spouse?.firstName).toBe('James');
    expect(result.spouse?.ssn).toBe('000-00-6666');
    expect(result.filingStatus).toBe('mfj');
  });

  test('extracts dependents from single-line layout', () => {
    const result = extractProfileFromTexts([{ text: FAKE_1040_SINGLE_LINE, type: 'other' }]);
    expect(result.dependents.length).toBeGreaterThanOrEqual(2);
    expect(result.dependents.find((d) => d.firstName === 'Tommy')).toBeDefined();
    expect(result.dependents.find((d) => d.firstName === 'Sally')).toBeDefined();
  });
});
