/**
 * PDF Generator — MCP Port
 *
 * Generates tax form PDFs using pdf-lib and writes them to disk.
 * Port of packages/web/src/services/pdfService.ts adapted for Node.js
 * (writes to file system instead of blob URLs).
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { TaxFormType, PDFFormData, TaxReturnPackage } from '@selftax/core';

/** Human-readable row for PDF display */
interface PDFRow {
  label: string;
  value: string;
}

/** Form labels by type */
const FORM_LABELS: Record<TaxFormType, string> = {
  '1040': 'Form 1040 - U.S. Individual Income Tax Return',
  'schedule-a': 'Schedule A - Itemized Deductions',
  'schedule-b': 'Schedule B - Interest and Dividends',
  'schedule-d': 'Schedule D - Capital Gains and Losses',
  'schedule-e': 'Schedule E - Rental and Royalty Income',
  'form-8949': 'Form 8949 - Sales of Capital Assets',
  'form-4562': 'Form 4562 - Depreciation and Amortization',
  'form-2441': 'Form 2441 - Child and Dependent Care Expenses',
  'form-6251': 'Form 6251 - Alternative Minimum Tax',
  'ca-540': 'CA Form 540 - California Resident Income Tax Return',
};

/** Field label mappings for well-known PDF field codes */
const FIELD_LABELS: Record<string, string> = {
  'f1-1': 'Filing Status',
  'f1-7': 'Line 9 - Total Income',
  'f1-8': 'Line 11 - Adjusted Gross Income',
  'f1-10': 'Line 13 - Deductions',
  'f1-11': 'Line 15 - Taxable Income',
  'f1-12': 'Line 16 - Tax',
  'f1-16': 'Line 21 - Total Credits',
  'f1-18': 'Line 24 - Total Tax',
  'f1-25': 'Line 33 - Total Payments',
  'f1-26': 'Line 34 - Overpaid (Refund)',
  'f1-30': 'Line 37 - Amount Owed',
  'sa-1': 'Line 5d - State/Local Taxes (SALT)',
  'sa-4': 'Line 10 - Mortgage Interest',
  'sa-6': 'Line 14 - Charitable Contributions',
  'sa-7': 'Line 17 - Total Itemized Deductions',
  'sd-1': 'Part I - Short-Term Net',
  'sd-5': 'Part II - Long-Term Net',
  'sd-7': 'Line 16 - Net Capital Gain/Loss',
  'sd-8': 'Line 21 - Capital Loss Deduction',
  'se-3': 'Line 3 - Rents Received',
  'se-9': 'Line 9 - Insurance',
  'se-12': 'Line 12 - Mortgage Interest',
  'se-14': 'Line 14 - Repairs',
  'se-16': 'Line 16 - Taxes',
  'se-18': 'Line 18 - Depreciation',
  'se-20': 'Line 20 - Total Expenses',
  'se-21': 'Line 21 - Net Rental Income',
  'ca540-1': 'CA Adjusted Gross Income',
  'ca540-2': 'CA Deduction',
  'ca540-3': 'CA Taxable Income',
  'ca540-4': 'CA Tax (Brackets)',
  'ca540-5': 'Mental Health Surcharge',
  'ca540-6': 'Exemption Credits',
  'ca540-7': 'Total CA Tax',
  'ca540-8': 'Total CA Payments',
  'ca540-9': 'CA Refund',
  'ca540-10': 'CA Amount Owed',
};

function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

function formatFieldValue(value: string | number | boolean): string {
  if (typeof value === 'number') {
    return value.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  return String(value);
}

function buildFormPDFData(
  formType: TaxFormType,
  fields: PDFFormData,
): { title: string; rows: PDFRow[] } {
  const title = FORM_LABELS[formType] ?? formType;
  const rows: PDFRow[] = Object.entries(fields)
    .filter(([, v]) => v !== '' && v !== 0 && v !== false)
    .map(([key, value]) => ({
      label: fieldLabel(key),
      value: formatFieldValue(value),
    }));

  return { title, rows };
}

/**
 * Generate a PDF for a single tax form.
 * PII header is added only at final generation time — the LLM never
 * calls this directly with PII data.
 */
export async function generateFormPDF(
  formType: TaxFormType,
  fields: PDFFormData,
  piiFields?: TaxReturnPackage['piiFields'],
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const PAGE_WIDTH = 612;
  const PAGE_HEIGHT = 792;
  const MARGIN = 50;
  const LINE_HEIGHT = 18;

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  function ensureSpace(needed: number) {
    if (y - needed < MARGIN) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  }

  // Title
  const data = buildFormPDFData(formType, fields);
  page.drawText(data.title, {
    x: MARGIN,
    y,
    size: 16,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  y -= LINE_HEIGHT * 1.5;

  // Tax Year
  page.drawText('Tax Year: 2025', {
    x: MARGIN,
    y,
    size: 10,
    font,
    color: rgb(0.3, 0.3, 0.3),
  });
  y -= LINE_HEIGHT * 1.5;

  // PII header
  if (piiFields) {
    page.drawText(piiFields.name, {
      x: MARGIN, y, size: 11, font: boldFont, color: rgb(0, 0, 0),
    });
    y -= LINE_HEIGHT;

    page.drawText(`SSN: ${piiFields.ssn}`, {
      x: MARGIN, y, size: 10, font, color: rgb(0, 0, 0),
    });
    y -= LINE_HEIGHT;

    page.drawText(piiFields.address, {
      x: MARGIN, y, size: 10, font, color: rgb(0, 0, 0),
    });
    y -= LINE_HEIGHT;

    page.drawText(piiFields.cityStateZip, {
      x: MARGIN, y, size: 10, font, color: rgb(0, 0, 0),
    });
    y -= LINE_HEIGHT * 2;
  }

  // Separator
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 1,
    color: rgb(0.7, 0.7, 0.7),
  });
  y -= LINE_HEIGHT;

  // Form fields
  const VALUE_X = PAGE_WIDTH - MARGIN - 120;

  for (const row of data.rows) {
    ensureSpace(LINE_HEIGHT);

    page.drawText(row.label, {
      x: MARGIN, y, size: 10, font, color: rgb(0, 0, 0),
    });

    page.drawText(row.value, {
      x: VALUE_X, y, size: 10, font: boldFont, color: rgb(0, 0, 0),
    });

    y -= LINE_HEIGHT;
  }

  // Footer
  ensureSpace(LINE_HEIGHT * 3);
  y -= LINE_HEIGHT;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 0.5,
    color: rgb(0.7, 0.7, 0.7),
  });
  y -= LINE_HEIGHT;

  page.drawText('Generated by SelfTax — For informational purposes', {
    x: MARGIN, y, size: 8, font, color: rgb(0.5, 0.5, 0.5),
  });

  return pdfDoc.save();
}

/**
 * Generate PDFs for all forms and write them to disk.
 *
 * @param forms - Array of form type + fields to generate
 * @param outputFolder - Directory to write PDF files to
 * @param piiFields - PII merged at final step (from session profile)
 * @returns Array of file paths that were written
 */
export async function generateAllFormPDFs(
  forms: Array<{ formType: TaxFormType; fields: PDFFormData }>,
  outputFolder: string,
  piiFields?: TaxReturnPackage['piiFields'],
): Promise<string[]> {
  const filePaths: string[] = [];

  for (const { formType, fields } of forms) {
    const bytes = await generateFormPDF(formType, fields, piiFields);
    const fileName = `${formType}.pdf`;
    const filePath = join(outputFolder, fileName);
    await writeFile(filePath, bytes);
    filePaths.push(filePath);
  }

  return filePaths;
}
