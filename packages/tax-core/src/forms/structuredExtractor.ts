/**
 * Structured Field Extractor — deterministic extraction from flattened IRS form text.
 *
 * Works on text extracted from flattened PDFs (no AcroForm fields needed).
 * IRS forms have consistent patterns: "lineNum label ... lineNum value"
 * or "lineNum\nvalue" in flattened format.
 *
 * Supports: Form 1040 (prior-year), W-2, 1099-INT, 1098.
 * Non-IRS documents (property tax bills, receipts) go to LLM.
 *
 * Pure string processing — no I/O, no LLM, no pdf-lib.
 */

/** Extracted fields — superset across all form types */
export interface StructuredExtraction {
  formType: string;
  documentTaxYear?: number;
  // 1040 fields
  priorYearAgi?: number;
  wages?: number;
  federalWithholding?: number;
  capitalLossCarryforward?: number;
  rentalInsurance?: number;
  rentalMortgageInterest?: number;
  rentalPropertyTax?: number;
  depreciation?: number;
  priorYearUnallowedLoss?: number;
  amortization?: number;
  qbiIncome?: number;
  occupation?: string;
  // Bank info (from prior-year 1040 lines 35b-d)
  routingNumber?: string;
  accountNumber?: string;
  accountType?: 'checking' | 'savings';
  // Self-select signature PINs (from prior-year 1040 Sign Here section)
  efilePin?: string;
  spouseEfilePin?: string;
  // W-2 fields
  socialSecurityWages?: number;
  socialSecurityTaxWithheld?: number;
  medicareWages?: number;
  medicareTaxWithheld?: number;
  stateWithholding?: number;
  dependentCareBenefits?: number;
  // W-2 employer info (text, not numbers)
  employerName?: string;
  employerAddress?: string;
  employerCity?: string;
  employerState?: string;
  employerZip?: string;
  employerEin?: string;
  stateEmployerId?: string;
  // W-2 Box 12 entries (code + amount pairs)
  box12?: Array<{ code: string; amount: number }>;
  // Care provider info (from prior year Form 2441)
  careProvider?: {
    name?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    ein?: string;
  };
  // Rental property address (from prior year Schedule E)
  rentalAddress?: string;
  rentalCity?: string;
  rentalState?: string;
  rentalZip?: string;
  // 1099-INT fields
  taxableInterest?: number;
  // 1098 fields (names match TaxDocumentExtraction for merger compatibility)
  primaryMortgageInterest?: number;
  outstandingMortgagePrincipal?: number;
  primaryPropertyTax?: number;
  mortgageInsurancePremiums?: number;
}

// ── Helpers ──────────────────────────────────────────────────────

/** Parse a dollar amount: "210,396", "$14,996.38", "(3,000)", "-3000" */
function parseDollar(s: string): number | undefined {
  if (!s) return undefined;
  let cleaned = s.replace(/[$,\s]/g, '');
  const parenMatch = cleaned.match(/^\((.+)\)$/);
  if (parenMatch) cleaned = '-' + parenMatch[1];
  const num = parseFloat(cleaned);
  return isNaN(num) ? undefined : num;
}

/** Find first dollar amount ($X.XX or X,XXX.XX) after a label */
function findDollarAfterLabel(text: string, label: string): number | undefined {
  const idx = text.indexOf(label);
  if (idx === -1) return undefined;
  const after = text.slice(idx + label.length, idx + label.length + 200);
  const match = after.match(/\$?([\d,]+\.?\d*)/);
  return match ? parseDollar(match[1]) : undefined;
}

/**
 * Generic line-value extractor for flattened IRS form text.
 * Tries: Format A (inline repeated lineNum), Format B (lineNum\nvalue near label).
 */
function findLineValue(text: string, lineNum: string, label?: string): number | undefined {
  const escaped = lineNum.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const VALUE = '([\\d,]+(?:\\.\\d+)?|\\(\\s*[\\d,]+\\s*\\))';

  if (label) {
    const labelEscaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patternA = new RegExp(escaped + '\\s+' + labelEscaped + '.*?' + escaped + '\\s+' + VALUE, 's');
    const matchA = text.match(patternA);
    if (matchA) return parseDollar(matchA[1]);

    const labelIdx = text.indexOf(label);
    if (labelIdx !== -1) {
      const section = text.slice(Math.max(0, labelIdx - 50), Math.min(text.length, labelIdx + 2000));
      const patternB = new RegExp(escaped + '\\s*\\n\\s*' + VALUE);
      const matchB = section.match(patternB);
      if (matchB) return parseDollar(matchB[1]);
    }
  }

  const patternC = new RegExp(escaped + '\\b.*?' + escaped + '\\s+' + VALUE, 's');
  const matchC = text.match(patternC);
  if (matchC) return parseDollar(matchC[1]);

  const patternD = new RegExp('\\b' + escaped + '\\s*\\n\\s*' + VALUE);
  const matchD = text.match(patternD);
  return matchD ? parseDollar(matchD[1]) : undefined;
}

