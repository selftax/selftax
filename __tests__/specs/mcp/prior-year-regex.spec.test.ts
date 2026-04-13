/**
 * Spec: Prior-Year Return Regex Extraction Against Real Redacted Text
 *
 * Status: hypothesis — test extractPriorYearByRegex against the actual
 * redacted prior-year return text from the extension's Verify page.
 *
 * Confirm: All 7 carryforward fields extracted correctly.
 * Invalidate: Regex misses fields or grabs wrong values.
 */

// The extractPriorYearByRegex function is not exported, so we replicate
// the key regex patterns here and test them against the real redacted text.

// This is a trimmed version of the actual redacted prior-year return
// from the Verify PII Redactions page. All PII replaced with semantic tokens.
// Dollar amounts and form structure are UNTOUCHED.
const REDACTED_PRIOR_YEAR = `
Form 1040 U.S. Individual Income Tax Return 2024
[SELF] [SELF_SSN]

1a Total amount from Form(s) W-2, box 1 (see instructions) . . . 1a 210,396
7 Capital gain or (loss). Attach Schedule D if required. If not required, check here . . . 7 (3,000)
8 Additional income from Schedule 1, line 10 . . . 8 6,520
9 Add lines 1z, 2b, 3b, 4b, 5b, 6b, 7, and 8. This is your total income . . . 9 214,184
11 Subtract line 10 from line 9. This is your adjusted gross income . . . 11 214,184
13 Qualified business income deduction from Form 8995 or Form 8995-A . . . 13 1,355
15 Subtract line 14 from line 11. If zero or less, enter -0-. This is your taxable income . . . 15 183,629
16 Tax (see instructions). Check if any from Form(s): 1 8814 2 4972 3 . . . 16 30,504
24 Add lines 22 and 23. This is your total tax . . . 24 26,304
25a Form(s) W-2 . . . 25a 31,221
33 Add lines 25d, 26, and 32. These are your total payments . . . 33 31,314
35a Amount of line 34 you want refunded to you . . . 35a 4,830

Your occupation If the IRS sent you an Identity
Protection PIN, enter it here
Joint return? See instructions. 94905 04-10-2025 SOFTWARE ENGINEER

SCHEDULE D Capital Gains and Losses
14 Long-term capital loss carryover. Enter the amount, if any, from line 13 of your Capital Loss Carryover
Worksheet in the instructions . . . 14 ( 114,460 )
15 Net long-term capital gain or (loss). Combine lines 8a through 14 in column (h) . . . 15 (115,119)
16 Combine lines 7 and 15 and enter the result . . . 16 (115,033)
21 If line 16 is a loss, enter here and on Form 1040, 1040-SR, or 1040-NR, line 7, the smaller of:
The loss on line 16; or . . . 21 ( 3,000 )

SCHEDULE E Supplemental Income and Loss
456 MAPLE DRIVE, Testville, CA 90000
3 Rents received . . . 3 115,400
9 Insurance . . . . . . . . . . . . . . . . . . . . . . . . 9 700
11 Management fees . . . 11 7,158
12 Mortgage interest paid to banks, etc. (see instructions) 12 41,736
14 Repairs . . . 14 750
16 Taxes . . . 16 17,622
17 Utilities . . . 17 11,869
18 Depreciation expense or depletion . . . 18 31,353
19 Other (list) Amortization 19 829
20 Total expenses. Add lines 5 through 19 . . . 20 112,017
21 Subtract line 20 from line 3 . . . 21 7,283
22 Deductible rental real estate loss after limitation, if any, on Form 8582 (see instructions) 22 ( ) ( ) ( 508 )
26 Total rental real estate and royalty income or (loss) . . . 26 6,520

Form 8582 Passive Activity Loss Limitations
1a Activities with net income (enter the amount from Part IV, column (a)) . . . . . 1a 7,283
b Activities with net loss (enter the amount from Part IV, column (b)) . . . . . . . 1b ( )
c Prior years' unallowed losses (enter the amount from Part IV, column (c)) . . . 1c ( 508 )
1d Combine lines 1a, 1b, and 1c . . . 1d 6,520

Form 8995 Qualified Business Income Deduction Simplified Computation
i Schedule E: 456 MAPLE DRIVE, Testville, CA 90000 [SELF_SSN] 6,520
5 Qualified business income component. Multiply line 4 by 20% (0.20) . . . 5 1,355
15 Qualified business income deduction . . . 15 1,355

Form 4562 Depreciation and Amortization
456 MAPLE DRIVE [SELF_SSN]
17 MACRS deductions for assets placed in service in tax years beginning before 2024 . . . 17 31,353
22 Total. Add amounts from line 12, lines 14 through 17 . . . 22 31,353
43 Amortization of costs that began before your 2024 tax year . . . 43 829
44 Total. Add amounts in column (f) . . . 44 829

Depreciation Detail Listing 2024
456 MAPLE DRIVE
1 SETTLEMENT COSTS - HA 04-27-2017 12,441 100.00 12,441 15 AMT-AMT 6.6667 5,596 829 6,425 829
2 456 MAPLE DR 04-27-2017 862,281 * 100.00 862,281 27.5 SL MM 3.636 210,345 31,353 241,698 31,353
Totals 1,112,441 874,722 215,941 32,182 248,123 32,182
TOTAL CY Depr including 179/bonus 32,182

Next Year's Depreciation Worksheet
E 1 SETTLEMENT COSTS - HAYWA 04-27-2017 12,441 AMT 15 829
E 1 456 MAPLE DR 04-27-2017 862,281 SL MM 27.5 31,356
TOTAL 32,185
`;

