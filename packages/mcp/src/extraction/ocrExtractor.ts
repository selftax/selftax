/**
 * OCR Text Extraction for Node.js
 *
 * Uses Tesseract.js to extract text from image files on disk.
 * In Node.js, tesseract.js accepts file paths directly (no need to
 * read the file into memory first).
 *
 * Port of packages/web/src/services/ocrExtractor.ts adapted for Node.js.
 * The worker is created lazily on first use and reused for subsequent calls.
 */

import { createWorker, type Worker } from 'tesseract.js';

let workerInstance: Worker | null = null;
let workerInitializing: Promise<Worker> | null = null;

/** Get or create the shared Tesseract worker. */
async function getWorker(): Promise<Worker> {
  if (workerInstance) return workerInstance;
  if (workerInitializing) return workerInitializing;

  workerInitializing = createWorker('eng');

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
 * @param filePath - Absolute path to the image file
 * @returns The extracted text content
 */
export async function extractTextFromImage(filePath: string): Promise<string> {
  const worker = await getWorker();
  const result = await worker.recognize(filePath);
  return result.data.text;
}

/** Terminate the shared Tesseract worker and free resources. */
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
