/**
 * Spec: PII Profile Extraction
 *
 * Status: active
 * Confirm: Auto-extracts PII from W-2 and 1040 text, saves locally, never leaks to LLM
 * Invalidate: Document formats too varied for regex extraction
 *
 * Tests that the MCP server can:
 * 1. Extract name, SSN, address from W-2 raw text
 * 2. Extract filing status, spouse, dependents from 1040 text
 * 3. Save/load profiles to/from disk
 * 4. Never leak PII in tool responses (summary only)
 * 5. Merge auto-extracted with manual profile (manual takes precedence)
 */

import { tmpdir } from 'node:os';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  extractProfileFromDocuments,
  buildProfileSummary,
  extractPrimaryAndSpouseFrom1040,
  extractDependentsFrom1040,
  extractFilingStatusFrom1040,
  extractPrimaryFromW2,
} from '@selftax/mcp/piiProfileExtractor';
import {
  saveProfileToFile,
  loadProfileFromFile,
} from '@selftax/mcp/profileStorage';
import { applyExtractedProfileToSession } from '@selftax/mcp/tools/setProfile';
import type { SessionDocument } from '@selftax/mcp/session';
import { createSession } from '@selftax/mcp/session';
import type { ExtractedProfile } from '@selftax/mcp/piiProfileExtractor';

/** Helper: build a minimal SessionDocument with raw text */
function makeDoc(
  rawText: string,
  documentType: 'w2' | 'other' = 'w2',
): SessionDocument {
  return {
    id: `doc-${Math.random().toString(36).slice(2)}`,
    fileName: 'test.pdf',
    mimeType: 'application/pdf',
    rawText,
    redactedText: '***REDACTED***',
    piiDetections: [],
    fields: {},
    documentType,
  };
}

// --- 1. Profile extraction from W-2 text ---

describe('PII Profile Extractor', () => {
  test('extracts SSN from W-2 Box a', () => {
    const doc = makeDoc(
      'Box a Employee SSN\n000-00-0000\nBox b Employer EIN\n00-0000000',
    );
    const profile = extractProfileFromDocuments([doc]);
    expect(profile.primaryFiler.ssn).toBe('000-00-0000');
  });

  test('extracts name from W-2 Box e', () => {
    const doc = makeDoc(
      'Box e Employee name\nJane Doe\nBox f Employee address\n123 Main St',
    );
    const profile = extractProfileFromDocuments([doc]);
    expect(profile.primaryFiler.firstName).toBe('Jane');
    expect(profile.primaryFiler.lastName).toBe('Doe');
  });

  test('extracts address from W-2 Box f', () => {
    const doc = makeDoc(
      'Box f Employee address\n456 Oak Ave\nSpringfield, IL 62704',
    );
    const profile = extractProfileFromDocuments([doc]);
    expect(profile.primaryFiler.address).toEqual({
      street: '456 Oak Ave',
      city: 'Springfield',
      state: 'IL',
      zip: '62704',
    });
  });

  test('extracts employer EIN from W-2', () => {
    const doc = makeDoc('Employer EIN: 00-0000000\nWages: $50,000');
    const profile = extractProfileFromDocuments([doc]);
    expect(profile.employerEIN).toBe('00-0000000');
  });

  test('extracts state from W-2 Box 15', () => {
    const doc = makeDoc('Box 15 State: CA\nBox 16 State wages: $50,000');
    const profile = extractProfileFromDocuments([doc]);
    expect(profile.stateOfResidence).toBe('CA');
  });

  test('extracts filing status from 1040', () => {
    const doc = makeDoc(
      'Form 1040\nFiling Status: Married Filing Jointly\nYour first name Jane',
      'other',
    );
    const profile = extractProfileFromDocuments([doc]);
    expect(profile.filingStatus).toBe('mfj');
  });

  test('extracts single filing status from 1040', () => {
    const doc = makeDoc(
      'Form 1040\nFiling Status: Single\nYour first name Jane',
      'other',
    );
    const profile = extractProfileFromDocuments([doc]);
    expect(profile.filingStatus).toBe('single');
  });

  test('falls back to first SSN in W-2 if no label match', () => {
    const doc = makeDoc('Some text\n000-00-0000\nMore text');
    const profile = extractProfileFromDocuments([doc]);
    expect(profile.primaryFiler.ssn).toBe('000-00-0000');
  });

  test('returns empty profile for documents with no PII', () => {
    const doc = makeDoc('Just some numbers: $50,000 in wages', 'other');
    const profile = extractProfileFromDocuments([doc]);
    expect(profile.primaryFiler.ssn).toBeUndefined();
    expect(profile.primaryFiler.firstName).toBeUndefined();
  });
});

