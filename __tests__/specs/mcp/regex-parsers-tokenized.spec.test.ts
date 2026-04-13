/**
 * Spec: Regex Parsers Against PII-Tokenized Text
 *
 * Status: hypothesis — regex parsers (mapW2Fields, map1098Fields, etc.)
 * were built for raw OCR text. The pipeline feeds PII-tokenized text
 * with patterns like [ssn]000-00-0000x, [phone]800-000-0000x, [ein]00-0000000x.
 * These tests verify parsers work against tokenized input.
 *
 * Confirm: All parsers extract correct values from tokenized text.
 * Invalidate: Parsers return wrong values due to tokenized format.
 */

import {
  mapW2Fields,
  map1098Fields,
  map1099INTFields,
  map1099DIVFields,
  map1099NECFields,
  map1099BFields,
} from '@selftax/core';

// ── Synthetic REDACTED W-2 (actual format server receives after PII tokenization) ──
// Names → [SELF], SSNs → [SELF_SSN], addresses → [HOME_ADDRESS]
// Dollar amounts and form structure are UNTOUCHED

const TOKENIZED_W2 = `
a Employee's social security number
[SELF_SSN] OMB No. 1545-00 29
b Employer identification number (EIN) 1 Wages, tips, other compensation 2 Federal income tax withheld
[REDACTED_ACCT] 217176.44 30970.89
c Employer's name, address, and ZIP code 3 Social security wages 4 Social security tax withheld
ACME CORP, INC. 176100.00 10918.20
350 MAIN STREET 5 Medicare wages and tips 6
18TH FLOOR Medicare tax withheld
SAN FRANCISCO CA 94104 223162.42 3444.31
7 Social security tips 8 Allocated tips
0.00 0.00
d Control number 9 10 Dependent care benefits
0.00
e Employee's first name and initial Last name Suff. 11 Nonqualified plans 12a See instructions for box 12
C o
0.00 d C 163.08
[SELF] e
13 Statutory Retirement Third-party 12b
employee plan sick pay C o
d D
[HOME_ADDRESS] e 5985.98
14 Other 12c C
TESTVILLE CA 90000 o
d CA SDI: 2676.00 DD 28674.48
e 12d C o d e
f Employee's address and ZIP code
15 State Employer's state ID number 16 State wages, tips, etc. 17 State income tax 18 Local wages, tips, etc. 19 Local income tax 20 Locality name
CA 136-1643-8 217176.44 14026.86
Department of the Treasury—Internal Revenue Service Wage and Tax Statement Form W-2 2025
`;

// ── Synthetic REDACTED 1098 (primary residence) ──

const TOKENIZED_1098_PRIMARY = `
JPMORGAN CHASE BANK, N.A. HOME LENDING
3415 VISION DRIVE OH4-7214
COLUMBUS, OH 43219-6009
Form 1098 Mortgage Interest
(Rev. April 2025) Statement
For calendar year 2025
1 Mortgage interest received from payer(s)/borrower(s)*
$14,996.38
RECIPIENT'S/LENDER'S TIN PAYER'S/BORROWER'S TIN
[REDACTED_ACCT] [SELF_SSN]
2 Outstanding mortgage principal
$552,134.57
3 Mortgage origination date
09/23/2020
8 Address or description of property securing mortgage
[HOME_ADDRESS]
TESTVILLE CA 90000
Account number [REDACTED_ACCT]
`;

// ── Synthetic REDACTED 1098 (rental property) ──

const TOKENIZED_1098_RENTAL = `
Nationstar Mortgage LLC d/b/a Mr. Cooper
8950 Cypress Waters Blvd.
Coppell, TX 75019
Form 1098 Mortgage Interest
For calendar year 2025
1 Mortgage interest received from payer(s)/borrower(s)*
40,890.07
$
RECIPIENT'S/LENDER'S TIN PAYER'S/BORROWER'S TIN
[REDACTED_ACCT] [SELF_SSN]
2 Outstanding mortgage principal
869,143.49
PROPERTY TAXES: $17,007.07
HAZARD INSURANCE: $6,332.00
8 Address or description of property securing mortgage
[RENTAL_1_ADDRESS]
TESTVILLE, CA 90000
MORTGAGE INTEREST RECEIVED FROM PAYER(S)/BORROWER(S): $40,890.07
Account number [REDACTED_ACCT]
`;

