/**
 * OCR Text Extraction Service
 *
 * Uses Tesseract.js to extract text from uploaded image files in the browser.
 * Images of W-2s, 1099s, receipts, etc. are processed entirely client-side —
 * no image data is ever sent to a server.
 *
 * The Tesseract worker is created lazily on first use and reused for
 * subsequent calls. Call terminateOCRWorker() to free resources when done.
 */

import { createWorker, type Worker, type LoggerMessage } from 'tesseract.js';

/** Error thrown when OCR fails to extract text from an image */
export class OCRExtractionError extends Error {
  constructor(message = 'Failed to extract text from image') {
    super(message);
    this.name = 'OCRExtractionError';
  }
}

let workerInstance: Worker | null = null;
let workerInitializing: Promise<Worker> | null = null;

/**
 * Get or create the shared Tesseract worker.
 * Uses a lock (workerInitializing promise) to prevent multiple simultaneous
 * worker creations if called concurrently.
 */
async function getWorker(
  logger?: (msg: LoggerMessage) => void,
): Promise<Worker> {
  if (workerInstance) return workerInstance;

  if (workerInitializing) return workerInitializing;

  workerInitializing = createWorker('eng', undefined, {
    logger: logger ?? (() => {}),
  });

  try {
    workerInstance = await workerInitializing;
    return workerInstance;
  } catch (err) {
    workerInitializing = null;
    throw err;
  }
}

/**
 * Extract text from an image file using Tesseract.js OCR.
 *
 * @param file - The image File object from user upload
 * @param onProgress - Optional callback receiving progress (0-1) during recognition
 * @returns The extracted text content
 * @throws {OCRExtractionError} If OCR fails for any reason
 */
export async function extractTextFromImage(
  file: File,
  onProgress?: (progress: number) => void,
): Promise<string> {
  const logger = onProgress
    ? (msg: LoggerMessage) => {
        if (msg.status === 'recognizing text') {
          onProgress(msg.progress);
        }
      }
    : undefined;

  let worker: Worker;
  try {
    worker = await getWorker(logger);
  } catch (err) {
    throw new OCRExtractionError(
      `Failed to initialize OCR worker: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Update the logger for this recognition call if a progress callback was provided
  if (logger) {
    await worker.setParameters({});
  }

  try {
    const result = await worker.recognize(file);
    return result.data.text;
  } catch (err) {
    throw new OCRExtractionError(
      `OCR recognition failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Terminate the shared Tesseract worker and free resources.
 * Safe to call even if no worker has been created.
 */
export async function terminateOCRWorker(): Promise<void> {
  if (workerInitializing) {
    try {
      await workerInitializing;
    } catch {
      // Worker failed to initialize — nothing to terminate
    }
  }

  if (workerInstance) {
    await workerInstance.terminate();
    workerInstance = null;
  }

  workerInitializing = null;
}

/**
 * Reset internal state (for testing only).
 * @internal
 */
export function _resetWorkerState(): void {
  workerInstance = null;
  workerInitializing = null;
}