// --- 2. Profile storage (save/load) ---

describe('Profile Storage', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'selftax-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  test('saves profile to .selftax-profile.json', async () => {
    const profile: ExtractedProfile = {
      primaryFiler: {
        firstName: 'Jane',
        lastName: 'Doe',
        ssn: '000-00-0000',
        address: { street: '123 Main St', city: 'Anytown', state: 'CA', zip: '90210' },
      },
      stateOfResidence: 'CA',
      filingStatus: 'single',
    };

    await saveProfileToFile(tmpDir, profile);

    const savedJson = await readFile(
      join(tmpDir, '.selftax-profile.json'),
      'utf-8',
    );
    const saved = JSON.parse(savedJson);
    expect(saved.primaryFiler.firstName).toBe('Jane');
    expect(saved.primaryFiler.ssn).toBe('000-00-0000');
  });

  test('loads profile from .selftax-profile.json', async () => {
    const profile: ExtractedProfile = {
      primaryFiler: {
        firstName: 'Jane',
        lastName: 'Doe',
        ssn: '000-00-0000',
      },
    };

    await saveProfileToFile(tmpDir, profile);
    const loaded = await loadProfileFromFile(tmpDir);

    expect(loaded).not.toBeNull();
    expect(loaded!.primaryFiler.firstName).toBe('Jane');
    expect(loaded!.primaryFiler.ssn).toBe('000-00-0000');
  });

  test('returns null when no profile file exists', async () => {
    const loaded = await loadProfileFromFile(tmpDir);
    expect(loaded).toBeNull();
  });
});

// --- 3. No PII leaks in tool responses ---

describe('Profile Summary (LLM-safe)', () => {
  test('includes only first names, not last names', () => {
    const profile: ExtractedProfile = {
      primaryFiler: {
        firstName: 'Jane',
        lastName: 'Doe',
        ssn: '000-00-0000',
        address: { street: '123 Main St', city: 'Anytown', state: 'CA', zip: '90210' },
      },
      stateOfResidence: 'CA',
    };

    const summary = buildProfileSummary(profile);
    expect(summary).toContain('Jane');
    expect(summary).not.toContain('Doe');
    expect(summary).not.toContain('000-00-0000');
    expect(summary).not.toContain('123 Main St');
    expect(summary).not.toContain('Anytown');
    expect(summary).not.toContain('90210');
  });

  test('includes spouse first name only', () => {
    const profile: ExtractedProfile = {
      primaryFiler: { firstName: 'Jane' },
      spouse: { firstName: 'John', lastName: 'Doe', ssn: '000-00-0001' },
    };

    const summary = buildProfileSummary(profile);
    expect(summary).toContain('John');
    expect(summary).not.toContain('000-00-0001');
  });

  test('includes dependent count but not names', () => {
    const profile: ExtractedProfile = {
      primaryFiler: { firstName: 'Jane' },
      dependents: [
        { firstName: 'Billy', lastName: 'Doe', ssn: '000-00-0002' },
        { firstName: 'Sally', lastName: 'Doe', ssn: '000-00-0003' },
      ],
    };

    const summary = buildProfileSummary(profile);
    expect(summary).toContain('2 dependent(s)');
    expect(summary).not.toContain('Billy');
    expect(summary).not.toContain('Sally');
    expect(summary).not.toContain('000-00-0002');
  });

  test('includes state code', () => {
    const profile: ExtractedProfile = {
      primaryFiler: { firstName: 'Jane' },
      stateOfResidence: 'CA',
    };

    const summary = buildProfileSummary(profile);
    expect(summary).toContain('CA');
  });

  test('returns "no data" message for empty profile', () => {
    const profile: ExtractedProfile = { primaryFiler: {} };
    const summary = buildProfileSummary(profile);
    expect(summary).toContain('No PII profile data found');
  });
});

