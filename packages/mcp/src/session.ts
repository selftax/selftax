/**
 * Session State
 *
 * In-memory state for the MCP server. Holds the user profile, extracted
 * documents, and calculation results. All PII is stored here and NEVER
 * returned to the LLM — only redacted text and numeric fields go out.
 */

import type {
  DocumentType,
  PIIDetection,
  Form1040Output,
  Form540Output,
  TaxFormType,
  FilingStatus,
} from '@selftax/core';
import type { SpreadsheetData } from './extraction/spreadsheetParser.js';

/** User profile — PII stored locally, never sent to LLM */
export interface SessionProfile {
  firstName: string;
  lastName: string;
  ssn: string;
  address: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
  filingStatus: FilingStatus;
  stateOfResidence: string;
  dependents: Array<{
    firstName: string;
    lastName: string;
    ssn: string;
    relationship: string;
  }>;
}

/** A document stored in session — raw text is NEVER returned to LLM */
export interface SessionDocument {
  id: string;
  fileName: string;
  mimeType: string;
  /** Raw extracted text — NEVER returned to LLM */
  rawText: string;
  /** Redacted text — safe to return to LLM */
  redactedText: string;
  /** PII detections found in this document */
  piiDetections: PIIDetection[];
  /** Parsed numeric/categorical fields */
  fields: Record<string, string | number>;
  /** Auto-detected document type */
  documentType: DocumentType;
  /** Spreadsheet data (if applicable) */
  spreadsheetData?: SpreadsheetData;
}

/** Cached calculation results */
export interface CalculationResult {
  form1040: Form1040Output;
  form540?: Form540Output;
  requiredForms: TaxFormType[];
  guidance: Array<{
    topic: string;
    advice: string;
    severity: 'info' | 'warning' | 'critical';
  }>;
}

/** Server session holding all state */
export interface Session {
  profile: SessionProfile | null;
  documents: Map<string, SessionDocument>;
  calculationResult: CalculationResult | null;
}

/** Create a new empty session */
export function createSession(): Session {
  return {
    profile: null,
    documents: new Map(),
    calculationResult: null,
  };
}

/** Add a document to the session */
export function addDocument(session: Session, doc: SessionDocument): void {
  session.documents.set(doc.id, doc);
}

/** Get a document by ID */
export function getDocument(
  session: Session,
  id: string,
): SessionDocument | undefined {
  return session.documents.get(id);
}

/** Get all documents as an array */
export function getAllDocuments(session: Session): SessionDocument[] {
  return Array.from(session.documents.values());
}

/** Set the user profile */
export function setProfile(session: Session, profile: SessionProfile): void {
  session.profile = profile;
}

/** Store calculation results */
export function setCalculationResult(
  session: Session,
  result: CalculationResult,
): void {
  session.calculationResult = result;
}
