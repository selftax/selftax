/**
 * @jest-environment jsdom
 */
/**
 * Spec: Document Processing Pipeline
 *
 * Status: hypothesis
 * Confirm: Uploading a document triggers automatic text extraction (PDF or OCR),
 *          PII detection, document type detection, and store updates.
 * Invalidate: Pipeline cannot reliably determine file type from MIME type alone.
 *
 * Covers:
 * - processDocument routes PDFs to pdfExtractor
 * - processDocument routes images to ocrExtractor
 * - processDocument calls setExtractedText on success
 * - processDocument sets error status on failure
 * - DocumentsPage triggers processing after upload
 * - FileList shows processing status indicators
 * - Store tracks processingStatus and processingError
 */

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';

// Mock extractors before importing anything that depends on them
jest.mock('@selftax/web/services/pdfExtractor', () => ({
  extractTextFromPDF: jest.fn(),
}));

jest.mock('@selftax/web/services/ocrExtractor', () => ({
  extractTextFromImage: jest.fn(),
}));


import { extractTextFromPDF } from '@selftax/web/services/pdfExtractor';
import { extractTextFromImage } from '@selftax/web/services/ocrExtractor';
import { processDocument } from '@selftax/web/services/documentProcessor';
import { useDocumentStore } from '@selftax/web/stores/documentStore';
import type { DocumentEntry } from '@selftax/web/stores/documentStore';
import FileList from '@selftax/web/components/FileList';

const mockExtractPDF = extractTextFromPDF as jest.MockedFunction<typeof extractTextFromPDF>;
const mockExtractImage = extractTextFromImage as jest.MockedFunction<typeof extractTextFromImage>;

function createMockFile(name: string, size: number, type: string): File {
  const buffer = new ArrayBuffer(size);
  return new File([buffer], name, { type });
}

