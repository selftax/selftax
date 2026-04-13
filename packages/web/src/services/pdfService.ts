import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { TaxFormType } from '@selftax/core';
import type { PDFFormData, TaxReturnPackage } from '@selftax/core';
import { getFormLabel } from '../stores/taxReturnStore';

/** Human-readable row for PDF display */
export interface PDFRow {
  label: string;
  value: string;
}

/** Intermediate data for building a single form's PDF */
export interface FormPDFData {
  title: string;
  rows: PDFRow[];
}

/** Field label mappings for well-known PDF field codes */
const FIELD_LABELS: Record<string, string> = {
  // Form 1040
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
  // Schedule A
  'sa-1': 'Line 5d - State/Local Taxes (SALT)',
  'sa-4': 'Line 10 - Mortgage Interest',
  'sa-6': 'Line 14 - Charitable Contributions',
  'sa-7': 'Line 17 - Total Itemized Deductions',
  // Schedule D
  'sd-1': 'Part I - Short-Term Net',
  'sd-5': 'Part II - Long-Term Net',
  'sd-7': 'Line 16 - Net Capital Gain/Loss',
  'sd-8': 'Line 21 - Capital Loss Deduction',
  // Schedule E
  'se-3': 'Line 3 - Rents Received',
  'se-9': 'Line 9 - Insurance',
  'se-12': 'Line 12 - Mortgage Interest',
  'se-14': 'Line 14 - Repairs',
  'se-16': 'Line 16 - Taxes',
  'se-18': 'Line 18 - Depreciation',
  'se-20': 'Line 20 - Total Expenses',
  'se-21': 'Line 21 - Net Rental Income',
  // CA Form 540
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

/** Convert a field code to a human-readable label */
function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

/** Format a value for display */
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

/**
 * Build display-ready data for a single form.
 * This is the data preparation layer — separated from PDF rendering
 * so it can be tested without pdf-lib.
 */
export function buildFormPDFData(
  formType: TaxFormType,
  fields: PDFFormData,
): FormPDFData {
  const title = getFormLabel(formType);
  const rows: PDFRow[] = Object.entries(fields)
    .filter(([, v]) => v !== '' && v !== 0 && v !== false)
    .map(([key, value]) => ({
      label: fieldLabel(key),
      value: formatFieldValue(value),
    }));

  return { title, rows };
}

/**
 * Generate a PDF document for a single tax form.
 *
 * Since we don't have official IRS PDF templates, this creates a clean
 * document with the form title, optional PII header, and all field data
 * laid out in a readable table format.
 */
export async function generateFormPDF(
  formType: TaxFormType,
  fields: PDFFormData,
  piiFields?: TaxReturnPackage['piiFields'],
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const PAGE_WIDTH = 612; // 8.5 inches
  const PAGE_HEIGHT = 792; // 11 inches
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
  const title = getFormLabel(formType);
  page.drawText(title, {
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

  // PII header (name, SSN, address)
  if (piiFields) {
    page.drawText(piiFields.name, {
      x: MARGIN,
      y,
      size: 11,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    y -= LINE_HEIGHT;

    page.drawText(`SSN: ${piiFields.ssn}`, {
      x: MARGIN,
      y,
      size: 10,
      font,
      color: rgb(0, 0, 0),
    });
    y -= LINE_HEIGHT;

    page.drawText(piiFields.address, {
      x: MARGIN,
      y,
      size: 10,
      font,
      color: rgb(0, 0, 0),
    });
    y -= LINE_HEIGHT;

    page.drawText(piiFields.cityStateZip, {
      x: MARGIN,
      y,
      size: 10,
      font,
      color: rgb(0, 0, 0),
    });
    y -= LINE_HEIGHT * 2;
  }

  // Separator line
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 1,
    color: rgb(0.7, 0.7, 0.7),
  });
  y -= LINE_HEIGHT;

  // Form fields as a table
  const data = buildFormPDFData(formType, fields);
  const VALUE_X = PAGE_WIDTH - MARGIN - 120;

  for (const row of data.rows) {
    ensureSpace(LINE_HEIGHT);

    page.drawText(row.label, {
      x: MARGIN,
      y,
      size: 10,
      font,
      color: rgb(0, 0, 0),
    });

    page.drawText(row.value, {
      x: VALUE_X,
      y,
      size: 10,
      font: boldFont,
      color: rgb(0, 0, 0),
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
    x: MARGIN,
    y,
    size: 8,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });

  return pdfDoc.save();
}

/**
 * Generate PDFs for multiple forms. Returns a map of formType -> Uint8Array.
 * Calls onProgress with the percentage complete after each form.
 */
export async function generateAllPDFs(
  forms: Array<{ formType: TaxFormType; fields: PDFFormData }>,
  piiFields?: TaxReturnPackage['piiFields'],
  onProgress?: (percent: number) => void,
): Promise<Record<string, Uint8Array>> {
  const results: Record<string, Uint8Array> = {};
  const total = forms.length;

  for (let i = 0; i < total; i++) {
    const { formType, fields } = forms[i];
    results[formType] = await generateFormPDF(formType, fields, piiFields);
    onProgress?.(Math.round(((i + 1) / total) * 100));
  }

  return results;
}

/** Convert a Uint8Array to a blob URL for download */
export function pdfBytesToBlobUrl(bytes: Uint8Array): string {
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
  return URL.createObjectURL(blob);
}
