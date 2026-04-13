/**
 * PII Tokenizer — replaces PII with meaningful tokens that preserve relationships.
 *
 * Unlike redactPII which blanks everything to [REDACTED], this replaces PII
 * with semantic tokens so the LLM can still understand document relationships:
 *   "JANE DOE" → "[SELF]"
 *   "123 MAIN AVE" → "[HOME_ADDRESS]"
 *   "456 MAPLE CT" → "[RENTAL_1_ADDRESS]"
 *   "000-00-1234" → "[SELF_SSN]"
 *
 * The LLM sees [HOME_ADDRESS] on both the W-2 and the property tax bill,
 * so it knows they're the same property — without seeing the real address.
 */

export interface TokenizationProfile {
  /** Primary filer name(s) */
  selfNames: string[];
  /** Spouse name(s) */
  spouseNames: string[];
  /** Dependent names — each entry is [firstName, lastName] */
  dependentNames: string[][];
  /** Primary residence address parts (street, city, state, zip) */
  homeAddress: string[];
  /** Rental property address parts — each entry is an array of address parts */
  rentalAddresses: string[][];
  /** SSNs: [self, spouse, dep1, dep2, ...] */
  ssns: string[];
  /** Account numbers to redact (bank, mortgage, brokerage) */
  accountNumbers: string[];
}

interface TokenRule {
  pattern: string;
  token: string;
}

/** Common street suffix abbreviations and their full forms */
const SUFFIX_VARIANTS: Record<string, string[]> = {
  'ST': ['STREET'], 'STREET': ['ST'],
  'AVE': ['AVENUE'], 'AVENUE': ['AVE'],
  'CT': ['COURT'], 'COURT': ['CT'],
  'DR': ['DRIVE'], 'DRIVE': ['DR'],
  'RD': ['ROAD'], 'ROAD': ['RD'],
  'LN': ['LANE'], 'LANE': ['LN'],
  'BLVD': ['BOULEVARD'], 'BOULEVARD': ['BLVD'],
  'WAY': [], 'PL': ['PLACE'], 'PLACE': ['PL'],
  'CIR': ['CIRCLE'], 'CIRCLE': ['CIR'],
};

/** Generate address variants by swapping common abbreviations */
function addressVariants(address: string): string[] {
  const variants: string[] = [];
  const upper = address.toUpperCase();
  for (const [abbr, fulls] of Object.entries(SUFFIX_VARIANTS)) {
    if (upper.includes(abbr)) {
      for (const full of fulls) {
        variants.push(address.replace(new RegExp(abbr, 'gi'), full));
      }
    }
  }
  return variants;
}

/**
 * Build a list of find→replace rules from the profile, ordered longest first
 * (so "JANE DOE" is replaced before "JANE" alone).
 */
