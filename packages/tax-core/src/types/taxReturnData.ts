/**
 * Canonical TaxReturnData — single source of truth for a complete tax return.
 *
 * Every line of every form as a typed field. This structure feeds:
 * - PDF adapter: fills IRS PDF templates via AcroForm field names
 * - Free File adapter: fills IRS Free File Fillable Forms via CSS selectors
 * - Chrome extension auto-fill
 *
 * PII (names, SSNs, address) is structurally separate from numeric data.
 * It gets merged only at final output (PDF generation or extension auto-fill).
 */

import type { FilingStatus } from '../engine/taxConstants';

/** Complete tax return — all forms, all lines, one object */
export interface TaxReturnData {
  taxYear: number;
  form1040: Form1040Data;
  schedule1?: Schedule1Data;
  schedule2?: Schedule2Data;
  schedule3?: Schedule3Data;
  scheduleA?: ScheduleAData;
  scheduleC?: ScheduleCData;
  scheduleD?: ScheduleDData;
  scheduleE?: ScheduleEData;
  scheduleSE?: ScheduleSEData;
  form2441?: Form2441Data;
  form4562?: Form4562Data;
  form6251?: Form6251Data;
  form8812?: Form8812Data;
  form8863?: Form8863Data;
  form8880?: Form8880Data;
  form8959?: Form8959Data;
  form8960?: Form8960Data;
  form8582?: Form8582Data;
  form8995?: Form8995Data;
  ca540?: CA540Data;
  pii: PIIData;
}

// ── Form 1040 ──────────────────────────────────────────────────────────

export interface Form1040Data {
  /** Line 1a: Wages, salaries, tips (from W-2) */
  line1a: number;
  /** Line 1z: Total of lines 1a through 1h */
  line1z: number;
  /** Line 2a: Tax-exempt interest */
  line2a: number;
  /** Line 2b: Taxable interest */
  line2b: number;
  /** Line 3a: Qualified dividends */
  line3a: number;
  /** Line 3b: Ordinary dividends */
  line3b: number;
  /** Line 4a: IRA distributions */
  line4a: number;
  /** Line 4b: Taxable IRA distributions */
  line4b: number;
  /** Line 5a: Pensions and annuities */
  line5a: number;
  /** Line 5b: Taxable pensions */
  line5b: number;
  /** Line 6a: Social security benefits */
  line6a: number;
  /** Line 6b: Taxable social security */
  line6b: number;
  /** Line 7: Capital gain or loss (from Schedule D line 16 or 21) */
  line7: number;
  /** Line 8: Other income from Schedule 1 line 10 */
  line8: number;
  /** Line 9: Total income */
  line9: number;
  /** Line 10: Adjustments from Schedule 1 line 26 */
  line10: number;
  /** Line 11: Adjusted gross income */
  line11: number;
  /** Line 12a: Standard deduction or itemized deductions (from Schedule A) */
  line12a: number;
  /** Line 12b: Charitable deduction if not itemizing */
  line12b: number;
  /** Line 12c: Sum of 12a and 12b */
  line12c: number;
  /** Line 13: Qualified business income deduction (Form 8995) */
  line13: number;
  /** Line 14: Total deductions (line 12c + line 13) */
  line14: number;
  /** Line 15: Taxable income (line 11 - line 14, min 0) */
  line15: number;
  /** Line 16: Tax (from tax table or brackets) */
  line16: number;
  /** Line 17: Amount from Schedule 2 Part I line 4 */
  line17: number;
  /** Line 18: Sum of lines 16 and 17 */
  line18: number;
  /** Line 19: Child tax credit / credit for other dependents */
  line19: number;
  /** Line 20: Amount from Schedule 3 line 8 */
  line20: number;
  /** Line 21: Sum of lines 19 and 20 */
  line21: number;
  /** Line 22: Line 18 minus line 21 (min 0) */
  line22: number;
  /** Line 23: Other taxes from Schedule 2 line 21 */
  line23: number;
  /** Line 24: Total tax */
  line24: number;
  /** Line 25a: Federal tax withheld from W-2 */
  line25a: number;
  /** Line 25b: Federal tax withheld from 1099 */
  line25b: number;
  /** Line 25c: Other withholding */
  line25c: number;
  /** Line 25d: Total withholding */
  line25d: number;
  /** Line 26: Estimated tax payments */
  line26: number;
  /** Line 27a: Earned income credit */
  line27a: number;
  /** Line 33: Total payments */
  line33: number;
  /** Line 34: Overpaid (if line 33 > line 24) */
  line34: number;
  /** Line 35a: Refund amount */
  line35a: number;
  /** Line 37: Amount you owe */
  line37: number;
  /** Filing status for checkbox selection */
  filingStatus: FilingStatus;
}

