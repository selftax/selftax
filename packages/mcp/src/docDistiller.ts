/**
 * Document Distiller — extracts structured tax data from any document.
 *
 * Pipeline per document:
 *   1. Haiku classifies document type (~$0.001)
 *   2. Well-structured IRS forms → regex extraction (free, deterministic)
 *      W-2, 1098, 1099-INT/DIV/B/NEC, prior-year-return
 *   3. Unstructured docs → Sonnet LLM extraction with focused template
 *      Spreadsheets, receipts, statements, etc.
 *
 * Returns TaxDocumentExtraction[] which is merged deterministically.
 */

import {
  mapW2Fields,
  map1098Fields,
  map1099INTFields,
  map1099DIVFields,
  map1099NECFields,
  map1099BFields,
} from '@selftax/core';
import {
  runClaude,
  createStats,
  addToStats,
  formatStats,
  type ClaudeResult,
  type ClaudeStats,
} from './claudeRunner.js';

/** What a single document extraction can contain */
export interface TaxDocumentExtraction {
  sourceDocument: string;
  /** Tax year this document is for (e.g., 2025 for a 2025 W-2, 2024 for a prior year return) */
  documentTaxYear?: number;

  // ── Single-source fields (one doc provides each) ──
  wages?: number;
  federalWithholding?: number;
  stateWithholding?: number;
  medicareWages?: number;
  medicareTaxWithheld?: number;
  qualifiedDividends?: number;
  ordinaryDividends?: number;
  longTermCapitalGains?: number;
  shortTermCapitalGains?: number;
  taxableInterest?: number;
  taxableIraDistributions?: number;
  iraDistributions?: number;
  taxablePensions?: number;
  pensionDistributions?: number;
  socialSecurityBenefits?: number;
  selfEmploymentIncome?: number;
  unemploymentCompensation?: number;
  alimonyReceived?: number;
  farmIncome?: number;
  k1OrdinaryIncome?: number;
  k1RentalIncome?: number;
  form4797Gain?: number;
  primaryMortgageInterest?: number;
  primaryPropertyTax?: number;
  dependentCareExpenses?: number;
  careProvider?: {
    name?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    ein?: string;
    isHouseholdEmployee?: boolean;
  };
  capitalLossCarryforward?: number;
  priorYearUnallowedLoss?: number;
  depreciation?: number;
  rentalInsurance?: number;
  rentalMortgageInterest?: number;
  rentalPropertyTax?: number;
  hsaDeduction?: number;
  studentLoanInterest?: number;
  educationExpenses?: number;
  educationCreditType?: string;
  foreignTaxCredit?: number;
  premiumTaxCredit?: number;
  retirementContributions?: number;
  cleanEnergyCredit?: number;
  energyImprovementCredit?: number;
  educatorExpenses?: number;
  estimatedPayments?: number;
  qbiIncome?: number;
  amortization?: number;
  /** Taxpayer's occupation (from W-2 or prior return) */
  occupation?: string;

  // ── Additive fields (multiple docs contribute, merged by summing) ──
  rentalUnits?: Array<{
    address?: string;
    grossRent: number;
    managementFees?: number;
    repairs?: number;
    utilities?: number;
    insurance?: number;
    otherExpenses?: number;
  }>;

  /** Property address (for property tax bills, rental statements) */
  propertyAddress?: string;
  /** Classification type (set by classifier, passed through for logging) */
  classifiedType?: string;
}

export interface DistillInput {
  fileName: string;
  redactedText: string;
  documentType?: string;
  /** Raw PDF bytes as base64 — if provided, sent as a document to the API for vision extraction */
  pdfBase64?: string;
}

export interface ExtractResult {
  fileName: string;
  extraction: TaxDocumentExtraction;
}

const PROMPT_RULES = `RULES:
- Only fill fields you find EVIDENCE for in this document
- Dollar amounts as numbers (no $ signs, no commas)
- PII tokens: [SELF] = taxpayer, [SPOUSE] = spouse, [HOME_ADDRESS] = primary residence, [RENTAL_1_ADDRESS] = rental property
- Return ONLY a JSON object — no markdown fences, no explanation
- Replace description strings with actual numbers. Omit null fields.
`;