function findInSection(text: string, header: string, lineNum: string, label?: string, size = 3000): number | undefined {
  const idx = text.indexOf(header);
  if (idx === -1) return undefined;
  return findLineValue(text.slice(idx, idx + size), lineNum, label);
}

function clean(result: StructuredExtraction): StructuredExtraction {
  for (const key of Object.keys(result)) {
    if ((result as unknown as Record<string, unknown>)[key] === undefined) {
      delete (result as unknown as Record<string, unknown>)[key];
    }
  }
  return result;
}

// ── Form detectors ───────────────────────────────────────────────

function isPriorYearReturn(text: string): boolean {
  return /Form\s+1040/i.test(text) && /Individual Income Tax/i.test(text);
}

function isW2(text: string): boolean {
  return /Wage and Tax Statement/i.test(text) && /Employer identification number/i.test(text);
}

function is1099INT(text: string): boolean {
  return /Form\s*1099-INT/i.test(text) || (/1099-INT/i.test(text) && /Interest Income/i.test(text));
}

function is1098(text: string): boolean {
  return (/Form\s*1098\b/i.test(text) || /Mortgage\s+Interest\s+Statement/i.test(text))
    && /Mortgage interest received/i.test(text);
}

// ── Prior-Year 1040 ─────────────────────────────────────────────