// ── Schedule 1 ─────────────────────────────────────────────────────────

export interface Schedule1Data {
  // Part I: Additional Income
  /** Line 1: Taxable refunds of state/local taxes */
  line1: number;
  /** Line 2a: Alimony received */
  line2a: number;
  /** Line 3: Business income or loss (Schedule C) */
  line3: number;
  /** Line 4: Other gains or losses (Form 4797) */
  line4: number;
  /** Line 5: Rental real estate, royalties, partnerships (Schedule E) */
  line5: number;
  /** Line 6: Farm income or loss (Schedule F) */
  line6: number;
  /** Line 7: Unemployment compensation */
  line7: number;
  /** Line 8z: Other income (description + amount) */
  line8z: number;
  /** Line 9: Total other income (lines 8a through 8z) */
  line9: number;
  /** Line 10: Total additional income (lines 1 through 9) */
  line10: number;

  // Part II: Adjustments to Income
  /** Line 11: Educator expenses */
  line11: number;
  /** Line 15: Deductible self-employment tax */
  line15: number;
  /** Line 19: Student loan interest deduction */
  line19: number;
  /** Line 25: Total Part II adjustments */
  line25: number;
  /** Line 26: Total adjustments to income */
  line26: number;
}

// ── Schedule 2 ─────────────────────────────────────────────────────────

export interface Schedule2Data {
  // Part I: Tax
  /** Line 1: AMT (from Form 6251) */
  line1: number;
  /** Line 2: Excess advance PTC repayment */
  line2: number;
  /** Line 4: Total Part I (Schedule 2) → 1040 line 17 */
  line4: number;

  // Part II: Other Taxes
  /** Line 6: Self-employment tax */
  line6: number;
  /** Line 11: Additional Medicare tax */
  line11: number;
  /** Line 18: Sum of lines 6 through 17 */
  line18: number;
  /** Line 21: Total additional taxes → 1040 line 23 */
  line21: number;
}

// ── Schedule 3 ─────────────────────────────────────────────────────────

export interface Schedule3Data {
  // Part I: Nonrefundable Credits
  /** Line 1: Foreign tax credit (Form 1116) */
  line1: number;
  /** Line 2: Child and dependent care credit (Form 2441) */
  line2: number;
  /** Line 3: Education credits (Form 8863) */
  line3: number;
  /** Line 4: Retirement savings contributions credit */
  line4: number;
  /** Line 5a: Residential clean energy credit */
  line5a: number;
  /** Line 7: Total nonrefundable credits */
  line7: number;
  /** Line 8: Total → 1040 line 20 */
  line8: number;

  // Part II: Other Payments and Refundable Credits
  /** Line 9: Net premium tax credit */
  line9: number;
  /** Line 15: Total other payments/credits → 1040 line 31 */
  line15: number;
}

// ── Schedule A ─────────────────────────────────────────────────────────