/** Per-document-type extraction templates — focused fields reduce LLM errors */
const TYPE_TEMPLATES: Record<string, string> = {
  w2: `You are reading a W-2 (Wage and Tax Statement). Extract:
${PROMPT_RULES}
{
  "documentTaxYear": 2025,
  "wages": "Box 1: Wages, tips, other compensation",
  "federalWithholding": "Box 2: Federal income tax withheld",
  "stateWithholding": "Box 17: State income tax withheld (NOT from employer address)",
  "medicareWages": "Box 5: Medicare wages",
  "medicareTaxWithheld": "Box 6: Medicare tax withheld",
  "occupation": "Employer name or taxpayer occupation if visible"
}`,

  '1099-int': `You are reading a 1099-INT (Interest Income). Extract:
${PROMPT_RULES}
{
  "documentTaxYear": 2025,
  "taxableInterest": "Box 1: Interest income",
  "federalWithholding": "Box 4: Federal income tax withheld"
}`,

  '1099-div': `You are reading a 1099-DIV (Dividends and Distributions). Extract:
${PROMPT_RULES}
{
  "documentTaxYear": 2025,
  "ordinaryDividends": "Box 1a: Total ordinary dividends",
  "qualifiedDividends": "Box 1b: Qualified dividends",
  "longTermCapitalGains": "Box 2a: Total capital gain distributions",
  "foreignTaxCredit": "Box 7: Foreign tax paid",
  "federalWithholding": "Box 4: Federal income tax withheld"
}`,

  '1099-b': `You are reading a 1099-B (Proceeds from Broker Transactions). Extract:
${PROMPT_RULES}
{
  "documentTaxYear": 2025,
  "shortTermCapitalGains": "Net short-term gain or loss (proceeds minus cost basis, holding period ≤ 1 year)",
  "longTermCapitalGains": "Net long-term gain or loss (proceeds minus cost basis, holding period > 1 year)"
}`,

  '1099-nec': `You are reading a 1099-NEC (Nonemployee Compensation). Extract:
${PROMPT_RULES}
{
  "documentTaxYear": 2025,
  "selfEmploymentIncome": "Box 1: Nonemployee compensation",
  "federalWithholding": "Box 4: Federal income tax withheld"
}`,

  '1099-misc': `You are reading a 1099-MISC (Miscellaneous Income). Extract:
${PROMPT_RULES}
{
  "documentTaxYear": 2025,
  "selfEmploymentIncome": "Box 7 or other: Income if self-employment related",
  "k1OrdinaryIncome": "Any pass-through income if applicable"
}`,

  '1098': `You are reading a 1098 (Mortgage Interest Statement). Extract:
${PROMPT_RULES}
- If the property address matches [HOME_ADDRESS], use PRIMARY fields
- If the property address matches [RENTAL_1_ADDRESS], use RENTAL fields
{
  "documentTaxYear": 2025,
  "primaryMortgageInterest": "Box 1: Mortgage interest on PRIMARY residence",
  "rentalMortgageInterest": "Box 1: Mortgage interest on RENTAL property",
  "rentalPropertyTax": "Box 10: Property taxes paid from escrow on RENTAL property",
  "primaryPropertyTax": "Box 10: Property taxes paid from escrow on PRIMARY residence",
  "rentalInsurance": "Hazard insurance paid from escrow (if shown)"
}`,

  // ── New income form templates ──

  '1099-r': `You are reading a 1099-R (Retirement Distributions). Extract:
${PROMPT_RULES}
{
  "documentTaxYear": 2025,
  "iraDistributions": "Box 1: Gross distribution (if IRA)",
  "taxableIraDistributions": "Box 2a: Taxable amount (if IRA)",
  "pensionDistributions": "Box 1: Gross distribution (if pension/annuity)",
  "taxablePensions": "Box 2a: Taxable amount (if pension/annuity)",
  "federalWithholding": "Box 4: Federal income tax withheld",
  "stateWithholding": "Box 12: State tax withheld"
}`,

  '1099-g': `You are reading a 1099-G (Government Payments). Extract:
${PROMPT_RULES}
{
  "documentTaxYear": 2025,
  "unemploymentCompensation": "Box 1: Unemployment compensation",
  "federalWithholding": "Box 4: Federal income tax withheld",
  "stateWithholding": "Box 11: State income tax withheld"
}`,

  '1099-ssa': `You are reading an SSA-1099 (Social Security Benefit Statement). Extract:
${PROMPT_RULES}
{
  "documentTaxYear": 2025,
  "socialSecurityBenefits": "Box 5: Net benefits paid"
}`,

  '1099-k': `You are reading a 1099-K (Payment Card Transactions). Extract:
${PROMPT_RULES}
{
  "documentTaxYear": 2025,
  "selfEmploymentIncome": "Box 1a: Gross amount of payment card/third party transactions"
}`,

  '1099-s': `You are reading a 1099-S (Real Estate Proceeds). Extract:
${PROMPT_RULES}
{
  "documentTaxYear": 2025,
  "form4797Gain": "Box 2: Gross proceeds from real estate sale"
}`,

  '1099-c': `You are reading a 1099-C (Cancellation of Debt). Extract:
${PROMPT_RULES}
{
  "documentTaxYear": 2025,
  "otherIncome": "Box 2: Amount of debt discharged"
}`,

  '1099-sa': `You are reading a 1099-SA (HSA Distributions). Extract:
${PROMPT_RULES}
{
  "documentTaxYear": 2025,
  "hsaDistribution": "Box 1: Gross distribution from HSA"
}`,

  'w2g': `You are reading a W-2G (Gambling Winnings). Extract:
${PROMPT_RULES}
{
  "documentTaxYear": 2025,
  "gamblingWinnings": "Box 1: Reportable winnings",
  "federalWithholding": "Box 4: Federal income tax withheld"
}`,

  'k-1': `You are reading a Schedule K-1 (Partner/Shareholder Income). Extract:
${PROMPT_RULES}
{
  "documentTaxYear": 2025,
  "k1OrdinaryIncome": "Box 1 (1065) or Box 1 (1120-S): Ordinary business income",
  "k1RentalIncome": "Box 2 (1065): Net rental real estate income/loss",
  "longTermCapitalGains": "Box 9a (1065) or Box 8a (1120-S): Net long-term capital gain",
  "shortTermCapitalGains": "Box 8 (1065) or Box 7 (1120-S): Net short-term capital gain",
  "qualifiedDividends": "Box 6b (1065): Qualified dividends",
  "foreignTaxCredit": "Box 16 (1065): Foreign taxes paid"
}`,

  // ── Deduction/credit form templates ──

  '1098-t': `You are reading a 1098-T (Tuition Statement). Extract:
${PROMPT_RULES}
{
  "documentTaxYear": 2025,
  "educationExpenses": "Box 1: Payments received for qualified tuition and related expenses",
  "educationCreditType": "AOTC or LLC based on student status if determinable"
}`,

  '1098-e': `You are reading a 1098-E (Student Loan Interest). Extract:
${PROMPT_RULES}
{
  "documentTaxYear": 2025,
  "studentLoanInterest": "Box 1: Student loan interest received by lender"
}`,

  '1095-a': `You are reading a 1095-A (Health Insurance Marketplace Statement). Extract:
${PROMPT_RULES}
{
  "documentTaxYear": 2025,
  "premiumTaxCredit": "Column C total: Advance payment of premium tax credit",
  "monthlyPremium": "Column A total: Monthly enrollment premiums",
  "slcsp": "Column B total: Second lowest cost silver plan (SLCSP) premium"
}`,

  '5498-sa': `You are reading a 5498-SA (HSA Contributions). Extract:
${PROMPT_RULES}
{
  "documentTaxYear": 2025,
  "hsaDeduction": "Box 2: Total contributions made in tax year"
}`,

  // ── Specific document types (LLM returns totals) ──

  'property-tax-bill': `You are reading a property tax bill or statement. Extract:
${PROMPT_RULES}
- If the property address matches [HOME_ADDRESS], use primaryPropertyTax
- If the property address matches [RENTAL_1_ADDRESS], use rentalPropertyTax
{
  "documentTaxYear": 2025,
  "primaryPropertyTax": "Total property tax PAID on PRIMARY residence (all installments)",
  "rentalPropertyTax": "Total property tax PAID on RENTAL property (all installments)"
}`,

  'daycare-statement': `You are reading a childcare/daycare statement. Extract:
${PROMPT_RULES}
IMPORTANT: "dependentCareExpenses" = total amount ACTUALLY PAID (cash out of pocket) in the tax year.
- If the document shows both charges AND payments (ACH, check, etc.), use the PAYMENT totals — that is what was paid.
- If the document only shows charges, sum those instead.
- Do NOT double-count by adding charges and payments together.
{
  "documentTaxYear": 2025,
  "dependentCareExpenses": "Total amount PAID for child/dependent care in the tax year",
  "careProvider": {
    "name": "Name of the daycare/preschool/care provider organization",
    "address": "Street address of the care provider",
    "city": "City",
    "state": "Two-letter state code",
    "zip": "ZIP code",
    "ein": "EIN or Tax ID of the care provider (XX-XXXXXXX format)",
    "isHouseholdEmployee": false
  }
}
If the provider is an individual (nanny, babysitter), use their name. If it is a business, use the business name.`,

  'charitable-receipt': `You are reading a charitable donation receipt. Extract:
${PROMPT_RULES}
{
  "documentTaxYear": 2025,
  "charitableCash": "Cash/check contributions to qualified charities",
  "charitableNonCash": "Non-cash contributions (goods, property) fair market value"
}`,

  'medical-receipt': `You are reading a medical expense document. Extract:
${PROMPT_RULES}
{
  "documentTaxYear": 2025,
  "medicalExpenses": "Total medical/dental expenses paid (not reimbursed by insurance)"
}`,

  'estimated-tax-payment': `You are reading an estimated tax payment confirmation. Extract:
${PROMPT_RULES}
{
  "documentTaxYear": 2025,
  "estimatedPayments": "Total estimated tax payments made for the tax year"
}`,

  'energy-improvement': `You are reading an energy improvement receipt or invoice. Extract:
${PROMPT_RULES}
{
  "documentTaxYear": 2025,
  "cleanEnergyCredit": "Total cost of qualifying clean energy improvements (solar, etc.)",
  "energyImprovementCredit": "Total cost of qualifying energy efficiency improvements (insulation, windows, etc.)"
}`,

  'educator-expense': `You are reading an educator expense receipt. Extract:
${PROMPT_RULES}
{
  "documentTaxYear": 2025,
  "educatorExpenses": "Total unreimbursed educator expenses (classroom supplies, books, etc.)"
}`,

  'business-expense': `You are reading a business expense receipt or statement. Extract:
${PROMPT_RULES}
{
  "documentTaxYear": 2025,
  "selfEmploymentIncome": "Gross business income/receipts if shown",
  "businessExpenses": "Total business expenses"
}`,

  receipt: `You are reading a receipt or statement. Identify what type it is and extract:
${PROMPT_RULES}
- If it's a property tax bill: use primaryPropertyTax or rentalPropertyTax
- If it's a daycare/childcare statement: use dependentCareExpenses
- If it's a charitable donation receipt: use charitableCash
- If it's a medical bill: use medicalExpenses
{
  "documentTaxYear": 2025,
  "primaryPropertyTax": "Property tax on [HOME_ADDRESS] residence",
  "rentalPropertyTax": "Property tax on [RENTAL_1_ADDRESS] property",
  "dependentCareExpenses": "Child/dependent care expenses",
  "charitableCash": "Charitable cash donations",
  "medicalExpenses": "Medical/dental expenses"
}`,

  spreadsheet: `You are reading a rental property income/expense spreadsheet. Extract:
${PROMPT_RULES}
{
  "documentTaxYear": 2025,
  "rentalUnits": "array — one entry per rental property/unit in THIS document"
}
rentalUnit template: { "address": "", "grossRent": 0, "managementFees": 0, "repairs": 0, "utilities": 0, "insurance": 0, "otherExpenses": 0 }`,

  'rental-spreadsheet': `You are reading a rental property income/expense spreadsheet. Extract:
${PROMPT_RULES}
{
  "documentTaxYear": 2025,
  "rentalUnits": "array — one entry per rental property/unit in THIS document"
}
rentalUnit template: { "address": "", "grossRent": 0, "managementFees": 0, "repairs": 0, "utilities": 0, "insurance": 0, "otherExpenses": 0 }`,

  'prior-year-return': `You are reading a PRIOR YEAR tax return. Extract ONLY carryforward values.
${PROMPT_RULES}
IMPORTANT: Only extract values that carry forward to the NEXT year. Ignore income, withholding, credits.

Look at these SPECIFIC forms and lines:
- Capital Loss Carryover Worksheet (after Schedule D): the amount CARRIED FORWARD to next year. This is the total loss MINUS the $3,000 already deducted. NOT the raw Schedule D loss.
- Form 8582 (Passive Activity Loss Limitations) line 16 or worksheets: unallowed passive losses
- Schedule E line 18 or Form 4562: depreciation and amortization
- Schedule E line 9: rental property insurance
- Form 8995 or 8995-A: qualified business income
- Form 1040 page 2 near signature: taxpayer occupation

{
  "documentTaxYear": "the tax year of this return (e.g., 2024)",
  "capitalLossCarryforward": "From Capital Loss Carryover Worksheet — amount carried to next year (NOT the raw loss from Schedule D line 16)",
  "priorYearUnallowedLoss": "From Form 8582 — unallowed passive activity loss (positive number)",
  "depreciation": "From Schedule E line 18 or Form 4562 — annual depreciation",
  "amortization": "From Form 4562 — annual amortization",
  "rentalInsurance": "From Schedule E line 9 — hazard insurance on rental",
  "qbiIncome": "From Form 8995 — qualified business income",
  "occupation": "From Form 1040 page 2 — taxpayer occupation"
}`,
};

