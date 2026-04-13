/**
 * Spec: 1099/1098 Field Mapping
 *
 * Status: confirmed
 * Confirm: 1099-B, 1099-DIV, 1099-INT, 1099-NEC, 1098 boxes correctly mapped
 *   from OCR text, following the same pattern as W-2 field mapping
 * Invalidate: These document layouts vary too much for regex-based extraction
 */

import {
  map1099BFields,
  map1099DIVFields,
  map1099INTFields,
  map1099NECFields,
  map1098Fields,
  aggregateAllDocuments,
} from '@selftax/core';

// ---------- Sample OCR text fixtures ----------

const SAMPLE_1099B_TEXT = `
Form 1099-B 2025
Proceeds From Broker and Barter Exchange Transactions
Payer: Acme Brokerage 00-0000000
Recipient: Jane Doe 000-00-0000

1a Proceeds  $54,321.00
1e Cost basis  $42,100.50
Box 2 Short-term gain or loss
Box 4 Federal income tax withheld: $1,200.00
`;

const SAMPLE_1099B_LONG_TERM_TEXT = `
Form 1099-B 2025
1a Proceeds  $120,000.00
1e Cost basis  $80,000.00
Box 2 Long-term gain or loss
Box 4 Federal income tax withheld: $3,500.00
`;

const SAMPLE_1099DIV_TEXT = `
Form 1099-DIV 2025
Dividends and Distributions
Payer: Vanguard 00-0000000

Box 1a Ordinary dividends: $3,456.78
Box 1b Qualified dividends: $2,100.00
Box 2a Capital gain distributions: $890.50
Box 4 Federal income tax withheld: $345.00
`;

const SAMPLE_1099INT_TEXT = `
Form 1099-INT 2025
Interest Income
Payer: First National Bank 00-0000000
Recipient: Jane Doe 000-00-0000

Box 1 Interest income: $1,234.56
Box 2 Early withdrawal penalty: $50.00
Box 4 Federal income tax withheld: $123.00
`;

const SAMPLE_1099NEC_TEXT = `
Form 1099-NEC 2025
Nonemployee Compensation
Payer: Consulting Corp 00-0000000
Recipient: Jane Doe 000-00-0000

Box 1 Nonemployee compensation: $45,000.00
Box 4 Federal income tax withheld: $0.00
`;

const SAMPLE_1098_TEXT = `
Form 1098 2025
Mortgage Interest Statement
Lender: First National Bank 00-0000000
Borrower: Jane Doe 000-00-0000

Box 1 Mortgage interest received: $12,345.67
Box 2 Points paid: $2,500.00
Box 5 Mortgage insurance premiums: $1,200.00
Box 10 Property tax: $4,800.00
`;

// ---------- 1099-B Tests ----------

describe('1099-B Field Mapping', () => {
  test('extracts proceeds (Box 1a)', () => {
    const result = map1099BFields(SAMPLE_1099B_TEXT);
    expect(result.proceeds).toBe(54321);
  });

  test('extracts cost basis (Box 1e)', () => {
    const result = map1099BFields(SAMPLE_1099B_TEXT);
    expect(result.costBasis).toBe(42100.5);
  });

  test('detects short-term gain/loss from Box 2', () => {
    const result = map1099BFields(SAMPLE_1099B_TEXT);
    expect(result.isShortTerm).toBe(true);
    expect(result.isLongTerm).toBe(false);
  });

  test('detects long-term gain/loss from Box 2', () => {
    const result = map1099BFields(SAMPLE_1099B_LONG_TERM_TEXT);
    expect(result.isLongTerm).toBe(true);
    expect(result.isShortTerm).toBe(false);
  });

  test('extracts federal tax withheld (Box 4)', () => {
    const result = map1099BFields(SAMPLE_1099B_TEXT);
    expect(result.federalTaxWithheld).toBe(1200);
  });

  test('missing fields return undefined', () => {
    const result = map1099BFields('Form 1099-B\nSome random text');
    expect(result.proceeds).toBeUndefined();
    expect(result.costBasis).toBeUndefined();
    expect(result.federalTaxWithheld).toBeUndefined();
  });

  test('handles dollar amounts without dollar sign', () => {
    const text = '1a Proceeds  54321.00\n1e Cost basis  42100.50';
    const result = map1099BFields(text);
    expect(result.proceeds).toBe(54321);
    expect(result.costBasis).toBe(42100.5);
  });
});