export interface ScheduleAData {
  /** Line 1: Medical and dental expenses */
  line1: number;
  /** Line 4: Allowable medical (after 7.5% AGI threshold) */
  line4: number;
  /** Line 5a: State/local income taxes (or sales tax) */
  line5a: number;
  /** Line 5b: State/local personal property taxes */
  line5b: number;
  /** Line 5c: State/local real estate taxes */
  line5c: number;
  /** Line 5d: Sum of 5a through 5c */
  line5d: number;
  /** Line 5e: SALT (smaller of 5d or $10,000) */
  line5e: number;
  /** Line 6: Other taxes */
  line6: number;
  /** Line 7: Total taxes paid (5e + 6) */
  line7: number;
  /** Line 8a: Home mortgage interest (from 1098) */
  line8a: number;
  /** Line 8b: Points not reported on 1098 */
  line8b: number;
  /** Line 8c: Mortgage insurance premiums */
  line8c: number;
  /** Line 10: Total interest paid (8a + 8b + 8c + 9) */
  line10: number;
  /** Line 11: Gifts to charity (cash/check) */
  line11: number;
  /** Line 12: Gifts to charity (other than cash) */
  line12: number;
  /** Line 13: Carryover from prior year */
  line13: number;
  /** Line 14: Total gifts to charity */
  line14: number;
  /** Line 15: Casualty and theft losses */
  line15: number;
  /** Line 16: Other itemized deductions */
  line16: number;
  /** Line 17: Total itemized deductions */
  line17: number;
}

// ── Schedule D ─────────────────────────────────────────────────────────

export interface ScheduleDData {
  /** Line 7: Net short-term capital gain or loss */
  line7: number;
  /** Line 14: Long-term capital loss carryover (negative) */
  line14?: number;
  /** Line 15: Net long-term capital gain or loss */
  line15: number;
  /** Line 16: Combine lines 7 and 15 */
  line16: number;
  /** Line 21: Capital loss deduction or net gain (to 1040 line 7) */
  line21: number;
}

// ── Schedule E ─────────────────────────────────────────────────────────

export interface ScheduleEProperty {
  /** Property address description */
  address: string;
  /** Property city */
  city?: string;
  /** Property state (2-letter code) */
  state?: string;
  /** Property zip */
  zip?: string;
  /** Property type code (e.g., "1" = single family, "2" = multi-family) */
  propertyType: string;
  /** Fair rental days */
  fairRentalDays: number;
  /** Personal use days */
  personalUseDays: number;

  /** Line 3: Rents received */
  line3: number;
  /** Line 5: Advertising */
  line5: number;
  /** Line 6: Auto and travel */
  line6: number;
  /** Line 7: Cleaning and maintenance */
  line7: number;
  /** Line 8: Commissions */
  line8: number;
  /** Line 9: Insurance */
  line9: number;
  /** Line 10: Legal and professional fees */
  line10: number;
  /** Line 11: Management fees */
  line11: number;
  /** Line 12: Mortgage interest paid */
  line12: number;
  /** Line 13: Other interest */
  line13: number;
  /** Line 14: Repairs */
  line14: number;
  /** Line 15: Supplies */
  line15: number;
  /** Line 16: Taxes */
  line16: number;
  /** Line 17: Utilities */
  line17: number;
  /** Line 18: Depreciation / depletion */
  line18: number;
  /** Line 19: Other expenses */
  line19: number;
  /** Line 19 description (e.g. "Amortization") */
  line19Desc?: string;
  /** Line 20: Total expenses */
  line20: number;
  /** Line 21: Net income or loss (line 3 minus line 20) */
  line21: number;
  /** Line 22: Deductible rental real estate loss after Form 8582 limitation */
  line22?: number;
  /** Did you make payments requiring Form 1099? (A checkbox) */
  no1099?: boolean;
}

export interface ScheduleEData {
  /** Per-property line items (up to 3 per page, IRS allows A/B/C) */
  properties: ScheduleEProperty[];
  /** Line 23a: Total net income from all properties */
  line23a: number;
  /** Line 24: Net income (if 23a is positive) */
  line24: number;
  /** Line 25: Net loss (if 23a is negative, with passive limits applied) */
  line25: number;
  /** Line 26: Total rental real estate → Schedule 1 line 5 */
  line26: number;
}

// ── Form 2441 ──────────────────────────────────────────────────────────

