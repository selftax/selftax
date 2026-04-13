/**
 * scan_tax_folder Tool
 *
 * Core document processing tool. Reads all supported files in a folder,
 * extracts text, strips PII, detects document types, parses fields,
 * and stores everything in the session.
 *
 * Returns redacted previews (first 500 chars) and sanitized fields
 * (SSN/EIN/name fields filtered out). Raw text is NEVER returned.
 */

import { readdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  detectPII,
  redactText,
  detectDocumentType,
  mapW2Fields,
  map1099INTFields,
  map1099DIVFields,
  map1099NECFields,
  map1099BFields,
  map1098Fields,
} from '@selftax/core';
import type { DocumentType, UserProfile } from '@selftax/core';
import type { Session, SessionDocument } from '../session.js';
import { addDocument } from '../session.js';
import { getMimeType, isSupportedExtension } from '../extraction/mimeTypes.js';
import { extractFile } from '../extraction/extractFile.js';
import {
  extractProfileFromDocuments,
  buildProfileSummary,
} from '../piiProfileExtractor.js';
import { saveProfileToFile } from '../profileStorage.js';
import { applyExtractedProfileToSession } from './setProfile.js';

/** Fields that contain PII and must not be returned to the LLM */
const PII_FIELD_KEYS = new Set([
  'employee_ssn',
  'employer_ein',
  'employee_name',
  'employer_name',
]);

export interface ScanTaxFolderInput {
  folderPath: string;
}

/** Summary of a processed document — safe to return to LLM */
interface DocumentSummary {
  id: string;
  fileName: string;
  documentType: DocumentType;
  piiDetectionsCount: number;
  redactedPreview: string;
  fields: Record<string, string | number>;
}

/**
 * Map document fields using the appropriate mapper.
 * Returns fields with PII keys filtered out.
 */
function extractFields(
  docType: DocumentType,
  rawText: string,
): Record<string, string | number> {
  let rawFields: Record<string, unknown>;

  switch (docType) {
    case 'w2':
      rawFields = { ...mapW2Fields(rawText) };
      break;
    case '1099-int':
      rawFields = { ...map1099INTFields(rawText) };
      break;
    case '1099-div':
      rawFields = { ...map1099DIVFields(rawText) };
      break;
    case '1099-nec':
      rawFields = { ...map1099NECFields(rawText) };
      break;
    case '1099-b':
      rawFields = { ...map1099BFields(rawText) };
      break;
    case '1098':
      rawFields = { ...map1098Fields(rawText) };
      break;
    default:
      return {};
  }

  // Filter out PII fields and non-primitive values
  const safeFields: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(rawFields)) {
    if (PII_FIELD_KEYS.has(key)) continue;
    if (typeof value === 'string' || typeof value === 'number') {
      safeFields[key] = value;
    }
  }

  return safeFields;
}

