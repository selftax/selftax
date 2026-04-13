/**
 * PDF.js Worker Setup
 *
 * Configures the pdfjs-dist web worker for use in the Vite/browser environment.
 * Import this file once in your app entry point (e.g., main.tsx) or before
 * calling any PDF extraction functions. In tests, mock pdfjs-dist instead.
 */

import { GlobalWorkerOptions } from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = pdfjsWorker;