// --- 4. Session profile merge ---

describe('Profile Merge (auto-extracted + manual)', () => {
  test('creates session profile from extracted data when none exists', () => {
    const session = createSession();
    const extracted: ExtractedProfile = {
      primaryFiler: {
        firstName: 'Jane',
        lastName: 'Doe',
        ssn: '000-00-0000',
        address: { street: '123 Main St', city: 'Anytown', state: 'CA', zip: '90210' },
      },
      filingStatus: 'single',
      stateOfResidence: 'CA',
    };

    applyExtractedProfileToSession(session, extracted);

    expect(session.profile).not.toBeNull();
    expect(session.profile!.firstName).toBe('Jane');
    expect(session.profile!.lastName).toBe('Doe');
    expect(session.profile!.ssn).toBe('000-00-0000');
    expect(session.profile!.address.street).toBe('123 Main St');
    expect(session.profile!.filingStatus).toBe('single');
    expect(session.profile!.stateOfResidence).toBe('CA');
  });

  test('does not overwrite existing manual profile', () => {
    const session = createSession();
    session.profile = {
      firstName: 'Manual',
      lastName: 'User',
      ssn: '111-11-1111',
      address: { street: '999 Override St', city: 'Override', state: 'NY', zip: '10001' },
      filingStatus: 'mfj',
      stateOfResidence: 'NY',
      dependents: [],
    };

    const extracted: ExtractedProfile = {
      primaryFiler: {
        firstName: 'Jane',
        lastName: 'Doe',
        ssn: '000-00-0000',
      },
      stateOfResidence: 'CA',
    };

    applyExtractedProfileToSession(session, extracted);

    // Manual values should remain unchanged
    expect(session.profile!.firstName).toBe('Manual');
    expect(session.profile!.lastName).toBe('User');
    expect(session.profile!.ssn).toBe('111-11-1111');
    expect(session.profile!.address.street).toBe('999 Override St');
    expect(session.profile!.stateOfResidence).toBe('NY');
  });

  test('fills blank fields in existing profile from extracted data', () => {
    const session = createSession();
    session.profile = {
      firstName: 'Jane',
      lastName: '',
      ssn: '',
      address: { street: '', city: '', state: '', zip: '' },
      filingStatus: 'single',
      stateOfResidence: '',
      dependents: [],
    };

    const extracted: ExtractedProfile = {
      primaryFiler: {
        firstName: 'Different',
        lastName: 'Doe',
        ssn: '000-00-0000',
        address: { street: '123 Main St', city: 'Anytown', state: 'CA', zip: '90210' },
      },
      stateOfResidence: 'CA',
    };

    applyExtractedProfileToSession(session, extracted);

    // firstName was already set, should NOT be overwritten
    expect(session.profile!.firstName).toBe('Jane');
    // Blank fields should be filled
    expect(session.profile!.lastName).toBe('Doe');
    expect(session.profile!.ssn).toBe('000-00-0000');
    expect(session.profile!.address.street).toBe('123 Main St');
    expect(session.profile!.stateOfResidence).toBe('CA');
  });

  test('handles extracted profile with dependents', () => {
    const session = createSession();
    const extracted: ExtractedProfile = {
      primaryFiler: { firstName: 'Jane', lastName: 'Doe', ssn: '000-00-0000' },
      dependents: [
        { firstName: 'Billy', lastName: 'Doe', ssn: '000-00-0002', relationship: 'son' },
      ],
    };

    applyExtractedProfileToSession(session, extracted);

    expect(session.profile!.dependents).toHaveLength(1);
    expect(session.profile!.dependents[0].firstName).toBe('Billy');
    expect(session.profile!.dependents[0].relationship).toBe('son');
  });
});

// --- 5. Structured 1040 header parsing ---