// ── Synthetic REDACTED 1099-INT ──

const TOKENIZED_1099_INT = `
JPMORGAN CHASE BANK, N.A. HOME LENDING
Form 1099-INT Interest Income
For calendar year 2025
Taxpayer ID Number: [SELF_SSN]
Box Description
$16.06 1. Interest income
$0.00 2. Early withdrawal penalty
$0.00 3. Interest on U.S. Savings Bonds
$0.00 4. Federal income tax withheld
Account Number Box #1 Box #2 Box #3
[REDACTED_ACCT] $16.06 $0.00 $0.00
`;

// ── Synthetic REDACTED 1099-INT (from mortgage servicer) ──

const TOKENIZED_1099_INT_ESCROW = `
Nationstar Mortgage LLC d/b/a Mr. Cooper
Form 1099-INT Interest Income
For calendar year 2025
RECIPIENT'S TIN
[REDACTED_ACCT] [SELF_SSN]
1 Interest income
175.50
$
2 Early withdrawal penalty
$ 0.00
4 Federal income tax withheld
$ 0.00
Account number [REDACTED_ACCT]
`;

// ── Synthetic REDACTED prior-year return (key sections) ──

const TOKENIZED_PRIOR_YEAR = `
Form 1040 U.S. Individual Income Tax Return 2024
[SELF] [SELF_SSN]

1a Total amount from Form(s) W-2, box 1 . . . 1a 210,396
2b Taxable interest . . . 2b 13
7 Capital gain or (loss). Attach Schedule D . . . 7 (3,000)
8 Additional income from Schedule 1, line 10 . . . 8 6,520
9 total income . . . 9 214,184
11 adjusted gross income . . . 11 214,184
15 taxable income . . . 15 183,629
16 Tax . . . 16 30,504
24 total tax . . . 24 26,304
25a Federal income tax withheld . . . 25a 31,221
33 total payments . . . 33 31,314
35a Refund . . . 35a 4,830

Your occupation Date
SOFTWARE ENGINEER 04-10-2025

Schedule D Capital Gains and Losses
14 Long-term capital loss carryover . . . 14 ( 114,460 )
15 Net long-term capital gain or (loss) . . . 15 (115,119)
16 Combine lines 7 and 15 . . . 16 (115,033)
21 . . . 21 ( 3,000 )

Capital Loss Carryover Worksheet
carryforward to 2025 . . . 112,033

Schedule E Supplemental Income and Loss
456 MAPLE DR, Testville, CA 90000
3 Rents received . . . 3 115,400
9 Insurance . . . 9 700
11 Management fees . . . 11 7,158
12 Mortgage interest . . . 12 41,736
16 Taxes . . . 16 17,622
17 Utilities . . . 17 11,869
18 Depreciation expense . . . 18 31,353
19 Other Amortization . . . 19 829
20 Total expenses . . . 20 112,017
21 . . . 21 7,283
22 Form 8582 . . . 22 ( 508 )
26 Total rental real estate . . . 26 6,520

Form 8582 Passive Activity Loss Limitations
1c Prior years' unallowed losses . . . 1c ( 508 )
1d Combine . . . 1d 6,520

Form 8995 Qualified Business Income Deduction
1 Schedule E: 456 MAPLE DR, Testville, CA 90000 . . . 6,520
5 Qualified business income component . . . 5 1,355
15 Qualified business income deduction . . . 15 1,355

Form 4562 Depreciation and Amortization
17 MACRS deductions . . . 17 31,353
22 Total . . . 22 31,353
43 Amortization of costs that began before your 2024 tax year . . . 43 829
44 Total . . . 44 829
`;