export interface Form2441Data {
  /** Line 3: Total qualifying expenses */
  line3: number;
  /** Line 4: Taxpayer's earned income */
  line4: number;
  /** Line 5: Spouse's earned income (MFJ) */
  line5?: number;
  /** Line 6: Smallest of lines 3, 4, 5 */
  line6: number;
  /** Line 8: Credit percentage decimal (e.g. ".20") for FreeFile dropdown */
  line8: string;
  /** Line 9: Credit amount (line 6 × line 8) */
  line9: number;
  /** Line 10: Tax liability limit (from Credit Limit Worksheet) */
  line10: number;
  /** Line 11: Credit → Schedule 3 line 2 */
  line11: number;
  /** Line 22: "No" — not from sole proprietorship */
  solePropNo?: number;
}

// ── Form 4562 ──────────────────────────────────────────────────────────

export interface Form4562Data {
  /** Line 22: Total depreciation (from Part III MACRS or other) */
  line22: number;
}

// ── Form 8995 (QBI Simplified) ─────────────────────────────────────────

export interface QbiBusiness {
  name: string;
  qbi: number;
}

export interface Form8995Data {
  /** Line 1(i)-(v): Up to 5 QBI businesses */
  businesses?: QbiBusiness[];
  /** Line 1/2: Total qualified business income */
  line1: number;
  /** Line 2/5: QBI component (20%) */
  line2: number;
  /** Line 4: Taxable income before QBI deduction */
  line4: number;
  /** Line 5: Net capital gain */
  line5: number;
  /** Line 6: Subtract line 5 from line 4 */
  line6: number;
  /** Line 7: Multiply line 6 by 20% */
  line7: number;
  /** Line 10: QBI deduction (lesser of line 2 or line 7) → 1040 line 13 */
  line10: number;
}

// ── Schedule C ────────────────────────────────────────────────────────

export interface ScheduleCData {
  line1: number;   // Gross receipts
  line7: number;   // Gross income
  line28: number;  // Total expenses
  line31: number;  // Net profit or loss
}

// ── Schedule SE ───────────────────────────────────────────────────────

export interface ScheduleSEData {
  line2: number;   // Net SE income from Schedule C
  line3: number;   // 92.35% of net SE income
  line4: number;   // Total SE tax
  line5: number;   // Deductible half
}

// ── Form 6251 (AMT) ──────────────────────────────────────────────────

export interface Form6251Data {
  line1: number;   // Taxable income
  line26: number;  // AMTI
  line27: number;  // Exemption
  line28: number;  // AMTI after exemption
  line30: number;  // Tentative minimum tax
  line31: number;  // Regular tax
  line32: number;  // AMT
}

// ── Form 8812 (Child Tax Credit) ─────────────────────────────────────

export interface Form8812Data {
  // Part I-A (2025 form lines 1–11)
  line1: number;           // AGI (from Form 1040 line 11)
  line3: number;           // Modified AGI (line 1 + line 2d exclusions)
  line4a: number;          // Number of qualifying children under 17 with SSN
  line4b: number;          // Line 4a × CTC per child ($2,200 for 2025)
  line5: number;           // Number of other dependents
  line6: number;           // Line 5 × $500
  line7: number;           // Add lines 4b and 6 (total initial credit)
  line8: number;           // Filing status threshold ($400k MFJ, $200k others)
  line9: number;           // Excess AGI: max(0, line 3 - line 8)
  line10: number;          // Line 9 × 5% (phaseout reduction)
  line11: number;          // Credit after phaseout: max(0, line 7 - line 10)
  // Part I-B (2025 form lines 12–14)
  creditLimitWsA: number;  // Line 13: Credit Limit Worksheet A (tax available for CTC)
  credit: number;          // Line 14: final non-refundable CTC = min(line 11, creditLimitWsA)
  // Part II: Additional CTC
  actc: number;            // Additional CTC (refundable) = max(0, line 11 - credit)
}

// ── Form 8863 (Education Credits) ────────────────────────────────────

export interface Form8863Data {
  line14: number;  // Refundable AOC credit
  line17: number;  // Nonrefundable education credits
  line28: number;  // Total education credit → Schedule 3 line 3
}

// ── Form 8880 (Saver's Credit) ──────────────────────────────────────

export interface Form8880Data {
  line1a: number;  // IRA contributions (primary)
  line7: number;   // Total contributions
  line8: number;   // AGI
  line10: number;  // Credit before limit
  line14: number;  // Saver's credit → Schedule 3 line 4
}

