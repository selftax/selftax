import type { DocumentType } from '../types';

/** Patterns that identify tax document types from extracted text */
const DOCUMENT_PATTERNS: Array<{ type: DocumentType; patterns: RegExp[] }> = [
  // ── Prior year return FIRST — contains text from all sub-forms ──
  {
    type: 'prior-year-return',
    patterns: [
      /form\s*1040.*u\.?s\.?\s*individual/i,  // Full 1040 return
    ],
  },
  // ── Specific 1099/1098 forms (before W-2, which has broad patterns) ──
  {
    type: '1099-int',
    patterns: [
      /form\s*1099-?int\b/i,
    ],
  },
  {
    type: '1099-b',
    patterns: [
      /proceeds\s*from\s*broker/i,
      /form\s*1099-?b\b/i,
      /barter\s*exchange\s*transactions/i,
    ],
  },
  {
    type: '1099-div',
    patterns: [
      /dividends\s*and\s*distributions/i,
      /form\s*1099-?div\b/i,
    ],
  },
  {
    type: '1099-r',
    patterns: [
      /form\s*1099-?r\b/i,
      /distributions\s*from\s*pensions/i,
      /retirement\s*or\s*profit.sharing/i,
    ],
  },
  {
    type: '1099-nec',
    patterns: [
      /nonemployee\s*compensation/i,
      /form\s*1099-?nec\b/i,
    ],
  },
  {
    type: '1099-misc',
    patterns: [
      /miscellaneous\s*income/i,
      /form\s*1099-?misc\b/i,
    ],
  },
  {
    type: '1099-g',
    patterns: [
      /form\s*1099-?g\b/i,
      /certain\s*government\s*payments/i,
      /unemployment\s*compensation/i,
    ],
  },
  {
    type: '1099-ssa',
    patterns: [
      /form\s*ssa-?1099\b/i,
      /social\s*security\s*benefit\s*statement/i,
    ],
  },
  {
    type: '1099-k',
    patterns: [
      /form\s*1099-?k\b/i,
      /payment\s*card.*third\s*party/i,
    ],
  },
  {
    type: '1099-s',
    patterns: [
      /form\s*1099-?s\b/i,
      /proceeds\s*from\s*real\s*estate/i,
    ],
  },
  {
    type: '1099-c',
    patterns: [
      /form\s*1099-?c\b/i,
      /cancellation\s*of\s*debt/i,
    ],
  },
  {
    type: '1099-sa',
    patterns: [
      /form\s*1099-?sa\b/i,
      /distributions.*health\s*savings/i,
    ],
  },
  {
    type: 'w2g',
    patterns: [
      /form\s*w-?2g\b/i,
      /certain\s*gambling\s*winnings/i,
    ],
  },
  {
    type: 'k-1',
    patterns: [
      /schedule\s*k-?1\b/i,
      /partner.s\s*share\s*of\s*income/i,
      /shareholder.s\s*share\s*of\s*income/i,
    ],
  },
  // ── W-2 (after all 1099/1098 forms to avoid false matches) ──
  {
    type: 'w2',
    patterns: [
      /wage\s*and\s*tax\s*statement/i,
      /form\s*w-?2\b/i,
    ],
  },
  // ── Deduction/credit forms ──
  {
    type: '1098-t',
    patterns: [
      /form\s*1098-?t\b/i,
      /tuition\s*statement/i,
    ],
  },
  {
    type: '1098-e',
    patterns: [
      /form\s*1098-?e\b/i,
      /student\s*loan\s*interest\s*statement/i,
    ],
  },
  {
    type: '1098',
    patterns: [
      /mortgage\s*interest\s*statement/i,
      /form\s*1098\b/i,
    ],
  },
  {
    type: '1095-a',
    patterns: [
      /form\s*1095-?a\b/i,
      /health\s*insurance\s*marketplace/i,
    ],
  },
  {
    type: '5498-sa',
    patterns: [
      /form\s*5498-?sa\b/i,
      /hsa.*contribution/i,
    ],
  },
];

