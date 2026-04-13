/**
 * Spec: Whitespace normalization in extracted text fields
 *
 * PDF text extraction produces extra spaces ("SOFTWARE   ENGINEER").
 * All string fields must be normalized to single spaces.
 */

import { extractStructuredFields } from '@selftax/core/forms/structuredExtractor';
import { extractProfileFromTexts } from '@selftax/core/pii/profileExtractor';

describe('Whitespace normalization', () => {
  test('occupation normalizes multiple spaces', () => {
    const text = `Form 1040 U.S. Individual Income Tax Return
2024
1a   Total amount from Form(s) W-2, box 1   1a 210396
Your occupation
94577 01-15-2025 SOFTWARE   ENGINEER
`;
    const result = extractStructuredFields(text);
    expect(result?.occupation).toBe('SOFTWARE ENGINEER');
  });

  test('occupation handles single-word occupations', () => {
    const text = `Form 1040 U.S. Individual Income Tax Return
2024
1a   Total amount from Form(s) W-2, box 1   1a 100000
Your occupation
94577 01-15-2025 TEACHER
`;
    const result = extractStructuredFields(text);
    expect(result?.occupation).toBe('TEACHER');
  });

  test('occupation handles three-word occupations with extra spaces', () => {
    const text = `Form 1040 U.S. Individual Income Tax Return
2024
1a   Total amount from Form(s) W-2, box 1   1a 100000
Your occupation
94577 01-15-2025 REAL   ESTATE   AGENT
`;
    const result = extractStructuredFields(text);
    expect(result?.occupation).toBe('REAL ESTATE AGENT');
  });
});

describe('Profile extraction whitespace normalization', () => {
  const priorYearText = `Form 1040 U.S. Individual Income Tax Return
2024
Your first name and middle initial   Last name
ALEX   HUANG   000-00-0001
spouse's first name and middle initial   Last name
SAM   A   MAI   000-00-0002
Home address (number and street)
687   ELM   AVE
City, town
San   Leandro   CA   94577
X Married filing jointly
Dependents (see instructions): (2)   Social security   (3)   Relationship
(1) First name   number   to you
than four ELLIOT   HUANG   000-00-0003   Daughter   X
dependents, DORIAN   HUANG   000-00-0004   Son   X
`;

  test('address street normalizes spaces', () => {
    const result = extractProfileFromTexts([{ text: priorYearText, type: 'prior-year-return' }]);
    expect(result.primary?.address?.street).toBe('687 ELM AVE');
  });

  test('address city normalizes spaces', () => {
    const result = extractProfileFromTexts([{ text: priorYearText, type: 'prior-year-return' }]);
    expect(result.primary?.address?.city).toBe('Springfield');
  });

  test('primary name normalizes spaces', () => {
    const result = extractProfileFromTexts([{ text: priorYearText, type: 'prior-year-return' }]);
    expect(result.primary?.firstName).toBe('Alex');
    expect(result.primary?.lastName).toBe('Huang');
  });

  test('dependent names normalize spaces', () => {
    const result = extractProfileFromTexts([{ text: priorYearText, type: 'prior-year-return' }]);
    expect(result.dependents?.[0]?.firstName).toBe('Elliot');
    expect(result.dependents?.[1]?.firstName).toBe('Dorian');
  });
});