function extractPriorYear(text: string): StructuredExtraction {
  const result: StructuredExtraction = { formType: 'prior-year-return' };

  // Try multiple patterns — PDF text layout varies (OMB numbers, line breaks between header and year)
  const yearMatch = text.match(/Form\s+1040.*?(?:Tax Return|Individual Income Tax)\D{0,80}(20\d{2})/is)
    ?? text.match(/(?:Tax Return|Individual Income Tax)\D{0,40}(20\d{2})/is)
    ?? text.match(/Form\s+1040\D{0,80}(20\d{2})/is);
  if (yearMatch) result.documentTaxYear = parseInt(yearMatch[1], 10);

  result.wages = findLineValue(text, '1a', 'Total amount from Form') ?? undefined;
  result.federalWithholding = findLineValue(text, '25a', 'Form') ?? undefined;
  result.priorYearAgi = findLineValue(text, '11', 'Adjusted gross income') ?? undefined;

  // Direct deposit info — multiple PDF formats:
  // CPA summary page: "Routing   Transit Number   322271627"
  // IRS 1040 line 35b: "b Routing number 322271627"
  const routingMatch = text.match(/Routing\s+(?:Transit\s+)?Number\s+(\d{9})\b/i)
    ?? text.match(/\b(?:35\s*)?b\s+(?:Routing\s+number\s+)?(\d{9})\b/i);
  if (routingMatch) result.routingNumber = routingMatch[1];
  // CPA: "Account   Number   167398020" / IRS: "d Account number 167398020"
  const acctMatch = text.match(/Account\s+Number\s+(\d{6,17})\b/i)
    ?? text.match(/\b(?:35\s*)?d\s+(?:Account\s+number\s+)?(\d{6,17})\b/i);
  if (acctMatch) result.accountNumber = acctMatch[1];
  // CPA: "Account   Type   checking" / IRS: "Checking" or "Savings"
  const typeMatch = text.match(/Account\s+Type\s+(checking|savings)\b/i)
    ?? text.match(/\b(Checking|Savings)\b/i);
  if (typeMatch) result.accountType = typeMatch[1].toLowerCase() as 'checking' | 'savings';

  // Self-select signature PINs (Sign Here section)
  // Only search after "perjury" to avoid matching ZIP codes near dates
  const signIdx = text.indexOf('perjury');
  if (signIdx >= 0) {
    const signArea = text.slice(signIdx);
    // CPA format: "94905   04-10-2025   SOFTWARE   ENGINEER\n15407   04-10-2025"
    const pinMatches = signArea.match(/\b(\d{5})\s+\d{2}-\d{2}-\d{4}\b/g);
    if (pinMatches && pinMatches.length >= 1) {
      result.efilePin = pinMatches[0].match(/(\d{5})/)?.[1];
      if (pinMatches.length >= 2) {
        result.spouseEfilePin = pinMatches[1].match(/(\d{5})/)?.[1];
      }
    }
  }

  // Schedule D
  const clcMatch = text.match(/14\s+Long-term capital loss carryover.*?\(\s*([\d,]+)\s*\)/s);
  if (clcMatch) result.capitalLossCarryforward = parseDollar(clcMatch[1]);

  // Schedule E
  const scheEIdx = text.indexOf('SCHEDULE E');
  if (scheEIdx !== -1) {
    const se = text.slice(scheEIdx, scheEIdx + 3000);
    result.rentalInsurance = findLineValue(se, '9', 'Insurance') ?? undefined;
    result.rentalMortgageInterest = findLineValue(se, '12', 'Mortgage interest') ?? undefined;
    result.rentalPropertyTax = findLineValue(se, '16', 'Taxes') ?? undefined;
    result.depreciation = findLineValue(se, '18', 'Depreciation') ?? undefined;

    // Extract rental address from line 1a property A
    // Server text: "A\n123 EXAMPLE ST, Anytown, CA 90000"
    // Browser text: "A 123   EXAMPLE   ST,   Anytown,   CA   90000"
    const addrMatch = se.match(/\bA\s+(\d+\s+[^,\n]+),\s*([^,\n]+),\s*([A-Z]{2})\s+(\d{5})/);
    if (addrMatch) {
      result.rentalAddress = addrMatch[1].replace(/\s+/g, ' ').trim();
      result.rentalCity = addrMatch[2].replace(/\s+/g, ' ').trim();
      result.rentalState = addrMatch[3];
      result.rentalZip = addrMatch[4];
    }
  }

  // Form 8582
  const unallowedMatch = text.match(/Prior year[s\u2019']*\s*unallowed losses.*?\(\s*(\d[\d,]*)\s*\)/s);
  if (unallowedMatch) result.priorYearUnallowedLoss = parseDollar(unallowedMatch[1]);

  // Form 4562 — header may have newline: "Form\n4562"
  result.amortization = findInSection(text, 'Form 4562', '43', 'Amortization of costs') ?? undefined;
  if (result.amortization == null) {
    // Flexible header search: "Form 4562" or "Form\n4562"
    const f4562Idx = Math.max(text.indexOf('Form 4562'), text.indexOf('Form\n4562'));
    if (f4562Idx !== -1) {
      const section = text.slice(f4562Idx, f4562Idx + 10000);
      // Line 43 value: "43 829" or "43\n829"
      const amortMatch = section.match(/\b43\s+([\d,]+)\s*\n/);
      if (amortMatch) result.amortization = parseDollar(amortMatch[1]);
    }
  }
  if (result.depreciation == null) {
    result.depreciation = findInSection(text, 'Form 4562', '17', 'MACRS deductions') ?? undefined;
  }

  // Form 8995
  const qbiHeaderIdx = text.indexOf('Qualified Business Income Deduction');
  if (qbiHeaderIdx !== -1) {
    const section = text.slice(qbiHeaderIdx, qbiHeaderIdx + 2000);
    const qbiMatch = section.match(/Schedule E[:\s].*?([\d,]+)\s*$/m);
    if (qbiMatch) result.qbiIncome = parseDollar(qbiMatch[1]);
  }
  if (result.qbiIncome == null) {
    result.qbiIncome = findLineValue(text, '13', 'Qualified business income deduction') ?? undefined;
  }

  // Form 2441 care provider (prior year) — extract from text near "Care provider"
  const f2441Idx = text.indexOf('Care provider');
  if (f2441Idx !== -1) {
    const section = text.slice(f2441Idx, f2441Idx + 2000);
    // Look for EIN pattern (XX-XXXXXXX) which identifies the provider
    const einMatch = section.match(/(\d{2}-\d{7})/);
    if (einMatch) {
      const ein = einMatch[1];
      // Provider name: text before the address, after the form labels
      // Look for all-caps words before a street address pattern
      const nameMatch = section.match(/([A-Z]{2,}(?:\s+[A-Z]{2,})*)\s+\d{5}/);
      // Address: number + street before city/state/zip
      const addrMatch = section.match(/(\d+\s+[A-Z]+\s+(?:AVE|ST|BLVD|DR|CT|LN|RD|WAY|PL))\b/);
      // City, State, ZIP near the EIN
      const cityMatch = section.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),?\s+([A-Z]{2})\s/);
      const zipMatch = section.match(/\b(\d{5})\b/);

      result.careProvider = {
        name: nameMatch ? nameMatch[1].replace(/\s+/g, ' ').trim() : undefined,
        address: addrMatch ? addrMatch[1].replace(/\s+/g, ' ').trim() : undefined,
        city: cityMatch ? cityMatch[1].replace(/\s+/g, ' ').trim() : undefined,
        state: cityMatch ? cityMatch[2] : undefined,
        zip: zipMatch ? zipMatch[1] : undefined,
        ein,
      };
    }
  }

  // Occupation
  const occMatch = text.match(/Your occupation[\s\S]*?\d{5}\s+\d{2}-\d{2}-\d{4}\s+([A-Z][A-Z\s]+)/);
  if (occMatch) {
    const occText = occMatch[1].replace(/\s+/g, ' ').trim();
    if (occText.length > 2) result.occupation = occText;
  }

  return clean(result);
}