// ---------- 1099-DIV Tests ----------

describe('1099-DIV Field Mapping', () => {
  test('extracts ordinary dividends (Box 1a)', () => {
    const result = map1099DIVFields(SAMPLE_1099DIV_TEXT);
    expect(result.ordinaryDividends).toBe(3456.78);
  });

  test('extracts qualified dividends (Box 1b)', () => {
    const result = map1099DIVFields(SAMPLE_1099DIV_TEXT);
    expect(result.qualifiedDividends).toBe(2100);
  });

  test('extracts capital gain distributions (Box 2a)', () => {
    const result = map1099DIVFields(SAMPLE_1099DIV_TEXT);
    expect(result.capitalGainsDistributions).toBe(890.5);
  });

  test('extracts federal tax withheld (Box 4)', () => {
    const result = map1099DIVFields(SAMPLE_1099DIV_TEXT);
    expect(result.federalTaxWithheld).toBe(345);
  });

  test('missing fields return undefined', () => {
    const result = map1099DIVFields('Form 1099-DIV\nNothing here');
    expect(result.ordinaryDividends).toBeUndefined();
    expect(result.qualifiedDividends).toBeUndefined();
  });
});

// ---------- 1099-INT Tests ----------

describe('1099-INT Field Mapping', () => {
  test('extracts interest income (Box 1)', () => {
    const result = map1099INTFields(SAMPLE_1099INT_TEXT);
    expect(result.interestIncome).toBe(1234.56);
  });

  test('extracts early withdrawal penalty (Box 2)', () => {
    const result = map1099INTFields(SAMPLE_1099INT_TEXT);
    expect(result.earlyWithdrawalPenalty).toBe(50);
  });

  test('extracts federal tax withheld (Box 4)', () => {
    const result = map1099INTFields(SAMPLE_1099INT_TEXT);
    expect(result.federalTaxWithheld).toBe(123);
  });

  test('missing fields return undefined', () => {
    const result = map1099INTFields('Some random text');
    expect(result.interestIncome).toBeUndefined();
    expect(result.earlyWithdrawalPenalty).toBeUndefined();
  });
});

// ---------- 1099-NEC Tests ----------

describe('1099-NEC Field Mapping', () => {
  test('extracts nonemployee compensation (Box 1)', () => {
    const result = map1099NECFields(SAMPLE_1099NEC_TEXT);
    expect(result.nonemployeeCompensation).toBe(45000);
  });

  test('extracts federal tax withheld (Box 4)', () => {
    const result = map1099NECFields(SAMPLE_1099NEC_TEXT);
    expect(result.federalTaxWithheld).toBe(0);
  });

  test('missing fields return undefined', () => {
    const result = map1099NECFields('Some unrelated text');
    expect(result.nonemployeeCompensation).toBeUndefined();
    expect(result.federalTaxWithheld).toBeUndefined();
  });

  test('handles amount with commas and no dollar sign', () => {
    const text = 'Box 1 Nonemployee compensation: 125,000.00';
    const result = map1099NECFields(text);
    expect(result.nonemployeeCompensation).toBe(125000);
  });
});

// ---------- 1098 Tests ----------

describe('1098 Field Mapping', () => {
  test('extracts mortgage interest (Box 1)', () => {
    const result = map1098Fields(SAMPLE_1098_TEXT);
    expect(result.mortgageInterest).toBe(12345.67);
  });

  test('extracts points paid (Box 2)', () => {
    const result = map1098Fields(SAMPLE_1098_TEXT);
    expect(result.pointsPaid).toBe(2500);
  });

  test('extracts mortgage insurance premiums (Box 5)', () => {
    const result = map1098Fields(SAMPLE_1098_TEXT);
    expect(result.mortgageInsurancePremiums).toBe(1200);
  });

  test('extracts property tax (Box 10)', () => {
    const result = map1098Fields(SAMPLE_1098_TEXT);
    expect(result.propertyTax).toBe(4800);
  });

  test('missing fields return undefined', () => {
    const result = map1098Fields('Form 1098\nNothing useful');
    expect(result.mortgageInterest).toBeUndefined();
    expect(result.pointsPaid).toBeUndefined();
    expect(result.propertyTax).toBeUndefined();
  });
});

