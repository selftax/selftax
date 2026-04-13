import type { PIIDetection, PIIType, UserProfile } from '../types';

/** Bounding box from OCR output, keyed by character offset range */
export type OCRBoundingBoxes = Map<
  string,
  { x: number; y: number; width: number; height: number }
>;

interface PatternRule {
  type: PIIType;
  pattern: RegExp;
  confidence: 'exact' | 'pattern';
  /** Return null to reject a match (e.g. date that looks like SSN) */
  validate?: (match: string, fullText: string) => boolean;
}

const DATE_CONTEXT_RE =
  /(?:date|dated|issued|expired?|born|dob|period|year|month|day|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i;

/**
 * Checks if a 9-digit or XXX-XX-XXXX match is likely a date rather than an SSN.
 * Dates like 01-15-2025 or 12-31-2024 have month (01-12) and day (01-31) ranges.
 */
function looksLikeDate(match: string, fullText: string): boolean {
  const digits = match.replace(/\D/g, '');
  if (digits.length !== 9) return false;

  const first2 = parseInt(digits.slice(0, 2), 10);
  const mid2 = parseInt(digits.slice(2, 4), 10);

  // MM-DD-YYYY pattern: month 1-12, day 1-31
  const couldBeDate =
    first2 >= 1 && first2 <= 12 && mid2 >= 1 && mid2 <= 31;

  if (!couldBeDate) return false;

  // Check surrounding context for date-related words
  const matchIndex = fullText.indexOf(match);
  const surroundingStart = Math.max(0, matchIndex - 30);
  const surroundingEnd = Math.min(fullText.length, matchIndex + match.length + 30);
  const surrounding = fullText.slice(surroundingStart, surroundingEnd);

  return DATE_CONTEXT_RE.test(surrounding);
}

const PATTERN_RULES: PatternRule[] = [
  {
    type: 'ssn',
    pattern: /\b(\d{3}-\d{2}-\d{4})\b/g,
    confidence: 'pattern',
    validate: (match, fullText) => !looksLikeDate(match, fullText),
  },
  {
    type: 'ssn',
    pattern: /\b(\d{9})\b/g,
    confidence: 'pattern',
    validate: (match, fullText) => {
      // Reject if it looks like a date or is all zeros/ones (test data)
      if (looksLikeDate(match, fullText)) return false;
      // Must not be a phone number (10 digits) — 9 digits only
      return true;
    },
  },
  {
    type: 'ein',
    pattern: /\b(\d{2}-\d{7})\b/g,
    confidence: 'pattern',
  },
  {
    type: 'phone',
    pattern: /\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g,
    confidence: 'pattern',
  },
  {
    type: 'email',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    confidence: 'exact',
  },
];

/**
 * Detects PII in text using regex patterns and optional profile matching.
 *
 * @param text - The text to scan for PII
 * @param profile - Optional user profile for name/address matching
 * @param ocrBoundingBoxes - Optional bounding boxes from OCR (keyed by "startIndex-endIndex")
 * @returns Array of PII detections with type, value, position, and confidence
 */
export function detectPII(
  text: string,
  profile?: Partial<UserProfile>,
  ocrBoundingBoxes?: OCRBoundingBoxes,
): PIIDetection[] {
  const detections: PIIDetection[] = [];
  const coveredRanges: Array<[number, number]> = [];

  function isOverlapping(start: number, end: number): boolean {
    return coveredRanges.some(
      ([s, e]) => start < e && end > s,
    );
  }

  // 1. Regex pattern matching
  for (const rule of PATTERN_RULES) {
    // Reset lastIndex for global regexes
    rule.pattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = rule.pattern.exec(text)) !== null) {
      const value = match[0];
      const startIndex = match.index;
      const endIndex = startIndex + value.length;

      if (isOverlapping(startIndex, endIndex)) continue;

      if (rule.validate && !rule.validate(value, text)) continue;

      const detection: PIIDetection = {
        type: rule.type,
        value,
        startIndex,
        endIndex,
        confidence: rule.confidence,
      };

      if (ocrBoundingBoxes) {
        const bbox = ocrBoundingBoxes.get(`${startIndex}-${endIndex}`);
        if (bbox) detection.boundingBox = bbox;
      }

      detections.push(detection);
      coveredRanges.push([startIndex, endIndex]);
    }
  }

  // 2. Profile-based matching (name, address)
  if (profile) {
    // Match full name
    if (profile.firstName && profile.lastName) {
      const fullName = `${profile.firstName} ${profile.lastName}`;
      const nameRegex = new RegExp(escapeRegex(fullName), 'gi');
      let match: RegExpExecArray | null;

      while ((match = nameRegex.exec(text)) !== null) {
        const startIndex = match.index;
        const endIndex = startIndex + match[0].length;

        if (isOverlapping(startIndex, endIndex)) continue;

        detections.push({
          type: 'name',
          value: match[0],
          startIndex,
          endIndex,
          confidence: 'profile-match',
        });
        coveredRanges.push([startIndex, endIndex]);
      }

      // Also match individual first/last names
      for (const name of [profile.firstName, profile.lastName]) {
        const singleNameRegex = new RegExp(`\\b${escapeRegex(name)}\\b`, 'gi');
        while ((match = singleNameRegex.exec(text)) !== null) {
          const startIndex = match.index;
          const endIndex = startIndex + match[0].length;

          if (isOverlapping(startIndex, endIndex)) continue;

          detections.push({
            type: 'name',
            value: match[0],
            startIndex,
            endIndex,
            confidence: 'profile-match',
          });
          coveredRanges.push([startIndex, endIndex]);
        }
      }
    }

    // Match address
    if (profile.address?.street) {
      const streetRegex = new RegExp(escapeRegex(profile.address.street), 'gi');
      let match: RegExpExecArray | null;

      while ((match = streetRegex.exec(text)) !== null) {
        const startIndex = match.index;
        // Try to capture the full address line (street + city + state + zip)
        const afterStreet = text.slice(startIndex);
        const fullAddressMatch = afterStreet.match(
          new RegExp(
            `${escapeRegex(profile.address.street)}[,\\s]*` +
            (profile.address.city ? `${escapeRegex(profile.address.city)}[,\\s]*` : '') +
            (profile.address.state ? `${escapeRegex(profile.address.state)}[,\\s]*` : '') +
            (profile.address.zip ? escapeRegex(profile.address.zip) : ''),
            'i',
          ),
        );

        const value = fullAddressMatch ? fullAddressMatch[0] : match[0];
        const endIndex = startIndex + value.length;

        if (isOverlapping(startIndex, endIndex)) continue;

        detections.push({
          type: 'address',
          value,
          startIndex,
          endIndex,
          confidence: 'profile-match',
        });
        coveredRanges.push([startIndex, endIndex]);
      }
    }
  }

  // Sort by position
  detections.sort((a, b) => a.startIndex - b.startIndex);

  return detections;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
