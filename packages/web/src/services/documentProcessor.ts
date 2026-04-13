/**
 * Document Processing Pipeline
 *
 * Orchestrates the full extraction pipeline for uploaded documents:
 *   1. Determine processing plan from file MIME type
 *   2. Extract text (PDF extraction or OCR depending on file type)
 *   3. Update document store with extracted text (which auto-runs PII detection + type detection)
 *
 * Errors are caught and stored on the document entry rather than thrown,
 * so a single failed document doesn't break the entire upload flow.
 */

import { getProcessingPlan, extractStructuredFields } from '@selftax/core';
import { extractTextFromPDF } from './pdfExtractor';
import { extractTextFromImage } from './ocrExtractor';
import { useDocumentStore } from '../stores/documentStore';

/**
 * Process a single uploaded document through the extraction pipeline.
 *
 * @param id - The document entry ID in the store
 * @param file - The original File object
 * @param onProgress - Optional progress callback (0-1) for OCR processing
 */
export async function processDocument(
  id: string,
  file: File,
  onProgress?: (progress: number) => void,
): Promise<void> {
  const store = useDocumentStore.getState();
  store.setProcessingStatus(id, 'processing');

  try {
    const plan = getProcessingPlan(file.type);
    let extractedText = '';

    if (plan.needsPDFExtraction) {
      extractedText = await extractTextFromPDF(file);
    } else if (plan.needsOCR) {
      extractedText = await extractTextFromImage(file, onProgress);
    } else if (plan.needsSpreadsheetParsing) {
      // Spreadsheet parsing not yet implemented — mark as done
      useDocumentStore.getState().setProcessingStatus(id, 'done');
      return;
    } else {
      // Unsupported processing type — nothing to extract
      useDocumentStore.getState().setProcessingStatus(id, 'done');
      return;
    }

    // Try structured extraction (deterministic, no PII to redact)
    const structured = extractStructuredFields(extractedText);
    if (structured) {
      // Need at least formType + 1 real field to count as successful
      const fieldCount = Object.keys(structured).filter((k) => k !== 'formType').length;
      if (fieldCount >= 1) {
        const docType = (structured.formType ?? 'other') as import('@selftax/core').DocumentType;
        const store2 = useDocumentStore.getState();
        store2.setExtractedText(id, extractedText);
        useDocumentStore.setState((state) => ({
          documents: state.documents.map((d) =>
            d.id === id ? { ...d, structuredFields: structured, type: docType, verified: true } : d,
          ),
        }));
        useDocumentStore.getState().setProcessingStatus(id, 'done');
        return;
      }
    }

    // Fallback: regular text extraction with PII detection
    useDocumentStore.getState().setExtractedText(id, extractedText);
    useDocumentStore.getState().setProcessingStatus(id, 'done');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    useDocumentStore.getState().setProcessingStatus(id, 'error', message);
  }
}