// ── W-2 ─────────────────────────────────────────────────────────

function extractW2(text: string): StructuredExtraction {
  const result: StructuredExtraction = { formType: 'w2' };

  const yearMatch = text.match(/Wage and Tax Statement\s+(20\d{2})/i);
  if (yearMatch) result.documentTaxYear = parseInt(yearMatch[1], 10);

  // W-2 flattened layout: labels on one line, values 1-2 lines later, tab-separated pairs
  // "1 Wages, tips, other compensation 2 Federal income tax withheld\nEIN\nVALUE1\tVALUE2"

  // Box 1/2: Wages + Fed withholding — values separated by tab or spaces after EIN line
  const box12Match = text.match(/1\s+Wages,\s*tips.*?2\s+Federal income tax withheld[\s\S]*?([\d,.]+)[\t ]{2,}([\d,.]+)/);
  if (box12Match) {
    result.wages = parseDollar(box12Match[1]);
    result.federalWithholding = parseDollar(box12Match[2]);
  }

  // Box 3/4: SS wages + SS tax
  const box34Match = text.match(/3\s+Social security wages\s+4\s+Social security tax withheld[\s\S]*?([\d,.]+)[\t ]{2,}([\d,.]+)/);
  if (box34Match) {
    result.socialSecurityWages = parseDollar(box34Match[1]);
    result.socialSecurityTaxWithheld = parseDollar(box34Match[2]);
  }

  // Box 5/6: Medicare wages + Medicare tax
  // Flattened layout: "SAN FRANCISCO CA 94104\t223162.42\t3444.31"
  // The ZIP code is on the same line — match last two tab-separated decimals
  const box56Idx = text.indexOf('6 Medicare tax withheld');
  if (box56Idx !== -1) {
    const section = text.slice(box56Idx, box56Idx + 300);
    // Find values with decimal points (to distinguish from ZIP codes)
    const medMatch = section.match(/([\d,]+\.\d+)[\t ]{2,}([\d,]+\.\d+)/);
    if (medMatch) {
      result.medicareWages = parseDollar(medMatch[1]);
      result.medicareTaxWithheld = parseDollar(medMatch[2]);
    }
  }

  // Box 16/17: State wages + State tax
  // Find after "15 State" label: "CA 136-1643-8\t217176.44 14026.86"
  const stateIdx = text.indexOf('17 State income tax');
  if (stateIdx !== -1) {
    const section = text.slice(stateIdx, stateIdx + 300);
    const stateMatch = section.match(/CA\s+[\d-]+[\t ]{2,}([\d,.]+)\s+([\d,.]+)/);
    if (stateMatch) {
      result.stateWithholding = parseDollar(stateMatch[2]);
    }
  }

  // Box 10: Dependent care
  const depCareMatch = text.match(/10\s+Dependent care benefits\s*\n?\s*([\d,.]+)/s);
  if (depCareMatch) {
    const val = parseDollar(depCareMatch[1]);
    if (val && val > 0) result.dependentCareBenefits = val;
  }

  return clean(result);
}

// ── 1099-INT ────────────────────────────────────────────────────