function buildTokenRules(profile: TokenizationProfile): TokenRule[] {
  const rules: TokenRule[] = [];

  // Self names (full name first, then individual)
  if (profile.selfNames.length >= 2) {
    rules.push({ pattern: profile.selfNames.join(' '), token: '[SELF]' });
  }
  for (const name of profile.selfNames) {
    if (name.length >= 2) rules.push({ pattern: name, token: '[SELF]' });
  }

  // Spouse
  if (profile.spouseNames.length >= 2) {
    rules.push({ pattern: profile.spouseNames.join(' '), token: '[SPOUSE]' });
  }
  for (const name of profile.spouseNames) {
    if (name.length >= 2) rules.push({ pattern: name, token: '[SPOUSE]' });
  }

  // Dependents
  for (let i = 0; i < profile.dependentNames.length; i++) {
    const dep = profile.dependentNames[i];
    const token = `[DEP_${i + 1}]`;
    if (dep.length >= 2) rules.push({ pattern: dep.join(' '), token });
    for (const name of dep) {
      if (name.length >= 2) rules.push({ pattern: name, token });
    }
  }

  // Home address (try full street first, then parts, plus abbreviation variants)
  for (const part of profile.homeAddress) {
    if (part.length >= 3) {
      rules.push({ pattern: part, token: '[HOME_ADDRESS]' });
      for (const variant of addressVariants(part)) {
        rules.push({ pattern: variant, token: '[HOME_ADDRESS]' });
      }
      // Truncated variant (e.g., "123 MAIN A" for "123 MAIN AVE")
      const words = part.split(/\s+/);
      if (words.length >= 3) {
        const truncated = words.slice(0, -1).join(' ') + ' ' + words[words.length - 1][0];
        if (truncated.length >= 5) rules.push({ pattern: truncated, token: '[HOME_ADDRESS]' });
      }
    }
  }

  // Rental addresses
  for (let i = 0; i < profile.rentalAddresses.length; i++) {
    const token = `[RENTAL_${i + 1}_ADDRESS]`;
    for (const part of profile.rentalAddresses[i]) {
      if (part.length >= 3) {
        rules.push({ pattern: part, token });
        for (const variant of addressVariants(part)) {
          rules.push({ pattern: variant, token });
        }
        // Add truncated variants (e.g., "456 MAPLE C" for "456 MAPLE COURT")
        // PDF text extraction sometimes truncates addresses
        const words = part.split(/\s+/);
        if (words.length >= 3) {
          // "718 HARRIS C" — number + street name + first letter of suffix
          const truncated = words.slice(0, -1).join(' ') + ' ' + words[words.length - 1][0];
          if (truncated.length >= 5) rules.push({ pattern: truncated, token });
        }
      }
    }
  }

  // SSNs (formatted and unformatted)
  const ssnTokens = ['[SELF_SSN]', '[SPOUSE_SSN]', '[DEP_1_SSN]', '[DEP_2_SSN]', '[DEP_3_SSN]', '[DEP_4_SSN]'];
  for (let i = 0; i < profile.ssns.length; i++) {
    const ssn = profile.ssns[i];
    if (!ssn || ssn === '000-00-0000') continue;
    const token = ssnTokens[i] ?? `[SSN_${i}]`;
    rules.push({ pattern: ssn, token });
    // Also match without dashes
    rules.push({ pattern: ssn.replace(/-/g, ''), token });
    // Also match masked versions (***-**-1234)
    const last4 = ssn.slice(-4);
    if (last4.length === 4) {
      rules.push({ pattern: `***-**-${last4}`, token });
      rules.push({ pattern: `XXX-XX-${last4}`, token });
    }
  }

  // Account numbers
  for (const acct of profile.accountNumbers) {
    if (acct.length >= 4) rules.push({ pattern: acct, token: '[REDACTED_ACCT]' });
  }

  // Sort by pattern length descending (longest match first)
  // For same-length patterns, prioritize [SELF] > [SPOUSE] > [DEP_*]
  // so shared last names (e.g., HUANG) always map to [SELF]
  const tokenPriority = (token: string): number => {
    if (token === '[SELF]') return 0;
    if (token === '[SPOUSE]') return 1;
    if (token === '[HOME_ADDRESS]') return 2;
    if (token.startsWith('[RENTAL_')) return 3;
    if (token.startsWith('[DEP_')) return 4;
    return 5;
  };
  rules.sort((a, b) => {
    const lenDiff = b.pattern.length - a.pattern.length;
    if (lenDiff !== 0) return lenDiff;
    return tokenPriority(a.token) - tokenPriority(b.token);
  });

  // Deduplicate: if same pattern appears with different tokens, keep first (highest priority)
  const seen = new Set<string>();
  return rules.filter((r) => {
    const key = r.pattern.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Replace all PII in text with semantic tokens.
 * Case-insensitive matching.
 */
export function tokenizePII(text: string, profile: TokenizationProfile): string {
  const rules = buildTokenRules(profile);
  let result = text;

  for (const rule of rules) {
    const escaped = rule.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Use word boundaries for short patterns (< 8 chars) to avoid matching
    // inside words (e.g., "MAI" inside "MAIL", "AVE" inside "HAVE")
    const boundaryPattern = rule.pattern.length < 8
      ? `\\b${escaped}\\b`
      : escaped;
    const regex = new RegExp(boundaryPattern, 'gi');
    result = result.replace(regex, rule.token);
  }

  // ── Generic PII sweep: catch anything not already tokenized ──

  // SSNs: any remaining XXX-XX-XXXX or 9-digit patterns
  result = result.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[UNKNOWN_SSN]');
  result = result.replace(/\b\d{9}\b/g, (match) => {
    if (/^\d{5}$/.test(match) || match.startsWith('0')) return match;
    return '[UNKNOWN_SSN]';
  });

  // Phone numbers: all formats (800-123-4567, (510) 272-6800, 1-800-848-9136)
  result = result.replace(/\b1-\d{3}-\d{3}-\d{4}\b/g, '[REDACTED_PHONE]');
  result = result.replace(/\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/g, '[REDACTED_PHONE]');

  // Email addresses
  result = result.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]');

  // EINs: XX-XXXXXXX (employer identification numbers)
  result = result.replace(/\b\d{2}-\d{7}\b/g, '[REDACTED_EIN]');

  // Routing/account numbers: 9-digit routing numbers near "routing" keyword
  result = result.replace(/(?:routing|account)\s*(?:number|no\.?|#)?\s*:?\s*(\d{6,17})/gi,
    (match) => match.replace(/\d{6,17}/, '[REDACTED_ACCT]'));

  // Street addresses: "123 MAIN ST" patterns not already tokenized
  // Match: number + street name + suffix (full or single-letter truncated)
  const streetSuffixes = 'ST|STREET|AVE|AVENUE|DR|DRIVE|CT|COURT|LN|LANE|RD|ROAD|BLVD|BOULEVARD|WAY|PL|PLACE|CIR|CIRCLE|PKWY|PARKWAY|HWY|HIGHWAY|STE|SUITE';
  const addrRegex = new RegExp(
    `\\b\\d{1,6}\\s+[A-Z][A-Za-z]+(?:\\s+[A-Z][A-Za-z]+)*\\s+(?:${streetSuffixes})\\b(?:\\s+(?:STE|SUITE|APT|UNIT|#)\\s*[A-Z0-9]+)?`,
    'gi',
  );
  result = result.replace(addrRegex, (match) => {
    if (match.includes('[')) return match;
    return '[REDACTED_ADDRESS]';
  });
  // Also catch truncated addresses: "718 HARRIS C" (number + name + single letter)
  // These appear in CA worksheets where the address was cut short
  result = result.replace(
    /\b(\d{1,6}\s+[A-Z][A-Z]+\s+[A-Z])\b(?!\w)/g,
    (match) => {
      if (match.includes('[')) return match;
      // Only redact if it looks like a street (number + word + single letter)
      // and not a form reference like "1040 Schedule A"
      if (/^\d{1,6}\s+[A-Z]{2,}\s+[A-Z]$/.test(match)) return '[REDACTED_ADDRESS]';
      return match;
    },
  );

  // City, State ZIP after a redacted address (or standalone)
  // e.g., "Jurupa Valley, CA 92509" or "San Francisco CA 94104"
  // Only redact if preceded by [REDACTED_ADDRESS] on the same or previous line
  // Skip this for now — too aggressive, could match form content

  // Names after known tax form labels — catches filer, spouse, employer, etc.
  // Pattern: label followed by 2+ capitalized words on the same line
  const nameLabelPatterns = [
    'Employer\'s name',
    'Employee name',
    'Employee\'s name',
    'Firm\'s name',
    'Preparer\'s name',
    'Designee\'s\\s*name',
    'Care provider\'s\\s*name',
    'ERO firm name',
    'Payer\'s name',
    'Recipient\'s name',
    'Taxpayer(?:\'s)?\\s*name',
    'Your first name(?:\\s+and\\s+middle\\s+initial)?',
    'spouse\'s first name(?:\\s+and\\s+middle\\s+initial)?',
    'Last name',
    'Name of person',
    'Name of qualifying person',
    'Name\\s*:',
  ];
  const nameLabelGroup = nameLabelPatterns.join('|');
  result = result.replace(
    new RegExp(`(?:${nameLabelGroup})[,:\\s]+([A-Z][A-Za-z']+(?:\\s+[A-Z][A-Za-z']+)*)`, 'gi'),
    (match, name) => match.replace(name, '[REDACTED_NAME]'),
  );

  // Catch preparer/ERO names in various contexts
  result = result.replace(
    /(?:Paid\s+)?Preparer[:\s]+(?:signature\s+)?([A-Z][A-Z]+\s+[A-Z][A-Z]+)/g,
    (match, name) => match.replace(name, '[REDACTED_NAME]'),
  );
  result = result.replace(
    /ERO's\s+signature\s+([A-Z][A-Z]+\s+[A-Z][A-Z]+)/g,
    (match, name) => match.replace(name, '[REDACTED_NAME]'),
  );

  // Final sweep: replace any remaining profile names that weren't caught.
  // Uses negative lookbehind to skip names inside existing tokens like [SELF_SSN].
  const allProfileNames: Array<{ name: string; token: string }> = [
    ...profile.selfNames.map((n) => ({ name: n, token: '[SELF]' })),
    ...profile.spouseNames.map((n) => ({ name: n, token: '[SPOUSE]' })),
    ...profile.dependentNames.flatMap((names, i) =>
      names.map((n) => ({ name: n, token: `[DEP_${i + 1}]` })),
    ),
  ];
  for (const { name, token } of allProfileNames) {
    if (name.length >= 3) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Negative lookbehind: don't match if preceded by [ (inside a token)
      const nameRegex = new RegExp(`(?<!\\[)\\b${escaped}\\b`, 'gi');
      result = result.replace(nameRegex, token);
    }
  }

  return result;
}

/**
 * Build a TokenizationProfile from the locally-stored PII.
 * This is called in the extension before sending docs to the server.
 */
export function buildTokenProfile(pii: {
  primary: { firstName: string; lastName: string; ssn: string };
  spouse?: { firstName: string; lastName: string; ssn: string };
  address: { street: string; city: string; state: string; zip: string };
  dependents: Array<{ firstName: string; lastName: string; ssn: string }>;
  rentalAddresses?: string[][];
}): TokenizationProfile {
  const ssns: string[] = [pii.primary.ssn];
  if (pii.spouse?.ssn) ssns.push(pii.spouse.ssn);
  for (const dep of pii.dependents) {
    ssns.push(dep.ssn);
  }

  return {
    selfNames: [pii.primary.firstName, pii.primary.lastName].filter(Boolean),
    spouseNames: pii.spouse ? [pii.spouse.firstName, pii.spouse.lastName].filter(Boolean) : [],
    dependentNames: pii.dependents.map((d) => [d.firstName, d.lastName].filter(Boolean)),
    homeAddress: [pii.address.street, pii.address.city, pii.address.zip].filter(Boolean),
    rentalAddresses: pii.rentalAddresses ?? [],
    ssns,
    accountNumbers: [],
  };
}
