/**
 * Extension-to-MIME type map for supported tax document file types.
 * Used by scanTaxFolder to determine how to process each file.
 */

const EXTENSION_TO_MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.heic': 'image/heic',
  '.tiff': 'image/tiff',
  '.webp': 'image/webp',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.csv': 'text/csv',
};

/** Get MIME type from a file extension (including the dot). Returns undefined if not supported. */
export function getMimeType(ext: string): string | undefined {
  return EXTENSION_TO_MIME[ext.toLowerCase()];
}

/** Get all supported file extensions */
export function getSupportedExtensions(): string[] {
  return Object.keys(EXTENSION_TO_MIME);
}

/** Check if a file extension is supported */
export function isSupportedExtension(ext: string): boolean {
  return ext.toLowerCase() in EXTENSION_TO_MIME;
}
