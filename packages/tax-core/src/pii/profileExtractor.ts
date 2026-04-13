/**
 * Profile Extractor — pure regex parsing to extract structured profile
 * data (name, SSN, address, spouse, dependents, filing status) from
 * tax document text.
 *
 * Runs entirely in the browser or Node.js — no network calls, no LLM.
 * Sources: W-2 (box a/e/f), 1040 header (name, SSN, spouse, dependents).
 */

import type { FilingStatus } from '../engine/taxConstants';

export interface ExtractedProfile {
  primary: {
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
  dependents: Array<{
    firstName?: string;
    lastName?: string;
    ssn?: string;
    relationship?: string;
  }>;
  filingStatus?: FilingStatus;
  stateOfResidence?: string;
}

// ── Regex constants ──────────────────────────────────────────────

const SSN_RE = /\b(\d{3}-\d{2}-\d{4})\b/;
const SSN_RE_G = /\b(\d{3}-\d{2}-\d{4})\b/g;

const ALL_CAPS_NAME_RE = /([A-Z]{2,})\s+(?:[A-Z]\.?\s+)?([A-Z]{2,})/;
const NAME_RE = /([A-Z][A-Za-z'-]+)\s+(?:[A-Z]\.?\s+)?([A-Z][A-Za-z'-]+)/;

const RELATIONSHIP_RE =
  /\b(son|daughter|child|stepson|stepdaughter|foster\s*child|parent|sibling|brother|sister|niece|nephew|grandchild|other)\b/i;

/** Words that regex matches as names but aren't actual person names */
const NAME_BLOCKLIST = new Set([
  'form', 'schedule', 'department', 'attach', 'see', 'the', 'for',
  'tax', 'irs', 'omb', 'use', 'not', 'and', 'your', 'this',
  'internal', 'revenue', 'service', 'treasury', 'return', 'income',
  'corrected', 'void', 'recipient', 'payer', 'borrower', 'lender',
]);

// ── Helpers ──────────────────────────────────────────────────────

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function parseName(raw: string): { firstName: string; lastName: string } | undefined {
  const m = raw.match(ALL_CAPS_NAME_RE) || raw.match(NAME_RE);
  if (!m) return undefined;
  const first = m[1], last = m[2];
  // Filter out false positives like "Form W-", "Schedule D", "Department Of"
  if (NAME_BLOCKLIST.has(first.toLowerCase()) || NAME_BLOCKLIST.has(last.toLowerCase())) return undefined;
  if (last.length <= 1 || first.length <= 1) return undefined; // "W-" etc
  return { firstName: titleCase(first), lastName: titleCase(last) };
}

function findSSNFrom(lines: string[], start: number, max = 4): string | undefined {
  for (let i = start; i < Math.min(start + max, lines.length); i++) {
    const m = lines[i].match(SSN_RE);
    if (m) return m[1];
  }
  return undefined;
}

function findNameFrom(lines: string[], start: number, max = 4) {
  for (let i = start; i < Math.min(start + max, lines.length); i++) {
    const name = parseName(lines[i]);
    if (name) return { ...name, lineIdx: i };
  }
  return undefined;
}

function parseAddress(lines: string[], start: number) {
  for (let j = 0; j <= 5 && start + j < lines.length; j++) {
    const line = lines[start + j].trim();
    const inline = line.match(
      /(\d+\s+[A-Za-z0-9\s.#-]+?),\s*([A-Za-z\s]+?)[,\s]+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/,
    );
    if (inline) {
      return { street: inline[1].trim(), city: inline[2].trim(), state: inline[3], zip: inline[4] };
    }
    const streetMatch = line.match(
      /^(\d+\s+[A-Za-z0-9\s.#-]+(?:St|Ave|Blvd|Dr|Ln|Rd|Ct|Way|Pl|Cir|Pkwy|Terr?|Loop)[.\s]*)/i,
    );
    if (streetMatch) {
      const street = streetMatch[1].trim();
      const rest = line.slice(streetMatch[0].length) ||
        (start + j + 1 < lines.length ? lines[start + j + 1].trim() : '');
      const csz = rest.match(/([A-Za-z\s]+?)[,\s]+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/);
      if (csz) return { street, city: csz[1].trim(), state: csz[2], zip: csz[3] };
    }
  }
  return undefined;
}

// ── 1040 parsers ─────────────────────────────────────────────────

function extractFrom1040(raw: string, profile: ExtractedProfile): void {
  const lines = raw.split('\n');

  // Primary + spouse names/SSNs
  let primaryIdx = -1, spouseIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    if (primaryIdx < 0 && /your\s+(first\s+)?name/.test(lower)) primaryIdx = i;
    if (spouseIdx < 0 && /spouse/.test(lower) && /name/.test(lower)) spouseIdx = i;
  }

  if (primaryIdx >= 0) {
    // Strategy: find ALL_CAPS name near SSN on or after the label line
    // The PDF often puts "Your first name...Last name...SSN JANE DOE 000-00-1234" on one line
    const searchText = lines.slice(primaryIdx, Math.min(primaryIdx + 5, lines.length)).join(' ');
    // Find name right before an SSN pattern (most reliable for 1040)
    // Also match partial SSNs (e.g., "613-40-59" from truncated PDF fields)
    const nameBeforeSSN = searchText.match(/([A-Z]{2,})\s+(?:[A-Z]\.?\s+)?([A-Z]{2,})\s+\d{3}-\d{2}-\d{2,4}/);
    if (nameBeforeSSN && !NAME_BLOCKLIST.has(nameBeforeSSN[1].toLowerCase())) {
      profile.primary.firstName = titleCase(nameBeforeSSN[1]);
      profile.primary.lastName = titleCase(nameBeforeSSN[2]);
    } else {
      const found = findNameFrom(lines, primaryIdx + 1, 5);
      if (found) { profile.primary.firstName = found.firstName; profile.primary.lastName = found.lastName; }
    }
    if (!profile.primary.ssn) profile.primary.ssn = findSSNFrom(lines, primaryIdx, 5);
  }

  if (spouseIdx >= 0) {
    const spouseLine = lines[spouseIdx];
    // Find text AFTER the spouse label on the same line
    const afterLabel = spouseLine.replace(/.*(?:spouse|spouse's).*(?:name|number)\b/i, '');
    const searchText = afterLabel + ' ' + lines.slice(spouseIdx + 1, Math.min(spouseIdx + 5, lines.length)).join(' ');
    // Find first NAME SSN pattern that isn't the primary filer
    const allMatches = [...searchText.matchAll(/([A-Z]{2,})\s+(?:[A-Z]\.?\s+)?([A-Z]{2,})\s+(\d{3}-\d{2}-\d{4})/g)];
    const spouse = { firstName: undefined as string | undefined, lastName: undefined as string | undefined, ssn: undefined as string | undefined };
    for (const m of allMatches) {
      if (m[3] === profile.primary.ssn) continue; // skip primary
      if (NAME_BLOCKLIST.has(m[1].toLowerCase())) continue;
      spouse.firstName = titleCase(m[1]);
      spouse.lastName = titleCase(m[2]);
      spouse.ssn = m[3];
      break;
    }
    if (!spouse.ssn) spouse.ssn = findSSNFrom(lines, spouseIdx, 5);
    if (spouse.firstName || spouse.ssn) profile.spouse = spouse;
  }

  // Address — try label-based first, then scan for street pattern near city/state/zip
  if (!profile.primary.address) {
    for (let i = 0; i < lines.length; i++) {
      if (/(?:home\s*address|present.*address|number.*street)/i.test(lines[i])) {
        const addr = parseAddress(lines, i);
        if (addr) { profile.primary.address = addr; break; }
      }
    }
  }
  // Fallback: look for address near "Home address" or "Apt" labels in full text
  if (!profile.primary.address) {
    const fullText = lines.join(' ');
    // Find text after "Home address" or "Apt" label
    const afterHome = fullText.match(/(?:Home\s*address|Apt\.?\s*no)[^]*?(\d+\s+[A-Z][A-Za-z0-9\s.#-]+?(?:Ave|St|Blvd|Dr|Ln|Rd|Ct|Way|Pl|Cir|Pkwy|Terr?))\b/i);
    if (afterHome) {
      const street = afterHome[1].trim();
      const afterStreet = fullText.slice(fullText.indexOf(street) + street.length);
      const csz = afterStreet.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+([A-Z]{2})\s+(\d{5})/);
      if (csz) {
        profile.primary.address = { street, city: csz[1].trim(), state: csz[2], zip: csz[3] };
      }
    }
  }

  // Filing status
  if (!profile.filingStatus) {
    const lower = raw.toLowerCase();
    if (/filing\s*status.*married\s*filing\s*joint/i.test(lower) ||
        /x\s*married\s*filing\s*joint/i.test(lower)) profile.filingStatus = 'mfj';
    else if (/filing\s*status.*single/i.test(lower)) profile.filingStatus = 'single';
    else if (/filing\s*status.*head\s*of\s*household/i.test(lower)) profile.filingStatus = 'hoh';
    else if (/filing\s*status.*married\s*filing\s*separate/i.test(lower)) profile.filingStatus = 'mfs';

    // Check for "X Married filing jointly" pattern
    if (!profile.filingStatus) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const prev = i > 0 ? lines[i - 1].trim() : '';
        const isChecked = /^[xX✓✔☑]\s/.test(line) || /[xX✓✔☑]\s*$/.test(prev);
        if (isChecked) {
          if (/married\s*filing\s*joint/i.test(line)) { profile.filingStatus = 'mfj'; break; }
          if (/single/i.test(line) && !/married/i.test(line)) { profile.filingStatus = 'single'; break; }
          if (/head\s*of\s*household/i.test(line)) { profile.filingStatus = 'hoh'; break; }
        }
      }
    }
  }

  // Dependents
  if (profile.dependents.length === 0) {
    let sectionStart = -1;
    for (let i = 0; i < lines.length; i++) {
      const lower = lines[i].toLowerCase();
      // Match the actual dependents header row, not generic "dependent" mentions
      // e.g., "Dependents (see instructions): (2) Social security (3) Relationship"
      if (/dependents?\s*\(/i.test(lower) &&
          (/social\s*security/i.test(lower) || /relationship/i.test(lower))) {
        sectionStart = i; break;
      }
    }
    if (sectionStart >= 0) {
      const preSSNs = new Set<string>();
      for (let i = 0; i < sectionStart; i++) {
        for (const m of lines[i].matchAll(SSN_RE_G)) preSSNs.add(m[1]);
      }

      let i = sectionStart + 1;
      while (i < lines.length) {
        const line = lines[i].trim();
        if (/^(income|wages|adjusted|standard|deduction|sign|total|page\s*\d)/i.test(line)) break;
        if (!line || (/^\(?\s*[a-d]\)?\s/i.test(line) && !/[A-Z]{2,}\s+[A-Z]{2,}/.test(line))) { i++; continue; }

        const allOnOne = line.match(/([A-Z][A-Za-z'-]+)\s+([A-Z][A-Za-z'-]+)\s+(\d{3}-\d{2}-\d{4})\s*(.*)/);
        if (allOnOne) {
          const rel = allOnOne[4].match(RELATIONSHIP_RE);
          profile.dependents.push({
            firstName: titleCase(allOnOne[1]), lastName: titleCase(allOnOne[2]),
            ssn: allOnOne[3], relationship: rel?.[1].toUpperCase(),
          });
          i++; continue;
        }

        const nameOnLine = parseName(line);
        if (nameOnLine) {
          const dep: ExtractedProfile['dependents'][number] = { firstName: nameOnLine.firstName, lastName: nameOnLine.lastName };
          const ssnM = line.match(SSN_RE); if (ssnM) dep.ssn = ssnM[1];
          const relM = line.match(RELATIONSHIP_RE); if (relM) dep.relationship = relM[1].toUpperCase();
          for (let j = 1; j <= 3 && i + j < lines.length; j++) {
            const next = lines[i + j].trim();
            if (!dep.ssn) { const sm = next.match(SSN_RE); if (sm) dep.ssn = sm[1]; }
            if (!dep.relationship) { const rm = next.match(RELATIONSHIP_RE); if (rm) dep.relationship = rm[1].toUpperCase(); }
            if (dep.ssn && dep.relationship) break;
          }
          if (!dep.ssn || !preSSNs.has(dep.ssn)) profile.dependents.push(dep);
          i++; continue;
        }
        i++;
      }
    }
  }

  // Dependents fallback: scan for NAME SSN Relationship pattern in full text
  if (profile.dependents.length === 0) {
    const fullText = lines.join(' ');
    // Collect primary + spouse SSNs to exclude
    const knownSSNs = new Set<string>();
    if (profile.primary.ssn) knownSSNs.add(profile.primary.ssn);
    if (profile.spouse?.ssn) knownSSNs.add(profile.spouse.ssn);

    const depPattern = /([A-Z]{2,})\s+([A-Z]{2,})\s+(\d{3}-\d{2}-\d{4})\s+(?:[A-Z]\.?\s+)?(Daughter|Son|Child|Stepson|Stepdaughter|Foster|Other)/gi;
    let match;
    while ((match = depPattern.exec(fullText)) !== null) {
      if (knownSSNs.has(match[3])) continue;
      if (NAME_BLOCKLIST.has(match[1].toLowerCase())) continue;
      profile.dependents.push({
        firstName: titleCase(match[1]),
        lastName: titleCase(match[2]),
        ssn: match[3],
        relationship: match[4].toUpperCase(),
      });
    }
  }

  // State from address
  if (!profile.stateOfResidence && profile.primary.address?.state) {
    profile.stateOfResidence = profile.primary.address.state;
  }
}

// ── W-2 parser ───────────────────────────────────────────────────

function extractFromW2(raw: string, profile: ExtractedProfile): void {
  const lines = raw.split('\n');

  // SSN
  if (!profile.primary.ssn) {
    const m = raw.match(SSN_RE);
    if (m) profile.primary.ssn = m[1];
  }

  // Name (Box e)
  if (!profile.primary.firstName) {
    for (let i = 0; i < lines.length; i++) {
      if (/(?:box\s*e\b|employee.*(?:first\s*)?name|e\s+employee)/i.test(lines[i])) {
        const after = lines[i].replace(/^.*?(?:name|employee)[^:]*:?\s*/i, '');
        const name = parseName(after) || findNameFrom(lines, i + 1, 3);
        if (name) { profile.primary.firstName = name.firstName; profile.primary.lastName = name.lastName; break; }
      }
    }
  }

  // Address (Box f)
  if (!profile.primary.address) {
    for (let i = 0; i < lines.length; i++) {
      if (/(?:box\s*f\b|employee.*address|f\s+employee)/i.test(lines[i])) {
        const addr = parseAddress(lines, i);
        if (addr) { profile.primary.address = addr; break; }
      }
    }
  }

  // State (Box 15)
  if (!profile.stateOfResidence) {
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/(?:box\s*15|15\s+state|state\s*(?:employer)?)[:\s]*([A-Z]{2})\b/i);
      if (m) { profile.stateOfResidence = m[1].toUpperCase(); break; }
    }
  }
}

// ── Main entry point ─────────────────────────────────────────────

/**
 * Extract a structured profile from document text.
 * Pass an array of { text, type } where type is the document classification.
 * Runs entirely locally — pure regex, no network calls.
 */
export function extractProfileFromTexts(
  documents: Array<{ text: string; type: string }>,
): ExtractedProfile {
  const profile: ExtractedProfile = { primary: {}, dependents: [] };

  // Process 1040 / prior year returns first (most complete)
  const returns = documents.filter(
    (d) => /form\s*1040|U\.?S\.?\s*Individual\s*Income\s*Tax/i.test(d.text),
  );
  for (const doc of returns) extractFrom1040(doc.text, profile);

  // Process W-2s (fill gaps)
  const w2s = documents.filter((d) => d.type === 'w2');
  for (const doc of w2s) extractFromW2(doc.text, profile);

  // Last resort: scan all docs for SSN if still missing
  if (!profile.primary.ssn) {
    for (const doc of documents) {
      const m = doc.text.match(SSN_RE);
      if (m) { profile.primary.ssn = m[1]; break; }
    }
  }

  // Normalize whitespace in all string fields (PDF extraction produces extra spaces)
  const norm = (s: string | undefined) => s?.replace(/\s+/g, ' ').trim();
  if (profile.primary.firstName) profile.primary.firstName = norm(profile.primary.firstName)!;
  if (profile.primary.lastName) profile.primary.lastName = norm(profile.primary.lastName)!;
  if (profile.primary.address) {
    profile.primary.address.street = norm(profile.primary.address.street) ?? '';
    profile.primary.address.city = norm(profile.primary.address.city) ?? '';
  }
  if (profile.spouse) {
    if (profile.spouse.firstName) profile.spouse.firstName = norm(profile.spouse.firstName)!;
    if (profile.spouse.lastName) profile.spouse.lastName = norm(profile.spouse.lastName)!;
  }
  for (const dep of profile.dependents) {
    if (dep.firstName) dep.firstName = norm(dep.firstName)!;
    if (dep.lastName) dep.lastName = norm(dep.lastName)!;
  }

  return profile;
}