/** Secondary patterns — checked after primary, with additional heuristics */
const SECONDARY_PATTERNS: Array<{ type: DocumentType; test: (text: string) => boolean }> = [
  {
    type: 'property-tax-bill',
    test: (text) => /property\s*tax|tax\s*bill|assessed\s*value|parcel/i.test(text)
      && /\$[\d,]+/g.test(text),
  },
  {
    type: 'daycare-statement',
    test: (text) => /child\s*care|daycare|day\s*care|preschool|dependent\s*care|after.school/i.test(text)
      && /\$[\d,]+/g.test(text),
  },
  {
    type: 'charitable-receipt',
    test: (text) => /charit|donat|contribution|tax.deductible|501\s*\(c\)/i.test(text)
      && /\$[\d,]+/g.test(text),
  },
  {
    type: 'medical-receipt',
    test: (text) => /medical|dental|hospital|prescription|health\s*care|copay|deductible/i.test(text)
      && /\$[\d,]+/g.test(text)
      && !/insurance\s*premium|escrow/i.test(text),
  },
];

/**
 * Auto-detect document type from extracted text content.
 * Returns 'other' if no pattern matches.
 */
export function detectDocumentType(text: string): DocumentType {
  // Primary: exact IRS form patterns
  for (const { type, patterns } of DOCUMENT_PATTERNS) {
    if (patterns.some((p) => p.test(text))) {
      return type;
    }
  }

  // Secondary: heuristic document types
  for (const { type, test } of SECONDARY_PATTERNS) {
    if (test(text)) {
      return type;
    }
  }

  // Fallback: generic receipt if it has dollar amounts and expense keywords
  const hasDollarAmounts = /\$[\d,]+\.?\d*/g.test(text);
  const hasExpenseKeywords = /(?:receipt|invoice|paid|total|amount\s*due|subtotal)/i.test(text);
  if (hasDollarAmounts && hasExpenseKeywords) {
    return 'receipt';
  }

  return 'other';
}

/** Supported image MIME types */
export const SUPPORTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/webp',
  'image/tiff',
];

/** Supported document MIME types */
export const SUPPORTED_DOCUMENT_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
  'application/vnd.ms-excel', // xls
  'text/csv',
  ...SUPPORTED_IMAGE_TYPES,
];

/** Check if a file type is a supported image */
export function isImageFile(mimeType: string): boolean {
  return SUPPORTED_IMAGE_TYPES.includes(mimeType);
}

/** Check if a file type is a spreadsheet */
export function isSpreadsheetFile(mimeType: string): boolean {
  return [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
  ].includes(mimeType);
}

/** Check if a file type is a PDF */
export function isPdfFile(mimeType: string): boolean {
  return mimeType === 'application/pdf';
}

/** Check if a file type is supported */
export function isSupportedFileType(mimeType: string): boolean {
  return SUPPORTED_DOCUMENT_TYPES.includes(mimeType);
}

/**
 * Describes the processing pipeline for a given file type.
 */
export interface ProcessingPlan {
  needsOCR: boolean;
  needsPDFExtraction: boolean;
  needsSpreadsheetParsing: boolean;
  runPIIDetection: boolean;
}

/** Maximum file size in bytes (50 MB) */
export const MAX_FILE_SIZE = 50 * 1024 * 1024;

export function isFileSizeValid(sizeInBytes: number): boolean {
  return sizeInBytes <= MAX_FILE_SIZE;
}

export function getProcessingPlan(mimeType: string): ProcessingPlan {
  return {
    needsOCR: isImageFile(mimeType),
    needsPDFExtraction: isPdfFile(mimeType),
    needsSpreadsheetParsing: isSpreadsheetFile(mimeType),
    runPIIDetection: true,
  };
}