/** Fallback template for unrecognized document types */
const GENERIC_TEMPLATE = `You are a tax document reader. Extract tax-relevant data.
${PROMPT_RULES}
{
  "documentTaxYear": "the tax year this document is for",
  "wages": null,
  "federalWithholding": null,
  "stateWithholding": null,
  "qualifiedDividends": null,
  "ordinaryDividends": null,
  "longTermCapitalGains": null,
  "shortTermCapitalGains": null,
  "taxableInterest": null,
  "taxableIraDistributions": null,
  "taxablePensions": null,
  "socialSecurityBenefits": null,
  "selfEmploymentIncome": null,
  "primaryMortgageInterest": null,
  "primaryPropertyTax": null,
  "rentalMortgageInterest": null,
  "rentalPropertyTax": null,
  "dependentCareExpenses": null,
  "capitalLossCarryforward": "capital loss CARRYFORWARD (after $3k deduction) — NOT raw loss",
  "priorYearUnallowedLoss": null,
  "depreciation": null,
  "hsaDeduction": null,
  "studentLoanInterest": null,
  "foreignTaxCredit": null,
  "retirementContributions": "voluntary IRA/Roth contributions only — NOT 401k/employer plan deferrals",
  "estimatedPayments": null,
  "occupation": null,
  "rentalUnits": "array — one entry per rental property"
}
rentalUnit template: { "address": "", "grossRent": 0, "managementFees": 0, "repairs": 0, "utilities": 0, "insurance": 0, "otherExpenses": 0 }`;


