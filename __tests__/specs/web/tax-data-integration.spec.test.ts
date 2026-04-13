/**
 * @jest-environment jsdom
 */
/**
 * Spec: Document-to-Engine Tax Data Integration
 *
 * Status: hypothesis
 * Confirm: Extracted document data (W-2, 1099, 1098) and user profile
 *          flow correctly into Form1040Input and trigger computation,
 *          so the review page shows real results.
 * Invalidate: Data mapping between document mappers and tax engine breaks
 *
 * Covers:
 * - buildForm1040Input maps W-2 wages/withholding into Form1040Input
 * - buildForm1040Input maps 1099-INT interest income
 * - buildForm1040Input maps 1099-DIV dividends (ordinary + qualified)
 * - buildForm1040Input maps 1099-NEC nonemployee compensation
 * - buildForm1040Input maps 1099-B capital gains
 * - buildForm1040Input maps 1098 mortgage interest for itemized deductions
 * - Filing status from profile flows through
 * - Dependents count flows into qualifying children
 * - Federal withholding aggregated from W-2s and 1099s
 * - CA state tax computed when stateOfResidence is 'CA'
 * - taxReturnStore.computeFromDocuments builds input from documents + profile
 */

import { act } from 'react';
import '@testing-library/jest-dom';
import type { DocumentEntry } from '@selftax/web/stores/documentStore';
import type { FilingStatus } from '@selftax/core';
import { buildForm1040Input } from '@selftax/web/services/taxDataBuilder';
import { useTaxReturnStore } from '@selftax/web/stores/taxReturnStore';
import { useDocumentStore } from '@selftax/web/stores/documentStore';
import { useProfileStore } from '@selftax/web/stores/profileStore';

/** Helper: create a mock DocumentEntry with extractedText and type */
function mockDocument(
  type: DocumentEntry['type'],
  extractedText: string,
  overrides?: Partial<DocumentEntry>,
): DocumentEntry {
  return {
    id: `test-${Math.random().toString(36).slice(2)}`,
    name: `test-${type}.pdf`,
    size: 1024,
    mimeType: 'application/pdf',
    type,
    file: new File([], `test-${type}.pdf`),
    createdAt: new Date(),
    extractedText,
    piiDetections: [],
    verified: true,
    processingStatus: 'done',
    ...overrides,
  };
}

interface MockProfileState {
  filingStatus: FilingStatus;
  stateOfResidence: string;
  dependents: Array<{
    firstName: string;
    lastName: string;
    ssn: string;
    relationship: string;
  }>;
}

// Synthetic test data — W-2 OCR text
const W2_TEXT = `
Wage and Tax Statement 2025
Box 1 Wages: $85,000.00
Box 2 Federal income tax withheld: $14,000.00
Box 15 State: CA
Box 16 State wages: $85,000.00
Box 17 State income tax: $5,200.00
`;

const W2_TEXT_2 = `
Wage and Tax Statement 2025
Box 1 Wages: $25,000.00
Box 2 Federal income tax withheld: $3,500.00
Box 16 State wages: $25,000.00
Box 17 State income tax: $1,500.00
`;

const INT_TEXT = `
1099-INT Interest Income 2025
Box 1 Interest income: $1,250.00
Box 4 Federal income tax withheld: $0.00
`;

const DIV_TEXT = `
1099-DIV Dividend Income 2025
Box 1a Ordinary dividends: $3,200.00
Box 1b Qualified dividends: $2,800.00
Box 4 Federal income tax withheld: $320.00
`;

const NEC_TEXT = `
Form 1099-NEC Tax Year
Box 1 Nonemployee compensation: $12,000.00
Box 4 Federal income tax withheld: $0.00
`;

const BROKERAGE_TEXT = `
1099-B Proceeds from Broker 2025
Box 1a Proceeds: $15,000.00
Box 1e Cost basis: $10,000.00
Short-term
Box 4 Federal income tax withheld: $150.00
`;

const MORTGAGE_TEXT = `
1098 Mortgage Interest Statement 2025
Box 1 Mortgage interest received: $18,500.00
Box 10 Property tax: $12,000.00
`;

const DEFAULT_PROFILE: MockProfileState = {
  filingStatus: 'single',
  stateOfResidence: '',
  dependents: [],
};