describe('1040 Header Parsing (primary + spouse)', () => {
  test('extracts primary and spouse from standard 1040 header layout', () => {
    const text = [
      'Form 1040  U.S. Individual Income Tax Return  2024',
      'Your first name and middle initial  Last name          Your social security number',
      'JANE                                DOE               000-00-0000',
      "If joint return, spouse's first name and middle initial  Last name  Spouse's social security number",
      'JOHN A                              DOE               000-00-0001',
    ].join('\n');

    const { primary, spouse } = extractPrimaryAndSpouseFrom1040(text);
    expect(primary.name).toEqual({ firstName: 'Jane', lastName: 'Doe' });
    expect(primary.ssn).toBe('000-00-0000');
    expect(spouse.name).toEqual({ firstName: 'John', lastName: 'Doe' });
    expect(spouse.ssn).toBe('000-00-0001');
  });

  test('extracts primary when no spouse present', () => {
    const text = [
      'Your first name and middle initial  Last name  Your social security number',
      'JANE                               DOE         000-00-0000',
    ].join('\n');

    const { primary, spouse } = extractPrimaryAndSpouseFrom1040(text);
    expect(primary.name).toEqual({ firstName: 'Jane', lastName: 'Doe' });
    expect(primary.ssn).toBe('000-00-0000');
    expect(spouse.name).toBeUndefined();
    expect(spouse.ssn).toBeUndefined();
  });

  test('handles name and SSN on separate lines', () => {
    const text = [
      'Your first name and middle initial  Last name',
      'JANE DOE',
      'Your social security number',
      '000-00-0000',
    ].join('\n');

    const { primary } = extractPrimaryAndSpouseFrom1040(text);
    expect(primary.name).toEqual({ firstName: 'Jane', lastName: 'Doe' });
    expect(primary.ssn).toBe('000-00-0000');
  });
});

// --- 6. Structured dependents table parsing ---

describe('1040 Dependents Table Parsing', () => {
  test('parses dependents with name, SSN, and relationship on one line', () => {
    const text = [
      'Dependents: (a) Qualifying person\'s name  (b) SSN  (c) Relationship  (d) CTC',
      'BILLY DOE          000-00-0002  Son  ✓',
      'SALLY DOE          000-00-0003  Daughter  ✓',
      'Income',
    ].join('\n');

    const deps = extractDependentsFrom1040(text);
    expect(deps).toHaveLength(2);
    expect(deps[0]).toEqual({
      firstName: 'Billy',
      lastName: 'Doe',
      ssn: '000-00-0002',
      relationship: 'son',
    });
    expect(deps[1]).toEqual({
      firstName: 'Sally',
      lastName: 'Doe',
      ssn: '000-00-0003',
      relationship: 'daughter',
    });
  });

  test('parses dependents across multiple lines per entry', () => {
    const text = [
      'Dependents (qualifying child or relative):',
      '(a) First name  Last name  (b) SSN  (c) Relationship',
      'BILLY DOE',
      '000-00-0002',
      'Son',
      'SALLY DOE',
      '000-00-0003',
      'Daughter',
      'Standard deduction',
    ].join('\n');

    const deps = extractDependentsFrom1040(text);
    expect(deps).toHaveLength(2);
    expect(deps[0].firstName).toBe('Billy');
    expect(deps[0].lastName).toBe('Doe');
    expect(deps[0].ssn).toBe('000-00-0002');
    expect(deps[0].relationship).toBe('son');
    expect(deps[1].firstName).toBe('Sally');
    expect(deps[1].ssn).toBe('000-00-0003');
    expect(deps[1].relationship).toBe('daughter');
  });

  test('returns empty array when no dependents section found', () => {
    const text = 'Form 1040\nIncome: $50,000\nTax: $5,000';
    const deps = extractDependentsFrom1040(text);
    expect(deps).toEqual([]);
  });

  test('does not include primary/spouse SSNs as dependents', () => {
    const text = [
      'Your social security number 000-00-0000',
      "Spouse's social security number 000-00-0001",
      'Dependents: (a) Qualifying person\'s name  (b) SSN',
      'BILLY DOE 000-00-0002 Son',
      'Income',
    ].join('\n');

    const deps = extractDependentsFrom1040(text);
    expect(deps).toHaveLength(1);
    expect(deps[0].ssn).toBe('000-00-0002');
  });
});