/** All specific types the classifier can identify */
const CLASSIFIABLE_TYPES = [
  'w2', '1099-int', '1099-div', '1099-b', '1099-r', '1099-nec', '1099-misc',
  '1099-g', '1099-ssa', '1099-k', '1099-s', '1099-c', '1099-sa', 'w2g', 'k-1',
  '1098', '1098-t', '1098-e', '1095-a', '5498-sa',
  'property-tax-bill', 'daycare-statement', 'charitable-receipt', 'medical-receipt',
  'rental-spreadsheet', 'prior-year-return',
  'estimated-tax-payment', 'energy-improvement', 'educator-expense', 'business-expense',
];

const CLASSIFICATION_PROMPT = `What type of tax document is this? Reply with ONLY the type code, nothing else.

Types:
- w2 (W-2 wage statement)
- 1099-int (interest income)
- 1099-div (dividends)
- 1099-b (broker/capital gains)
- 1099-r (retirement distributions)
- 1099-nec (self-employment/contractor income)
- 1099-misc (miscellaneous income)
- 1099-g (unemployment/government payments)
- 1099-ssa (social security benefits)
- 1099-k (payment card transactions)
- 1099-s (real estate sale proceeds)
- 1099-c (cancellation of debt)
- 1099-sa (HSA distributions)
- w2g (gambling winnings)
- k-1 (partnership/S-corp income)
- 1098 (mortgage interest)
- 1098-t (tuition/education)
- 1098-e (student loan interest)
- 1095-a (health insurance marketplace)
- 5498-sa (HSA contributions)
- property-tax-bill (property tax bill or assessment)
- daycare-statement (child/dependent care expenses)
- charitable-receipt (donation receipt)
- medical-receipt (medical/dental expenses)
- rental-spreadsheet (rental income/expense data)
- prior-year-return (previous year's tax return)
- estimated-tax-payment (estimated tax payment confirmation)
- energy-improvement (solar, insulation, energy efficiency receipt)
- educator-expense (teacher classroom supply receipt)
- business-expense (business/self-employment expense receipt)

You MUST pick the single best match. Do not say "other" or "unknown".

DOCUMENT (first 2000 chars):
`;

