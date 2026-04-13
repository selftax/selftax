/**
 * PDF Text Extraction for Node.js
 *
 * Uses pdfjs-dist legacy build to extract text from PDF files on disk.
 * Preserves spatial text layout (items on the same line joined with spaces,
 * different lines separated by newlines) — important for tax document
 * table layouts (W-2, 1099, etc.).
 *
 * Port of packages/web/src/services/pdfExtractor.ts adapted for Node.js
 * (reads from file path instead of File object, no worker needed).
 */

import { readFile } from 'node:fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PDFPageProxy } from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';

/**
 * Determine if two text items are on the same line.
 * Uses the vertical position (transform[5]) with a generous tolerance
 * to keep grid-aligned items together (e.g., W-2 left/right box pairs).
 */
function isSameLine(a: TextItem, b: TextItem): boolean {
  const maxHeight = Math.max(a.height, b.height);
  // Use 0.8 * max height as tolerance — tight enough to separate rows,
  // loose enough to keep grid cells on the same line even if baselines
  // vary slightly (common in IRS form PDFs)
  const tolerance = maxHeight * 0.8;
  return Math.abs(a.transform[5] - b.transform[5]) < tolerance;
}

/**
 * Extract text from a single PDF page, preserving spatial layout.
 *
 * Items are sorted by vertical position (top to bottom) then horizontal
 * (left to right). Items on the same line are joined with spaces;
 * different lines are separated by newlines.
 */
async function extractPageText(page: PDFPageProxy): Promise<string> {
  const content = await page.getTextContent();

  const items = content.items.filter(
    (item): item is TextItem => 'str' in item && typeof item.str === 'string',
  );

  if (items.length === 0) return '';

  // Sort by vertical position descending (PDF y-axis is bottom-up),
  // then by horizontal position ascending
  items.sort((a, b) => {
    const yDiff = b.transform[5] - a.transform[5];
    if (Math.abs(yDiff) > Math.max(a.height, b.height) * 0.8) {
      return yDiff;
    }
    return a.transform[4] - b.transform[4];
  });

  const lines: string[] = [];
  let currentLine: string[] = [];
  let prevItem: TextItem | null = null;

  for (const item of items) {
    if (item.str.trim() === '' && !item.hasEOL) continue;

    if (prevItem && !isSameLine(prevItem, item)) {
      lines.push(currentLine.join('').trim());
      currentLine = [];
    }

    if (item.str.trim()) {
      // Add spacing based on horizontal gap between items
      if (prevItem && isSameLine(prevItem, item)) {
        const prevEnd = prevItem.transform[4] + prevItem.width;
        const gap = item.transform[4] - prevEnd;
        // Large gap (>30 units) = separate grid column → use tab
        // Small gap = same column → use space
        currentLine.push(gap > 30 ? '\t' : ' ');
      }
      currentLine.push(item.str.trim());
    }

    if (item.hasEOL && currentLine.length > 0) {
      lines.push(currentLine.join('').trim());
      currentLine = [];
    }

    prevItem = item;
  }

  if (currentLine.length > 0) {
    lines.push(currentLine.join(' ').trim());
  }

  return lines.filter((line) => line.length > 0).join('\n');
}

/**
 * Extract all text content from a PDF file on disk.
 *
 * @param filePath - Absolute path to the PDF file
 * @returns The extracted text, with pages separated by double newlines
 */
export async function extractTextFromPDF(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  const data = new Uint8Array(buffer);

  const pdf = await getDocument({ data, useSystemFonts: true }).promise;

  const pageTexts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const text = await extractPageText(page);
    if (text.trim()) {
      pageTexts.push(text);
    }
  }

  return pageTexts.join('\n\n');
}