describe('Prior-year return: structured field lookup on redacted text', () => {

  test('finds capital loss carryover (114,460) on Schedule D line 14', () => {
    // Format: "14 ( 114,460 )" — value is inside parentheses after line label
    const match = REDACTED_PRIOR_YEAR.match(
      /14\s+Long-term capital loss carryover.*?\(\s*([\d,]+)\s*\)/s,
    );
    expect(match).toBeTruthy();
    expect(parseInt(match![1].replace(/,/g, ''), 10)).toBe(114460);
  });

  test('finds prior-year unallowed loss (508) on Form 8582 line 1c', () => {
    // The line starts with just "c" (not "1c") in the redacted text
    const match = REDACTED_PRIOR_YEAR.match(
      /Prior year[s']*\s*unallowed losses.*?\(\s*(\d[\d,]*)\s*\)/s,
    );
    expect(match).toBeTruthy();
    expect(parseInt(match![1].replace(/,/g, ''), 10)).toBe(508);
  });

  test('finds depreciation (31,353) on Schedule E line 18', () => {
    const match = REDACTED_PRIOR_YEAR.match(
      /18\s+Depreciation expense.*?18\s+([\d,]+)/s,
    );
    expect(match).toBeTruthy();
    expect(parseInt(match![1].replace(/,/g, ''), 10)).toBe(31353);
  });

  test('finds amortization (829) on Form 4562 line 43', () => {
    const match = REDACTED_PRIOR_YEAR.match(
      /43\s+Amortization of costs.*?43\s+([\d,]+)/,
    );
    expect(match).toBeTruthy();
    expect(parseInt(match![1].replace(/,/g, ''), 10)).toBe(829);
  });

  test('finds QBI income (6,520) on Form 8995', () => {
    // Search for the actual Form 8995 section header (not "from Form 8995" on 1040)
    const idx = REDACTED_PRIOR_YEAR.indexOf('Form 8995 Qualified Business Income');
    expect(idx).toBeGreaterThan(-1);
    const section = REDACTED_PRIOR_YEAR.slice(idx, idx + 500);
    // Line "i Schedule E: ... 6,520"
    const match = section.match(/Schedule E:.*?([\d,]+)\s*$/m);
    expect(match).toBeTruthy();
    expect(parseInt(match![1].replace(/,/g, ''), 10)).toBe(6520);
  });

  test('finds occupation (SOFTWARE ENGINEER) near "occupation" keyword', () => {
    const match = REDACTED_PRIOR_YEAR.match(
      /Your occupation.*?SOFTWARE ENGINEER/s,
    );
    expect(match).toBeTruthy();
  });

  test('finds rental insurance (700) on Schedule E line 9', () => {
    // Within Schedule E section
    const idx = REDACTED_PRIOR_YEAR.indexOf('SCHEDULE E');
    expect(idx).toBeGreaterThan(-1);
    const section = REDACTED_PRIOR_YEAR.slice(idx, idx + 2000);
    const match = section.match(/9\s+Insurance.*?9\s+([\d,]+)/s);
    expect(match).toBeTruthy();
    expect(parseInt(match![1].replace(/,/g, ''), 10)).toBe(700);
  });

  test('finds next year depreciation (32,185) from worksheet', () => {
    const match = REDACTED_PRIOR_YEAR.match(
      /Next Year.*?TOTAL\s+([\d,]+)/s,
    );
    expect(match).toBeTruthy();
    expect(parseInt(match![1].replace(/,/g, ''), 10)).toBe(32185);
  });

  test('finds document tax year (2024) from Form 1040 header', () => {
    const match = REDACTED_PRIOR_YEAR.match(
      /Form 1040.*?(?:Tax Return|Individual Income Tax)\s*(20\d{2})/i,
    );
    expect(match).toBeTruthy();
    expect(parseInt(match![1], 10)).toBe(2024);
  });

  // ── New: 1040 income lines ──

  test('finds wages (210,396) on 1040 line 1a', () => {
    const match = REDACTED_PRIOR_YEAR.match(
      /1a\s+Total amount from Form.*?1a\s+([\d,]+)/s,
    );
    expect(match).toBeTruthy();
    expect(parseInt(match![1].replace(/,/g, ''), 10)).toBe(210396);
  });

  test('finds federal withholding (31,221) on 1040 line 25a', () => {
    const match = REDACTED_PRIOR_YEAR.match(
      /25a\s+Form.*?25a\s+([\d,]+)/s,
    );
    expect(match).toBeTruthy();
    expect(parseInt(match![1].replace(/,/g, ''), 10)).toBe(31221);
  });

  test('finds rental mortgage interest (41,736) on Schedule E line 12', () => {
    const idx = REDACTED_PRIOR_YEAR.indexOf('SCHEDULE E');
    expect(idx).toBeGreaterThan(-1);
    const section = REDACTED_PRIOR_YEAR.slice(idx, idx + 2000);
    const match = section.match(/12\s+Mortgage interest.*?12\s+([\d,]+)/s);
    expect(match).toBeTruthy();
    expect(parseInt(match![1].replace(/,/g, ''), 10)).toBe(41736);
  });

  test('finds rental property taxes (17,622) on Schedule E line 16', () => {
    const idx = REDACTED_PRIOR_YEAR.indexOf('SCHEDULE E');
    expect(idx).toBeGreaterThan(-1);
    const section = REDACTED_PRIOR_YEAR.slice(idx, idx + 2000);
    const match = section.match(/16\s+Taxes.*?16\s+([\d,]+)/s);
    expect(match).toBeTruthy();
    expect(parseInt(match![1].replace(/,/g, ''), 10)).toBe(17622);
  });
});
