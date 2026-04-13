/**
 * Spec: Document Type Detection
 *
 * Status: confirmed — detectDocumentType identifies IRS forms by regex
 * and classifies non-form documents (tax bills, daycare, charitable) by heuristics.
 *
 * Confirm: Each document type is detected from representative text samples.
 *
 * Invalidate: A common document type is misclassified or falls through to 'other'.
 */

import { detectDocumentType } from '@selftax/core/ocr/documentDetector';

describe('Document Type Detection — IRS forms', () => {

  test('detects W-2 from "Wage and Tax Statement"', () => {
    expect(detectDocumentType('Form W-2 Wage and Tax Statement 2025')).toBe('w2');
  });

  test('detects 1099-INT from "Interest Income"', () => {
    expect(detectDocumentType('Form 1099-INT Interest Income 2025')).toBe('1099-int');
  });

  test('detects 1099-DIV from "Dividends and Distributions"', () => {
    expect(detectDocumentType('Form 1099-DIV Dividends and Distributions')).toBe('1099-div');
  });

  test('detects 1099-B from "Proceeds from Broker"', () => {
    expect(detectDocumentType('Form 1099-B Proceeds from Broker and Barter Exchange Transactions')).toBe('1099-b');
  });

  test('detects 1099-R from "Distributions from Pensions"', () => {
    expect(detectDocumentType('Form 1099-R Distributions from Pensions, Annuities, Retirement')).toBe('1099-r');
  });

  test('detects 1099-NEC from "Nonemployee Compensation"', () => {
    expect(detectDocumentType('Form 1099-NEC Nonemployee Compensation')).toBe('1099-nec');
  });

  test('detects 1099-G from "Certain Government Payments"', () => {
    expect(detectDocumentType('Form 1099-G Certain Government Payments')).toBe('1099-g');
  });

  test('detects SSA-1099 from "Social Security Benefit Statement"', () => {
    expect(detectDocumentType('Form SSA-1099 Social Security Benefit Statement')).toBe('1099-ssa');
  });

  test('detects 1098 from "Mortgage Interest Statement"', () => {
    expect(detectDocumentType('Form 1098 Mortgage Interest Statement')).toBe('1098');
  });

  test('detects 1098-T from "Tuition Statement"', () => {
    expect(detectDocumentType('Form 1098-T Tuition Statement')).toBe('1098-t');
  });

  test('detects 1098-E from "Student Loan Interest Statement"', () => {
    expect(detectDocumentType('Form 1098-E Student Loan Interest Statement')).toBe('1098-e');
  });

  test('detects 1095-A from "Health Insurance Marketplace"', () => {
    expect(detectDocumentType('Form 1095-A Health Insurance Marketplace Statement')).toBe('1095-a');
  });

  test('detects K-1 from "Schedule K-1"', () => {
    expect(detectDocumentType("Schedule K-1 (Form 1065) Partner's Share of Income")).toBe('k-1');
  });

  test('detects prior-year-return from "Form 1040 U.S. Individual"', () => {
    expect(detectDocumentType('Form 1040 U.S. Individual Income Tax Return 2024')).toBe('prior-year-return');
  });
});

describe('Document Type Detection — non-IRS documents', () => {

  test('detects property-tax-bill from "property tax" + dollar amounts', () => {
    expect(detectDocumentType('Property Tax Bill - Assessed Value: $500,000 Tax: $6,500')).toBe('property-tax-bill');
  });

  test('detects property-tax-bill from "parcel" keyword', () => {
    expect(detectDocumentType('Parcel Number: 123-456 Annual Tax: $8,000')).toBe('property-tax-bill');
  });

  test('detects daycare-statement from "child care"', () => {
    expect(detectDocumentType('Annual Child Care Statement - Total Paid: $12,000')).toBe('daycare-statement');
  });

  test('detects daycare-statement from "dependent care"', () => {
    expect(detectDocumentType('Dependent Care Provider - ABC Daycare - $15,000')).toBe('daycare-statement');
  });

  test('detects charitable-receipt from "donation" + dollar amounts', () => {
    expect(detectDocumentType('Thank you for your donation of $500 to Charity XYZ. Tax-deductible.')).toBe('charitable-receipt');
  });

  test('detects charitable-receipt from "501(c)"', () => {
    expect(detectDocumentType('501(c)(3) organization - Contribution receipt: $1,000')).toBe('charitable-receipt');
  });

  test('detects medical-receipt from "medical" + dollar amounts', () => {
    expect(detectDocumentType('Medical bill from Dr. Smith - Total: $2,500 Copay: $50')).toBe('medical-receipt');
  });

  test('falls back to receipt for generic expense documents', () => {
    expect(detectDocumentType('Receipt - Total: $150.00 Paid via credit card')).toBe('receipt');
  });

  test('returns other for unrecognizable documents', () => {
    expect(detectDocumentType('Some random text without any tax keywords')).toBe('other');
  });
});
