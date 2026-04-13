import { irsRound } from '../engine/form1040';

export interface W2Fields {
  /** Box a: Employee SSN */
  employee_ssn?: string;
  /** Box b: Employer EIN */
  employer_ein?: string;
  /** Box c: Employer name/address */
  employer_name?: string;
  /** Box e: Employee name */
  employee_name?: string;
  /** Box 1: Wages, tips, other compensation */
  box1_wages?: number;
  /** Box 2: Federal income tax withheld */
  box2_federal_tax?: number;
  /** Box 3: Social Security wages */
  box3_ss_wages?: number;
  /** Box 4: Social Security tax withheld */
  box4_ss_tax?: number;
  /** Box 5: Medicare wages */
  box5_medicare_wages?: number;
  /** Box 6: Medicare tax withheld */
  box6_medicare_tax?: number;
  /** Box 7: Social Security tips */
  box7_ss_tips?: number;
  /** Box 8: Allocated tips */
  box8_allocated_tips?: number;
  /** Box 10: Dependent care benefits */
  box10_dependent_care?: number;
  /** Box 11: Nonqualified plans */
  box11_nonqualified?: number;
  /** Box 12a-d: Coded items */
  box12: Array<{ code: string; amount: number }>;
  /** Box 13: Checkboxes */
  box13_statutory?: boolean;
  box13_retirement?: boolean;
  box13_sick_pay?: boolean;
  /** Box 14: Other items */
  box14_other: Array<{ label: string; amount: number }>;
  /** Box 15: State/employer state ID */
  state?: string;
  /** Box 16: State wages */
  state_wages?: number;
  /** Box 17: State income tax */
  state_tax?: number;
}