// --- 7. Filing status detection ---

describe('1040 Filing Status Detection', () => {
  test('detects MFJ from filing status label', () => {
    expect(extractFilingStatusFrom1040('Filing Status: Married Filing Jointly')).toBe('mfj');
  });

  test('detects Single from filing status label', () => {
    expect(extractFilingStatusFrom1040('Filing Status: Single')).toBe('single');
  });

  test('detects HOH from filing status label', () => {
    expect(extractFilingStatusFrom1040('Filing Status: Head of Household')).toBe('hoh');
  });

  test('detects MFS from filing status label', () => {
    expect(extractFilingStatusFrom1040('Filing Status: Married Filing Separately')).toBe('mfs');
  });

  test('detects checkbox X before status', () => {
    expect(extractFilingStatusFrom1040('[X] Married Filing Jointly\n[ ] Single')).toBe('mfj');
  });

  test('detects X on line before status text', () => {
    const text = 'X\nMarried filing jointly';
    expect(extractFilingStatusFrom1040(text)).toBe('mfj');
  });

  test('returns undefined for no filing status', () => {
    expect(extractFilingStatusFrom1040('Some random text')).toBeUndefined();
  });
});

// --- 8. W-2 structured field parsing ---

describe('W-2 Structured Field Parsing', () => {
  test('parses W-2 with labeled boxes', () => {
    const text = [
      "a Employee's social security number: 000-00-0000",
      'b Employer identification number (EIN): 00-0000000',
      'c Employer name: Acme Corp',
      "e Employee's first name: JANE DOE",
      "f Employee's address: 456 Oak Ave, Springfield, IL 62704",
      '15 State: CA  16 State wages: 50000  17 State income tax: 3000',
    ].join('\n');

    const w2 = extractPrimaryFromW2(text);
    expect(w2.ssn).toBe('000-00-0000');
    expect(w2.name).toEqual({ firstName: 'Jane', lastName: 'Doe' });
    expect(w2.ein).toBe('00-0000000');
    expect(w2.address).toEqual({
      street: '456 Oak Ave',
      city: 'Springfield',
      state: 'IL',
      zip: '62704',
    });
    expect(w2.state).toBe('CA');
  });

  test('parses W-2 with SSN on line after label', () => {
    const text = [
      "a Employee's social security number",
      '000-00-0000',
      "e Employee's name",
      'JANE DOE',
    ].join('\n');

    const w2 = extractPrimaryFromW2(text);
    expect(w2.ssn).toBe('000-00-0000');
    expect(w2.name).toEqual({ firstName: 'Jane', lastName: 'Doe' });
  });

  test('parses address with street on one line and city/state/zip on next', () => {
    const text = [
      "f Employee's address",
      '789 Elm Rd',
      'Anytown, CA 90210',
    ].join('\n');

    const w2 = extractPrimaryFromW2(text);
    expect(w2.address).toEqual({
      street: '789 Elm Rd',
      city: 'Anytown',
      state: 'CA',
      zip: '90210',
    });
  });
});

// --- 9. End-to-end: full 1040 + W-2 documents ---

