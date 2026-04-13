import { irsRound } from '../engine/form1040';

// ---------- Type Definitions ----------

export interface Form1099BFields {
  /** Box 1a: Proceeds */
  proceeds?: number;
  /** Box 1e: Cost or other basis */
  costBasis?: number;
  /** Box 2: Short-term indicator */
  isShortTerm?: boolean;
  /** Box 2: Long-term indicator */
  isLongTerm?: boolean;
  /** Box 4: Federal income tax withheld */
  federalTaxWithheld?: number;
}

export interface Form1099DIVFields {
  /** Box 1a: Ordinary dividends */
  ordinaryDividends?: number;
  /** Box 1b: Qualified dividends */
  qualifiedDividends?: number;
  /** Box 2a: Total capital gain distributions */
  capitalGainsDistributions?: number;
  /** Box 4: Federal income tax withheld */
  federalTaxWithheld?: number;
}

export interface Form1099INTFields {
  /** Box 1: Interest income */
  interestIncome?: number;
  /** Box 2: Early withdrawal penalty */
  earlyWithdrawalPenalty?: number;
  /** Box 4: Federal income tax withheld */
  federalTaxWithheld?: number;
}

export interface Form1099NECFields {
  /** Box 1: Nonemployee compensation */
  nonemployeeCompensation?: number;
  /** Box 4: Federal income tax withheld */
  federalTaxWithheld?: number;
}

export interface Form1098Fields {
  /** Box 1: Mortgage interest received */
  mortgageInterest?: number;
  /** Box 2: Points paid on purchase of principal residence */
  pointsPaid?: number;
  /** Box 5: Mortgage insurance premiums */
  mortgageInsurancePremiums?: number;
  /** Box 10: Property tax */
  propertyTax?: number;
}

// ---------- Shared Helpers ----------

/** Parse a dollar amount — preserve cents */
function parseDollarAmount(text: string): number | undefined {
  const cleaned = text.replace(/[$,\s]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? undefined : num;
}

/** Extract a dollar value following a box label pattern (single-line) */
function extractBoxValue(text: string, pattern: RegExp): number | undefined {
  const match = text.match(pattern);
  if (!match) return undefined;
  return parseDollarAmount(match[1]);
}

/** Dollar amount pattern: digits with optional commas and decimal */
const AMOUNT_RE = /\d[\d,]*\.\d{2}/g;

/**
 * Find all dollar amounts on a given line.
 * Returns parsed amounts in order of appearance.
 */
function findAmountsOnLine(line: string): number[] {
  const matches = line.match(AMOUNT_RE);
  if (!matches) return [];
  return matches
    .map((m) => parseDollarAmount(m))
    .filter((v): v is number => v !== undefined);
}

/**
 * Multi-line search: find dollar amount near a label pattern.
 * Searches the label line itself, then lines after, then lines before.
 * Only uses multi-line search when the label line has no amount on it
 * (indicating a PDF spatial layout where labels and values are on
 * separate lines).
 */
export function findAmountNearLabel(
  text: string,
  labelPattern: RegExp,
  searchRadius = 5,
): number | undefined {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!labelPattern.test(lines[i])) continue;

    // Check if the label line itself has an amount
    const sameLineAmounts = findAmountsOnLine(lines[i]);
    if (sameLineAmounts.length > 0) {
      // Amount is on same line as label — return it directly.
      // This is the "label: $amount" format.
      return sameLineAmounts[0];
    }

    // No amount on label line → multi-line PDF layout.
    // Search lines after the label.
    for (let offset = 1; offset <= searchRadius; offset++) {
      const idx = i + offset;
      if (idx >= lines.length) break;
      const amounts = findAmountsOnLine(lines[idx]);
      if (amounts.length > 0) return amounts[0];
    }

    // Search lines before the label (PDF sometimes places amount first)
    for (let offset = 1; offset <= searchRadius; offset++) {
      const idx = i - offset;
      if (idx < 0) break;
      const amounts = findAmountsOnLine(lines[idx]);
      if (amounts.length > 0) return amounts[amounts.length - 1];
    }
  }
  return undefined;
}

// ---------- 1099-B ----------

/**
 * Maps OCR-extracted text from a 1099-B to structured fields.
 * Handles both single-line labeled formats and multi-line PDF layouts.
 */
