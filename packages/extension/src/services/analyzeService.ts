/**
 * Analyze Service — sends redacted documents to the SelfTax API server
 * and saves the result to chrome.storage for autofill.
 *
 * This is the bridge between the extension (browser) and the tax engine
 * (Node.js HTTP server). Only redacted text is sent — PII stays local.
 */

import type { DocumentType } from '@selftax/core';
import { tokenizePII, buildTokenProfile } from '@selftax/core';

async function getApiUrl(): Promise<string> {
  const stored = await chrome.storage.local.get('serverPort');
  const port = (stored.serverPort as number) ?? 3742;
  return `http://localhost:${port}`;
}

/** Profile sent to server — NO PII (no names, SSNs, or addresses) */
export interface AnalyzeProfile {
  filingStatus: string;
  stateOfResidence: string;
  dependentCount: number;
}

/** PII stored locally in chrome.storage — NEVER sent to server */
export interface LocalPII {
  primary: { firstName: string; lastName: string; ssn: string };
  spouse?: { firstName: string; lastName: string; ssn: string };
  address: { street: string; city: string; state: string; zip: string };
  dependents: Array<{
    firstName: string;
    lastName: string;
    ssn: string;
    relationship: string;
  }>;
  filingStatus: string;
  /** Auto-detected rental property addresses */
  rentalAddresses?: string[][];
  /** E-file signing fields */
  phone?: string;
  primaryDob?: string;   // MM/DD/YYYY
  spouseDob?: string;    // MM/DD/YYYY
  efilePin?: string;     // 5-digit chosen PIN
  spouseEfilePin?: string;
  priorYearAgi?: number; // from prior year return line 11
  /** Prior year self-select PINs (extracted from prior return Sign Here section) */
  priorYearPin?: string;
  spousePriorYearPin?: string;
  /** Direct deposit (from prior year return) */
  routingNumber?: string;
  accountNumber?: string;
  accountType?: 'checking' | 'savings';
}

export interface AnalyzeDocument {
  type: DocumentType;
  redactedText: string;
  fields: Record<string, string | number>;
  /** Raw file as base64 — for documents the browser couldn't extract */
  fileName?: string;
  fileData?: string;
}

export interface AnalyzeOverrides {
  rentalIncome?: number;
  scheduleE?: {
    grossRentalIncome?: number;
    insurance?: number;
    mortgageInterest?: number;
    repairs?: number;
    propertyTaxes?: number;
    depreciation?: number;
    otherExpenses?: number;
  };
  capitalLossCarryforward?: number;
  dependentCareExpenses?: number;
  qbiIncome?: number;
  estimatedPayments?: number;
}

export interface AnalyzeResult {
  taxReturn: unknown;
  fieldMaps: Record<string, Record<string, string | number>>;
  summary: {
    taxYear: number;
    name: string;
    filingStatus: string;
    refundOrOwed: number;
    isRefund: boolean;
    forms: string[];
    totalIncome: number;
    agi: number;
    totalTax: number;
  };
}

/**
 * Tokenize all document text using locally-stored PII.
 * Replaces names, SSNs, addresses with semantic tokens before sending to server.
 */
async function tokenizeDocuments(documents: AnalyzeDocument[]): Promise<AnalyzeDocument[]> {
  const stored = await chrome.storage.local.get('localPII');
  const pii = stored.localPII as LocalPII | undefined;
  if (!pii) return documents; // No PII to tokenize with

  const profile = buildTokenProfile({
    primary: pii.primary,
    spouse: pii.spouse,
    address: pii.address,
    dependents: pii.dependents,
    rentalAddresses: pii.rentalAddresses,
  });

  return documents.map((doc) => ({
    ...doc,
    redactedText: doc.redactedText ? tokenizePII(doc.redactedText, profile) : doc.redactedText,
  }));
}

/**
 * Send tokenized documents to the SelfTax API for analysis.
 * PII is replaced with tokens ([SELF], [HOME_ADDRESS], etc.) before sending.
 * Returns TaxReturnData + field maps ready for autofill.
 */
export async function analyzeDocuments(
  profile: AnalyzeProfile,
  documents: AnalyzeDocument[],
  overrides?: AnalyzeOverrides,
): Promise<AnalyzeResult> {
  // Tokenize PII before sending to server
  const tokenized = await tokenizeDocuments(documents);

  const apiUrl = await getApiUrl();
  const response = await fetch(`${apiUrl}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile, documents: tokenized, overrides }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Server error' }));
    throw new Error(err.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Recalculate using cached overrides — skips the extraction pipeline.
 * Use after server restart when field mappings change.
 */
export async function recalculate(): Promise<AnalyzeResult> {
  const apiUrl = await getApiUrl();
  const response = await fetch(`${apiUrl}/recalculate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Server error' }));
    throw new Error(err.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Check if the SelfTax API server is running.
 */
export async function checkServerHealth(): Promise<boolean> {
  try {
    const apiUrl = await getApiUrl();
    const res = await fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Save analysis result to chrome.storage for popup autofill.
 */
export function saveResultToStorage(result: AnalyzeResult): Promise<void> {
  return chrome.storage.local.set({
    taxReturn: result.taxReturn,
    fieldMaps: result.fieldMaps,
    savedReturn: result.summary,
  });
}

/**
 * Save PII locally — encrypts via vault if set up, otherwise stores plaintext.
 * NEVER sent to server.
 */
export async function savePIIToStorage(pii: LocalPII): Promise<void> {
  const { isUnlocked, savePII } = await import('./vaultManager');
  if (isUnlocked()) {
    await savePII(pii);
  } else {
    // Fallback for pre-vault or during initial setup before password is set
    await chrome.storage.local.set({ localPII: pii });
  }
}

/**
 * Merge locally-stored PII into field maps at autofill time.
 * The server returns field maps WITHOUT PII. This function adds
 * names, SSNs, and address from chrome.storage.
 */
export async function mergeFieldMapsWithPII(
  fieldMaps: Record<string, Record<string, string | number>>,
): Promise<Record<string, Record<string, string | number>>> {
  const stored = await chrome.storage.local.get('localPII');
  const pii = stored.localPII as LocalPII | undefined;
  if (!pii) return fieldMaps;

  const merged = { ...fieldMaps };
  if (merged.form1040) {
    const f = { ...merged.form1040 };

    // Primary filer
    f['pos:primaryFirstName'] = pii.primary.firstName;
    f['pos:primaryLastName'] = pii.primary.lastName;
    f['pos:primarySSN'] = pii.primary.ssn;

    // Spouse
    if (pii.spouse) {
      f['txtSpFirstName'] = pii.spouse.firstName;
      f['txtSpLastName'] = pii.spouse.lastName;
      f['txtSpSSN'] = pii.spouse.ssn;
    }

    // Address
    f['txtAddress1'] = pii.address.street;
    f['txtCity'] = pii.address.city;
    f['cboState'] = pii.address.state;
    f['txtZip'] = pii.address.zip;

    // Filing status: handled by content script (checkbox IDs are randomized per session)

    // Dependents
    for (let i = 0; i < pii.dependents.length && i < 4; i++) {
      const dep = pii.dependents[i];
      const n = i + 1;
      f[`txtDepFirstName${n}`] = dep.firstName;
      f[`txtDepLastName${n}`] = dep.lastName;
      f[`txtDepSSN${n}`] = dep.ssn;
      f[`cboDepRelation${n}`] = dep.relationship;
    }

    merged.form1040 = f;
  }

  return merged;
}
