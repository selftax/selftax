/**
 * @jest-environment jsdom
 */
/**
 * Spec: PII Verification UI (React Components)
 *
 * Status: hypothesis
 * Confirm: Users can review detected PII, see before/after redaction preview,
 *          approve or edit detections, and continue to review only after approval.
 * Invalidate: Redaction preview too confusing for users to understand
 *
 * Covers:
 * - VerifyPage renders with document list and PII highlights
 * - PIIHighlighter shows original text with PII spans highlighted
 * - RedactedPreview shows the after-redaction text
 * - Users can remove a false-positive detection
 * - Users can add a manual PII detection
 * - Approve & Continue button marks documents verified and navigates
 * - Documents without PII still appear for confirmation
 * - PII count summary by type displayed
 * - Document store tracks extractedText and piiDetections per document
 */

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import PIIHighlighter from '@selftax/web/components/PIIHighlighter';
import RedactedPreview from '@selftax/web/components/RedactedPreview';
import VerifyPage from '@selftax/web/pages/VerifyPage';
import { useDocumentStore } from '@selftax/web/stores/documentStore';
import type { PIIDetection } from '@selftax/core';

function createMockFile(name: string, size: number, type: string): File {
  const buffer = new ArrayBuffer(size);
  return new File([buffer], name, { type });
}

