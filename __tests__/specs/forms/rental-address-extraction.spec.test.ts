/**
 * Spec: Rental address extraction handles browser and server PDF text formats
 *
 * Status: active
 * Confirm: The regex in extractStructuredFields handles both newline-separated
 *          (server pdfjs) and space-separated (browser pdfjs) Schedule E text.
 * Invalidate: PDF text extraction changes its line grouping behavior.
 */

import { extractStructuredFields } from '@selftax/core/forms/structuredExtractor';

/** Minimal prior-year 1040 text with Schedule E rental address */
function make1040WithScheduleE(scheduleEText: string): string {
  return `Form 1040 U.S. Individual Income Tax Return 2024\n${scheduleEText}`;
}

describe('Rental address extraction from Schedule E', () => {
  test('extracts address from server-style text (newline after A)', () => {
    /** Server pdfjs produces: "A\n718 MAPLE DR, Testville, CA 94544" */
    const text = make1040WithScheduleE(`
SCHEDULE E Supplemental Income and Loss
1a Physical address of each property
A
718 MAPLE DR, Testville, CA 94544
1b Type of Property
A 2
9 Insurance 6332
12 Mortgage interest 40890
18 Depreciation 31353
`);
    const result = extractStructuredFields(text);
    expect(result).not.toBeNull();
    expect(result!.rentalAddress).toBe('718 MAPLE DR');
    expect(result!.rentalCity).toBe('Testville');
    expect(result!.rentalState).toBe('CA');
    expect(result!.rentalZip).toBe('94544');
  });

  test('extracts address from browser-style text (spaces after A)', () => {
    /** Browser pdfjs groups items by Y-position, producing:
     *  "A 718   HARRIS   COURT,   Testville,   CA   94544" on one line */
    const text = make1040WithScheduleE(`
SCHEDULE E Supplemental Income and Loss
1a Physical address of each property (street, city, state, ZIP code)
A 718   HARRIS   COURT,   Testville,   CA   94544
B
C
1b   Type of Property
A   2
9 Insurance 6332
12 Mortgage interest 40890
18 Depreciation 31353
`);
    const result = extractStructuredFields(text);
    expect(result).not.toBeNull();
    expect(result!.rentalAddress).toBe('718 MAPLE DR');
    expect(result!.rentalCity).toBe('Testville');
    expect(result!.rentalState).toBe('CA');
    expect(result!.rentalZip).toBe('94544');
  });

  test('normalizes extra whitespace in address components', () => {
    /** Browser PDF extraction can have variable spacing between words */
    const text = make1040WithScheduleE(`
SCHEDULE E Supplemental Income and Loss
A  100   MAIN    STREET,   San   Francisco,   CA   94102
9 Insurance 1000
`);
    const result = extractStructuredFields(text);
    expect(result).not.toBeNull();
    expect(result!.rentalAddress).toBe('100 MAIN STREET');
    expect(result!.rentalCity).toBe('San Francisco');
  });

  test('does not match "A Did you make any payments" line', () => {
    /** The "A" label for the 1099 question should not be mistaken for
     *  the property address line. The regex requires a digit after "A". */
    const text = make1040WithScheduleE(`
SCHEDULE E Supplemental Income and Loss
A    Did you make any payments in 2024 that would require you to file Form(s) 1099?
A 200 OAK AVE, Berkeley, CA 94704
9 Insurance 500
`);
    const result = extractStructuredFields(text);
    expect(result).not.toBeNull();
    // Should match the address line, not the 1099 question
    expect(result!.rentalAddress).toBe('200 OAK AVE');
    expect(result!.rentalCity).toBe('Berkeley');
  });
});