/** Parse a dollar amount — preserve cents (don't round) */
function parseDollarAmount(text: string): number | undefined {
  const cleaned = text.replace(/[$,\s]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? undefined : num;
}

/** Parse a dollar amount rounded to whole dollars (for aggregation) */
function parseDollarAmountRounded(text: string): number | undefined {
  const val = parseDollarAmount(text);
  return val !== undefined ? irsRound(val) : undefined;
}

/** Extract a dollar value following a box label pattern (single-line) */
function extractBoxValue(text: string, pattern: RegExp): number | undefined {
  const match = text.match(pattern);
  if (!match) return undefined;
  return parseDollarAmount(match[1]);
}

/** Dollar amount pattern: digits with optional commas and decimal */
const AMOUNT_PATTERN = /\d[\d,]*\.\d{2}/g;

/**
 * Find all dollar amounts on a given line.
 * Returns parsed amounts in order of appearance.
 */
function findAmountsOnLine(line: string): number[] {
  // Use String.match with global regex — always resets lastIndex
  const matches = line.match(AMOUNT_PATTERN);
  if (!matches) return [];
  return matches
    .map((m) => parseDollarAmount(m))
    .filter((v): v is number => v !== undefined);
}

/** Check if a line contains a dollar amount */
function lineHasAmount(line: string): boolean {
  // Create fresh regex to avoid global lastIndex state issues
  return /\d[\d,]*\.\d{2}/.test(line);
}

/**
 * Search nearby lines (after a label line) for dollar amounts.
 * For paired W-2 boxes (left/right), extracts first or second amount.
 * Skips lines that look like other box labels (contain box-number patterns).
 * @param lines - all lines of text
 * @param labelLineIndex - index of the line containing the label
 * @param position - 'left' for first amount, 'right' for second, 'single' for only
 * @param searchRadius - how many lines below to search (default 3)
 */
function findNearbyAmount(
  lines: string[],
  labelLineIndex: number,
  position: 'left' | 'right' | 'single' = 'single',
  searchRadius = 3,
): number | undefined {
  for (let offset = 1; offset <= searchRadius; offset++) {
    const idx = labelLineIndex + offset;
    if (idx >= lines.length) break;
    const amounts = findAmountsOnLine(lines[idx]);
    if (amounts.length === 0) continue;
    if (position === 'left' || position === 'single') return amounts[0];
    if (position === 'right' && amounts.length >= 2) return amounts[1];
    // If only one amount on line and we want 'right', keep searching
    if (position === 'right' && amounts.length === 1) continue;
  }
  return undefined;
}

/**
 * Multi-line search: find dollar amount near a label pattern.
 * Looks both before and after the label within searchRadius lines.
 */
export function findAmountNearLabel(
  text: string,
  labelPattern: RegExp,
  searchRadius = 5,
): number | undefined {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!labelPattern.test(lines[i])) continue;

    // First check if amount is on the same line (after the label)
    const sameLine = lines[i].match(
      new RegExp(labelPattern.source + '[:\\s]*\\$?([\\d,]+\\.?\\d*)', 'i'),
    );
    if (sameLine) {
      const val = parseDollarAmount(sameLine[sameLine.length - 1]);
      if (val !== undefined) return val;
    }

    // Search lines after the label
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

/**
 * Maps OCR-extracted text from a W-2 to structured fields.
 * Handles both labeled single-line formats and multi-line PDF layouts
 * where labels and values appear on separate lines.
 *
 * Strategy:
 * 1. Try multi-line paired-box parsing FIRST (handles real PDF extraction
 *    where "1 Wages..." and "2 Federal..." are on a label row with
 *    values on a subsequent row — the most common real-world layout)
 * 2. Then try single-line regex as fallback (handles "Box 1 Wages: $125,432")
 */
export function mapW2Fields(ocrText: string): W2Fields {
  const fields: W2Fields = {
    box12: [],
    box14_other: [],
  };

  // --- Phase 0: Structured field lookup for paired W-2 boxes ---
  // W-2 layout: labels on one line, values on the next line, left/right paired:
  //   "1 Wages, tips, other compensation  2 Federal income tax withheld"
  //   "217176.44  30970.89"
  // Also handles: "15 State  16 State wages, tips, etc.  17 State income tax"
  //               "CA  136-1643-8  217176.44  14026.86"

  const pairedLookups: Array<{
    leftLabel: RegExp;
    rightLabel: RegExp;
    leftField: keyof W2Fields;
    rightField: keyof W2Fields;
  }> = [
    {
      leftLabel: /\b1\s+Wages,?\s*tips/i,
      rightLabel: /\b2\s+Federal\s*income\s*tax/i,
      leftField: 'box1_wages',
      rightField: 'box2_federal_tax',
    },
    {
      leftLabel: /\b3\s+Social\s*security\s*wages/i,
      rightLabel: /\b4\s+Social\s*security\s*tax/i,
      leftField: 'box3_ss_wages',
      rightField: 'box4_ss_tax',
    },
    {
      leftLabel: /\b5\s+Medicare\s*wages/i,
      rightLabel: /\b6\s*\n?\s*Medicare\s*tax/i,
      leftField: 'box5_medicare_wages',
      rightField: 'box6_medicare_tax',
    },
    {
      leftLabel: /\b16\s+State\s*wages/i,
      rightLabel: /\b17\s+State\s*income\s*tax/i,
      leftField: 'state_wages',
      rightField: 'state_tax',
    },
  ];

  for (const pair of pairedLookups) {
    // Find both labels — they must be on the SAME line (W-2 grid layout)
    const leftMatch = ocrText.match(pair.leftLabel);
    const rightMatch = ocrText.match(pair.rightLabel);
    if (!leftMatch || !rightMatch) continue;
    // Check they're on the same line: no newline between them
    const start = Math.min(leftMatch.index ?? 0, rightMatch.index ?? 0);
    const end = Math.max(
      (leftMatch.index ?? 0) + leftMatch[0].length,
      (rightMatch.index ?? 0) + rightMatch[0].length,
    );
    const between = ocrText.slice(start, end);
    if (between.includes('\n')) continue; // Different lines — skip Phase 0

    // Find the end of the label line (search for newline after right label)
    const labelEnd = Math.max(
      (leftMatch.index ?? 0) + leftMatch[0].length,
      (rightMatch.index ?? 0) + rightMatch[0].length,
    );
    const afterLabels = ocrText.slice(labelEnd);

    // Get the next line(s) that contain numbers
    const nextLines = afterLabels.split('\n').slice(0, 5);
    for (const line of nextLines) {
      // Find all dollar amounts on this line (must have comma or decimal to be a dollar amount)
      const amounts = (line.match(/\d[\d,]*\.\d+|\d{1,3}(?:,\d{3})+/g) ?? [])
        .map((m) => parseDollarAmount(m))
        .filter((v): v is number => v !== undefined && v > 1);

      if (amounts.length >= 2) {
        // Paired: first = left field, second = right field
        (fields as unknown as Record<string, unknown>)[pair.leftField] = amounts[0];
        (fields as unknown as Record<string, unknown>)[pair.rightField] = amounts[1];
        break;
      } else if (amounts.length === 1) {
        // Single value on line — assign to left field
        (fields as unknown as Record<string, unknown>)[pair.leftField] = amounts[0];
        break;
      }
    }
  }

  // Direct lookups for fields that need the LAST amount after a label
  // (because the line has paired values: left field amount, then right field amount)
  const lowerText = ocrText.toLowerCase();

  // Dependent care (Box 10): single value after label
  if (fields.box10_dependent_care === undefined) {
    const idx = lowerText.indexOf('10 dependent care benefits');
    if (idx !== -1) {
      const after = ocrText.slice(idx, idx + 300);
      const m = after.match(/(\d[\d,]*\.?\d*)/);
      if (m) { const v = parseDollarAmount(m[1]); if (v) fields.box10_dependent_care = v; }
    }
  }

  // Medicare tax (Box 6): appears after "Medicare tax withheld" on a line
  // with Medicare wages first, then Medicare tax second
  // Layout: "SAN FRANCISCO CA 94104  223162.42  3444.31"
  if (fields.box6_medicare_tax === undefined) {
    const idx = lowerText.indexOf('medicare tax withheld');
    if (idx !== -1) {
      const after = ocrText.slice(idx, idx + 500);
      const amounts = (after.match(/\d[\d,]*\.\d{2}/g) ?? [])
        .map((m) => parseDollarAmount(m))
        .filter((v): v is number => v !== undefined && v > 0);
      // If we already have Medicare wages, the tax is the OTHER amount
      if (amounts.length >= 2 && fields.box5_medicare_wages !== undefined) {
        fields.box6_medicare_tax = amounts.find((a) => a !== fields.box5_medicare_wages);
      } else if (amounts.length >= 2) {
        // Second amount is usually the tax (smaller number)
        fields.box6_medicare_tax = amounts[1];
      } else if (amounts.length === 1) {
        fields.box6_medicare_tax = amounts[0];
      }
    }
  }

  // State tax (Box 17): "17 State income tax" on label line,
  // value line has: "CA  136-1643-8  217176.44  14026.86"
  // State tax is the LAST dollar amount on the value line
  if (fields.state_tax === undefined) {
    const idx = lowerText.indexOf('17 state income tax');
    if (idx !== -1) {
      const after = ocrText.slice(idx);
      const nlIdx = after.indexOf('\n');
      if (nlIdx !== -1) {
        const valueLine = after.slice(nlIdx + 1).split('\n')[0];
        const amounts = (valueLine.match(/\d[\d,]*\.\d{2}/g) ?? [])
          .map((m) => parseDollarAmount(m))
          .filter((v): v is number => v !== undefined);
        if (amounts.length >= 2) {
          fields.state_wages = amounts[amounts.length - 2];
          fields.state_tax = amounts[amounts.length - 1];
        } else if (amounts.length === 1) {
          fields.state_tax = amounts[0];
        }
      }
    }
  }

  // --- Phase 1: Multi-line positional parsing for paired boxes ---
  // Run FIRST because single-line regex often grabs wrong values from
  // multi-line PDF layouts (e.g., matching "1545" as box1 value).
  // W-2 PDF layout: paired label rows with values on subsequent lines:
  //   "1 Wages, tips, other compensation  2 Federal income tax withheld"
  //   "210395.52  31221.21"

  const lines = ocrText.split('\n');

  const pairedBoxes: Array<{
    leftLabel: RegExp;
    rightLabel: RegExp;
    leftField: 'box1_wages' | 'box3_ss_wages' | 'box5_medicare_wages';
    rightField: 'box2_federal_tax' | 'box4_ss_tax' | 'box6_medicare_tax';
  }> = [
    {
      leftLabel: /\b1\s+wages[,.\s]*tips/i,
      rightLabel: /\b2\s+federal\s*income\s*tax/i,
      leftField: 'box1_wages',
      rightField: 'box2_federal_tax',
    },
    {
      leftLabel: /\b3\s+social\s*security\s*wages/i,
      rightLabel: /\b4\s+social\s*security\s*tax/i,
      leftField: 'box3_ss_wages',
      rightField: 'box4_ss_tax',
    },
    {
      leftLabel: /\b5\s+medicare\s*wages/i,
      rightLabel: /\b6\s+medicare\s*tax/i,
      leftField: 'box5_medicare_wages',
      rightField: 'box6_medicare_tax',
    },
  ];

  for (const pair of pairedBoxes) {
    // Skip if both fields already populated
    if (
      fields[pair.leftField] !== undefined &&
      fields[pair.rightField] !== undefined
    ) {
      continue;
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const hasLeft = pair.leftLabel.test(line);
      const hasRight = pair.rightLabel.test(line);

      if (!hasLeft && !hasRight) continue;

      // Only use multi-line parsing if the label line has no amount on it
      // (i.e., it's a pure label row from PDF spatial extraction)
      if (lineHasAmount(line)) break;

      if (hasLeft && hasRight) {
        // Both labels on same line → paired values on a nearby line
        if (fields[pair.leftField] === undefined) {
          fields[pair.leftField] = findNearbyAmount(lines, i, 'left');
        }
        if (fields[pair.rightField] === undefined) {
          fields[pair.rightField] = findNearbyAmount(lines, i, 'right');
        }
      } else if (hasLeft && fields[pair.leftField] === undefined) {
        fields[pair.leftField] = findNearbyAmount(lines, i, 'single');
      } else if (hasRight && fields[pair.rightField] === undefined) {
        fields[pair.rightField] = findNearbyAmount(lines, i, 'single');
      }
      break;
    }
  }

  // Box 10: Multi-line fallback for dependent care
  if (fields.box10_dependent_care === undefined) {
    for (let i = 0; i < lines.length; i++) {
      if (/\b10\s+dependent\s*care/i.test(lines[i]) && !lineHasAmount(lines[i])) {
        const val = findNearbyAmount(lines, i, 'single');
        if (val !== undefined) fields.box10_dependent_care = val;
        break;
      }
    }
  }

  // --- Phase 2: Single-line regex fallback ---
  // Only runs for fields not populated by multi-line parsing.
  if (fields.box1_wages === undefined) {
    fields.box1_wages = extractBoxValue(ocrText,
      /(?:box\s*1\b[^:\n]*wages|wages[,.\s]*tips[,.\s]*other\s*comp)[: \t]*\$?([\d,]{2,}\.?\d*)/i);
  }
  if (fields.box2_federal_tax === undefined) {
    fields.box2_federal_tax = extractBoxValue(ocrText,
      /(?:box\s*2\b[^:\n]*|federal\s*income\s*tax\s*withheld\b[^:\n]*)[: \t]*\$?([\d,]{2,}\.?\d*)/i);
  }
  if (fields.box3_ss_wages === undefined) {
    fields.box3_ss_wages = extractBoxValue(ocrText,
      /(?:box\s*3\b[^:\n]*|social\s*security\s*wages\b[^:\n]*)[: \t]*\$?([\d,]{2,}\.?\d*)/i);
  }
  if (fields.box4_ss_tax === undefined) {
    fields.box4_ss_tax = extractBoxValue(ocrText,
      /(?:box\s*4\b[^:\n]*|social\s*security\s*tax\s*withheld\b[^:\n]*)[: \t]*\$?([\d,]{2,}\.?\d*)/i);
  }
  if (fields.box5_medicare_wages === undefined) {
    fields.box5_medicare_wages = extractBoxValue(ocrText,
      /(?:box\s*5\b[^:\n]*|medicare\s*wages\b[^:\n]*)[: \t]*\$?([\d,]{2,}\.?\d*)/i);
  }
  if (fields.box6_medicare_tax === undefined) {
    fields.box6_medicare_tax = extractBoxValue(ocrText,
      /(?:box\s*6\b[^:\n]*|medicare\s*tax\s*withheld\b[^:\n]*)[: \t]*\$?([\d,]{2,}\.?\d*)/i);
  }
  if (fields.box10_dependent_care === undefined) {
    fields.box10_dependent_care = extractBoxValue(ocrText,
      /(?:box\s*10\b[^:\n]*|dependent\s*care\s*benefits?\b[^:\n]*)[: \t]*\$?([\d,]{2,}\.?\d*)/i);
  }

  // Box 12: Coded items (12a, 12b, 12c, 12d)
  const box12Pattern =
    /(?:box\s*)?12[a-d][:\s]*(?:code\s*)?([A-Z]{1,2})\s+\$?([\d,]+\.?\d*)/gi;
  let box12Match;
  while ((box12Match = box12Pattern.exec(ocrText)) !== null) {
    const amount = parseDollarAmount(box12Match[2]);
    if (amount !== undefined) {
      fields.box12.push({ code: box12Match[1].toUpperCase(), amount });
    }
  }

  // Also try "Code X $amount" pattern without box prefix
  const codePattern = /\bcode\s+([A-Z]{1,2})\s+\$?([\d,]+\.?\d*)/gi;
  let codeMatch;
  while ((codeMatch = codePattern.exec(ocrText)) !== null) {
    const code = codeMatch[1].toUpperCase();
    const amount = parseDollarAmount(codeMatch[2]);
    // Avoid duplicates
    if (amount !== undefined && !fields.box12.some((b) => b.code === code)) {
      fields.box12.push({ code, amount });
    }
  }

  // Box 14: Other items
  const box14Pattern =
    /(?:box\s*)?14[:\s]*([A-Z]+)\s+\$?([\d,]+\.?\d*)/gi;
  let box14Match;
  while ((box14Match = box14Pattern.exec(ocrText)) !== null) {
    const amount = parseDollarAmount(box14Match[2]);
    if (amount !== undefined) {
      fields.box14_other.push({
        label: box14Match[1].toUpperCase(),
        amount,
      });
    }
  }

  // Employer EIN (Box b): XX-XXXXXXX
  const einMatch = ocrText.match(
    /(?:box\s*b|employer.*(?:ein|id|identification))[:\s]*(\d{2}-\d{7})/i,
  );
  if (einMatch) {
    fields.employer_ein = einMatch[1];
  } else {
    // Fallback: find any EIN pattern near "employer"
    const einFallback = ocrText.match(/(\d{2}-\d{7})/);
    if (einFallback) fields.employer_ein = einFallback[1];
  }

  // State info (Boxes 15-17)
  const stateMatch = ocrText.match(
    /(?:box\s*15\s*(?:state)?|state\s*(?:employer)?)[:\s]*([A-Z]{2})\b/i,
  );
  if (stateMatch) {
    fields.state = stateMatch[1].toUpperCase();
  }

  if (fields.state_wages === undefined) {
    fields.state_wages = extractBoxValue(
      ocrText,
      /(?:box\s*16|state\s*wages)[:\s]*\$?([\d,]+\.?\d*)/i,
    );
  }

  if (fields.state_tax === undefined) {
    fields.state_tax = extractBoxValue(
      ocrText,
      /(?:box\s*17|state\s*income\s*tax)[:\s]*\$?([\d,]+\.?\d*)/i,
    );
  }

  return fields;
}

/** Aggregate multiple W-2s into combined totals for Form 1040 */
export function aggregateW2s(w2s: W2Fields[]): {
  totalWages: number;
  totalFederalWithholding: number;
  totalSSWages: number;
  totalMedicareWages: number;
  totalStateWages: number;
  totalStateTax: number;
} {
  return {
    totalWages: irsRound(
      w2s.reduce((sum, w) => sum + (w.box1_wages ?? 0), 0),
    ),
    totalFederalWithholding: irsRound(
      w2s.reduce((sum, w) => sum + (w.box2_federal_tax ?? 0), 0),
    ),
    totalSSWages: irsRound(
      w2s.reduce((sum, w) => sum + (w.box3_ss_wages ?? 0), 0),
    ),
    totalMedicareWages: irsRound(
      w2s.reduce((sum, w) => sum + (w.box5_medicare_wages ?? 0), 0),
    ),
    totalStateWages: irsRound(
      w2s.reduce((sum, w) => sum + (w.state_wages ?? 0), 0),
    ),
    totalStateTax: irsRound(
      w2s.reduce((sum, w) => sum + (w.state_tax ?? 0), 0),
    ),
  };
}