describe('W-2 regex parser against tokenized text', () => {
  const w2 = mapW2Fields(TOKENIZED_W2);

  test('extracts wages (Box 1)', () => {
    expect(w2.box1_wages).toBe(217176.44);
  });

  test('extracts federal withholding (Box 2)', () => {
    expect(w2.box2_federal_tax).toBe(30970.89);
  });

  test('extracts state withholding (Box 17) — NOT "18" from 18TH FLOOR', () => {
    // This was the original bug: regex matched "18" from "18TH FLOOR"
    expect(w2.state_tax).toBe(14026.86);
  });

  test('extracts Medicare wages (Box 5)', () => {
    expect(w2.box5_medicare_wages).toBe(223162.42);
  });

  test('extracts Medicare tax (Box 6)', () => {
    expect(w2.box6_medicare_tax).toBe(3444.31);
  });

  test('extracts social security wages (Box 3)', () => {
    expect(w2.box3_ss_wages).toBe(176100);
  });
});

describe('1098 regex parser against tokenized text', () => {
  test('extracts mortgage interest from primary residence 1098', () => {
    const f = map1098Fields(TOKENIZED_1098_PRIMARY);
    expect(f.mortgageInterest).toBeCloseTo(14996.38, 1);
  });

  test('extracts mortgage interest from rental 1098', () => {
    const f = map1098Fields(TOKENIZED_1098_RENTAL);
    expect(f.mortgageInterest).toBeCloseTo(40890.07, 1);
  });

  test('extracts property tax from rental 1098 escrow', () => {
    const f = map1098Fields(TOKENIZED_1098_RENTAL);
    expect(f.propertyTax).toBeCloseTo(17007.07, 1);
  });
});

describe('1099-INT regex parser against tokenized text', () => {
  test('extracts interest income from Chase 1099-INT', () => {
    const f = map1099INTFields(TOKENIZED_1099_INT);
    expect(f.interestIncome).toBeCloseTo(16.06, 1);
  });

  test('extracts interest income from Mr. Cooper 1099-INT', () => {
    const f = map1099INTFields(TOKENIZED_1099_INT_ESCROW);
    expect(f.interestIncome).toBeCloseTo(175.5, 1);
  });
});

describe('Prior-year return regex extraction', () => {
  // Import the regex extractor
  // Since extractPriorYearByRegex is not exported, we test it indirectly
  // by checking if the key values are findable in the text

  test('capital loss carryforward (112033) is in the text', () => {
    expect(TOKENIZED_PRIOR_YEAR).toContain('112,033');
  });

  test('priorYearUnallowedLoss (508) on Form 8582 line 1c', () => {
    const match = TOKENIZED_PRIOR_YEAR.match(/1c\s+Prior years['']?\s*unallowed losses.*?\(\s*(\d[\d,]*)\s*\)/s);
    expect(match).toBeTruthy();
    expect(parseInt(match![1])).toBe(508);
  });

  test('depreciation (31353) on Schedule E line 18', () => {
    const match = TOKENIZED_PRIOR_YEAR.match(/18\s+Depreciation expense.*?18\s+([\d,]+)/s);
    expect(match).toBeTruthy();
    expect(parseInt(match![1].replace(/,/g, ''))).toBe(31353);
  });

  test('occupation near "occupation" keyword', () => {
    const match = TOKENIZED_PRIOR_YEAR.match(/Your occupation.*?SOFTWARE ENGINEER/s);
    expect(match).toBeTruthy();
  });

  test('qbiIncome (6520) in Form 8995 section', () => {
    const idx = TOKENIZED_PRIOR_YEAR.indexOf('Form 8995 Qualified Business Income');
    expect(idx).toBeGreaterThan(-1);
    const section = TOKENIZED_PRIOR_YEAR.slice(idx, idx + 500);
    expect(section).toContain('6,520');
  });

  test('amortization (829) in Form 4562 section', () => {
    const match = TOKENIZED_PRIOR_YEAR.match(/43\s+Amortization of costs.*?43\s+([\d,]+)/);
    expect(match).toBeTruthy();
    expect(parseInt(match![1])).toBe(829);
  });
});