/** Build the extraction prompt for a specific document type */
function buildExtractionPrompt(docType: string | undefined, text: string): string {
  const template = TYPE_TEMPLATES[docType ?? ''] ?? GENERIC_TEMPLATE;
  return template + '\n\nDOCUMENT:\n' + text;
}

/** Document types with regex parsers — no LLM needed */
const REGEX_EXTRACTABLE = new Set([
  'w2', '1098', '1099-int', '1099-div', '1099-nec', '1099-b', 'prior-year-return',
]);

/** Convert regex-parsed fields to TaxDocumentExtraction */
function regexExtract(type: string, text: string, fileName: string): TaxDocumentExtraction | null {
  const result: TaxDocumentExtraction = { sourceDocument: fileName };

  if (type === 'w2') {
    const w2 = mapW2Fields(text);
    if (w2.box1_wages) result.wages = w2.box1_wages;
    if (w2.box2_federal_tax) result.federalWithholding = w2.box2_federal_tax;
    if (w2.state_tax) result.stateWithholding = w2.state_tax;
    if (w2.box5_medicare_wages) result.medicareWages = w2.box5_medicare_wages;
    if (w2.box6_medicare_tax) result.medicareTaxWithheld = w2.box6_medicare_tax;
    if (w2.employer_name) result.occupation = w2.employer_name;
    result.documentTaxYear = 2025;
    return result;
  }

  if (type === '1098') {
    const f = map1098Fields(text);
    if (f.mortgageInterest) result.primaryMortgageInterest = f.mortgageInterest;
    if (f.propertyTax) result.primaryPropertyTax = f.propertyTax;
    result.documentTaxYear = 2025;
    return result;
  }

  if (type === '1099-int') {
    const f = map1099INTFields(text);
    if (f.interestIncome) result.taxableInterest = f.interestIncome;
    if (f.federalTaxWithheld) result.federalWithholding = f.federalTaxWithheld;
    result.documentTaxYear = 2025;
    return result;
  }

  if (type === '1099-div') {
    const f = map1099DIVFields(text);
    if (f.ordinaryDividends) result.ordinaryDividends = f.ordinaryDividends;
    if (f.qualifiedDividends) result.qualifiedDividends = f.qualifiedDividends;
    if (f.federalTaxWithheld) result.federalWithholding = f.federalTaxWithheld;
    result.documentTaxYear = 2025;
    return result;
  }

  if (type === '1099-nec') {
    const f = map1099NECFields(text);
    if (f.nonemployeeCompensation) result.selfEmploymentIncome = f.nonemployeeCompensation;
    if (f.federalTaxWithheld) result.federalWithholding = f.federalTaxWithheld;
    result.documentTaxYear = 2025;
    return result;
  }

  if (type === '1099-b') {
    const f = map1099BFields(text);
    if (f.proceeds || f.costBasis) {
      const gain = (f.proceeds ?? 0) - (f.costBasis ?? 0);
      if (f.isLongTerm) result.longTermCapitalGains = gain;
      else result.shortTermCapitalGains = gain;
    }
    result.documentTaxYear = 2025;
    return result;
  }

  if (type === 'prior-year-return') {
    return extractPriorYearByRegex(text, fileName);
  }

  return null;
}


/** Extract carryforward fields from a prior-year return using direct field lookup.
 *  IRS forms are standardized: same lines, same layout, every year.
 *  Patterns tested against actual redacted prior-year return text. */
/**
 * Parse a dollar amount from flattened 1040 text.
 * Handles: "210,396", "(3,000)", "( 114,460 )", "-3000"
 */
function parseDollar(s: string): number | undefined {
  if (!s) return undefined;
  let cleaned = s.replace(/[$,\s]/g, '');
  const parenMatch = cleaned.match(/^\((.+)\)$/);
  if (parenMatch) cleaned = '-' + parenMatch[1];
  const num = parseFloat(cleaned);
  return isNaN(num) ? undefined : num;
}

/**
 * Generic line-value extractor for flattened IRS form text.
 *
 * Flattened PDFs have two formats:
 *   Format A (inline):  "1a Total amount ... 1a 210,396"
 *   Format B (newline):  "25a\n31,221"  (value on next line after line number)
 *
 * We try label-anchored patterns first, then fall back to simpler matches.
 */
function findLineValue(text: string, lineNum: string, label?: string): number | undefined {
  const escaped = lineNum.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const VALUE = '([\\d,]+(?:\\.\\d+)?|\\(\\s*[\\d,]+\\s*\\))';

  if (label) {
    const labelEscaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Format A: "1a Total amount from Form ... 1a 210,396" (label + repeated lineNum + value)
    const patternA = new RegExp(escaped + '\\s+' + labelEscaped + '.*?' + escaped + '\\s+' + VALUE, 's');
    const matchA = text.match(patternA);
    if (matchA) return parseDollar(matchA[1]);

    // Format B: "1a\n210,396" or "25a\n31,221" (lineNum on one line, value on next)
    // Only match if the label appears nearby (within 200 chars before the lineNum)
    const labelIdx = text.indexOf(label);
    if (labelIdx !== -1) {
      const searchStart = Math.max(0, labelIdx - 50);
      const searchEnd = Math.min(text.length, labelIdx + 2000);
      const section = text.slice(searchStart, searchEnd);
      // Find lineNum followed by newline then value
      const patternB = new RegExp(escaped + '\\s*\\n\\s*' + VALUE);
      const matchB = section.match(patternB);
      if (matchB) return parseDollar(matchB[1]);
    }
  }

  // Fallback: lineNum repeated with value (no label needed)
  const patternC = new RegExp(escaped + '\\b.*?' + escaped + '\\s+' + VALUE, 's');
  const matchC = text.match(patternC);
  if (matchC) return parseDollar(matchC[1]);

  // Fallback: lineNum followed by newline then value
  const patternD = new RegExp('\\b' + escaped + '\\s*\\n\\s*' + VALUE);
  const matchD = text.match(patternD);
  return matchD ? parseDollar(matchD[1]) : undefined;
}

