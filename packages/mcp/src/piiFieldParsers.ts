/**
 * PII Field Parsers
 *
 * Low-level parsers for extracting structured PII fields from specific
 * sections of tax documents (1040 header, dependents table, W-2 boxes).
 *
 * These run LOCALLY — extracted PII is stored on disk and NEVER
 * returned to the LLM.
 *
 * Parsing strategy: Tax forms have STRUCTURED layouts where fields
 * appear in predictable order. We parse by section/position rather
 * than relying on labels appearing on the same line as values.
 */

import type { FilingStatus } from '@selftax/core';

// ── Regex constants ──────────────────────────────────────────────

const SSN_RE = /\b(\d{3}-\d{2}-\d{4})\b/;
const SSN_RE_G = /\b(\d{3}-\d{2}-\d{4})\b/g;
const EIN_RE = /\b(\d{2}-\d{7})\b/;

/** Matches a name in ALL CAPS or Title Case (at least 2 chars each) */
const NAME_RE = /([A-Z][A-Za-z'-]+)\s+(?:[A-Z]\.?\s+)?([A-Z][A-Za-z'-]+)/;
const ALL_CAPS_NAME_RE = /([A-Z]{2,})\s+(?:[A-Z]\.?\s+)?([A-Z]{2,})/;

const RELATIONSHIP_RE =
  /\b(son|daughter|child|stepson|stepdaughter|foster\s*child|parent|sibling|brother|sister|niece|nephew|grandchild|other)\b/i;

// ── Utility helpers ──────────────────────────────────────────────

/** Capitalize first letter, lowercase rest */
function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/** Parse a "FIRST LAST" or "FIRST M LAST" string into {firstName, lastName} */
function parseName(
  raw: string,
): { firstName: string; lastName: string } | undefined {
  const m = raw.match(ALL_CAPS_NAME_RE) || raw.match(NAME_RE);
  if (!m) return undefined;
  return { firstName: titleCase(m[1]), lastName: titleCase(m[2]) };
}

/** Find the first SSN on or after a given line index */
function findSSNFrom(
  lines: string[],
  startIdx: number,
  maxLines = 4,
): string | undefined {
  for (
    let i = startIdx;
    i < Math.min(startIdx + maxLines, lines.length);
    i++
  ) {
    const m = lines[i].match(SSN_RE);
    if (m) return m[1];
  }
  return undefined;
}

/** Find a name (ALL CAPS or Title Case) on or after a given line index */
function findNameFrom(
  lines: string[],
  startIdx: number,
  maxLines = 4,
): { firstName: string; lastName: string; lineIdx: number } | undefined {
  for (
    let i = startIdx;
    i < Math.min(startIdx + maxLines, lines.length);
    i++
  ) {
    const name = parseName(lines[i]);
    if (name) return { ...name, lineIdx: i };
  }
  return undefined;
}

// ── Address parser ───────────────────────────────────────────────

