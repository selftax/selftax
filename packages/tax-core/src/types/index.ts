// Core type definitions for SelfTax

/** User's PII profile — stored locally, never sent to API */
export interface UserProfile {
  ssn: string;
  firstName: string;
  lastName: string;
  middleInitial?: string;
  dateOfBirth: string;
  address: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
  phone?: string;
  email?: string;
}

/** A document uploaded by the user */
export interface TaxDocument {
  id: string;
  type: DocumentType;
  originalFile: Blob;
  extractedText: string;
  redactedText: string;
  redactedImage?: Blob;
  fields: Record<string, string | number>;
  verified: boolean;
  createdAt: Date;
}

export type DocumentType =
  // Income forms
  | 'w2'
  | '1099-int'
  | '1099-div'
  | '1099-b'
  | '1099-r'
  | '1099-nec'
  | '1099-misc'
  | '1099-g'
  | '1099-ssa'
  | '1099-k'
  | '1099-s'
  | '1099-c'
  | '1099-sa'
  | 'w2g'
  | 'k-1'
  // Deduction/credit forms
  | '1098'
  | '1098-t'
  | '1098-e'
  | '1095-a'
  | '5498-sa'
  // Specific document types (not IRS forms)
  | 'property-tax-bill'
  | 'daycare-statement'
  | 'charitable-receipt'
  | 'medical-receipt'
  | 'rental-spreadsheet'
  | 'prior-year-return'
  | 'estimated-tax-payment'
  | 'energy-improvement'
  | 'educator-expense'
  | 'business-expense'
  // Catch-alls
  | 'receipt'       // legacy — prefer specific types above
  | 'spreadsheet'   // legacy — prefer rental-spreadsheet
  | 'statement'
  | 'other';

/** PII detection result from a document */
export interface PIIDetection {
  type: PIIType;
  value: string;
  startIndex: number;
  endIndex: number;
  confidence: 'exact' | 'pattern' | 'profile-match';
  /** Bounding box for image redaction (if from OCR) */
  boundingBox?: { x: number; y: number; width: number; height: number };
}

export type PIIType =
  | 'ssn'
  | 'ein'
  | 'name'
  | 'address'
  | 'phone'
  | 'email'
  | 'dob'
  | 'account-number';

/** Redacted document safe to send to LLM */
export interface RedactedDocument {
  id: string;
  type: DocumentType;
  redactedText: string;
  fields: Record<string, string | number>;
  piiDetections: PIIDetection[];
}

/** Tax form output */
export type TaxFormType =
  | '1040'
  | 'schedule-a'
  | 'schedule-b'
  | 'schedule-d'
  | 'schedule-e'
  | 'form-8949'
  | 'form-4562'
  | 'form-2441'
  | 'form-6251'
  | 'ca-540';

export interface TaxFormOutput {
  formType: TaxFormType;
  fields: Record<string, string | number | boolean>;
  /** PDF bytes ready to save/print */
  pdf?: Uint8Array;
}

export type {
  TaxReturnData,
  Form1040Data,
  Schedule1Data,
  Schedule2Data,
  Schedule3Data,
  ScheduleAData,
  ScheduleDData,
  ScheduleEData,
  ScheduleEProperty,
  Form2441Data,
  Form4562Data,
  Form8995Data,
  CA540Data,
  PIIData,
} from './taxReturnData';