/** Find a value within a specific form section */
function findInSection(text: string, sectionHeader: string, lineNum: string, label?: string): number | undefined {
  const idx = text.indexOf(sectionHeader);
  if (idx === -1) return undefined;
  // Search within 3000 chars of the section header
  const section = text.slice(idx, idx + 3000);
  return findLineValue(section, lineNum, label);
}

function extractPriorYearByRegex(text: string, fileName: string): TaxDocumentExtraction {
  const result: TaxDocumentExtraction = { sourceDocument: fileName };

  // ── Tax year ── (handles "Form\n1040" newline in flattened PDFs)
  const yearMatch = text.match(/Form\s+1040.*?(?:Tax Return|Individual Income Tax)\s*(20\d{2})/is);
  if (yearMatch) result.documentTaxYear = parseInt(yearMatch[1], 10);

  // ── Form 1040 income lines ──
  const wages = findLineValue(text, '1a', 'Total amount from Form');
  if (wages != null) result.wages = wages;

  const fedWithholding = findLineValue(text, '25a', 'Form');
  if (fedWithholding != null) result.federalWithholding = fedWithholding;

  result.estimatedPayments = findLineValue(text, '26', 'Estimated tax payments');

  // ── Schedule D — Capital Gains ──
  const clcMatch = text.match(/14\s+Long-term capital loss carryover.*?\(\s*([\d,]+)\s*\)/s);
  if (clcMatch) result.capitalLossCarryforward = parseDollar(clcMatch[1]);

  // ── Schedule E — Rental Income ──
  const scheEIdx = text.indexOf('SCHEDULE E');
  if (scheEIdx !== -1) {
    const se = text.slice(scheEIdx, scheEIdx + 3000);
    result.rentalInsurance = findLineValue(se, '9', 'Insurance');
    result.rentalMortgageInterest = findLineValue(se, '12', 'Mortgage interest');
    result.rentalPropertyTax = findLineValue(se, '16', 'Taxes');
    result.depreciation = findLineValue(se, '18', 'Depreciation');
  }

  // ── Form 8582 — Passive Activity ──
  const unallowedMatch = text.match(/Prior year[s\u2019']*\s*unallowed losses.*?\(\s*(\d[\d,]*)\s*\)/s);
  if (unallowedMatch) result.priorYearUnallowedLoss = parseDollar(unallowedMatch[1]);

  // ── Form 4562 — Depreciation/Amortization ──
  result.amortization = findInSection(text, 'Form 4562', '43', 'Amortization of costs');
  // Fallback: look for "Amortization" line with value in Form 4562 section
  if (result.amortization == null) {
    result.amortization = findInSection(text, 'Form 4562', '44', 'Total');
    // Also try the direct "43\n829" newline format
    if (result.amortization == null) {
      const f4562Idx = text.indexOf('4562');
      if (f4562Idx !== -1) {
        const section = text.slice(f4562Idx, f4562Idx + 10000);
        const amortMatch = section.match(/43\s*\n\s*([\d,]+)/);
        if (amortMatch) result.amortization = parseDollar(amortMatch[1]);
      }
    }
  }
  // If depreciation wasn't found in Schedule E, try Form 4562
  if (result.depreciation == null) {
    result.depreciation = findInSection(text, 'Form 4562', '17', 'MACRS deductions');
  }

  // ── Form 8995 — QBI ──
  // Skip "from Form 8995" references on 1040 — find the actual Form 8995 page
  const qbi8995Idx = text.indexOf('Form 8995') !== -1
    ? text.indexOf('Qualified Business Income Deduction')
    : -1;
  if (qbi8995Idx !== -1) {
    const section = text.slice(qbi8995Idx, qbi8995Idx + 2000);
    // Look for "Schedule E: ... 6,775" on the Form 8995
    const qbiMatch = section.match(/Schedule E[:\s].*?([\d,]+)\s*$/m);
    if (qbiMatch) result.qbiIncome = parseDollar(qbiMatch[1]);
  }
  // Fallback: 1040 line 13 (QBI deduction amount)
  if (result.qbiIncome == null) {
    result.qbiIncome = findLineValue(text, '13', 'Qualified business income deduction');
  }

  // ── Occupation ── (appears near "Your occupation" + date + occupation text)
  // Format: "94905\t04-10-2025 SOFTWARE ENGINEER"
  const occMatch = text.match(/Your occupation[\s\S]*?\d{5}\s+\d{2}-\d{2}-\d{4}\s+([A-Z][A-Z\s]+)/);
  if (occMatch) {
    const occText = occMatch[1].trim();
    if (occText.length > 2) result.occupation = occText;
  }

  // ── Next Year's Depreciation (for current-year estimate) ──
  const nextYearMatch = text.match(/Next Year.*?TOTAL\s+([\d,]+)/s);
  if (nextYearMatch) {
    // Store as metadata for depreciation projection
    const nextYearDepr = parseDollar(nextYearMatch[1]);
    if (nextYearDepr != null && result.depreciation == null) {
      result.depreciation = nextYearDepr;
    }
  }

  // Clean up undefined values
  for (const key of Object.keys(result) as (keyof TaxDocumentExtraction)[]) {
    if (result[key] === undefined) delete result[key];
  }

  const fields = Object.keys(result).filter((k) => k !== 'sourceDocument');
  console.log(`[Extract] Prior-year structured: ${fields.length} fields from ${fileName} — ${fields.join(', ')}`);

  return result;
}



/** Extract structured data from a single document.
 *  Classifies with Haiku first, then extracts with the matching template.
 *  Prior-year returns use regex extraction (no LLM) since IRS forms are standardized. */
export interface ExtractDocumentResult extends ClaudeResult {
  classifiedType: string;
}

export async function extractDocument(input: DistillInput): Promise<ExtractDocumentResult> {
  let detectedType = '';
  let classifyCost = 0;

  // Step 1: Classify — skip if extension already detected the type
  if (input.documentType && CLASSIFIABLE_TYPES.includes(input.documentType)) {
    detectedType = input.documentType;
    console.log(`[Extract] Pre-classified "${input.fileName}" as: ${detectedType} (skip Haiku)`);
  } else {
    const snippet = input.redactedText.slice(0, 2000);
    const classifyResult = await runClaude(
      CLASSIFICATION_PROMPT + snippet,
      { timeout: 30000, model: 'haiku' },
    );
    classifyCost = classifyResult.cost;

    detectedType = (classifyResult.text ?? '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!CLASSIFIABLE_TYPES.includes(detectedType)) {
      console.log(`[Extract] Haiku returned unrecognized type "${detectedType}" for "${input.fileName}", using generic template`);
      detectedType = '';
    }

    console.log(`[Extract] Classified "${input.fileName}" as: ${detectedType}`);
  }

  // Step 2: Prior-year returns → regex only (proven to work, LLM was unreliable on 185k docs)
  if (detectedType === 'prior-year-return') {
    const extraction = extractPriorYearByRegex(input.redactedText, input.fileName);
    const fields = Object.keys(extraction).filter((k) => k !== 'sourceDocument' && (extraction as unknown as Record<string, unknown>)[k] != null);
    console.log(`[Extract] Regex extracted ${fields.length} fields from "${input.fileName}" (no LLM needed)`);
    return {
      text: JSON.stringify(extraction),
      durationMs: 0,
      inputTokens: 0,
      outputTokens: 0,
      cost: classifyCost,
      model: 'regex',
      classifiedType: detectedType,
    };
  }

  // Step 3: Extract with vision (PDF) or text
  if (input.pdfBase64) {
    const template = TYPE_TEMPLATES[detectedType] ?? TYPE_TEMPLATES['receipt'] ?? '';
    const prompt = template + '\n\nReturn ONLY the JSON object.';

    // Priority: Gemini (free, fast) > Anthropic API > Claude CLI with Read tool
    // Try direct API paths first (fast), fall through to CLI on failure
    if (process.env.GEMINI_API_KEY) {
      try {
        const { runGeminiWithPDF } = await import('./claudeRunner.js');
        const result = await runGeminiWithPDF(prompt, input.pdfBase64);
        return { ...result, classifiedType: detectedType };
      } catch (err) {
        console.log(`[Extract] Gemini failed for ${input.fileName}: ${err instanceof Error ? err.message.slice(0, 100) : err}. Falling back to CLI.`);
      }
    }

    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const { runClaudeAPI } = await import('./claudeRunner.js');
        const result = await runClaudeAPI(prompt, { timeout: 180000, model: 'sonnet', pdfBase64: input.pdfBase64 });
        return { ...result, classifiedType: detectedType };
      } catch (err) {
        console.log(`[Extract] Claude API failed for ${input.fileName}: ${err instanceof Error ? err.message.slice(0, 100) : err}. Falling back to CLI.`);
      }
    }

    // CLI fallback: write temp file, use Read tool
    const { writeFileSync, mkdtempSync, unlinkSync } = await import('fs');
    const { join } = await import('path');
    const { tmpdir } = await import('os');
    const { runClaudeWithFile } = await import('./claudeRunner.js');

    const tmpDir = mkdtempSync(join(tmpdir(), 'selftax-pdf-'));
    const tmpFile = join(tmpDir, input.fileName || 'document.pdf');
    writeFileSync(tmpFile, Buffer.from(input.pdfBase64, 'base64'));

    try {
      const filePrompt = `Read the PDF file at ${tmpFile}.\n\n${template}\n\nReturn ONLY the JSON object.`;
      const result = await runClaudeWithFile(filePrompt, tmpFile, { timeout: 180000, model: 'sonnet' });
      return { ...result, classifiedType: detectedType };
    } finally {
      try { unlinkSync(tmpFile); } catch { /* ignore */ }
    }
  }

  // Fallback: CLI text-based extraction (for non-PDF docs like XLS text)
  const prompt = buildExtractionPrompt(detectedType, input.redactedText);
  const result = await runClaude(prompt, { timeout: 180000, model: 'sonnet' });
  return { ...result, classifiedType: detectedType };
}