export function map1099BFields(ocrText: string): Form1099BFields {
  const fields: Form1099BFields = {};

  // --- Single-line regex first ---
  fields.proceeds = extractBoxValue(
    ocrText,
    /(?:box\s*)?1a\s*(?:proceeds|gross\s*proceeds)[:\s]*\$?([\d,]+\.?\d*)/i,
  );
  if (fields.proceeds === undefined) {
    fields.proceeds = extractBoxValue(
      ocrText,
      /proceeds[:\s]*\$?([\d,]+\.?\d*)/i,
    );
  }

  // Multi-line fallback for proceeds
  if (fields.proceeds === undefined) {
    fields.proceeds = findAmountNearLabel(
      ocrText,
      /(?:(?:box\s*)?1a\s*(?:proceeds|gross\s*proceeds)|total\s*proceeds|gross\s*proceeds)/i,
    );
  }

  // --- Single-line regex for cost basis ---
  fields.costBasis = extractBoxValue(
    ocrText,
    /(?:box\s*)?1e\s*(?:cost\s*(?:or\s*other\s*)?basis)[:\s]*\$?([\d,]+\.?\d*)/i,
  );
  if (fields.costBasis === undefined) {
    fields.costBasis = extractBoxValue(
      ocrText,
      /cost\s*basis[:\s]*\$?([\d,]+\.?\d*)/i,
    );
  }

  // Multi-line fallback for cost basis
  if (fields.costBasis === undefined) {
    fields.costBasis = findAmountNearLabel(
      ocrText,
      /(?:(?:box\s*)?1e\s*(?:cost\s*(?:or\s*other\s*)?basis)|total\s*cost\s*basis|cost\s*basis)/i,
    );
  }

  // Box 2: Short-term or long-term
  const hasShortTerm = /short[- ]?term/i.test(ocrText);
  const hasLongTerm = /long[- ]?term/i.test(ocrText);
  if (hasShortTerm || hasLongTerm) {
    fields.isShortTerm = hasShortTerm && !hasLongTerm;
    fields.isLongTerm = hasLongTerm && !hasShortTerm;
    // If both appear, check context near "Box 2" for the primary classification
    if (hasShortTerm && hasLongTerm) {
      const box2Area = ocrText.match(/box\s*2[^]*?(short|long)[- ]?term/i);
      if (box2Area) {
        const term = box2Area[1].toLowerCase();
        fields.isShortTerm = term === 'short';
        fields.isLongTerm = term === 'long';
      }
    }
  }

  // Box 4: Federal tax withheld — single-line then multi-line
  fields.federalTaxWithheld = extractBoxValue(
    ocrText,
    /(?:box\s*4\b[^:\n]*|federal\s*(?:income\s*)?tax\s*withheld)[:\s]*\$?([\d,]+\.?\d*)/i,
  );
  if (fields.federalTaxWithheld === undefined) {
    fields.federalTaxWithheld = findAmountNearLabel(
      ocrText,
      /(?:box\s*4\b[^:\n]*|federal\s*(?:income\s*)?tax\s*withheld)/i,
    );
  }

  return fields;
}

// ---------- 1099-DIV ----------

/**
 * Maps OCR-extracted text from a 1099-DIV to structured fields.
 * Handles both single-line labeled formats and multi-line PDF layouts.
 */
