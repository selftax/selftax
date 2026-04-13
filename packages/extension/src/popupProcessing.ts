/**
 * Popup processing bridge — loads @selftax/core functions and
 * exposes them on window for popup.js to use.
 *
 * Built as a separate Vite entry point, loaded as type="module" in popup.html.
 * This avoids chunk splitting issues with the classic popup.js script.
 */

import {
  detectDocumentType,
  extractStructuredFields,
  mergeStructuredExtractions,
  tokenizePII,
  buildTokenProfile,
  extractProfileFromTexts,
} from '@selftax/core';
import { calculateInBrowser } from './services/browserCalculator';
import { extractByLabelProximity, extractYearFromItems } from './services/labelExtractor';
import type { PositionedTextItem } from './services/labelExtractor';

// Expose on window for popup.js
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).selftaxCore = {
  detectDocumentType,
  extractStructuredFields,
  mergeStructuredExtractions,
  tokenizePII,
  buildTokenProfile,
  extractProfileFromTexts,
  calculateInBrowser,
  extractByLabelProximity,
  extractYearFromItems,
};
