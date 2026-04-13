/**
 * Spreadsheet Parser for Node.js
 *
 * Uses SheetJS (xlsx) to parse Excel (.xlsx, .xls) and CSV files.
 * Returns structured data (rows of cells per sheet) plus a text
 * representation for PII detection.
 *
 * NEW capability — not present in the web package.
 */

import { readFile } from 'node:fs/promises';
import * as XLSX from 'xlsx';

/** Parsed spreadsheet data — all sheets, rows of cells */
export interface SpreadsheetData {
  sheetNames: string[];
  sheets: Record<string, string[][]>;
}

/**
 * Parse a spreadsheet file into structured data.
 *
 * @param filePath - Absolute path to the spreadsheet file (.xlsx, .xls, or .csv)
 * @returns Parsed spreadsheet with sheet names and cell data
 */
export async function parseSpreadsheet(filePath: string): Promise<SpreadsheetData> {
  const buffer = await readFile(filePath);
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  const sheetNames = workbook.SheetNames;
  const sheets: Record<string, string[][]> = {};

  for (const name of sheetNames) {
    const sheet = workbook.Sheets[name];
    // Convert to array of arrays, all values as strings
    const rows: string[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: '',
      raw: false,
    });
    sheets[name] = rows.map((row) => row.map((cell) => String(cell)));
  }

  return { sheetNames, sheets };
}

/**
 * Convert spreadsheet data to a text representation for PII detection.
 * Each sheet is separated by a header line. Rows are tab-separated.
 *
 * @param data - Parsed spreadsheet data
 * @returns Text representation of all sheets
 */
export function spreadsheetToText(data: SpreadsheetData): string {
  const parts: string[] = [];

  for (const name of data.sheetNames) {
    const rows = data.sheets[name];
    if (!rows || rows.length === 0) continue;

    parts.push(`=== Sheet: ${name} ===`);
    for (const row of rows) {
      const line = row.join('\t');
      if (line.trim()) {
        parts.push(line);
      }
    }
  }

  return parts.join('\n');
}