describe('Document-to-Engine Tax Data Integration', () => {
  beforeEach(() => {
    useTaxReturnStore.getState().reset();
  });

  describe('buildForm1040Input', () => {
    test('maps W-2 wages and federal withholding into Form1040Input', () => {
      const docs = [mockDocument('w2', W2_TEXT)];
      const profile = { ...DEFAULT_PROFILE };

      const input = buildForm1040Input(docs, profile);

      expect(input.wages).toBe(85000);
      expect(input.federalWithholding).toBe(14000);
      expect(input.filingStatus).toBe('single');
    });

    test('aggregates multiple W-2s', () => {
      const docs = [
        mockDocument('w2', W2_TEXT),
        mockDocument('w2', W2_TEXT_2),
      ];
      const profile = { ...DEFAULT_PROFILE };

      const input = buildForm1040Input(docs, profile);

      expect(input.wages).toBe(110000); // 85000 + 25000
      expect(input.federalWithholding).toBe(17500); // 14000 + 3500
    });

    test('maps 1099-INT interest income', () => {
      const docs = [mockDocument('1099-int', INT_TEXT)];
      const profile = { ...DEFAULT_PROFILE };

      const input = buildForm1040Input(docs, profile);

      // Interest income flows into otherIncome on 1040
      expect(input.otherIncome).toBeGreaterThanOrEqual(1250);
    });

    test('maps 1099-DIV ordinary and qualified dividends', () => {
      const docs = [mockDocument('1099-div', DIV_TEXT)];
      const profile = { ...DEFAULT_PROFILE };

      const input = buildForm1040Input(docs, profile);

      expect(input.ordinaryDividends).toBe(3200);
      expect(input.qualifiedDividends).toBe(2800);
    });

    test('maps 1099-NEC nonemployee compensation into otherIncome', () => {
      const docs = [mockDocument('1099-nec', NEC_TEXT)];
      const profile = { ...DEFAULT_PROFILE };

      const input = buildForm1040Input(docs, profile);

      // NEC goes into otherIncome
      expect(input.otherIncome).toBeGreaterThanOrEqual(12000);
    });

    test('maps 1099-B proceeds minus cost basis into capitalGains', () => {
      const docs = [mockDocument('1099-b', BROKERAGE_TEXT)];
      const profile = { ...DEFAULT_PROFILE };

      const input = buildForm1040Input(docs, profile);

      expect(input.capitalGains).toBe(5000); // 15000 - 10000
    });

    test('maps 1098 mortgage interest into itemizedDeductions', () => {
      const docs = [mockDocument('1098', MORTGAGE_TEXT)];
      const profile = { ...DEFAULT_PROFILE };

      const input = buildForm1040Input(docs, profile);

      // Mortgage interest + property tax contribute to itemized deductions
      expect(input.itemizedDeductions).toBeGreaterThanOrEqual(18500);
    });

    test('aggregates federal withholding from W-2s and 1099s', () => {
      const docs = [
        mockDocument('w2', W2_TEXT),
        mockDocument('1099-div', DIV_TEXT),
        mockDocument('1099-b', BROKERAGE_TEXT),
      ];
      const profile = { ...DEFAULT_PROFILE };

      const input = buildForm1040Input(docs, profile);

      // 14000 (W-2) + 320 (1099-DIV) + 150 (1099-B) = 14470
      expect(input.federalWithholding).toBe(14470);
    });

    test('filing status from profile flows through', () => {
      const docs = [mockDocument('w2', W2_TEXT)];

      const input = buildForm1040Input(docs, {
        ...DEFAULT_PROFILE,
        filingStatus: 'mfj',
      });

      expect(input.filingStatus).toBe('mfj');
    });

    test('dependents count flows into qualifyingChildren', () => {
      const docs = [mockDocument('w2', W2_TEXT)];
      const profile: MockProfileState = {
        ...DEFAULT_PROFILE,
        dependents: [
          { firstName: 'Child', lastName: 'Doe', ssn: '000-00-0001', relationship: 'child' },
          { firstName: 'Child2', lastName: 'Doe', ssn: '000-00-0002', relationship: 'child' },
        ],
      };

      const input = buildForm1040Input(docs, profile);

      expect(input.qualifyingChildren).toBe(2);
    });

    test('handles mixed document types together', () => {
      const docs = [
        mockDocument('w2', W2_TEXT),
        mockDocument('1099-int', INT_TEXT),
        mockDocument('1099-div', DIV_TEXT),
        mockDocument('1099-b', BROKERAGE_TEXT),
        mockDocument('1098', MORTGAGE_TEXT),
      ];
      const profile: MockProfileState = {
        ...DEFAULT_PROFILE,
        filingStatus: 'mfj',
        dependents: [
          { firstName: 'Child', lastName: 'Doe', ssn: '000-00-0001', relationship: 'child' },
        ],
      };

      const input = buildForm1040Input(docs, profile);

      expect(input.filingStatus).toBe('mfj');
      expect(input.wages).toBe(85000);
      expect(input.ordinaryDividends).toBe(3200);
      expect(input.qualifiedDividends).toBe(2800);
      expect(input.capitalGains).toBe(5000);
      expect(input.qualifyingChildren).toBe(1);
      expect(input.federalWithholding).toBeGreaterThan(14000);
      expect(input.itemizedDeductions).toBeGreaterThanOrEqual(18500);
    });

    test('ignores documents with unrecognized types', () => {
      const docs = [
        mockDocument('w2', W2_TEXT),
        mockDocument('other', 'Some random document text'),
        mockDocument('receipt', 'Office supplies $50'),
      ];
      const profile = { ...DEFAULT_PROFILE };

      const input = buildForm1040Input(docs, profile);

      expect(input.wages).toBe(85000);
      // Other and receipt types should not affect core fields
    });
  });

  describe('taxReturnStore.computeFromDocuments', () => {
    test('builds Form1040Input from document and profile stores and computes', () => {
      // Set up document store with a W-2
      act(() => {
        const docStore = useDocumentStore.getState();
        const entry = docStore.addDocument(new File([], 'w2.pdf'));
        docStore.setExtractedText(entry.id, W2_TEXT);
      });

      // Set up profile store
      act(() => {
        const profileStore = useProfileStore.getState();
        profileStore.setFilingStatus('single');
        profileStore.setStateOfResidence('');
      });

      // Compute from documents
      act(() => {
        useTaxReturnStore.getState().computeFromDocuments(
          useDocumentStore.getState().documents,
          useProfileStore.getState(),
        );
      });

      const state = useTaxReturnStore.getState();
      expect(state.computed).toBe(true);
      expect(state.result).not.toBeNull();
      expect(state.result!.totalIncome).toBe(85000);
      expect(state.result!.isRefund).toBe(true);
      expect(state.input.wages).toBe(85000);
    });

    test('computes CA Form 540 when stateOfResidence is CA', () => {
      // Set up document store with a W-2
      act(() => {
        const docStore = useDocumentStore.getState();
        const entry = docStore.addDocument(new File([], 'w2.pdf'));
        docStore.setExtractedText(entry.id, W2_TEXT);
      });

      // Set up profile store with CA
      act(() => {
        const profileStore = useProfileStore.getState();
        profileStore.setFilingStatus('single');
        profileStore.setStateOfResidence('CA');
      });

      // Compute from documents
      act(() => {
        useTaxReturnStore.getState().computeFromDocuments(
          useDocumentStore.getState().documents,
          useProfileStore.getState(),
        );
      });

      const state = useTaxReturnStore.getState();
      expect(state.computed).toBe(true);
      expect(state.result).not.toBeNull();
      expect(state.form540Result).not.toBeNull();
      expect(state.form540Result!.caAGI).toBeGreaterThan(0);
      expect(state.form540Result!.totalTax).toBeGreaterThan(0);
    });

    test('does not compute CA Form 540 when state is not CA', () => {
      act(() => {
        const docStore = useDocumentStore.getState();
        const entry = docStore.addDocument(new File([], 'w2.pdf'));
        docStore.setExtractedText(entry.id, W2_TEXT);
      });

      act(() => {
        const profileStore = useProfileStore.getState();
        profileStore.setFilingStatus('single');
        profileStore.setStateOfResidence('NY');
      });

      act(() => {
        useTaxReturnStore.getState().computeFromDocuments(
          useDocumentStore.getState().documents,
          useProfileStore.getState(),
        );
      });

      const state = useTaxReturnStore.getState();
      expect(state.computed).toBe(true);
      expect(state.form540Result).toBeNull();
    });
  });
});