// ── Form 8959 (Additional Medicare Tax) ──────────────────────────────

export interface Form8959Data {
  line1: number;   // Medicare wages
  line4: number;   // Total wages
  line5: number;   // Threshold
  line6: number;   // Over threshold
  line7: number;   // Tax on wages (0.9%)
  line18: number;  // Total additional Medicare tax → Schedule 2 line 11
}

// ── Form 8960 (NIIT) ────────────────────────────────────────────────

export interface Form8960Data {
  line1: number;   // Taxable interest
  line2: number;   // Ordinary dividends
  line8: number;   // Total investment income
  line12: number;  // Net investment income
  line13: number;  // MAGI
  line14: number;  // Threshold
  line15: number;  // Over threshold
  line16: number;  // Taxable amount
  line17: number;  // NIIT (3.8%)
}

// ── Form 8582 (Passive Activity Loss Limitations) ─────────────────────

export interface Form8582Data {
  /** Part I line 1a: Net income (rental with active participation) */
  line1a?: number;
  /** Part I line 1b: Net loss */
  line1b?: number;
  /** Part I line 1c: Prior year unallowed loss */
  line1c?: number;
  /** Part I line 1d: Combined */
  line1d: number;
  /** Part II line 5: Loss from line 1d (positive) */
  line5?: number;
  /** Part II line 6: Filing status amount ($25K or $12.5K) */
  line6?: number;
  /** Part II line 7: Modified AGI */
  line7?: number;
  /** Part II line 8: Subtract $100K from AGI (if > $100K) */
  line8?: number;
  /** Part II line 9: Multiply line 8 by 50% */
  line9?: number;
  /** Part II line 10: Allowed loss (smaller of line 5 or line 6 - line 9) */
  line10?: number;
  /** Part IV: total passive income */
  totalIncome?: number;
  /** Part IV: total allowed losses */
  totalLoss?: number;
  // Worksheet 1 (page 2)
  ws1Name?: string;
  ws1NetIncome?: number;
  ws1NetLoss?: number;
  ws1UnallowedLoss?: number;
  ws1Gain?: number;
  ws1OverallLoss?: number;
  // Worksheet 6 (page 2)
  ws6Name?: string;
  ws6Form?: string;
  ws6Loss?: number;
  ws6UnallowedLoss?: number;
  ws6AllowedLoss?: number;
}

// ── CA Form 540 ────────────────────────────────────────────────────────

export interface CA540Data {
  /** Line 13: Federal AGI */
  line13: number;
  /** Line 14: CA adjustments (subtractions) */
  line14: number;
  /** Line 15: CA adjusted gross income */
  line15: number;
  /** Line 18: CA standard or itemized deduction */
  line18: number;
  /** Line 19: CA taxable income */
  line19: number;
  /** Line 31: CA tax from tax table */
  line31: number;
  /** Line 35: Mental Health Services surcharge */
  line35: number;
  /** Line 40: Exemption credits */
  line40: number;
  /** Line 48: Total tax */
  line48: number;
  /** Line 71: CA withholding (from W-2 Box 17) */
  line71: number;
  /** Line 72: CA estimated payments */
  line72: number;
  /** Line 74: Total payments */
  line74: number;
  /** Line 91: Overpaid */
  line91: number;
  /** Line 95: Amount owed */
  line95: number;
}

// ── PII Data ───────────────────────────────────────────────────────────

export interface PIIData {
  primary: {
    firstName: string;
    lastName: string;
    ssn: string;
    middleInitial?: string;
  };
  /** Taxpayer's occupation (from W-2 or prior return) */
  occupation?: string;
  spouse?: {
    firstName: string;
    lastName: string;
    ssn: string;
  };
  dependents: Array<{
    firstName: string;
    lastName: string;
    ssn: string;
    relationship: string;
    dob?: string;
  }>;
  address: {
    street: string;
    aptNo?: string;
    city: string;
    state: string;
    zip: string;
  };
  filingStatus: FilingStatus;
  // Direct deposit (from prior year return)
  routingNumber?: string;
  accountNumber?: string;
  accountType?: 'checking' | 'savings';
}