// ---------- Dollar Amount Parsing Edge Cases ----------

describe('Dollar amount parsing edge cases', () => {
  test('parses amounts with dollar sign and commas', () => {
    const text = 'Box 1 Interest income: $1,234,567.89';
    const result = map1099INTFields(text);
    expect(result.interestIncome).toBe(1234567.89);
  });

  test('parses amounts without dollar sign', () => {
    const text = 'Box 1 Interest income: 1234.56';
    const result = map1099INTFields(text);
    expect(result.interestIncome).toBe(1234.56);
  });

  test('parses whole dollar amounts without decimals', () => {
    const text = 'Box 1 Interest income: $500';
    const result = map1099INTFields(text);
    expect(result.interestIncome).toBe(500);
  });

  test('parses zero amounts', () => {
    const text = 'Box 1 Nonemployee compensation: $0.00';
    const result = map1099NECFields(text);
    expect(result.nonemployeeCompensation).toBe(0);
  });
});

// ---------- Aggregation Tests ----------

describe('aggregateAllDocuments', () => {
  test('aggregates interest income from multiple 1099-INTs', () => {
    const result = aggregateAllDocuments([
      { type: '1099-int', fields: { interestIncome: 1000 } },
      { type: '1099-int', fields: { interestIncome: 2500 } },
    ]);
    expect(result.totalInterestIncome).toBe(3500);
  });

  test('aggregates dividends from multiple 1099-DIVs', () => {
    const result = aggregateAllDocuments([
      {
        type: '1099-div',
        fields: { ordinaryDividends: 1000, qualifiedDividends: 800 },
      },
      {
        type: '1099-div',
        fields: { ordinaryDividends: 2000, qualifiedDividends: 1500 },
      },
    ]);
    expect(result.totalOrdinaryDividends).toBe(3000);
    expect(result.totalQualifiedDividends).toBe(2300);
  });

  test('aggregates federal withholding across all document types', () => {
    const result = aggregateAllDocuments([
      { type: '1099-int', fields: { federalTaxWithheld: 100 } },
      { type: '1099-div', fields: { federalTaxWithheld: 200 } },
      { type: '1099-b', fields: { federalTaxWithheld: 300 } },
      { type: '1099-nec', fields: { federalTaxWithheld: 400 } },
    ]);
    expect(result.totalFederalWithholding).toBe(1000);
  });

  test('aggregates 1099-B proceeds and cost basis', () => {
    const result = aggregateAllDocuments([
      { type: '1099-b', fields: { proceeds: 50000, costBasis: 40000 } },
      { type: '1099-b', fields: { proceeds: 30000, costBasis: 25000 } },
    ]);
    expect(result.totalProceeds).toBe(80000);
    expect(result.totalCostBasis).toBe(65000);
  });

  test('aggregates 1098 mortgage interest', () => {
    const result = aggregateAllDocuments([
      { type: '1098', fields: { mortgageInterest: 12000, propertyTax: 5000 } },
      { type: '1098', fields: { mortgageInterest: 8000, propertyTax: 3000 } },
    ]);
    expect(result.totalMortgageInterest).toBe(20000);
    expect(result.totalPropertyTax).toBe(8000);
  });

  test('aggregates NEC income', () => {
    const result = aggregateAllDocuments([
      { type: '1099-nec', fields: { nonemployeeCompensation: 25000 } },
      { type: '1099-nec', fields: { nonemployeeCompensation: 15000 } },
    ]);
    expect(result.totalNonemployeeCompensation).toBe(40000);
  });

  test('handles empty document list', () => {
    const result = aggregateAllDocuments([]);
    expect(result.totalInterestIncome).toBe(0);
    expect(result.totalOrdinaryDividends).toBe(0);
    expect(result.totalFederalWithholding).toBe(0);
  });

  test('ignores unknown document types', () => {
    const result = aggregateAllDocuments([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { type: 'receipt' as any, fields: { federalTaxWithheld: 9999 } },
    ]);
    expect(result.totalFederalWithholding).toBe(0);
  });

  test('treats missing numeric fields as 0', () => {
    const result = aggregateAllDocuments([
      { type: '1099-int', fields: {} },
    ]);
    expect(result.totalInterestIncome).toBe(0);
    expect(result.totalFederalWithholding).toBe(0);
  });
});
