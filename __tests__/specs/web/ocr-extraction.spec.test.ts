/**
 * Spec: OCR Text Extraction (Tesseract.js)
 *
 * Status: active
 * Confirm: Image files uploaded by users are processed via Tesseract.js OCR
 *          in the browser, extracting text for downstream PII detection and
 *          document classification.
 * Invalidate: Tesseract.js cannot run in browser or worker initialization fails
 *
 * Covers:
 * - extractTextFromImage calls Tesseract recognize with the file
 * - Progress callback is forwarded during recognition
 * - Unreadable images / worker failures throw OCRExtractionError
 * - Worker is lazily initialized (created on first use, reused after)
 * - terminateOCRWorker cleans up the worker
 * - Error class has correct name for catch-by-type
 * - ocrExtractor.ts exists at the expected path
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import * as fs from 'fs';
import * as path from 'path';

// Mock tesseract.js entirely — no real OCR in unit tests
const mockRecognize = jest.fn();
const mockTerminate = jest.fn();
const mockSetParameters = jest.fn();

const mockWorker = {
  recognize: mockRecognize,
  terminate: mockTerminate,
  setParameters: mockSetParameters,
};

const mockCreateWorker = jest.fn();

jest.mock('tesseract.js', () => ({
  createWorker: mockCreateWorker,
}));

import {
  extractTextFromImage,
  terminateOCRWorker,
  OCRExtractionError,
  _resetWorkerState,
} from '@selftax/web/services/ocrExtractor';

/** Helper: create a mock image File */
function createMockImageFile(name = 'w2-photo.jpg'): File {
  return new File(['fake-image-bytes'], name, { type: 'image/jpeg' });
}