export function map1099DIVFields(ocrText: string): Form1099DIVFields {
  const fields: Form1099DIVFields = {};

  // Box 1a: Ordinary dividends — single-line then multi-line
  fields.ordinaryDividends = extractBoxValue(
    ocrText,
    /(?:box\s*)?1a\s*(?:ordinary\s*dividends|total\s*ordinary\s*dividends)[:\s]*\$?([\d,]+\.?\d*)/i,
  );
  if (fields.ordinaryDividends === undefined) {
    fields.ordinaryDividends = extractBoxValue(
      ocrText,
      /ordinary\s*dividends[:\s]*\$?([\d,]+\.?\d*)/i,
    );
  }
  if (fields.ordinaryDividends === undefined) {
    fields.ordinaryDividends = findAmountNearLabel(
      ocrText,
      /(?:(?:box\s*)?1a\s*(?:ordinary\s*dividends|total\s*ordinary)|ordinary\s*dividends)/i,
    );
  }

  // Box 1b: Qualified dividends — single-line then multi-line
  fields.qualifiedDividends = extractBoxValue(
    ocrText,
    /(?:box\s*)?1b\s*(?:qualified\s*dividends)[:\s]*\$?([\d,]+\.?\d*)/i,
  );
  if (fields.qualifiedDividends === undefined) {
    fields.qualifiedDividends = extractBoxValue(
      ocrText,
      /qualified\s*dividends[:\s]*\$?([\d,]+\.?\d*)/i,
    );
  }
  if (fields.qualifiedDividends === undefined) {
    fields.qualifiedDividends = findAmountNearLabel(
      ocrText,
      /(?:(?:box\s*)?1b\s*qualified|qualified\s*dividends)/i,
    );
  }

  // Box 2a: Capital gain distributions — single-line then multi-line
  fields.capitalGainsDistributions = extractBoxValue(
    ocrText,
    /(?:box\s*)?2a\s*(?:(?:total\s*)?capital\s*gain\s*dist(?:ribution)?s?)[:\s]*\$?([\d,]+\.?\d*)/i,
  );
  if (fields.capitalGainsDistributions === undefined) {
    fields.capitalGainsDistributions = extractBoxValue(
      ocrText,
      /capital\s*gain\s*dist(?:ribution)?s?[:\s]*\$?([\d,]+\.?\d*)/i,
    );
  }
  if (fields.capitalGainsDistributions === undefined) {
    fields.capitalGainsDistributions = findAmountNearLabel(
      ocrText,
      /(?:(?:box\s*)?2a\s*(?:(?:total\s*)?capital\s*gain)|capital\s*gain\s*dist)/i,
    );
  }

  // Box 4: Federal tax withheld — single-line then multi-line
  fields.federalTaxWithheld = extractBoxValue(
    ocrText,
    /(?:box\s*4\b[^:\n]*|federal\s*(?:income\s*)?tax\s*withheld)[:\s]*\$?([\d,]+\.?\d*)/i,
  );
  if (fields.federalTaxWithheld === undefined) {
    fields.federalTaxWithheld = findAmountNearLabel(
      ocrText,
      /(?:box\s*4\b[^:\n]*|federal\s*(?:income\s*)?tax\s*withheld)/i,
    );
  }

  return fields;
}

// ---------- 1099-INT ----------

/**
 * Maps OCR-extracted text from a 1099-INT to structured fields.
 * Handles both single-line labeled formats and multi-line PDF layouts.
 */
export function map1099INTFields(ocrText: string): Form1099INTFields {
  const fields: Form1099INTFields = {};

  // Box 1: Interest income
  // Format 1: "$16.06 1. Interest income" (amount before label)
  // Format 2: "1 Interest income $16.06" or "Box 1: $16.06"
  // Format 3: "175.50\n$" (amount on line before "$" on next line)
  const intPatterns = [
    /\$\s*([\d,]+\.\d{2})\s+1[\.\s]+Interest\s*income/i,    // amount before "1. Interest income"
    /(?:box\s*1\b[^:\n]*|interest\s*income)[:\s]*\$?([\d,]+\.?\d*)/i, // amount after label
    /1\s+Interest\s*income\s*\n\s*([\d,]+\.\d{2})/i,         // amount on next line
  ];
  for (const p of intPatterns) {
    if (fields.interestIncome !== undefined) break;
    const m = ocrText.match(p);
    if (m) {
      const val = parseDollarAmount(m[1]);
      if (val !== undefined && val > 0) fields.interestIncome = val;
    }
  }
  if (fields.interestIncome === undefined) {
    fields.interestIncome = findAmountNearLabel(
      ocrText,
      /(?:box\s*1\b[^:\n]*interest|interest\s*income)/i,
    );
  }

  // Box 2: Early withdrawal penalty — single-line then multi-line
  fields.earlyWithdrawalPenalty = extractBoxValue(
    ocrText,
    /(?:box\s*2\b[^:\n]*|early\s*withdrawal\s*penalty)[:\s]*\$?([\d,]+\.?\d*)/i,
  );
  if (fields.earlyWithdrawalPenalty === undefined) {
    fields.earlyWithdrawalPenalty = findAmountNearLabel(
      ocrText,
      /(?:box\s*2\b[^:\n]*early|early\s*withdrawal\s*penalty)/i,
    );
  }

  // Box 4: Federal tax withheld — single-line then multi-line
  fields.federalTaxWithheld = extractBoxValue(
    ocrText,
    /(?:box\s*4\b[^:\n]*|federal\s*(?:income\s*)?tax\s*withheld)[:\s]*\$?([\d,]+\.?\d*)/i,
  );
  if (fields.federalTaxWithheld === undefined) {
    fields.federalTaxWithheld = findAmountNearLabel(
      ocrText,
      /(?:box\s*4\b[^:\n]*|federal\s*(?:income\s*)?tax\s*withheld)/i,
    );
  }

  return fields;
}

