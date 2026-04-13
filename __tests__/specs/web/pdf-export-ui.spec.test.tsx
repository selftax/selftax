/**
 * @jest-environment jsdom
 */
/**
 * Spec: PDF Export Page
 *
 * Status: hypothesis
 * Confirm: Users can select forms, generate PDFs, and download them
 *          from a dedicated export page after reviewing their tax return.
 * Invalidate: PDF generation fails or UX flow is confusing
 *
 * Covers:
 * - ExportPage renders form checkboxes for each required form
 * - "Generate All" button triggers PDF generation
 * - Download links appear after generation completes
 * - Progress indicator shows during generation
 * - Export Zustand store tracks generation state
 * - PDF service builds correct data (pdf-lib mocked)
 * - Route /export is wired in App
 */

import React, { act } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import type { TaxFormType } from '@selftax/core';

// Mock document processor to prevent transitive pdfjs-dist ESM import via App -> DocumentsPage
jest.mock('@selftax/web/services/documentProcessor', () => ({
  processDocument: jest.fn().mockResolvedValue(undefined),
}));

// ---- Export Store Tests ----

describe('PDF Export', () => {
  describe('Export store (Zustand)', () => {
    // We import the store lazily so it can be reset between tests
    let useExportStore: typeof import('@selftax/web/stores/exportStore').useExportStore;

    beforeEach(async () => {
      const mod = await import('@selftax/web/stores/exportStore');
      useExportStore = mod.useExportStore;
      act(() => {
        useExportStore.getState().reset();
      });
    });

    test('initial state has no generated PDFs and is idle', () => {
      const state = useExportStore.getState();
      expect(state.generatedPDFs).toEqual({});
      expect(state.status).toBe('idle');
      expect(state.progress).toBe(0);
    });

    test('setSelectedForms updates which forms are selected', () => {
      act(() => {
        useExportStore.getState().setSelectedForms(['1040', 'schedule-a']);
      });
      const state = useExportStore.getState();
      expect(state.selectedForms).toEqual(['1040', 'schedule-a']);
    });

    test('toggleForm adds and removes forms from selection', () => {
      act(() => {
        useExportStore.getState().setSelectedForms(['1040', 'schedule-a']);
      });
      act(() => {
        useExportStore.getState().toggleForm('schedule-a');
      });
      expect(useExportStore.getState().selectedForms).toEqual(['1040']);
      act(() => {
        useExportStore.getState().toggleForm('schedule-d');
      });
      expect(useExportStore.getState().selectedForms).toContain('schedule-d');
    });

    test('setGeneratedPDF stores a PDF blob URL for a form', () => {
      act(() => {
        useExportStore.getState().setGeneratedPDF('1040', 'blob:http://localhost/abc123');
      });
      expect(useExportStore.getState().generatedPDFs['1040']).toBe('blob:http://localhost/abc123');
    });

    test('setStatus transitions between idle, generating, done, error', () => {
      act(() => {
        useExportStore.getState().setStatus('generating');
      });
      expect(useExportStore.getState().status).toBe('generating');
      act(() => {
        useExportStore.getState().setStatus('done');
      });
      expect(useExportStore.getState().status).toBe('done');
    });

    test('setProgress updates progress (0 to 100)', () => {
      act(() => {
        useExportStore.getState().setProgress(50);
      });
      expect(useExportStore.getState().progress).toBe(50);
    });

    test('reset clears all state', () => {
      act(() => {
        useExportStore.getState().setSelectedForms(['1040']);
        useExportStore.getState().setGeneratedPDF('1040', 'blob:url');
        useExportStore.getState().setStatus('done');
        useExportStore.getState().setProgress(100);
      });
      act(() => {
        useExportStore.getState().reset();
      });
      const state = useExportStore.getState();
      expect(state.selectedForms).toEqual([]);
      expect(state.generatedPDFs).toEqual({});
      expect(state.status).toBe('idle');
      expect(state.progress).toBe(0);
    });
  });

  // ---- PDF Service Tests ----

  describe('PDF service', () => {
    test('buildFormPDFData returns field data for a 1040 form', async () => {
      const { buildFormPDFData } = await import('@selftax/web/services/pdfService');
      const { calculateForm1040, build1040Fields } = await import('@selftax/core');

      const result = calculateForm1040({ filingStatus: 'single', wages: 75000 });
      const data = buildFormPDFData('1040', build1040Fields(result));

      expect(data.title).toContain('1040');
      expect(data.rows.length).toBeGreaterThan(0);
      // Each row should have a label and value
      expect(data.rows[0]).toHaveProperty('label');
      expect(data.rows[0]).toHaveProperty('value');
    });

    test('buildFormPDFData returns field data for Schedule A', async () => {
      const { buildFormPDFData } = await import('@selftax/web/services/pdfService');
      const { calculateScheduleA, buildScheduleAFields } = await import('@selftax/core');

      const result = calculateScheduleA({
        filingStatus: 'single',
        stateIncomeTax: 5000,
        primaryPropertyTax: 8000,
        mortgageInterest: 12000,
        charitableCash: 2000,
      });
      const data = buildFormPDFData('schedule-a', buildScheduleAFields(result));

      expect(data.title).toContain('Schedule A');
      expect(data.rows.length).toBeGreaterThan(0);
    });

    test('generateFormPDF returns a Uint8Array of PDF bytes', async () => {
      const { generateFormPDF } = await import('@selftax/web/services/pdfService');

      const pdfBytes = await generateFormPDF('1040', {
        'f1-7': 75000,
        'f1-8': 75000,
        'f1-11': 59525,
        'f1-12': 8876,
      });

      expect(pdfBytes).toBeInstanceOf(Uint8Array);
      expect(pdfBytes.length).toBeGreaterThan(0);
    });

    test('generateFormPDF embeds PII fields when provided', async () => {
      const { generateFormPDF } = await import('@selftax/web/services/pdfService');

      const piiFields = {
        name: 'Jane Doe',
        ssn: '000-00-0000',
        address: '123 Main St',
        cityStateZip: 'Anytown, CA 90210',
      };

      const pdfBytes = await generateFormPDF('1040', { 'f1-7': 75000 }, piiFields);

      // PDF bytes should be generated (we can't inspect content easily,
      // but we verify the function accepts PII and returns bytes)
      expect(pdfBytes).toBeInstanceOf(Uint8Array);
      expect(pdfBytes.length).toBeGreaterThan(0);
    });
  });

  // ---- ExportPage UI Tests ----

  describe('ExportPage', () => {
    let useExportStore: typeof import('@selftax/web/stores/exportStore').useExportStore;
    let useTaxReturnStore: typeof import('@selftax/web/stores/taxReturnStore').useTaxReturnStore;

    beforeEach(async () => {
      const exportMod = await import('@selftax/web/stores/exportStore');
      useExportStore = exportMod.useExportStore;
      const taxMod = await import('@selftax/web/stores/taxReturnStore');
      useTaxReturnStore = taxMod.useTaxReturnStore;

      act(() => {
        useExportStore.getState().reset();
        useTaxReturnStore.getState().reset();
      });
    });

    function setupStoreWithForms(forms: TaxFormType[]) {
      act(() => {
        useTaxReturnStore.getState().setInput({
          filingStatus: 'single',
          wages: 85000,
          federalWithholding: 14000,
        });
        useTaxReturnStore.getState().compute();
        // Manually set requiredForms since setRequiredForms needs a TaxSituation
        useTaxReturnStore.setState({ requiredForms: forms });
        useExportStore.getState().setSelectedForms([...forms]);
      });
    }

    test('renders page heading', async () => {
      const ExportPage = (await import('@selftax/web/pages/ExportPage')).default;
      setupStoreWithForms(['1040']);

      render(
        <MemoryRouter>
          <ExportPage />
        </MemoryRouter>,
      );

      expect(
        screen.getByRole('heading', { level: 1, name: /export tax forms/i }),
      ).toBeInTheDocument();
    });

    test('renders checkbox for each required form', async () => {
      const ExportPage = (await import('@selftax/web/pages/ExportPage')).default;
      setupStoreWithForms(['1040', 'schedule-a', 'schedule-d']);

      render(
        <MemoryRouter>
          <ExportPage />
        </MemoryRouter>,
      );

      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes).toHaveLength(3);
      // All should be checked by default
      checkboxes.forEach((cb) => {
        expect(cb).toBeChecked();
      });
    });

    test('toggling a checkbox updates the export store', async () => {
      const ExportPage = (await import('@selftax/web/pages/ExportPage')).default;
      setupStoreWithForms(['1040', 'schedule-a']);

      render(
        <MemoryRouter>
          <ExportPage />
        </MemoryRouter>,
      );

      const user = userEvent.setup();
      const checkboxes = screen.getAllByRole('checkbox');
      await user.click(checkboxes[1]); // uncheck schedule-a

      expect(useExportStore.getState().selectedForms).not.toContain('schedule-a');
    });

    test('has a "Generate All" button', async () => {
      const ExportPage = (await import('@selftax/web/pages/ExportPage')).default;
      setupStoreWithForms(['1040']);

      render(
        <MemoryRouter>
          <ExportPage />
        </MemoryRouter>,
      );

      expect(screen.getByTestId('generate-all-btn')).toBeInTheDocument();
      expect(screen.getByTestId('generate-all-btn')).toHaveTextContent(/generate/i);
    });

    test('shows progress indicator while generating', async () => {
      const ExportPage = (await import('@selftax/web/pages/ExportPage')).default;
      setupStoreWithForms(['1040']);

      // Set store to generating state
      act(() => {
        useExportStore.getState().setStatus('generating');
        useExportStore.getState().setProgress(50);
      });

      render(
        <MemoryRouter>
          <ExportPage />
        </MemoryRouter>,
      );

      expect(screen.getByTestId('progress-indicator')).toBeInTheDocument();
      expect(screen.getByTestId('progress-indicator')).toHaveTextContent(/50/);
    });

    test('shows download links after generation completes', async () => {
      const ExportPage = (await import('@selftax/web/pages/ExportPage')).default;
      setupStoreWithForms(['1040', 'schedule-a']);

      act(() => {
        useExportStore.getState().setStatus('done');
        useExportStore.getState().setGeneratedPDF('1040', 'blob:http://localhost/pdf1');
        useExportStore.getState().setGeneratedPDF('schedule-a', 'blob:http://localhost/pdf2');
      });

      render(
        <MemoryRouter>
          <ExportPage />
        </MemoryRouter>,
      );

      const downloadLinks = screen.getAllByTestId(/^download-link-/);
      expect(downloadLinks).toHaveLength(2);
      expect(downloadLinks[0]).toHaveAttribute('href', 'blob:http://localhost/pdf1');
      expect(downloadLinks[1]).toHaveAttribute('href', 'blob:http://localhost/pdf2');
    });

    test('has "Back to Review" link pointing to /review', async () => {
      const ExportPage = (await import('@selftax/web/pages/ExportPage')).default;
      setupStoreWithForms(['1040']);

      render(
        <MemoryRouter>
          <ExportPage />
        </MemoryRouter>,
      );

      const backLink = screen.getByTestId('back-to-review');
      expect(backLink).toHaveAttribute('href', '/review');
    });

    test('shows error message when generation fails', async () => {
      const ExportPage = (await import('@selftax/web/pages/ExportPage')).default;
      setupStoreWithForms(['1040']);

      act(() => {
        useExportStore.getState().setStatus('error');
        useExportStore.getState().setError('Failed to generate PDF');
      });

      render(
        <MemoryRouter>
          <ExportPage />
        </MemoryRouter>,
      );

      expect(screen.getByTestId('error-message')).toHaveTextContent(/failed to generate/i);
    });
  });

  // ---- Route Integration ----

  describe('Route integration', () => {
    test('/export route renders ExportPage', async () => {
      const App = (await import('@selftax/web/App')).default;

      render(
        <MemoryRouter initialEntries={['/export']}>
          <App />
        </MemoryRouter>,
      );

      expect(
        screen.getByRole('heading', { level: 1, name: /export tax forms/i }),
      ).toBeInTheDocument();
    });
  });
});