export async function handleScanTaxFolder(
  session: Session,
  input: ScanTaxFolderInput,
): Promise<CallToolResult> {
  const { folderPath } = input;

  // Read directory entries
  let entries: string[];
  try {
    entries = await readdir(folderPath);
  } catch (err) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: `Cannot read folder: ${err instanceof Error ? err.message : String(err)}`,
          }),
        },
      ],
      isError: true,
    };
  }

  // Filter to supported files
  const supportedFiles = entries.filter((name) => {
    const ext = extname(name);
    return isSupportedExtension(ext);
  });

  if (supportedFiles.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            message: 'No supported tax document files found in folder.',
            supportedTypes: [
              '.pdf', '.png', '.jpg', '.jpeg', '.heic',
              '.tiff', '.webp', '.xlsx', '.xls', '.csv',
            ],
          }),
        },
      ],
    };
  }

  // Build a partial UserProfile for PII detection from session profile
  const profileForPII: Partial<UserProfile> | undefined = session.profile
    ? {
        firstName: session.profile.firstName,
        lastName: session.profile.lastName,
        ssn: session.profile.ssn,
        address: session.profile.address,
      }
    : undefined;

  const summaries: DocumentSummary[] = [];
  const errors: Array<{ fileName: string; error: string }> = [];

  for (const fileName of supportedFiles) {
    const filePath = join(folderPath, fileName);
    const ext = extname(fileName);
    const mimeType = getMimeType(ext);
    if (!mimeType) continue;

    try {
      // 1. Extract text
      const extraction = await extractFile(filePath, mimeType);
      const rawText = extraction.text;

      // 2. Detect PII
      const piiDetections = detectPII(rawText, profileForPII);

      // 3. Redact text
      const redactedText = redactText(rawText, piiDetections);

      // 4. Detect document type
      const documentType = detectDocumentType(rawText);

      // 5. Extract and filter fields
      const fields = extractFields(documentType, rawText);

      // 6. Generate unique ID
      const id = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      // 7. Store in session (raw text stored, NEVER returned)
      const doc: SessionDocument = {
        id,
        fileName,
        mimeType,
        rawText,
        redactedText,
        piiDetections,
        fields,
        documentType,
        spreadsheetData: extraction.kind === 'spreadsheet' ? extraction.data : undefined,
      };
      addDocument(session, doc);

      // 8. Build summary with redacted preview
      summaries.push({
        id,
        fileName,
        documentType,
        piiDetectionsCount: piiDetections.length,
        redactedPreview: redactedText.slice(0, 500),
        fields,
      });
    } catch (err) {
      errors.push({
        fileName,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // --- Auto-extract PII profile from scanned documents ---
  // DEBUG: Write raw text of 1040 docs for diagnosis
  try {
    const { writeFileSync } = await import('fs');
    const allDocsDebug = Array.from(session.documents.values());
    const returnDoc = allDocsDebug.find(d => /form\s*1040|Individual\s*Income\s*Tax/i.test(d.rawText));
    if (returnDoc) {
      const lines = returnDoc.rawText.split('\n');
      const debugLines: string[] = ['FILE: ' + returnDoc.fileName, 'LINES: ' + lines.length, ''];
      for (let i = 0; i < Math.min(80, lines.length); i++) {
        const masked = lines[i].replace(/(\d{3})-\d{2}-(\d{4})/g, '$1-**-$2');
        debugLines.push(i + ': ' + masked.substring(0, 150));
      }
      writeFileSync(folderPath + '/.debug-raw-text.txt', debugLines.join('\n'));
    } else {
      const { writeFileSync: wf } = await import('fs');
      const info = allDocsDebug.map(d => d.fileName + ': has1040=' + /form\s*1040/i.test(d.rawText) + ' rawLen=' + d.rawText.length);
      wf(folderPath + '/.debug-raw-text.txt', 'NO 1040 FOUND\n' + info.join('\n'));
    }
  } catch { /* debug output is best-effort */ }

  let profileSummary: string | undefined;
  try {
    const allDocs = Array.from(session.documents.values());
    const extractedProfile = extractProfileFromDocuments(allDocs);

    // Save profile to disk (PII stays on user's machine)
    await saveProfileToFile(folderPath, extractedProfile);

    // Merge into session profile (auto-extracted values, won't overwrite manual set_profile)
    applyExtractedProfileToSession(session, extractedProfile);

    // Build a safe summary (first names only, no SSN/address/last name)
    profileSummary = buildProfileSummary(extractedProfile);
  } catch {
    // Profile extraction is best-effort — don't fail the scan
    profileSummary = 'PII profile auto-extraction failed (non-critical).';
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          processed: summaries.length,
          errors: errors.length,
          documents: summaries,
          ...(errors.length > 0 ? { processingErrors: errors } : {}),
          ...(profileSummary ? { profileStatus: profileSummary } : {}),
        }, null, 2),
      },
    ],
  };
}