const MAX_RETRIES = 2;

/** Parse a Claude result into a TaxDocumentExtraction, or return null on failure */
function parseExtraction(r: ClaudeResult, fileName: string): TaxDocumentExtraction | null {
  if (!r.text) return null;
  const jsonMatch = r.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]) as TaxDocumentExtraction;
    delete (parsed as unknown as Record<string, unknown>)['_rentalUnitTemplate'];
    for (const [key, val] of Object.entries(parsed)) {
      if (typeof val === 'string' && val.length > 20) {
        delete (parsed as unknown as Record<string, unknown>)[key];
      }
    }
    parsed.sourceDocument = fileName;
    return parsed;
  } catch {
    return null;
  }
}

/** Extract from multiple documents in parallel, retrying failures */
export async function extractDocuments(docs: DistillInput[]): Promise<{ results: ExtractResult[]; stats: ClaudeStats }> {
  const nonEmpty = docs.filter((d) => d.redactedText.length > 0 || d.pdfBase64);
  const skipped = docs.length - nonEmpty.length;
  const totalInputChars = nonEmpty.reduce((sum, d) => sum + d.redactedText.length + (d.pdfBase64 ? d.pdfBase64.length : 0), 0);

  const MAX_CONCURRENT = 4; // Limit concurrent Claude CLI processes to avoid API contention
  console.log(`[Extract] Processing ${nonEmpty.length} documents (max ${MAX_CONCURRENT} concurrent, ${skipped} empty skipped, ${totalInputChars.toLocaleString()} total input chars)...`);
  const start = Date.now();
  const stats = createStats();

  // Extract with concurrency limit to avoid API rate limit contention
  // (10+ concurrent claude processes cause 120s+ waits on the last ones)
  const settled: PromiseSettledResult<ExtractDocumentResult>[] = new Array(nonEmpty.length);
  let cursor = 0;

  async function runNext(): Promise<void> {
    while (cursor < nonEmpty.length) {
      const idx = cursor++;
      settled[idx] = await extractDocument(nonEmpty[idx])
        .then((v) => ({ status: 'fulfilled' as const, value: v }))
        .catch((reason) => ({ status: 'rejected' as const, reason }));
    }
  }

  // Start MAX_CONCURRENT workers
  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT, nonEmpty.length) }, () => runNext()));

  const results: (ExtractResult | null)[] = new Array(settled.length).fill(null);
  const failed: number[] = [];

  for (let i = 0; i < settled.length; i++) {
    const result = settled[i];
    const fileName = nonEmpty[i].fileName;
    const inputLen = nonEmpty[i].redactedText.length;

    if (result.status === 'fulfilled') {
      addToStats(stats, result.value);
      const parsed = parseExtraction(result.value, fileName);
      if (parsed) {
        parsed.classifiedType = result.value.classifiedType;
        const fieldCount = Object.keys(parsed).filter(k => (parsed as unknown as Record<string, unknown>)[k] != null && k !== 'sourceDocument' && k !== 'classifiedType').length;
        console.log(`[Extract] ✓ ${fileName} (${inputLen.toLocaleString()} chars, ${(result.value.durationMs / 1000).toFixed(1)}s, $${result.value.cost.toFixed(4)}) → ${fieldCount} fields`);
        results[i] = { fileName, extraction: parsed };
      } else {
        console.log(`[Extract] ✗ ${fileName}: failed to parse response`);
        failed.push(i);
      }
    } else {
      const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
      console.log(`[Extract] ✗ ${fileName} (${inputLen.toLocaleString()} chars): ${reason}`);
      failed.push(i);
    }
  }

  // Retry failed extractions (sequentially to avoid overload)
  for (let retry = 1; retry <= MAX_RETRIES && failed.length > 0; retry++) {
    const retrying = [...failed];
    failed.length = 0;
    console.log(`[Extract] Retry ${retry}/${MAX_RETRIES}: ${retrying.length} documents...`);

    const retrySettled = await Promise.allSettled(
      retrying.map((idx) => extractDocument(nonEmpty[idx])),
    );

    for (let j = 0; j < retrySettled.length; j++) {
      const idx = retrying[j];
      const result = retrySettled[j];
      const fileName = nonEmpty[idx].fileName;
      const inputLen = nonEmpty[idx].redactedText.length;

      if (result.status === 'fulfilled') {
        addToStats(stats, result.value);
        const parsed = parseExtraction(result.value, fileName);
        if (parsed) {
          const fieldCount = Object.keys(parsed).filter(k => (parsed as unknown as Record<string, unknown>)[k] != null && k !== 'sourceDocument').length;
          console.log(`[Extract] ✓ ${fileName} (retry ${retry}, ${inputLen.toLocaleString()} chars, ${(result.value.durationMs / 1000).toFixed(1)}s, $${result.value.cost.toFixed(4)}) → ${fieldCount} fields`);
          results[idx] = { fileName, extraction: parsed };
        } else {
          console.log(`[Extract] ✗ ${fileName} (retry ${retry}): failed to parse`);
          failed.push(idx);
        }
      } else {
        const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
        console.log(`[Extract] ✗ ${fileName} (retry ${retry}): ${reason}`);
        failed.push(idx);
      }
    }
  }

  // If any documents still failed after retries, abort
  if (failed.length > 0) {
    const failedNames = failed.map((i) => nonEmpty[i].fileName).join(', ');
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[Extract] FAILED after ${elapsed}s: ${failed.length} documents could not be extracted: ${failedNames}`);
    throw new Error(
      `Extraction failed for ${failed.length} document(s) after ${MAX_RETRIES} retries: ${failedNames}. ` +
      'Cannot proceed with incomplete data — results would be incorrect.',
    );
  }

  const finalResults = results.filter((r): r is ExtractResult => r !== null);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[Extract] Complete in ${elapsed}s: ${finalResults.length}/${nonEmpty.length} succeeded`);
  console.log(`[Extract] Cost: ${formatStats(stats)}`);

  return { results: finalResults, stats };
}
