import type { PIIDetection } from '../types';

const REDACTED = '[REDACTED]';

/**
 * Replaces all detected PII in text with [REDACTED].
 * Processes detections from end to start to preserve indices.
 */
export function redactText(text: string, detections: PIIDetection[]): string {
  // Sort by startIndex descending so replacements don't shift later indices
  const sorted = [...detections].sort((a, b) => b.startIndex - a.startIndex);

  let result = text;
  for (const detection of sorted) {
    result =
      result.slice(0, detection.startIndex) +
      REDACTED +
      result.slice(detection.endIndex);
  }

  return result;
}

/**
 * Redacts PII cells in CSV/spreadsheet data.
 * Each row is an array of cell values. Cells containing detected PII are replaced.
 */
export function redactSpreadsheet(
  rows: string[][],
  detections: PIIDetection[],
): string[][] {
  const piiValues = new Set(detections.map((d) => d.value.toLowerCase()));

  return rows.map((row) =>
    row.map((cell) => {
      const cellLower = cell.toLowerCase();
      for (const piiValue of piiValues) {
        if (cellLower.includes(piiValue)) {
          return REDACTED;
        }
      }
      return cell;
    }),
  );
}