describe('OCR Text Extraction (Tesseract.js)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _resetWorkerState();
    mockCreateWorker.mockResolvedValue(mockWorker);
    mockRecognize.mockResolvedValue({
      data: { text: 'Form W-2 Wage and Tax Statement\nWages: $75,000.00\n' },
    });
    mockTerminate.mockResolvedValue({});
    mockSetParameters.mockResolvedValue({});
  });

  describe('File existence', () => {
    test('ocrExtractor.ts exists at the expected path', () => {
      const filePath = path.resolve(
        __dirname,
        '../../../packages/web/src/services/ocrExtractor.ts',
      );
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('ocrExtractor.ts imports from tesseract.js', () => {
      const filePath = path.resolve(
        __dirname,
        '../../../packages/web/src/services/ocrExtractor.ts',
      );
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('tesseract.js');
      expect(content).toContain('createWorker');
    });
  });

  describe('extractTextFromImage', () => {
    test('calls Tesseract recognize with the provided file', async () => {
      const file = createMockImageFile();
      await extractTextFromImage(file);

      expect(mockRecognize).toHaveBeenCalledWith(file);
    });

    test('returns extracted text from recognition result', async () => {
      const file = createMockImageFile();
      const text = await extractTextFromImage(file);

      expect(text).toContain('Form W-2');
      expect(text).toContain('Wages: $75,000.00');
    });

    test('returns empty string when image has no text', async () => {
      mockRecognize.mockResolvedValue({ data: { text: '' } });

      const file = createMockImageFile('blank.png');
      const text = await extractTextFromImage(file);

      expect(text).toBe('');
    });

    test('forwards progress callback during recognition', async () => {
      const progressValues: number[] = [];
      const onProgress = (p: number) => progressValues.push(p);

      // Capture the logger passed to createWorker
      mockCreateWorker.mockImplementation((_lang: any, _oem: any, opts: any) => {
        // Simulate logger calls during recognition
        if (opts?.logger) {
          opts.logger({ status: 'recognizing text', progress: 0.25, jobId: '', userJobId: '', workerId: '' });
          opts.logger({ status: 'recognizing text', progress: 0.5, jobId: '', userJobId: '', workerId: '' });
          opts.logger({ status: 'recognizing text', progress: 1.0, jobId: '', userJobId: '', workerId: '' });
          // Non-recognition status should not trigger progress
          opts.logger({ status: 'loading language traineddata', progress: 0.5, jobId: '', userJobId: '', workerId: '' });
        }
        return Promise.resolve(mockWorker);
      });

      const file = createMockImageFile();
      await extractTextFromImage(file, onProgress);

      expect(progressValues).toEqual([0.25, 0.5, 1.0]);
    });

    test('does not error when no progress callback is provided', async () => {
      const file = createMockImageFile();
      await expect(extractTextFromImage(file)).resolves.toBeDefined();
    });
  });

  describe('Worker lifecycle', () => {
    test('creates worker lazily on first call', async () => {
      expect(mockCreateWorker).not.toHaveBeenCalled();

      const file = createMockImageFile();
      await extractTextFromImage(file);

      expect(mockCreateWorker).toHaveBeenCalledTimes(1);
    });

    test('reuses worker on subsequent calls', async () => {
      const file = createMockImageFile();

      await extractTextFromImage(file);
      await extractTextFromImage(file);
      await extractTextFromImage(file);

      expect(mockCreateWorker).toHaveBeenCalledTimes(1);
      expect(mockRecognize).toHaveBeenCalledTimes(3);
    });

    test('creates worker with English language', async () => {
      const file = createMockImageFile();
      await extractTextFromImage(file);

      expect(mockCreateWorker).toHaveBeenCalledWith(
        'eng',
        undefined,
        expect.objectContaining({
          logger: expect.any(Function),
        }),
      );
    });
  });

  describe('terminateOCRWorker', () => {
    test('terminates an active worker', async () => {
      const file = createMockImageFile();
      await extractTextFromImage(file);

      await terminateOCRWorker();

      expect(mockTerminate).toHaveBeenCalledTimes(1);
    });

    test('is safe to call when no worker exists', async () => {
      // Should not throw
      await expect(terminateOCRWorker()).resolves.toBeUndefined();
      expect(mockTerminate).not.toHaveBeenCalled();
    });

    test('allows creating a new worker after termination', async () => {
      const file = createMockImageFile();

      await extractTextFromImage(file);
      await terminateOCRWorker();
      await extractTextFromImage(file);

      expect(mockCreateWorker).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error handling', () => {
    test('throws OCRExtractionError when worker initialization fails', async () => {
      mockCreateWorker.mockRejectedValue(new Error('Worker WASM load failed'));

      const file = createMockImageFile();

      await expect(extractTextFromImage(file)).rejects.toThrow(OCRExtractionError);
      await expect(extractTextFromImage(file)).rejects.toThrow(
        'Failed to initialize OCR worker',
      );
    });

    test('throws OCRExtractionError when recognition fails', async () => {
      mockRecognize.mockRejectedValue(new Error('Image decode error'));

      const file = createMockImageFile();

      await expect(extractTextFromImage(file)).rejects.toThrow(OCRExtractionError);
      await expect(extractTextFromImage(file)).rejects.toThrow(
        'OCR recognition failed',
      );
    });

    test('wraps non-Error throw values', async () => {
      mockRecognize.mockRejectedValue('string error');

      const file = createMockImageFile();

      await expect(extractTextFromImage(file)).rejects.toThrow(OCRExtractionError);
      await expect(extractTextFromImage(file)).rejects.toThrow('string error');
    });
  });

  describe('Error class identity', () => {
    test('OCRExtractionError has correct name', () => {
      const err = new OCRExtractionError();
      expect(err.name).toBe('OCRExtractionError');
      expect(err.message).toBe('Failed to extract text from image');
      expect(err instanceof Error).toBe(true);
    });

    test('OCRExtractionError accepts custom message', () => {
      const err = new OCRExtractionError('Custom OCR error');
      expect(err.message).toBe('Custom OCR error');
    });
  });
});
