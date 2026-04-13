/**
 * Spec: PDF Text Extraction
 *
 * Status: hypothesis
 * Confirm: PDF files uploaded by users are parsed via pdfjs-dist and text
 *          content is extracted with spatial layout preserved.
 * Invalidate: pdfjs-dist cannot run in browser without WASM/worker issues
 *
 * Covers:
 * - extractTextFromPDF reads a PDF File and returns text content
 * - Multi-page PDFs produce text from all pages, separated by double newlines
 * - Text items are spatially ordered (top-to-bottom, left-to-right)
 * - Password-protected PDFs throw PasswordProtectedError
 * - Corrupted/invalid files throw InvalidPDFError
 * - pdfjs-dist worker config lives in a separate setup file (pdfWorkerSetup.ts)
 * - Error classes have correct names for catch-by-type
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import * as fs from 'fs';
import * as path from 'path';

// Mock pdfjs-dist entirely — no real PDF parsing in unit tests
jest.mock('pdfjs-dist', () => {
  return {
    getDocument: jest.fn(),
    GlobalWorkerOptions: { workerSrc: '' },
    InvalidPDFException: class InvalidPDFException extends Error {
      constructor(msg: string) {
        super(msg);
        this.name = 'InvalidPDFException';
      }
    },
  };
});

import {
  extractTextFromPDF,
  PasswordProtectedError,
  InvalidPDFError,
} from '@selftax/web/services/pdfExtractor';
import { getDocument } from 'pdfjs-dist';

const mockGetDocument = getDocument as jest.MockedFunction<typeof getDocument>;

/** Helper: build a mock TextItem */
function makeTextItem(
  str: string,
  x: number,
  y: number,
  opts?: { hasEOL?: boolean; width?: number; height?: number },
): any {
  return {
    str,
    dir: 'ltr',
    transform: [1, 0, 0, 1, x, y],
    width: opts?.width ?? str.length * 6,
    height: opts?.height ?? 12,
    fontName: 'g_d0_f1',
    hasEOL: opts?.hasEOL ?? false,
  };
}

/** Helper: create a mock PDF page with given text items */
function makeMockPage(items: any[]) {
  return {
    getTextContent: jest.fn().mockResolvedValue({
      items,
      styles: {},
      lang: null,
    }),
  };
}

/** Helper: create a mock PDF document */
function makeMockPDFDoc(pages: any[]) {
  return {
    numPages: pages.length,
    getPage: jest.fn((num: number) => Promise.resolve(pages[num - 1])),
  };
}

/** Helper: create a File from a string (simulates a PDF upload) */
function createMockFile(content: string, name = 'test.pdf'): File {
  return new File([content], name, { type: 'application/pdf' });
}