function extract1099INT(text: string): StructuredExtraction {
  const result: StructuredExtraction = { formType: '1099-int' };

  const yearMatch = text.match(/(?:calendar year|For calendar year)\s*\n?\s*(20\d{2})/i)
    ?? text.match(/Tax Year\s+(20\d{2})/i);
  if (yearMatch) result.documentTaxYear = parseInt(yearMatch[1], 10);

  // Box 1: Interest income
  // Format 1: "1 Interest income\n...\n$ 175.50" (value on later line with $)
  // Format 2: "1. Interest income $16.06" (inline)
  // Format 3: "Box #1 ... $16.06" (table format)
  const intMatch = text.match(/1\s+Interest income[\s\S]*?\$\s*([\d,.]+)/i);
  if (intMatch) {
    const val = parseDollar(intMatch[1]);
    if (val && val > 0) result.taxableInterest = val;
  }

  if (result.taxableInterest == null) {
    const boxMatch = text.match(/Box\s*#?1\b[^$]*?\$\s*([\d,.]+)/i);
    if (boxMatch) {
      const val = parseDollar(boxMatch[1]);
      if (val && val > 0) result.taxableInterest = val;
    }
  }

  // Box 4: Federal tax withheld (limit search to ~200 chars to avoid grabbing unrelated numbers)
  const fedMatch = text.match(/4\s+Federal income tax withheld.{0,200}?\$\s*([\d,.]+)/i);
  if (fedMatch) {
    const val = parseDollar(fedMatch[1]);
    // Sanity check: withholding should be reasonable (not account/loan numbers)
    if (val && val > 0 && val < 1_000_000) result.federalWithholding = val;
  }

  return clean(result);
}

// ── 1098 ────────────────────────────────────────────────────────

function extract1098(text: string): StructuredExtraction {
  const result: StructuredExtraction = { formType: '1098' };

  const yearMatch = text.match(/(?:calendar year|For calendar year)\s*\n?\s*(20\s*\d{2})/i);
  if (yearMatch) result.documentTaxYear = parseInt(yearMatch[1].replace(/\s/g, ''), 10);

  // Box 1 + Box 2: Often tab-separated on same line "$14,996.38\t$552,134.57"
  const dualMatch = text.match(/\$\s*([\d,.]+)\t\$\s*([\d,.]+)/);
  if (dualMatch) {
    result.primaryMortgageInterest = parseDollar(dualMatch[1]);
    result.outstandingMortgagePrincipal = parseDollar(dualMatch[2]);
  }

  // Fallback Box 1: various patterns
  if (result.primaryMortgageInterest == null) {
    const mtgMatch = text.match(/Mortgage interest received.*?\$\s*([\d,.]+)/s)
      ?? text.match(/INTEREST PAID:\s*\$?([\d,.]+)/i);
    if (mtgMatch) result.primaryMortgageInterest = parseDollar(mtgMatch[1]);
  }

  // Fallback Box 2
  if (result.outstandingMortgagePrincipal == null) {
    const principalMatch = text.match(/Outstanding mortgage\s*(?:principal)?.*?\$\s*([\d,.]+)/is);
    if (principalMatch) result.outstandingMortgagePrincipal = parseDollar(principalMatch[1]);
  }

  // Property taxes paid from escrow (Mr. Cooper format)
  const propTaxMatch = text.match(/PROPERTY TAXES:\s*\$?([\d,.]+)/i);
  if (propTaxMatch) {
    const val = parseDollar(propTaxMatch[1]);
    if (val && val > 0) result.primaryPropertyTax = val;
  }

  // Hazard insurance from escrow disbursements (Mr. Cooper format)
  const insuranceMatch = text.match(/HAZARD INSURANCE:\s*\$?([\d,.]+)/i);
  if (insuranceMatch) {
    const val = parseDollar(insuranceMatch[1]);
    if (val && val > 0) result.rentalInsurance = val;
  }

  return clean(result);
}

// ── Main entry point ────────────────────────────────────────────

/**
 * Try to extract structured fields from any IRS form text.
 * Returns null if the text doesn't match any known IRS form pattern.
 */
export function extractStructuredFields(text: string): StructuredExtraction | null {
  // Try each form type in order of specificity
  if (isPriorYearReturn(text)) return extractPriorYear(text);
  if (isW2(text)) return extractW2(text);
  if (is1099INT(text)) return extract1099INT(text);
  if (is1098(text)) return extract1098(text);
  return null;
}

/** Check if text matches any supported IRS form */
export { isPriorYearReturn };
