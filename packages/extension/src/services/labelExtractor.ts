/**
 * Label-Anchored Extractor — spatial extraction from positioned PDF text items.
 *
 * Instead of regex on linearized text (fragile), this finds all dollar amounts
 * in a PDF page, then matches each to its nearest IRS label by position.
 * Works for any W-2/1098/1099 layout regardless of text flow order.
 *
 * Algorithm:
 * 1. Find all decimal dollar amounts (e.g., "217176.44")
 * 2. Find all text labels (non-numeric, length > 3)
 * 3. For each amount, find the nearest label that is above or at the same height
 * 4. Map matched IRS labels to StructuredExtraction field names
 */

import type { StructuredExtraction } from '@selftax/core';

/** A text item with its position on the PDF page */
export interface PositionedTextItem {
  text: string;
  x: number;
  y: number;
  page?: number;
}

/** Map of IRS label substrings → StructuredExtraction field names */
const LABEL_TO_FIELD: Array<{ match: RegExp; field: keyof StructuredExtraction }> = [
  // W-2
  { match: /wages,?\s*tips/i, field: 'wages' },
  { match: /federal income tax withheld/i, field: 'federalWithholding' },
  { match: /social security wages/i, field: 'socialSecurityWages' },
  { match: /social security tax withheld/i, field: 'socialSecurityTaxWithheld' },
  { match: /medicare wages/i, field: 'medicareWages' },
  { match: /medicare tax withheld/i, field: 'medicareTaxWithheld' },
  { match: /state income tax/i, field: 'stateWithholding' },
  { match: /dependent care benefits/i, field: 'dependentCareBenefits' },
  // 1099-INT
  { match: /interest income/i, field: 'taxableInterest' },
  // 1098
  { match: /mortgage interest received/i, field: 'primaryMortgageInterest' },
  { match: /outstanding mortgage principal/i, field: 'outstandingMortgagePrincipal' },
  { match: /\bprincipal\b/i, field: 'outstandingMortgagePrincipal' },
  { match: /property tax|real estate tax/i, field: 'primaryPropertyTax' },
  { match: /mortgage insurance premium/i, field: 'mortgageInsurancePremiums' },
  // 1098 escrow disbursements (inline "LABEL: $VALUE" format)
  { match: /hazard insurance/i, field: 'rentalInsurance' },
  // 1099-INT box 4
  { match: /federal income tax withheld/i, field: 'federalWithholding' },
];