describe('PDF Text Extraction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Worker configuration', () => {
    test('pdfWorkerSetup.ts exists and imports GlobalWorkerOptions', () => {
      const setupPath = path.resolve(
        __dirname,
        '../../../packages/web/src/services/pdfWorkerSetup.ts',
      );
      expect(fs.existsSync(setupPath)).toBe(true);
      const content = fs.readFileSync(setupPath, 'utf-8');
      expect(content).toContain('GlobalWorkerOptions');
      expect(content).toContain('workerSrc');
    });

    test('pdfExtractor.ts does not configure the worker itself', () => {
      // Worker setup is a separate concern (pdfWorkerSetup.ts) so the
      // extractor can be tested without import.meta.url issues.
      const extractorPath = path.resolve(
        __dirname,
        '../../../packages/web/src/services/pdfExtractor.ts',
      );
      const content = fs.readFileSync(extractorPath, 'utf-8');
      expect(content).not.toContain('import.meta.url');
      expect(content).not.toContain('GlobalWorkerOptions');
    });
  });

  describe('extractTextFromPDF', () => {
    test('extracts text from a single-page PDF', async () => {
      const page = makeMockPage([
        makeTextItem('Form W-2', 50, 700),
        makeTextItem('Wage and Tax Statement', 50, 680),
        makeTextItem('Employer: Acme Corp', 50, 650),
        makeTextItem('Wages: $125,432.00', 50, 630),
      ]);

      const doc = makeMockPDFDoc([page]);
      mockGetDocument.mockReturnValue({ promise: Promise.resolve(doc) } as any);

      const file = createMockFile('fake-pdf-bytes');
      const text = await extractTextFromPDF(file);

      expect(text).toContain('Form W-2');
      expect(text).toContain('Wage and Tax Statement');
      expect(text).toContain('Wages: $125,432.00');
    });

    test('extracts text from multi-page PDFs with pages separated by double newlines', async () => {
      const page1 = makeMockPage([
        makeTextItem('Page 1 Content', 50, 700),
      ]);
      const page2 = makeMockPage([
        makeTextItem('Page 2 Content', 50, 700),
      ]);

      const doc = makeMockPDFDoc([page1, page2]);
      mockGetDocument.mockReturnValue({ promise: Promise.resolve(doc) } as any);

      const file = createMockFile('fake-pdf-bytes');
      const text = await extractTextFromPDF(file);

      expect(text).toContain('Page 1 Content');
      expect(text).toContain('Page 2 Content');
      // Pages separated by double newline
      expect(text).toBe('Page 1 Content\n\nPage 2 Content');
    });

    test('preserves spatial layout — items on the same line joined by spaces', async () => {
      const page = makeMockPage([
        // Two items on the same vertical line (y=700)
        makeTextItem('Label:', 50, 700),
        makeTextItem('$50,000', 300, 700),
        // A different line (y=680)
        makeTextItem('Taxes:', 50, 680),
        makeTextItem('$12,000', 300, 680),
      ]);

      const doc = makeMockPDFDoc([page]);
      mockGetDocument.mockReturnValue({ promise: Promise.resolve(doc) } as any);

      const file = createMockFile('fake-pdf-bytes');
      const text = await extractTextFromPDF(file);

      const lines = text.split('\n');
      expect(lines[0]).toContain('Label:');
      expect(lines[0]).toContain('$50,000');
      expect(lines[1]).toContain('Taxes:');
      expect(lines[1]).toContain('$12,000');
    });

    test('orders text top-to-bottom, left-to-right', async () => {
      const page = makeMockPage([
        // Deliberately out of order in the items array
        makeTextItem('Bottom', 50, 100),
        makeTextItem('Top', 50, 700),
        makeTextItem('Middle', 50, 400),
      ]);

      const doc = makeMockPDFDoc([page]);
      mockGetDocument.mockReturnValue({ promise: Promise.resolve(doc) } as any);

      const file = createMockFile('fake-pdf-bytes');
      const text = await extractTextFromPDF(file);

      const lines = text.split('\n');
      expect(lines[0]).toBe('Top');
      expect(lines[1]).toBe('Middle');
      expect(lines[2]).toBe('Bottom');
    });

    test('handles empty pages gracefully', async () => {
      const emptyPage = makeMockPage([]);
      const contentPage = makeMockPage([
        makeTextItem('Some content', 50, 700),
      ]);

      const doc = makeMockPDFDoc([emptyPage, contentPage]);
      mockGetDocument.mockReturnValue({ promise: Promise.resolve(doc) } as any);

      const file = createMockFile('fake-pdf-bytes');
      const text = await extractTextFromPDF(file);

      // Empty page is skipped, only content page text returned
      expect(text).toBe('Some content');
    });

    test('handles completely empty PDF', async () => {
      const doc = makeMockPDFDoc([makeMockPage([])]);
      mockGetDocument.mockReturnValue({ promise: Promise.resolve(doc) } as any);

      const file = createMockFile('fake-pdf-bytes');
      const text = await extractTextFromPDF(file);

      expect(text).toBe('');
    });

    test('skips whitespace-only text items', async () => {
      const page = makeMockPage([
        makeTextItem('Real content', 50, 700),
        makeTextItem('   ', 200, 700),
        makeTextItem('', 300, 700),
        makeTextItem('More content', 50, 680),
      ]);

      const doc = makeMockPDFDoc([page]);
      mockGetDocument.mockReturnValue({ promise: Promise.resolve(doc) } as any);

      const file = createMockFile('fake-pdf-bytes');
      const text = await extractTextFromPDF(file);

      expect(text).toBe('Real content\nMore content');
    });

    test('handles items with hasEOL flag', async () => {
      const page = makeMockPage([
        makeTextItem('Line one', 50, 700, { hasEOL: true }),
        makeTextItem('Line two', 50, 700, { hasEOL: false }),
      ]);

      const doc = makeMockPDFDoc([page]);
      mockGetDocument.mockReturnValue({ promise: Promise.resolve(doc) } as any);

      const file = createMockFile('fake-pdf-bytes');
      const text = await extractTextFromPDF(file);

      // hasEOL causes a line break
      expect(text).toContain('Line one');
      expect(text).toContain('Line two');
    });
  });

  describe('Error handling', () => {
    test('throws PasswordProtectedError for password-protected PDFs', async () => {
      const passwordError = new Error('No password given');
      passwordError.name = 'PasswordException';
      mockGetDocument.mockReturnValue({
        promise: Promise.reject(passwordError),
      } as any);

      const file = createMockFile('encrypted-pdf-bytes');

      await expect(extractTextFromPDF(file)).rejects.toThrow(PasswordProtectedError);
      await expect(extractTextFromPDF(file)).rejects.toThrow('PDF is password-protected');
    });

    test('throws InvalidPDFError for corrupted/invalid files', async () => {
      // Import the mocked InvalidPDFException
      const { InvalidPDFException } = jest.requireMock('pdfjs-dist');
      const invalidError = new InvalidPDFException('Invalid PDF structure');
      mockGetDocument.mockReturnValue({
        promise: Promise.reject(invalidError),
      } as any);

      const file = createMockFile('not-a-pdf');

      await expect(extractTextFromPDF(file)).rejects.toThrow(InvalidPDFError);
      await expect(extractTextFromPDF(file)).rejects.toThrow('File is not a valid PDF');
    });

    test('wraps unknown errors with a descriptive message', async () => {
      mockGetDocument.mockReturnValue({
        promise: Promise.reject(new Error('Network timeout')),
      } as any);

      const file = createMockFile('some-bytes');

      await expect(extractTextFromPDF(file)).rejects.toThrow('Failed to load PDF: Network timeout');
    });

    test('passes PDF data as Uint8Array to getDocument', async () => {
      const doc = makeMockPDFDoc([makeMockPage([])]);
      mockGetDocument.mockReturnValue({ promise: Promise.resolve(doc) } as any);

      const file = createMockFile('pdf-data');
      await extractTextFromPDF(file);

      expect(mockGetDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.any(Uint8Array),
        }),
      );
    });
  });

  describe('Error class identity', () => {
    test('PasswordProtectedError has correct name', () => {
      const err = new PasswordProtectedError();
      expect(err.name).toBe('PasswordProtectedError');
      expect(err.message).toBe('PDF is password-protected');
      expect(err instanceof Error).toBe(true);
    });

    test('InvalidPDFError has correct name', () => {
      const err = new InvalidPDFError();
      expect(err.name).toBe('InvalidPDFError');
      expect(err.message).toBe('File is not a valid PDF');
      expect(err instanceof Error).toBe(true);
    });

    test('PasswordProtectedError accepts custom message', () => {
      const err = new PasswordProtectedError('Custom password message');
      expect(err.message).toBe('Custom password message');
    });

    test('InvalidPDFError accepts custom message', () => {
      const err = new InvalidPDFError('Custom invalid message');
      expect(err.message).toBe('Custom invalid message');
    });
  });
});
