/**
 * Unified File Extraction Dispatcher
 *
 * Routes file extraction to the correct extractor based on MIME type,
 * using tax-core's getProcessingPlan to determine the processing pipeline.
 */

import { getProcessingPlan } from '@selftax/core';
import { extractTextFromPDF } from './pdfExtractor.js';
import { extractTextFromImage } from './ocrExtractor.js';
import {
  parseSpreadsheet,
  spreadsheetToText,
  type SpreadsheetData,
} from './spreadsheetParser.js';

/** Result of text extraction from a file */
export type ExtractionResult =
  | { kind: 'text'; text: string }
  | { kind: 'spreadsheet'; data: SpreadsheetData; text: string };

/**
 * Extract text content from a file, routing to the correct extractor
 * based on MIME type.
 *
 * @param filePath - Absolute path to the file
 * @param mimeType - MIME type of the file
 * @returns Extraction result with text (and structured data for spreadsheets)
 */
export async function extractFile(
  filePath: string,
  mimeType: string,
): Promise<ExtractionResult> {
  const plan = getProcessingPlan(mimeType);

  if (plan.needsPDFExtraction) {
    const text = await extractTextFromPDF(filePath);
    return { kind: 'text', text };
  }

  if (plan.needsOCR) {
    const text = await extractTextFromImage(filePath);
    return { kind: 'text', text };
  }

  if (plan.needsSpreadsheetParsing) {
    const data = await parseSpreadsheet(filePath);
    const text = spreadsheetToText(data);
    return { kind: 'spreadsheet', data, text };
  }

  throw new Error(`Unsupported file type: ${mimeType}`);
}
