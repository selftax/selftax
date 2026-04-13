import { create } from 'zustand';
import { detectDocumentType, detectPII, type DocumentType, type PIIDetection, type UserProfile, type StructuredExtraction } from '@selftax/core';

export type ProcessingStatus = 'pending' | 'processing' | 'done' | 'error';

export interface DocumentEntry {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  type: DocumentType;
  file: File;
  createdAt: Date;
  extractedText: string;
  piiDetections: PIIDetection[];
  verified: boolean;
  processingStatus: ProcessingStatus;
  processingError?: string;
  /** Structured fields extracted deterministically — no PII, no LLM needed */
  structuredFields?: StructuredExtraction;
}

interface DocumentStore {
  documents: DocumentEntry[];
  addDocument: (file: File, extractedText?: string) => DocumentEntry;
  removeDocument: (id: string) => void;
  setExtractedText: (id: string, text: string, profile?: Partial<UserProfile>) => void;
  setProcessingStatus: (id: string, status: ProcessingStatus, error?: string) => void;
  updatePIIDetections: (id: string, detections: PIIDetection[]) => void;
  setVerified: (id: string, verified: boolean) => void;
}

export const useDocumentStore = create<DocumentStore>((set) => ({
  documents: [],

  addDocument: (file: File, extractedText?: string) => {
    const type = extractedText ? detectDocumentType(extractedText) : 'other';
    const entry: DocumentEntry = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      name: file.name,
      size: file.size,
      mimeType: file.type,
      type,
      file,
      createdAt: new Date(),
      extractedText: '',
      piiDetections: [],
      verified: false,
      processingStatus: 'pending',
    };
    set((state) => ({ documents: [...state.documents, entry] }));
    return entry;
  },

  removeDocument: (id: string) => {
    set((state) => ({
      documents: state.documents.filter((d) => d.id !== id),
    }));
  },

  setExtractedText: (id: string, text: string, profile?: Partial<UserProfile>) => {
    const detections = detectPII(text, profile);
    const type = detectDocumentType(text);
    set((state) => ({
      documents: state.documents.map((d) =>
        d.id === id
          ? { ...d, extractedText: text, piiDetections: detections, type }
          : d,
      ),
    }));
  },

  setProcessingStatus: (id: string, status: ProcessingStatus, error?: string) => {
    set((state) => ({
      documents: state.documents.map((d) =>
        d.id === id
          ? { ...d, processingStatus: status, processingError: error }
          : d,
      ),
    }));
  },

  updatePIIDetections: (id: string, detections: PIIDetection[]) => {
    set((state) => ({
      documents: state.documents.map((d) =>
        d.id === id ? { ...d, piiDetections: detections } : d,
      ),
    }));
  },

  setVerified: (id: string, verified: boolean) => {
    set((state) => ({
      documents: state.documents.map((d) =>
        d.id === id ? { ...d, verified } : d,
      ),
    }));
  },
}));