export function parseAddress(
  lines: string[],
  startIdx: number,
): { street: string; city: string; state: string; zip: string } | undefined {
  for (let j = 0; j <= 5 && startIdx + j < lines.length; j++) {
    const line = lines[startIdx + j].trim();

    // Pattern A: "123 Main St, Springfield, IL 62704" (all on one line)
    const inlineMatch = line.match(
      /(\d+\s+[A-Za-z0-9\s.#-]+?),\s*([A-Za-z\s]+?)[,\s]+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/,
    );
    if (inlineMatch) {
      return {
        street: inlineMatch[1].trim(),
        city: inlineMatch[2].trim(),
        state: inlineMatch[3],
        zip: inlineMatch[4],
      };
    }

    // Pattern B: Street on one line, city/state/zip on next
    const streetMatch = line.match(
      /^(\d+\s+[A-Za-z0-9\s.#-]+(?:St|Ave|Blvd|Dr|Ln|Rd|Ct|Way|Pl|Cir|Pkwy|Terr?|Loop)[.\s]*)/i,
    );
    if (streetMatch) {
      const street = streetMatch[1].trim();
      const remaining = line.slice(streetMatch[0].length);
      const cszText =
        remaining ||
        (startIdx + j + 1 < lines.length
          ? lines[startIdx + j + 1].trim()
          : '');
      const cszMatch = cszText.match(
        /([A-Za-z\s]+?)[,\s]+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/,
      );
      if (cszMatch) {
        return {
          street,
          city: cszMatch[1].trim(),
          state: cszMatch[2],
          zip: cszMatch[3],
        };
      }
    }
  }
  return undefined;
}

// ── 1040 Header: Primary + Spouse ────────────────────────────────

export function extractPrimaryAndSpouseFrom1040(raw: string): {
  primary: {
    name?: { firstName: string; lastName: string };
    ssn?: string;
  };
  spouse: {
    name?: { firstName: string; lastName: string };
    ssn?: string;
  };
} {
  const result = {
    primary: {} as Record<string, unknown>,
    spouse: {} as Record<string, unknown>,
  };
  const lines = raw.split('\n');

  let primaryLabelIdx = -1;
  let spouseLabelIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    if (primaryLabelIdx < 0 && /your\s+(first\s+)?name/.test(lower)) {
      primaryLabelIdx = i;
    }
    if (spouseLabelIdx < 0 && /spouse/.test(lower) && /name/.test(lower)) {
      spouseLabelIdx = i;
    }
  }

  // Primary filer
  if (primaryLabelIdx >= 0) {
    const sameLine = parseName(
      lines[primaryLabelIdx].replace(/.*(?:name|initial)\b/i, ''),
    );
    if (sameLine) {
      result.primary.name = sameLine;
    } else {
      const found = findNameFrom(lines, primaryLabelIdx + 1, 3);
      if (found)
        result.primary.name = {
          firstName: found.firstName,
          lastName: found.lastName,
        };
    }
    result.primary.ssn = findSSNFrom(lines, primaryLabelIdx, 5);
  }

  // Spouse
  if (spouseLabelIdx >= 0) {
    const sameLine = parseName(
      lines[spouseLabelIdx].replace(/.*(?:name|initial)\b/i, ''),
    );
    if (sameLine) {
      result.spouse.name = sameLine;
    } else {
      const found = findNameFrom(lines, spouseLabelIdx + 1, 3);
      if (found)
        result.spouse.name = {
          firstName: found.firstName,
          lastName: found.lastName,
        };
    }
    result.spouse.ssn = findSSNFrom(lines, spouseLabelIdx, 5);
  }

  return result as ReturnType<typeof extractPrimaryAndSpouseFrom1040>;
}

// ── 1040 Dependents Table ────────────────────────────────────────

export function extractDependentsFrom1040(
  raw: string,
): Array<{
  firstName?: string;
  lastName?: string;
  ssn?: string;
  relationship?: string;
}> {
  const dependents: Array<{
    firstName?: string;
    lastName?: string;
    ssn?: string;
    relationship?: string;
  }> = [];

  const lines = raw.split('\n');

  // Find the dependents section header
  let sectionStart = -1;
  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    if (
      /dependent/i.test(lower) &&
      (/name/i.test(lower) || /qualifying/i.test(lower) ||
       /social\s*security/i.test(lower) || /relationship/i.test(lower))
    ) {
      sectionStart = i;
      break;
    }
  }
  if (sectionStart < 0) return dependents;

  // Collect SSNs used before the dependents section (primary + spouse)
  const preSSNs = new Set<string>();
  for (let i = 0; i < sectionStart; i++) {
    for (const m of lines[i].matchAll(SSN_RE_G)) preSSNs.add(m[1]);
  }

  // Parse dependent rows
  let i = sectionStart + 1;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (
      /^(income|wages|adjusted|standard|deduction|sign|total|page\s*\d)/i.test(
        line,
      )
    )
      break;

    // Skip blank / column-label lines
    if (
      !line ||
      (/^\(?\s*[a-d]\)?\s/i.test(line) && !/[A-Z]{2,}\s+[A-Z]{2,}/.test(line))
    ) {
      i++;
      continue;
    }

    // All-on-one-line: "FIRST LAST SSN Relationship"
    const allOnOneLine = line.match(
      /([A-Z][A-Za-z'-]+)\s+([A-Z][A-Za-z'-]+)\s+(\d{3}-\d{2}-\d{4})\s*(.*)/,
    );
    if (allOnOneLine) {
      const dep: (typeof dependents)[number] = {
        firstName: titleCase(allOnOneLine[1]),
        lastName: titleCase(allOnOneLine[2]),
        ssn: allOnOneLine[3],
      };
      const relMatch = allOnOneLine[4].match(RELATIONSHIP_RE);
      if (relMatch) dep.relationship = relMatch[1].toLowerCase();
      dependents.push(dep);
      i++;
      continue;
    }

    // Name-only on this line — look ahead for SSN + relationship
    const nameOnLine = parseName(line);
    if (nameOnLine) {
      const dep: (typeof dependents)[number] = {
        firstName: nameOnLine.firstName,
        lastName: nameOnLine.lastName,
      };

      const ssnSame = line.match(SSN_RE);
      if (ssnSame) dep.ssn = ssnSame[1];

      const relSame = line.match(RELATIONSHIP_RE);
      if (relSame) dep.relationship = relSame[1].toLowerCase();

      for (let j = 1; j <= 3 && i + j < lines.length; j++) {
        const next = lines[i + j].trim();
        if (!dep.ssn) {
          const sm = next.match(SSN_RE);
          if (sm) dep.ssn = sm[1];
        }
        if (!dep.relationship) {
          const rm = next.match(RELATIONSHIP_RE);
          if (rm) dep.relationship = rm[1].toLowerCase();
        }
        if (dep.ssn && dep.relationship) break;
        if (parseName(next) && !next.match(SSN_RE)) break;
      }

      if (!dep.ssn || !preSSNs.has(dep.ssn)) {
        dependents.push(dep);
      }
      i++;
      continue;
    }

    i++;
  }

  return dependents;
}

// ── 1040 Filing Status ───────────────────────────────────────────

export function extractFilingStatusFrom1040(
  raw: string,
): FilingStatus | undefined {
  const lower = raw.toLowerCase();

  // "Filing Status: <status>" label
  if (/filing\s*status.*married\s*filing\s*joint/i.test(lower)) return 'mfj';
  if (/filing\s*status.*married\s*filing\s*separate/i.test(lower))
    return 'mfs';
  if (/filing\s*status.*head\s*of\s*household/i.test(lower)) return 'hoh';
  if (/filing\s*status.*qualifying\s*(widow|surviving)/i.test(lower))
    return 'qw';
  if (/filing\s*status.*single/i.test(lower)) return 'single';

  // Checkbox "[X]" before status
  if (/\[x\]\s*married\s*filing\s*joint/i.test(lower)) return 'mfj';
  if (/\[x\]\s*single/i.test(lower)) return 'single';
  if (/\[x\]\s*head\s*of\s*household/i.test(lower)) return 'hoh';
  if (/\[x\]\s*married\s*filing\s*separate/i.test(lower)) return 'mfs';
  if (/\[x\]\s*qualifying/i.test(lower)) return 'qw';

  // "X" on line before status text (PDF checkbox extraction)
  const lines = raw.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const isChecked =
      /^[xX✓✔☑]\s/.test(line) ||
      (i > 0 && /^[xX✓✔☑]$/.test(lines[i - 1].trim()));
    const prevChecked =
      i > 0 && /[xX✓✔☑]\s*$/.test(lines[i - 1].trim());
    if (isChecked || prevChecked) {
      if (/married\s*filing\s*joint/i.test(line)) return 'mfj';
      if (/married\s*filing\s*separate/i.test(line)) return 'mfs';
      if (/head\s*of\s*household/i.test(line)) return 'hoh';
      if (/qualifying\s*(widow|surviving)/i.test(line)) return 'qw';
      if (/single/i.test(line)) return 'single';
    }
  }

  return undefined;
}