// ---------- 1099-NEC ----------

/**
 * Maps OCR-extracted text from a 1099-NEC to structured fields.
 * Handles both single-line labeled formats and multi-line PDF layouts.
 */
export function map1099NECFields(ocrText: string): Form1099NECFields {
  const fields: Form1099NECFields = {};

  // Box 1: Nonemployee compensation — single-line then multi-line
  fields.nonemployeeCompensation = extractBoxValue(
    ocrText,
    /(?:box\s*1\b[^:\n]*|nonemployee\s*compensation)[:\s]*\$?([\d,]+\.?\d*)/i,
  );
  if (fields.nonemployeeCompensation === undefined) {
    fields.nonemployeeCompensation = findAmountNearLabel(
      ocrText,
      /(?:box\s*1\b[^:\n]*nonemployee|nonemployee\s*compensation)/i,
    );
  }

  // Box 4: Federal tax withheld — single-line then multi-line
  fields.federalTaxWithheld = extractBoxValue(
    ocrText,
    /(?:box\s*4\b[^:\n]*|federal\s*(?:income\s*)?tax\s*withheld)[:\s]*\$?([\d,]+\.?\d*)/i,
  );
  if (fields.federalTaxWithheld === undefined) {
    fields.federalTaxWithheld = findAmountNearLabel(
      ocrText,
      /(?:box\s*4\b[^:\n]*|federal\s*(?:income\s*)?tax\s*withheld)/i,
    );
  }

  return fields;
}

// ---------- 1098 ----------

/**
 * Maps OCR-extracted text from a 1098 to structured fields.
 * Handles both single-line labeled formats and multi-line PDF layouts
 * where amounts may appear before or after labels.
 */
export function map1098Fields(ocrText: string): Form1098Fields {
  const fields: Form1098Fields = {};

  // Box 1: Mortgage interest received — single-line first
  fields.mortgageInterest = extractBoxValue(
    ocrText,
    /(?:box\s*1\b[^:\n]*|mortgage\s*interest\s*(?:received|paid)?)[:\s]*\$?([\d,]+\.?\d*)/i,
  );
  // Multi-line fallback: search near "mortgage interest" label
  if (fields.mortgageInterest === undefined) {
    fields.mortgageInterest = findAmountNearLabel(
      ocrText,
      /mortgage\s*interest\s*(?:received|paid)?/i,
      10,
    );
  }
  // Fallback: amount prefixed with 'x' near "1098" (real PDF layout)
  if (fields.mortgageInterest === undefined) {
    const xAmountMatch = ocrText.match(/x(\d[\d,]*\.\d{2})/i);
    if (xAmountMatch) {
      fields.mortgageInterest = parseDollarAmount(xAmountMatch[1]);
    }
  }

  // Box 2: Points paid — single-line then multi-line
  fields.pointsPaid = extractBoxValue(
    ocrText,
    /(?:box\s*2\b[^:\n]*|points\s*paid)[:\s]*\$?([\d,]+\.?\d*)/i,
  );
  if (fields.pointsPaid === undefined) {
    fields.pointsPaid = findAmountNearLabel(
      ocrText,
      /(?:box\s*2\b[^:\n]*|points\s*paid)/i,
    );
  }

  // Box 5: Mortgage insurance premiums — single-line then multi-line
  fields.mortgageInsurancePremiums = extractBoxValue(
    ocrText,
    /(?:box\s*5\b[^:\n]*|mortgage\s*insurance\s*premiums?)[:\s]*\$?([\d,]+\.?\d*)/i,
  );
  if (fields.mortgageInsurancePremiums === undefined) {
    fields.mortgageInsurancePremiums = findAmountNearLabel(
      ocrText,
      /(?:box\s*5\b[^:\n]*|mortgage\s*insurance\s*premiums?)/i,
    );
  }

  // Box 10: Property tax — single-line then multi-line
  fields.propertyTax = extractBoxValue(
    ocrText,
    /(?:box\s*10\b[^:\n]*|property\s*tax(?:es)?)[:\s]*\$?([\d,]+\.?\d*)/i,
  );
  if (fields.propertyTax === undefined) {
    fields.propertyTax = findAmountNearLabel(
      ocrText,
      /(?:box\s*10\b[^:\n]*|property\s*tax(?:es)?)/i,
    );
  }

  return fields;
}