function parseDollar(s: string): number | undefined {
  const cleaned = s.replace(/[$,\s]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? undefined : num;
}

/**
 * Extract structured fields from positioned PDF text items using label proximity.
 *
 * Processes items per-page to avoid cross-page label interference
 * (e.g., W-2 PDFs have multiple copies on different pages).
 *
 * @param items - All text items from pdfjs getTextContent with positions
 * @param formType - Detected form type (for filtering relevant labels)
 * @param pageItems - Optional pre-grouped items by page. If not provided, all items treated as one page.
 * @returns StructuredExtraction with matched fields, or null if no matches
 */
export function extractByLabelProximity(
  items: PositionedTextItem[],
  formType: string,
): StructuredExtraction | null {
  // Group items by page (using y-coordinate gaps to detect page boundaries)
  // If items come from multiple pages, items from the same page share similar y ranges
  // But since we get flat items, use the page field if available, otherwise treat as one page
  const pages: PositionedTextItem[][] = [];
  if (items.length > 0 && 'page' in items[0]) {
    // Items have page numbers — group by page
    const byPage = new Map<number, PositionedTextItem[]>();
    for (const item of items) {
      const pg = (item as PositionedTextItem & { page: number }).page;
      if (!byPage.has(pg)) byPage.set(pg, []);
      byPage.get(pg)!.push(item);
    }
    pages.push(...byPage.values());
  } else {
    pages.push(items);
  }

  const result: StructuredExtraction = { formType };
  const usedFields = new Set<string>();

  // Pass 1: Proximity-based (separate label and value items)
  for (const pageItems of pages) {
    const matches = matchAmountsToLabels(pageItems);
    for (const { value, label } of matches) {
      for (const mapping of LABEL_TO_FIELD) {
        if (mapping.match.test(label) && !usedFields.has(mapping.field)) {
          if (value > 10_000_000) continue;
          (result as unknown as Record<string, unknown>)[mapping.field] = value;
          usedFields.add(mapping.field);
          break;
        }
      }
    }
    if (usedFields.size >= 5) break;
  }

  // Pass 2: Inline "LABEL: $VALUE" patterns (single text items containing both)
  // e.g., "PROPERTY TAXES: $17,007.07" or "HAZARD INSURANCE: $6,332.00"
  for (const item of items) {
    const inlineMatch = item.text.match(/^(.+?):\s*\$?([\d,]+\.\d{2})$/);
    if (!inlineMatch) continue;
    const label = inlineMatch[1];
    const val = parseDollar(inlineMatch[2]);
    if (val === undefined || val <= 0 || val > 10_000_000) continue;
    for (const mapping of LABEL_TO_FIELD) {
      if (mapping.match.test(label) && !usedFields.has(mapping.field)) {
        (result as unknown as Record<string, unknown>)[mapping.field] = val;
        usedFields.add(mapping.field);
        break;
      }
    }
  }

  // Pass 3: W-2 employer text fields (not dollar amounts)
  // Find text values near known labels like "Employer identification number", "Employer's name"
  if (formType === 'w2' || result.formType === 'w2') {
    const page1 = pages[0] ?? items;
    const textLabels = page1.filter((i) => !/^[\d,.$]+$/.test(i.text) && i.text.length > 3);

    // EIN: find text matching XX-XXXXXXX pattern near "Employer identification"
    const einLabel = textLabels.find((i) => /employer\s*identification/i.test(i.text));
    if (einLabel) {
      const einCandidates = page1.filter((i) => /^\d{2}-\d{7}$/.test(i.text));
      const nearest = einCandidates.sort((a, b) => {
        const da = Math.sqrt((a.x - einLabel.x) ** 2 + (a.y - einLabel.y) ** 2);
        const db = Math.sqrt((b.x - einLabel.x) ** 2 + (b.y - einLabel.y) ** 2);
        return da - db;
      })[0];
      if (nearest) result.employerEin = nearest.text;
    }

    // Employer name: text item below "Employer's name, address"
    const nameLabel = textLabels.find((i) => /employer.s\s*name/i.test(i.text));
    if (nameLabel) {
      // Find text items below the label (lower y in PDF coords) within x range
      const below = page1
        .filter((i) => i.y < nameLabel.y && i.y > nameLabel.y - 60 && Math.abs(i.x - nameLabel.x) < 50)
        .filter((i) => i.text.length > 2 && !/employer|state|zip|code/i.test(i.text))
        .sort((a, b) => b.y - a.y); // highest y first (closest below label)

      const addressLines: string[] = [];
      for (const item of below) {
        const csz = item.text.match(/^(.+?)\s+([A-Z]{2})\s+(\d{5})/);
        if (csz) {
          result.employerCity = csz[1];
          result.employerState = csz[2];
          result.employerZip = csz[3];
        } else if (!result.employerName) {
          result.employerName = item.text;
        } else {
          addressLines.push(item.text);
        }
      }
      if (addressLines.length > 0) result.employerAddress = addressLines.join(', ');
    }

    // State employer ID: find XX-XXXX-X or XXX-XXXX-X pattern near "state ID number"
    const stateIdLabel = textLabels.find((i) => /state.*id.*number/i.test(i.text));
    if (stateIdLabel) {
      const stateIdCandidates = page1.filter((i) =>
        /^\d{2,3}-\d{3,7}-?\d?$/.test(i.text) && i.text !== result.employerEin,
      );
      const nearest = stateIdCandidates.sort((a, b) => {
        const da = Math.sqrt((a.x - stateIdLabel.x) ** 2 + (a.y - stateIdLabel.y) ** 2);
        const db = Math.sqrt((b.x - stateIdLabel.x) ** 2 + (b.y - stateIdLabel.y) ** 2);
        return da - db;
      })[0];
      if (nearest) result.stateEmployerId = nearest.text;
    }

    // Box 12: code + amount pairs
    // Layout: "12a" label at (445, 623), code at (450, 611), amount at (478, 611)
    // The code is ~5px to the right of the label x, ~12px below label y
    // Amount is ~30px further right from the code
    const box12Labels = page1.filter((i) => /^12[a-d]$/.test(i.text));
    if (box12Labels.length > 0) {
      // Find all amounts in the box 12 region (x > 470, decimal numbers)
      const box12Amounts = page1
        .filter((i) => /^\d[\d,]*\.\d{2}$/.test(i.text) && i.x > 470 && i.x < 530)
        .sort((a, b) => b.y - a.y); // top to bottom

      // Find all code letters in the box 12 region (x ~450, single/double letters)
      // These are the ACTUAL codes, not the "C o d e" label text
      const box12Codes = page1
        .filter((i) => /^[A-Z]{1,3}$/.test(i.text) && i.x >= 448 && i.x <= 455)
        .sort((a, b) => b.y - a.y);

      const box12: Array<{ code: string; amount: number }> = [];
      // Match codes to amounts by y proximity
      for (const code of box12Codes) {
        const nearestAmount = box12Amounts.find((a) => Math.abs(a.y - code.y) < 8);
        if (nearestAmount) {
          const val = parseFloat(nearestAmount.text.replace(/,/g, ''));
          if (val > 0) box12.push({ code: code.text, amount: val });
        }
      }
      if (box12.length > 0) result.box12 = box12;
    }
  }

  const fieldCount = Object.keys(result).filter((k) => k !== 'formType').length;
  return fieldCount > 0 ? result : null;
}

/** Match dollar amounts to nearest labels on a single page */
function matchAmountsToLabels(
  items: PositionedTextItem[],
): Array<{ value: number; label: string }> {
  const amounts = items.filter((i) => {
    if (!/^\d[\d,]*\.\d{2}$/.test(i.text)) return false;
    const val = parseFloat(i.text.replace(/,/g, ''));
    return val > 0;
  });

  const labels = items.filter(
    (i) => !/^[\d,.$]+$/.test(i.text) && i.text.length > 3,
  );

  const matches: Array<{ value: number; label: string }> = [];

  for (const amount of amounts) {
    let bestLabel: PositionedTextItem | null = null;
    let bestScore = Infinity;

    for (const label of labels) {
      const dx = amount.x - label.x;
      const dy = amount.y - label.y;
      const rawDist = Math.sqrt(dx * dx + dy * dy);
      const isBelowValue = label.y < amount.y - 5;
      const penalty = isBelowValue ? 50 : 0;
      const score = rawDist + penalty;
      if (score < bestScore) { bestScore = score; bestLabel = label; }
    }

    if (bestLabel) {
      const val = parseDollar(amount.text);
      if (val !== undefined) {
        matches.push({ value: val, label: bestLabel.text });
      }
    }
  }

  return matches;
}

/**
 * Extract year from positioned text items.
 */
export function extractYearFromItems(items: PositionedTextItem[]): number | undefined {
  for (const item of items) {
    const match = item.text.match(/(?:calendar year|tax year|Wage and Tax Statement)\s*(20\d{2})/i);
    if (match) return parseInt(match[1], 10);
  }
  // Fallback: standalone year near top of page
  const topItems = items.filter((i) => i.y > 700); // top region
  for (const item of topItems) {
    if (/^20\d{2}$/.test(item.text.trim())) return parseInt(item.text.trim(), 10);
  }
  return undefined;
}
