/**
 * PDF Text Extraction Service
 *
 * Uses pdfjs-dist to extract text content from uploaded PDF files in the browser.
 * This is the extraction side — pdfService.ts handles PDF generation.
 *
 * Text is extracted preserving some spatial layout: items on the same line
 * are separated by spaces, and lines/pages are separated by newlines.
 * This matters for tax documents that use table layouts (W-2, 1099, etc.).
 *
 * IMPORTANT: Before calling extractTextFromPDF, the PDF.js worker must be
 * configured. Import '../services/pdfWorkerSetup' once in your app entry point.
 */

import { getDocument, InvalidPDFException } from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';

/** Error thrown when a PDF is password-protected */
export class PasswordProtectedError extends Error {
  constructor(message = 'PDF is password-protected') {
    super(message);
    this.name = 'PasswordProtectedError';
  }
}

/** Error thrown when a file is not a valid PDF */
export class InvalidPDFError extends Error {
  constructor(message = 'File is not a valid PDF') {
    super(message);
    this.name = 'InvalidPDFError';
  }
}

/**
 * Determine if two text items are on the same line.
 * Uses the vertical position (transform[5]) with a tolerance
 * based on item height to handle slight baseline variations.
 */
function isSameLine(a: TextItem, b: TextItem): boolean {
  const maxHeight = Math.max(a.height, b.height);
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

  // Filter to only TextItem (not TextMarkedContent)
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

  // Flush remaining line
  if (currentLine.length > 0) {
    lines.push(currentLine.join('').trim());
  }

  return lines.filter((line) => line.length > 0).join('\n');
}

/**
 * Extract all text content from a PDF file.
 *
 * @param file - The PDF File object from user upload
 * @returns The extracted text, with pages separated by double newlines
 * @throws {PasswordProtectedError} If the PDF is password-protected
 * @throws {InvalidPDFError} If the file is not a valid PDF
 * @throws {Error} For other unexpected failures
 */
export async function extractTextFromPDF(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const data = new Uint8Array(arrayBuffer);

  let pdf: PDFDocumentProxy;
  try {
    pdf = await getDocument({ data }).promise;
  } catch (err: unknown) {
    if (err instanceof InvalidPDFException) {
      throw new InvalidPDFError();
    }
    // pdfjs-dist throws PasswordException for protected PDFs.
    // PasswordException is not directly exported, so we check by name.
    if (err instanceof Error && err.name === 'PasswordException') {
      throw new PasswordProtectedError();
    }
    throw new Error(
      `Failed to load PDF: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

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