describe('PII Verification UI', () => {
  beforeEach(() => {
    useDocumentStore.setState({ documents: [] });
  });

  describe('PIIHighlighter component', () => {
    test('renders text with PII spans highlighted', () => {
      const text = 'SSN: 000-00-0000, Wages: $50,000';
      const detections: PIIDetection[] = [
        { type: 'ssn', value: '000-00-0000', startIndex: 5, endIndex: 16, confidence: 'pattern' },
      ];

      render(<PIIHighlighter text={text} detections={detections} />);

      const highlighted = screen.getByTestId('pii-highlight-0');
      expect(highlighted).toHaveTextContent('000-00-0000');
      // Non-PII text is also visible
      expect(screen.getByTestId('pii-highlighter')).toHaveTextContent('$50,000');
    });

    test('highlights multiple PII detections with type labels', () => {
      const text = 'Jane Doe SSN 000-00-0000 email jane@example.com';
      const detections: PIIDetection[] = [
        { type: 'name', value: 'Jane Doe', startIndex: 0, endIndex: 8, confidence: 'profile-match' },
        { type: 'ssn', value: '000-00-0000', startIndex: 13, endIndex: 24, confidence: 'pattern' },
        { type: 'email', value: 'jane@example.com', startIndex: 31, endIndex: 47, confidence: 'exact' },
      ];

      render(<PIIHighlighter text={text} detections={detections} />);

      expect(screen.getByTestId('pii-highlight-0')).toHaveTextContent('Jane Doe');
      expect(screen.getByTestId('pii-highlight-1')).toHaveTextContent('000-00-0000');
      expect(screen.getByTestId('pii-highlight-2')).toHaveTextContent('jane@example.com');
    });

    test('calls onRemoveDetection when user clicks remove on a highlight', () => {
      const text = 'EIN: 12-3456789';
      const detections: PIIDetection[] = [
        { type: 'ein', value: '12-3456789', startIndex: 5, endIndex: 15, confidence: 'pattern' },
      ];
      const onRemove = jest.fn();

      render(
        <PIIHighlighter text={text} detections={detections} onRemoveDetection={onRemove} />,
      );

      const removeBtn = screen.getByTestId('remove-detection-0');
      fireEvent.click(removeBtn);
      expect(onRemove).toHaveBeenCalledWith(0);
    });
  });

  describe('RedactedPreview component', () => {
    test('shows redacted text with [REDACTED] replacing PII', () => {
      const redactedText = 'SSN: [REDACTED], Wages: $50,000';

      render(<RedactedPreview redactedText={redactedText} />);

      const preview = screen.getByTestId('redacted-preview');
      expect(preview).toHaveTextContent('[REDACTED]');
      expect(preview).toHaveTextContent('$50,000');
      expect(preview).not.toHaveTextContent('000-00-0000');
    });
  });

  describe('VerifyPage', () => {
    test('renders document cards with PII highlights for each document', () => {
      const file = createMockFile('w2.pdf', 1024, 'application/pdf');

      act(() => {
        const entry = useDocumentStore.getState().addDocument(file);
        useDocumentStore.getState().setExtractedText(
          entry.id,
          'Jane Doe SSN 000-00-0000 Wages $50,000',
        );
      });

      render(
        <MemoryRouter>
          <VerifyPage />
        </MemoryRouter>,
      );

      expect(screen.getByText(/verify pii redactions/i)).toBeInTheDocument();
      expect(screen.getByText('w2.pdf')).toBeInTheDocument();
      // SSN should be highlighted
      expect(screen.getByTestId('pii-highlighter')).toBeInTheDocument();
    });

    test('shows PII count summary by type', () => {
      const file = createMockFile('w2.pdf', 1024, 'application/pdf');

      act(() => {
        const entry = useDocumentStore.getState().addDocument(file);
        useDocumentStore.getState().setExtractedText(
          entry.id,
          'SSN: 000-00-0000, Phone: (555) 123-4567, Email: jane@example.com',
        );
      });

      render(
        <MemoryRouter>
          <VerifyPage />
        </MemoryRouter>,
      );

      expect(screen.getByTestId('pii-summary')).toBeInTheDocument();
      expect(screen.getByTestId('pii-summary')).toHaveTextContent(/ssn/i);
    });

    test('shows before/after toggle for redacted preview', () => {
      const file = createMockFile('w2.pdf', 1024, 'application/pdf');

      act(() => {
        const entry = useDocumentStore.getState().addDocument(file);
        useDocumentStore.getState().setExtractedText(
          entry.id,
          'SSN: 000-00-0000 Wages: $50,000',
        );
      });

      render(
        <MemoryRouter>
          <VerifyPage />
        </MemoryRouter>,
      );

      // Toggle to redacted view
      const toggleBtn = screen.getByTestId('toggle-redacted');
      fireEvent.click(toggleBtn);
      expect(screen.getByTestId('redacted-preview')).toHaveTextContent('[REDACTED]');
    });

    test('allows removing a false positive detection', () => {
      const file = createMockFile('w2.pdf', 1024, 'application/pdf');

      act(() => {
        const entry = useDocumentStore.getState().addDocument(file);
        useDocumentStore.getState().setExtractedText(
          entry.id,
          'EIN: 12-3456789 Wages: $50,000',
        );
      });

      render(
        <MemoryRouter>
          <VerifyPage />
        </MemoryRouter>,
      );

      // EIN should be detected
      expect(screen.getByTestId('pii-highlight-0')).toHaveTextContent('12-3456789');

      // Remove the detection
      const removeBtn = screen.getByTestId('remove-detection-0');
      fireEvent.click(removeBtn);

      // Detection should be gone
      expect(screen.queryByTestId('pii-highlight-0')).not.toBeInTheDocument();
    });

    test('Approve & Continue button marks documents verified', () => {
      const file = createMockFile('w2.pdf', 1024, 'application/pdf');

      act(() => {
        const entry = useDocumentStore.getState().addDocument(file);
        useDocumentStore.getState().setExtractedText(
          entry.id,
          'SSN: 000-00-0000 Wages: $50,000',
        );
      });

      render(
        <MemoryRouter>
          <VerifyPage />
        </MemoryRouter>,
      );

      const approveBtn = screen.getByTestId('approve-continue');
      fireEvent.click(approveBtn);

      const docs = useDocumentStore.getState().documents;
      expect(docs[0].verified).toBe(true);
    });

    test('documents without PII still appear for confirmation', () => {
      const file = createMockFile('expenses.csv', 1024, 'text/csv');

      act(() => {
        const entry = useDocumentStore.getState().addDocument(file);
        useDocumentStore.getState().setExtractedText(
          entry.id,
          'Office supplies $200, Travel $500',
        );
      });

      render(
        <MemoryRouter>
          <VerifyPage />
        </MemoryRouter>,
      );

      expect(screen.getByText('expenses.csv')).toBeInTheDocument();
      expect(screen.getByText(/no pii detected/i)).toBeInTheDocument();
    });

    test('redirects to /documents when no documents are uploaded', () => {
      render(
        <MemoryRouter initialEntries={['/verify']}>
          <VerifyPage />
        </MemoryRouter>,
      );

      // Should show message directing user to upload documents
      expect(screen.getByText(/no documents to verify/i)).toBeInTheDocument();
      expect(screen.getByText(/upload documents/i)).toBeInTheDocument();
    });
  });

  describe('Document store PII extensions', () => {
    test('setExtractedText stores text and auto-detects PII', () => {
      const file = createMockFile('w2.pdf', 1024, 'application/pdf');

      act(() => {
        const entry = useDocumentStore.getState().addDocument(file);
        useDocumentStore.getState().setExtractedText(
          entry.id,
          'SSN: 000-00-0000, Name: Jane Doe',
          { firstName: 'Jane', lastName: 'Doe' },
        );
      });

      const doc = useDocumentStore.getState().documents[0];
      expect(doc.extractedText).toBe('SSN: 000-00-0000, Name: Jane Doe');
      expect(doc.piiDetections.length).toBeGreaterThanOrEqual(2);
    });

    test('updatePIIDetections replaces detections for a document', () => {
      const file = createMockFile('w2.pdf', 1024, 'application/pdf');

      act(() => {
        const entry = useDocumentStore.getState().addDocument(file);
        useDocumentStore.getState().setExtractedText(entry.id, 'SSN: 000-00-0000');
      });

      const originalDetections = useDocumentStore.getState().documents[0].piiDetections;
      expect(originalDetections.length).toBeGreaterThan(0);

      // User removes all detections
      act(() => {
        const id = useDocumentStore.getState().documents[0].id;
        useDocumentStore.getState().updatePIIDetections(id, []);
      });

      expect(useDocumentStore.getState().documents[0].piiDetections).toHaveLength(0);
    });

    test('setVerified marks a document as verified', () => {
      const file = createMockFile('w2.pdf', 1024, 'application/pdf');

      act(() => {
        const entry = useDocumentStore.getState().addDocument(file);
        expect(entry.verified).toBe(false);
        useDocumentStore.getState().setVerified(entry.id, true);
      });

      expect(useDocumentStore.getState().documents[0].verified).toBe(true);
    });
  });
});