describe('Full Document Integration', () => {
  test('extracts complete profile from 1040 with spouse and dependents', () => {
    const form1040Text = [
      'Form 1040  U.S. Individual Income Tax Return  2024',
      'Filing Status: Married Filing Jointly',
      'Your first name and middle initial  Last name  Your social security number',
      'JANE                               DOE         000-00-0000',
      "If joint return, spouse's first name and middle initial  Last name  Spouse's social security number",
      'JOHN A                             DOE         000-00-0001',
      'Home address (number and street)  City  State  ZIP',
      '123 Main St, Anytown, CA 90210',
      'Dependents: (a) Qualifying person\'s name  (b) SSN  (c) Relationship  (d) CTC',
      'BILLY DOE          000-00-0002  Son  ✓',
      'SALLY DOE          000-00-0003  Daughter  ✓',
      'Income',
      'Wages: $100,000',
    ].join('\n');

    const doc = makeDoc(form1040Text, 'other');
    const profile = extractProfileFromDocuments([doc]);

    expect(profile.filingStatus).toBe('mfj');
    expect(profile.primaryFiler.firstName).toBe('Jane');
    expect(profile.primaryFiler.lastName).toBe('Doe');
    expect(profile.primaryFiler.ssn).toBe('000-00-0000');
    expect(profile.spouse).toBeDefined();
    expect(profile.spouse!.firstName).toBe('John');
    expect(profile.spouse!.lastName).toBe('Doe');
    expect(profile.spouse!.ssn).toBe('000-00-0001');
    expect(profile.dependents).toHaveLength(2);
    expect(profile.dependents![0].firstName).toBe('Billy');
    expect(profile.dependents![0].ssn).toBe('000-00-0002');
    expect(profile.dependents![0].relationship).toBe('son');
    expect(profile.dependents![1].firstName).toBe('Sally');
    expect(profile.dependents![1].relationship).toBe('daughter');
    expect(profile.primaryFiler.address).toEqual({
      street: '123 Main St',
      city: 'Anytown',
      state: 'CA',
      zip: '90210',
    });
    expect(profile.stateOfResidence).toBe('CA');
  });

  test('fills gaps from W-2 when 1040 is incomplete', () => {
    // 1040 with just filing status
    const form1040 = makeDoc(
      'Form 1040\nFiling Status: Single\nIncome: $50,000',
      'other',
    );
    // W-2 with name, SSN, address
    const w2 = makeDoc(
      [
        "a Employee's social security number: 000-00-0000",
        'b Employer identification number (EIN): 00-0000000',
        "e Employee's first name: JANE DOE",
        "f Employee's address: 456 Oak Ave, Springfield, IL 62704",
        '15 State: CA',
      ].join('\n'),
      'w2',
    );

    const profile = extractProfileFromDocuments([form1040, w2]);
    expect(profile.filingStatus).toBe('single');
    expect(profile.primaryFiler.firstName).toBe('Jane');
    expect(profile.primaryFiler.ssn).toBe('000-00-0000');
    expect(profile.employerEIN).toBe('00-0000000');
    expect(profile.stateOfResidence).toBe('CA');
  });

  test('W-2 alone provides complete first-time filer profile', () => {
    const w2 = makeDoc(
      [
        "a Employee's social security number: 000-00-0000",
        'b Employer identification number (EIN): 00-0000000',
        "e Employee's first name: JANE DOE",
        "f Employee's address: 456 Oak Ave, Springfield, IL 62704",
        '15 State: CA',
      ].join('\n'),
      'w2',
    );

    const profile = extractProfileFromDocuments([w2]);
    expect(profile.primaryFiler.firstName).toBe('Jane');
    expect(profile.primaryFiler.lastName).toBe('Doe');
    expect(profile.primaryFiler.ssn).toBe('000-00-0000');
    expect(profile.primaryFiler.address).toEqual({
      street: '456 Oak Ave',
      city: 'Springfield',
      state: 'IL',
      zip: '62704',
    });
    expect(profile.employerEIN).toBe('00-0000000');
    expect(profile.stateOfResidence).toBe('CA');
  });

  test('1040 data takes priority over W-2 data', () => {
    const form1040 = makeDoc(
      [
        'Form 1040  U.S. Individual Income Tax Return',
        'Your first name and middle initial  Last name  Your social security number',
        'JANE                               DOE         000-00-1111',
        'Home address (number and street)',
        '999 Priority Ln, Maintown, NY 10001',
      ].join('\n'),
      'other',
    );
    const w2 = makeDoc(
      [
        "a Employee's social security number: 000-00-2222",
        "e Employee's first name: JANE DOE",
        "f Employee's address: 456 Oak Ave, Springfield, IL 62704",
      ].join('\n'),
      'w2',
    );

    const profile = extractProfileFromDocuments([form1040, w2]);
    // 1040 should win
    expect(profile.primaryFiler.ssn).toBe('000-00-1111');
    expect(profile.primaryFiler.address!.street).toBe('999 Priority Ln');
    expect(profile.primaryFiler.address!.state).toBe('NY');
  });
});