// ── W-2 Structured Fields ────────────────────────────────────────

export function extractPrimaryFromW2(raw: string): {
  name?: { firstName: string; lastName: string };
  ssn?: string;
  address?: { street: string; city: string; state: string; zip: string };
  ein?: string;
  state?: string;
} {
  const result: ReturnType<typeof extractPrimaryFromW2> = {};
  const lines = raw.split('\n');

  // Employee SSN (Box a)
  for (let i = 0; i < lines.length; i++) {
    if (
      /(?:box\s*a\b|employee.*s\.?s\.?n|employee.*social\s*security|a\s+employee)/i.test(
        lines[i],
      )
    ) {
      const sameLine = lines[i].match(SSN_RE);
      if (sameLine) {
        result.ssn = sameLine[1];
        break;
      }
      const found = findSSNFrom(lines, i + 1, 3);
      if (found) {
        result.ssn = found;
        break;
      }
    }
  }
  if (!result.ssn) {
    const m = raw.match(SSN_RE);
    if (m) result.ssn = m[1];
  }

  // Employee name (Box e)
  for (let i = 0; i < lines.length; i++) {
    if (
      /(?:box\s*e\b|employee.*(?:first\s*)?name|e\s+employee)/i.test(lines[i])
    ) {
      const afterLabel = lines[i].replace(
        /^.*?(?:name|employee)[^:]*:?\s*/i,
        '',
      );
      const sameLine = parseName(afterLabel);
      if (sameLine) {
        result.name = sameLine;
        break;
      }
      const found = findNameFrom(lines, i + 1, 3);
      if (found) {
        result.name = { firstName: found.firstName, lastName: found.lastName };
        break;
      }
    }
  }

  // Employee address (Box f)
  for (let i = 0; i < lines.length; i++) {
    if (
      /(?:box\s*f\b|employee.*address|f\s+employee)/i.test(lines[i])
    ) {
      result.address = parseAddress(lines, i);
      if (result.address) break;
    }
  }
  if (!result.address) {
    for (let i = 0; i < lines.length; i++) {
      if (/home\s*address|present.*address|number.*street/i.test(lines[i])) {
        result.address = parseAddress(lines, i);
        if (result.address) break;
      }
    }
  }

  // Employer EIN (Box b)
  for (let i = 0; i < lines.length; i++) {
    if (
      /(?:box\s*b\b|employer.*(?:ein|identification)|b\s+employer)/i.test(
        lines[i],
      )
    ) {
      const sameLine = lines[i].match(EIN_RE);
      if (sameLine) {
        result.ein = sameLine[1];
        break;
      }
      for (let j = 1; j <= 3 && i + j < lines.length; j++) {
        const m = lines[i + j].match(EIN_RE);
        if (m) {
          result.ein = m[1];
          break;
        }
      }
      if (result.ein) break;
    }
  }
  if (!result.ein) {
    const m = raw.match(EIN_RE);
    if (m) result.ein = m[1];
  }

  // State (Box 15)
  for (let i = 0; i < lines.length; i++) {
    const stateMatch = lines[i].match(
      /(?:box\s*15[^:\n]*|15\s+state|state\s*(?:employer)?)[:\s]*([A-Z]{2})\b/i,
    );
    if (stateMatch) {
      result.state = stateMatch[1].toUpperCase();
      break;
    }
  }

  return result;
}

// ── 1040 Address ─────────────────────────────────────────────────

export function extractAddressFrom1040(
  raw: string,
): { street: string; city: string; state: string; zip: string } | undefined {
  const lines = raw.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (
      /(?:home\s*address|present.*address|number.*street)/i.test(lines[i])
    ) {
      const addr = parseAddress(lines, i);
      if (addr) return addr;
    }
  }
  return undefined;
}