describe('Document Processing Pipeline', () => {
  beforeEach(() => {
    useDocumentStore.setState({ documents: [] });
    jest.clearAllMocks();
  });

  describe('processDocument service', () => {
    test('routes PDF files to pdfExtractor', async () => {
      mockExtractPDF.mockResolvedValue('Form W-2 Wage and Tax Statement');
      const file = createMockFile('w2.pdf', 1024, 'application/pdf');

      let entry: DocumentEntry;
      act(() => {
        entry = useDocumentStore.getState().addDocument(file);
      });

      await processDocument(entry!.id, file);

      expect(mockExtractPDF).toHaveBeenCalledWith(file);
      expect(mockExtractImage).not.toHaveBeenCalled();
    });

    test('routes image files to ocrExtractor', async () => {
      mockExtractImage.mockResolvedValue('Receipt Total: $45.00 Amount Paid');
      const file = createMockFile('receipt.jpg', 2048, 'image/jpeg');

      let entry: DocumentEntry;
      act(() => {
        entry = useDocumentStore.getState().addDocument(file);
      });

      await processDocument(entry!.id, file);

      expect(mockExtractImage).toHaveBeenCalledWith(file, undefined);
      expect(mockExtractPDF).not.toHaveBeenCalled();
    });

    test('calls setExtractedText on successful extraction', async () => {
      const extractedText = 'Form W-2 Wage and Tax Statement SSN: 000-00-0000';
      mockExtractPDF.mockResolvedValue(extractedText);
      const file = createMockFile('w2.pdf', 1024, 'application/pdf');

      let entry: DocumentEntry;
      act(() => {
        entry = useDocumentStore.getState().addDocument(file);
      });

      await processDocument(entry!.id, file);

      const doc = useDocumentStore.getState().documents[0];
      expect(doc.extractedText).toBe(extractedText);
      expect(doc.processingStatus).toBe('done');
      // PII detection should have run automatically via setExtractedText
      expect(doc.piiDetections.length).toBeGreaterThan(0);
      expect(doc.piiDetections[0].type).toBe('ssn');
    });

    test('updates document type from extracted text', async () => {
      mockExtractPDF.mockResolvedValue('Form W-2 Wage and Tax Statement');
      const file = createMockFile('scan.pdf', 1024, 'application/pdf');

      let entry: DocumentEntry;
      act(() => {
        entry = useDocumentStore.getState().addDocument(file);
      });

      // Before processing, type defaults to 'other'
      expect(useDocumentStore.getState().documents[0].type).toBe('other');

      await processDocument(entry!.id, file);

      // After processing, type detected from text
      expect(useDocumentStore.getState().documents[0].type).toBe('w2');
    });

    test('sets error status on extraction failure', async () => {
      mockExtractPDF.mockRejectedValue(new Error('PDF is corrupted'));
      const file = createMockFile('bad.pdf', 512, 'application/pdf');

      let entry: DocumentEntry;
      act(() => {
        entry = useDocumentStore.getState().addDocument(file);
      });

      await processDocument(entry!.id, file);

      const doc = useDocumentStore.getState().documents[0];
      expect(doc.processingStatus).toBe('error');
      expect(doc.processingError).toBe('PDF is corrupted');
      // extractedText should still be empty
      expect(doc.extractedText).toBe('');
    });

    test('sets processing status to processing during extraction', async () => {
      // Use a deferred promise to control when extraction completes
      let resolveExtraction!: (text: string) => void;
      mockExtractPDF.mockImplementation(
        () => new Promise<string>((resolve) => { resolveExtraction = resolve; }),
      );
      const file = createMockFile('w2.pdf', 1024, 'application/pdf');

      let entry: DocumentEntry;
      act(() => {
        entry = useDocumentStore.getState().addDocument(file);
      });

      // Start processing (don't await)
      const promise = processDocument(entry!.id, file);

      // Status should be 'processing' while extraction is in-flight
      expect(useDocumentStore.getState().documents[0].processingStatus).toBe('processing');

      // Complete extraction
      resolveExtraction('Some text');
      await promise;

      expect(useDocumentStore.getState().documents[0].processingStatus).toBe('done');
    });

    test('passes progress callback to OCR extractor', async () => {
      mockExtractImage.mockResolvedValue('Some OCR text');
      const file = createMockFile('photo.png', 4096, 'image/png');
      const onProgress = jest.fn();

      let entry: DocumentEntry;
      act(() => {
        entry = useDocumentStore.getState().addDocument(file);
      });

      await processDocument(entry!.id, file, onProgress);

      expect(mockExtractImage).toHaveBeenCalledWith(file, onProgress);
    });

    test('handles spreadsheet files gracefully (not yet implemented)', async () => {
      const file = createMockFile('expenses.csv', 256, 'text/csv');

      let entry: DocumentEntry;
      act(() => {
        entry = useDocumentStore.getState().addDocument(file);
      });

      await processDocument(entry!.id, file);

      const doc = useDocumentStore.getState().documents[0];
      // Should complete without error even though parsing is not implemented
      expect(doc.processingStatus).toBe('done');
      expect(doc.processingError).toBeUndefined();
    });
  });

  describe('Document store processingStatus', () => {
    test('new documents start with processingStatus pending', () => {
      const file = createMockFile('w2.pdf', 1024, 'application/pdf');

      act(() => {
        useDocumentStore.getState().addDocument(file);
      });

      const doc = useDocumentStore.getState().documents[0];
      expect(doc.processingStatus).toBe('pending');
      expect(doc.processingError).toBeUndefined();
    });

    test('setProcessingStatus updates status and error', () => {
      const file = createMockFile('w2.pdf', 1024, 'application/pdf');

      let entry: DocumentEntry;
      act(() => {
        entry = useDocumentStore.getState().addDocument(file);
      });

      act(() => {
        useDocumentStore.getState().setProcessingStatus(entry!.id, 'error', 'Something went wrong');
      });

      const doc = useDocumentStore.getState().documents[0];
      expect(doc.processingStatus).toBe('error');
      expect(doc.processingError).toBe('Something went wrong');
    });
  });

  describe('FileList processing status display', () => {
    test('shows "Processing..." for documents being processed', () => {
      const files: DocumentEntry[] = [
        {
          id: '1',
          name: 'w2.pdf',
          size: 1024,
          mimeType: 'application/pdf',
          type: 'other',
          file: createMockFile('w2.pdf', 1024, 'application/pdf'),
          createdAt: new Date(),
          extractedText: '',
          piiDetections: [],
          verified: false,
          processingStatus: 'processing',
        },
      ];
      render(<FileList files={files} onRemove={jest.fn()} />);

      expect(screen.getByText('Processing...')).toBeInTheDocument();
    });

    test('shows "Text extracted" for completed documents', () => {
      const files: DocumentEntry[] = [
        {
          id: '1',
          name: 'w2.pdf',
          size: 1024,
          mimeType: 'application/pdf',
          type: 'w2',
          file: createMockFile('w2.pdf', 1024, 'application/pdf'),
          createdAt: new Date(),
          extractedText: 'Form W-2 data',
          piiDetections: [],
          verified: false,
          processingStatus: 'done',
        },
      ];
      render(<FileList files={files} onRemove={jest.fn()} />);

      expect(screen.getByText('Text extracted')).toBeInTheDocument();
    });

    test('shows "Extraction failed" for errored documents', () => {
      const files: DocumentEntry[] = [
        {
          id: '1',
          name: 'bad.pdf',
          size: 512,
          mimeType: 'application/pdf',
          type: 'other',
          file: createMockFile('bad.pdf', 512, 'application/pdf'),
          createdAt: new Date(),
          extractedText: '',
          piiDetections: [],
          verified: false,
          processingStatus: 'error',
          processingError: 'PDF is corrupted',
        },
      ];
      render(<FileList files={files} onRemove={jest.fn()} />);

      expect(screen.getByText('Extraction failed')).toBeInTheDocument();
    });

    test('shows no status text for pending documents', () => {
      const files: DocumentEntry[] = [
        {
          id: '1',
          name: 'w2.pdf',
          size: 1024,
          mimeType: 'application/pdf',
          type: 'other',
          file: createMockFile('w2.pdf', 1024, 'application/pdf'),
          createdAt: new Date(),
          extractedText: '',
          piiDetections: [],
          verified: false,
          processingStatus: 'pending',
        },
      ];
      render(<FileList files={files} onRemove={jest.fn()} />);

      const statusEl = screen.getByTestId('processing-status');
      expect(statusEl.textContent).toBe('');
    });
  });

  describe('DocumentsPage triggers processing', () => {
    test('uploading a PDF via DocumentsPage triggers pdfExtractor', async () => {
      // DocumentsPage calls processDocument, which (with our mocked extractors)
      // should route the PDF to extractTextFromPDF
      mockExtractPDF.mockResolvedValue('Form W-2 Wage and Tax Statement');

      const DocumentsPage = (await import('@selftax/web/pages/DocumentsPage')).default;

      render(
        <MemoryRouter>
          <DocumentsPage />
        </MemoryRouter>,
      );

      const input = screen.getByTestId('file-input');
      const file = createMockFile('w2.pdf', 1024, 'application/pdf');
      fireEvent.change(input, { target: { files: [file] } });

      // processDocument is async — wait for it to complete
      await act(async () => {
        // Flush microtasks so the async processDocument completes
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(mockExtractPDF).toHaveBeenCalledWith(file);
    });

    test('uploading an image via DocumentsPage triggers ocrExtractor', async () => {
      mockExtractImage.mockResolvedValue('Receipt Total: $50.00');

      const DocumentsPage = (await import('@selftax/web/pages/DocumentsPage')).default;

      render(
        <MemoryRouter>
          <DocumentsPage />
        </MemoryRouter>,
      );

      const input = screen.getByTestId('file-input');
      const file = createMockFile('receipt.jpg', 2048, 'image/jpeg');
      fireEvent.change(input, { target: { files: [file] } });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(mockExtractImage).toHaveBeenCalled();
    });
  });
});
