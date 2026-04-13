/**
 * PII Profile Extractor
 *
 * Orchestrates extraction of structured profile data (name, SSN, address,
 * etc.) from raw document text. This runs LOCALLY — extracted PII is
 * stored on disk and NEVER returned to the LLM.
 *
 * Sources:
 * - W-2 Box a (SSN), Box e (name), Box f (address), Box b (EIN)
 * - Prior year 1040 header (name, SSN, address, filing status)
 * - Prior year 1040 dependents section
 *
 * Section-level parsers live in piiFieldParsers.ts. This module
 * composes them and resolves conflicts (1040 wins over W-2).
 */

import { writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { SessionDocument } from './session.js';
import type { FilingStatus } from '@selftax/core';
import {
  extractPrimaryAndSpouseFrom1040 as parseHeader,
  extractDependentsFrom1040 as parseDependents,
  extractFilingStatusFrom1040 as parseFilingStatus,
  extractPrimaryFromW2 as parseW2,
  extractAddressFrom1040 as parseAddress1040,
} from './piiFieldParsers.js';

// Re-export the section parsers for direct use and testing
export {
  extractPrimaryAndSpouseFrom1040,
  extractDependentsFrom1040,
  extractFilingStatusFrom1040,
  extractPrimaryFromW2,
} from './piiFieldParsers.js';

/** Structured profile extracted from documents */
export interface ExtractedProfile {
  primaryFiler: {
    firstName?: string;
    lastName?: string;
    ssn?: string;
    address?: { street: string; city: string; state: string; zip: string };
  };
  spouse?: {
    firstName?: string;
    lastName?: string;
    ssn?: string;
  };
  dependents?: Array<{
    firstName?: string;
    lastName?: string;
    ssn?: string;
    relationship?: string;
  }>;
  employerEIN?: string;
  filingStatus?: FilingStatus;
  stateOfResidence?: string;
}

/**
 * Extract a structured PII profile from scanned session documents.
 *
 * This reads RAW (unredacted) text from documents and uses regex
 * to find SSN, names, addresses, and other PII. The result is
 * stored locally and NEVER returned to the LLM.
 *
 * Priority:
 * 1. Form 1040 (has everything: primary, spouse, dependents, filing status, address)
 * 2. W-2 (primary filer name, SSN, address, employer EIN, state)
 * 3. Fill gaps across document types
 */
export function extractProfileFromDocuments(
  documents: SessionDocument[],
): ExtractedProfile {
  const profile: ExtractedProfile = {
    primaryFiler: {},
  };

  // ── Process 1040 / prior year returns first (most complete) ──
  const returnDocs = documents.filter(
    (d) => /form\s*1040|U\.?S\.?\s*Individual\s*Income\s*Tax/i.test(d.rawText),
  );

  for (const doc of returnDocs) {
    const raw = doc.rawText;

    // DEBUG: write raw text lines around dependents to a file for diagnosis
    try {
      const debugLines = raw.split('\n');
      const debugOut: string[] = ['=== RAW TEXT DEPENDENTS AREA ==='];
      for (let i = 0; i < debugLines.length; i++) {
        if (/ELLIOT|DORIAN|[Dd]ependent|[Ss]ocial\s*[Ss]ecurity.*[Rr]elation/i.test(debugLines[i])) {
          for (let j = Math.max(0, i - 2); j < Math.min(debugLines.length, i + 3); j++) {
            // Mask SSNs for safety
            debugOut.push(j + ': ' + debugLines[j].replace(/(\d{3})-\d{2}-(\d{4})/g, '$1-**-$2'));
          }
          debugOut.push('---');
        }
      }
      debugOut.push('\n=== FILING STATUS AREA ===');
      for (let i = 0; i < debugLines.length; i++) {
        if (/[Ff]iling\s*[Ss]tatus|[Mm]arried|[Ss]ingle/.test(debugLines[i])) {
          debugOut.push(i + ': ' + debugLines[i]);
        }
      }
      writeFileSync(join(tmpdir(), '.debug-raw-text.txt'), debugOut.join('\n'));
    } catch { /* debug output is best-effort */ }

    // Filing status
    if (!profile.filingStatus) {
      profile.filingStatus = parseFilingStatus(raw);
    }

    // Primary + spouse from 1040 header
    const { primary, spouse } = parseHeader(raw);

    if (!profile.primaryFiler.firstName && primary.name) {
      profile.primaryFiler.firstName = primary.name.firstName;
      profile.primaryFiler.lastName = primary.name.lastName;
    }
    if (!profile.primaryFiler.ssn && primary.ssn) {
      profile.primaryFiler.ssn = primary.ssn;
    }

    if (!profile.spouse && (spouse.name || spouse.ssn)) {
      profile.spouse = {
        firstName: spouse.name?.firstName,
        lastName: spouse.name?.lastName,
        ssn: spouse.ssn,
      };
    }

    // Address from 1040
    if (!profile.primaryFiler.address) {
      profile.primaryFiler.address = parseAddress1040(raw);
    }

    // Dependents
    if (!profile.dependents || profile.dependents.length === 0) {
      const deps = parseDependents(raw);
      if (deps.length > 0) {
        profile.dependents = deps;
      }
    }

    // State of residence from address
    if (!profile.stateOfResidence && profile.primaryFiler.address?.state) {
      profile.stateOfResidence = profile.primaryFiler.address.state;
    }
  }

  // ── Process W-2s (fill gaps) ──
  const w2Docs = documents.filter((d) => d.documentType === 'w2');
  for (const doc of w2Docs) {
    const w2 = parseW2(doc.rawText);

    if (!profile.primaryFiler.ssn && w2.ssn) {
      profile.primaryFiler.ssn = w2.ssn;
    }
    if (!profile.primaryFiler.firstName && w2.name) {
      profile.primaryFiler.firstName = w2.name.firstName;
      profile.primaryFiler.lastName = w2.name.lastName;
    }
    if (!profile.primaryFiler.address && w2.address) {
      profile.primaryFiler.address = w2.address;
    }
    if (!profile.employerEIN && w2.ein) {
      profile.employerEIN = w2.ein;
    }
    if (!profile.stateOfResidence && w2.state) {
      profile.stateOfResidence = w2.state;
    }
  }

  return profile;
}

/**
 * Build a safe summary of the extracted profile for returning to the LLM.
 * Only first names, dependent count, and state are included — NO SSN,
 * NO last names, NO addresses.
 */
export function buildProfileSummary(profile: ExtractedProfile): string {
  const parts: string[] = [];

  if (profile.primaryFiler.firstName) {
    parts.push(`primary filer ${profile.primaryFiler.firstName}`);
  }
  if (profile.spouse?.firstName) {
    parts.push(`spouse ${profile.spouse.firstName}`);
  }
  if (profile.dependents && profile.dependents.length > 0) {
    parts.push(`${profile.dependents.length} dependent(s)`);
  }
  if (profile.stateOfResidence) {
    parts.push(`state ${profile.stateOfResidence}`);
  }
  if (profile.filingStatus) {
    parts.push(`filing status ${profile.filingStatus}`);
  }

  if (parts.length === 0) {
    return 'No PII profile data found in scanned documents.';
  }

  return `PII profile auto-saved: ${parts.join(', ')}.`;
}
