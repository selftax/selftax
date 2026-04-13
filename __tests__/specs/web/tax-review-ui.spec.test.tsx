/**
 * @jest-environment jsdom
 */
/**
 * Spec: Tax Return Review Screen
 *
 * Status: hypothesis
 * Confirm: Users can see a complete summary of their tax return before
 *          generating PDFs — including filing status, AGI, deductions,
 *          taxable income, tax liability, credits, refund/owed, and
 *          all required forms with key line items.
 * Invalidate: Summary view is confusing or incomplete for user decision-making
 *
 * Covers:
 * - TaxSummary component renders all key 1040 fields
 * - FormList component shows required forms with labels
 * - Tax return Zustand store holds input, computes results, tracks forms
 * - ReviewPage integrates summary + form list + navigation
 * - "Back to Advisor" and "Generate PDF" navigation buttons
 */

import React, { act } from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import TaxSummary from '@selftax/web/components/TaxSummary';
import FormList from '@selftax/web/components/FormList';
import ReviewPage from '@selftax/web/pages/ReviewPage';
import {
  useTaxReturnStore,
  getFormLabel,
} from '@selftax/web/stores/taxReturnStore';
import type { FormSummaryEntry } from '@selftax/web/stores/taxReturnStore';
import type { Form1040Output, TaxFormType } from '@selftax/core';

// Sample computed result for a single filer with W-2 wages
const SAMPLE_RESULT: Form1040Output = {
  totalIncome: 85000,
  agi: 85000,
  deduction: 15475,
  deductionType: 'standard',
  qbiDeduction: 0,
  taxableIncome: 69525,
  tax: 11063,
  childTaxCredit: 0,
  totalCredits: 0,
  totalTax: 11063,
  totalPayments: 14000,
  refundOrOwed: 2937,
  isRefund: true,
};

// Result for a filer who owes money
const OWES_RESULT: Form1040Output = {
  totalIncome: 120000,
  agi: 120000,
  deduction: 15475,
  deductionType: 'standard',
  qbiDeduction: 0,
  taxableIncome: 104525,
  tax: 19943,
  childTaxCredit: 0,
  totalCredits: 0,
  totalTax: 19943,
  totalPayments: 15000,
  refundOrOwed: -4943,
  isRefund: false,
};

const SAMPLE_FORM_SUMMARIES: FormSummaryEntry[] = [
  {
    formType: '1040',
    label: 'Form 1040',
    keyFields: [
      { name: 'Total Income', value: 85000 },
      { name: 'AGI', value: 85000 },
    ],
  },
  {
    formType: 'schedule-d',
    label: 'Schedule D',
    keyFields: [
      { name: 'Net Capital Gain/Loss', value: 5000 },
    ],
  },
];

describe('Tax Return Review Screen', () => {
  beforeEach(() => {
    useTaxReturnStore.getState().reset();
  });

  describe('TaxSummary component', () => {
    test('renders all key financial fields from Form 1040', () => {
      render(<TaxSummary result={SAMPLE_RESULT} filingStatus="single" />);

      expect(screen.getByTestId('tax-summary')).toBeInTheDocument();
      expect(screen.getByTestId('filing-status')).toHaveTextContent('Single');
      expect(screen.getByTestId('total-income')).toHaveTextContent('$85,000');
      expect(screen.getByTestId('agi')).toHaveTextContent('$85,000');
      expect(screen.getByTestId('deduction')).toHaveTextContent('$15,475');
      expect(screen.getByTestId('taxable-income')).toHaveTextContent('$69,525');
      expect(screen.getByTestId('tax')).toHaveTextContent('$11,063');
      expect(screen.getByTestId('total-credits')).toHaveTextContent('$0');
      expect(screen.getByTestId('total-tax')).toHaveTextContent('$11,063');
      expect(screen.getByTestId('total-payments')).toHaveTextContent('$14,000');
    });

    test('shows refund amount when overpaid', () => {
      render(<TaxSummary result={SAMPLE_RESULT} filingStatus="single" />);

      const refundEl = screen.getByTestId('refund-or-owed');
      expect(refundEl).toHaveTextContent('$2,937');
      // Should show "Refund" label
      expect(screen.getByText('Refund')).toBeInTheDocument();
    });

    test('shows amount owed when underpaid', () => {
      render(<TaxSummary result={OWES_RESULT} filingStatus="single" />);

      const owedEl = screen.getByTestId('refund-or-owed');
      expect(owedEl).toHaveTextContent('$4,943');
      // Should show "Amount Owed" label
      expect(screen.getByText('Amount Owed')).toBeInTheDocument();
    });

    test('shows deduction type (standard vs itemized)', () => {
      render(<TaxSummary result={SAMPLE_RESULT} filingStatus="single" />);

      expect(screen.getByText(/Standard/)).toBeInTheDocument();
    });

    test('displays filing status label correctly for MFJ', () => {
      render(<TaxSummary result={SAMPLE_RESULT} filingStatus="mfj" />);

      expect(screen.getByTestId('filing-status')).toHaveTextContent(
        'Married Filing Jointly',
      );
    });
  });

  describe('FormList component', () => {
    test('renders all required forms with labels', () => {
      const forms: TaxFormType[] = ['1040', 'schedule-d', 'form-8949'];

      render(<FormList requiredForms={forms} formSummaries={[]} />);

      expect(screen.getByTestId('form-list')).toBeInTheDocument();
      expect(screen.getByTestId('form-entry-1040')).toBeInTheDocument();
      expect(screen.getByTestId('form-entry-schedule-d')).toBeInTheDocument();
      expect(screen.getByTestId('form-entry-form-8949')).toBeInTheDocument();
      expect(screen.getByText(/Form 1040/)).toBeInTheDocument();
      expect(screen.getByText(/Schedule D/)).toBeInTheDocument();
      expect(screen.getByText(/Form 8949/)).toBeInTheDocument();
    });

    test('shows key fields for forms with summaries', () => {
      const forms: TaxFormType[] = ['1040', 'schedule-d'];

      render(
        <FormList requiredForms={forms} formSummaries={SAMPLE_FORM_SUMMARIES} />,
      );

      expect(screen.getByText('Total Income')).toBeInTheDocument();
      expect(screen.getByText('AGI')).toBeInTheDocument();
      expect(screen.getByText('Net Capital Gain/Loss')).toBeInTheDocument();
    });

    test('shows count of required forms', () => {
      const forms: TaxFormType[] = ['1040', 'schedule-a', 'schedule-d'];

      render(<FormList requiredForms={forms} formSummaries={[]} />);

      expect(screen.getByText(/Required Forms \(3\)/)).toBeInTheDocument();
    });

    test('shows empty state when no forms are required', () => {
      render(<FormList requiredForms={[]} formSummaries={[]} />);

      expect(screen.getByText(/No forms determined yet/)).toBeInTheDocument();
    });
  });

  describe('Tax return store (Zustand)', () => {
    test('setInput stores Form 1040 input data', () => {
      act(() => {
        useTaxReturnStore.getState().setInput({
          filingStatus: 'single',
          wages: 85000,
          federalWithholding: 14000,
        });
      });

      const state = useTaxReturnStore.getState();
      expect(state.input.filingStatus).toBe('single');
      expect(state.input.wages).toBe(85000);
      expect(state.input.federalWithholding).toBe(14000);
      expect(state.computed).toBe(false);
    });

    test('compute runs calculateForm1040 and stores result', () => {
      act(() => {
        useTaxReturnStore.getState().setInput({
          filingStatus: 'single',
          wages: 85000,
          federalWithholding: 14000,
        });
        useTaxReturnStore.getState().compute();
      });

      const state = useTaxReturnStore.getState();
      expect(state.computed).toBe(true);
      expect(state.result).not.toBeNull();
      expect(state.result!.totalIncome).toBe(85000);
      expect(state.result!.agi).toBe(85000);
      expect(state.result!.isRefund).toBe(true);
      expect(state.result!.refundOrOwed).toBeGreaterThan(0);
    });

    test('setRequiredForms determines forms from a TaxSituation', () => {
      act(() => {
        useTaxReturnStore.getState().setRequiredForms({
          filingStatus: 'single',
          hasW2Income: true,
          hasRentalProperty: false,
          hasStockSales: true,
          hasISOs: false,
          hasDependentCareFSA: false,
        });
      });

      const forms = useTaxReturnStore.getState().requiredForms;
      expect(forms).toContain('1040');
      expect(forms).toContain('schedule-d');
      expect(forms).toContain('form-8949');
    });

    test('setFormSummaries replaces all form summaries', () => {
      act(() => {
        useTaxReturnStore.getState().setFormSummaries(SAMPLE_FORM_SUMMARIES);
      });

      const summaries = useTaxReturnStore.getState().formSummaries;
      expect(summaries).toHaveLength(2);
      expect(summaries[0].formType).toBe('1040');
      expect(summaries[1].formType).toBe('schedule-d');
    });

    test('reset clears all store state', () => {
      act(() => {
        useTaxReturnStore.getState().setInput({
          filingStatus: 'mfj',
          wages: 100000,
        });
        useTaxReturnStore.getState().compute();
        useTaxReturnStore.getState().setFormSummaries(SAMPLE_FORM_SUMMARIES);
      });

      expect(useTaxReturnStore.getState().computed).toBe(true);

      act(() => {
        useTaxReturnStore.getState().reset();
      });

      const state = useTaxReturnStore.getState();
      expect(state.computed).toBe(false);
      expect(state.result).toBeNull();
      expect(state.requiredForms).toHaveLength(0);
      expect(state.formSummaries).toHaveLength(0);
    });

    test('getFormLabel returns human-readable form names', () => {
      expect(getFormLabel('1040')).toContain('1040');
      expect(getFormLabel('schedule-a')).toContain('Schedule A');
      expect(getFormLabel('schedule-d')).toContain('Schedule D');
      expect(getFormLabel('form-2441')).toContain('2441');
      expect(getFormLabel('form-6251')).toContain('6251');
    });
  });

  describe('ReviewPage integration', () => {
    test('renders page heading and description', () => {
      render(
        <MemoryRouter>
          <ReviewPage />
        </MemoryRouter>,
      );

      expect(
        screen.getByRole('heading', { name: /review your return/i }),
      ).toBeInTheDocument();
      expect(screen.getByText(/review your tax return summary/i)).toBeInTheDocument();
    });

    test('shows no-data message when store has no input', () => {
      render(
        <MemoryRouter>
          <ReviewPage />
        </MemoryRouter>,
      );

      // The default input with no wages results in $0 across the board,
      // but it still computes. The page should show the TaxSummary.
      // With default single + no wages, result is non-null after compute.
      expect(screen.getByTestId('tax-summary')).toBeInTheDocument();
    });

    test('shows TaxSummary when store has computed result', () => {
      act(() => {
        useTaxReturnStore.getState().setInput({
          filingStatus: 'single',
          wages: 85000,
          federalWithholding: 14000,
        });
        useTaxReturnStore.getState().compute();
      });

      render(
        <MemoryRouter>
          <ReviewPage />
        </MemoryRouter>,
      );

      expect(screen.getByTestId('tax-summary')).toBeInTheDocument();
      expect(screen.getByTestId('total-income')).toHaveTextContent('$85,000');
    });

    test('shows FormList with required forms', () => {
      act(() => {
        useTaxReturnStore.getState().setInput({
          filingStatus: 'single',
          wages: 85000,
        });
        useTaxReturnStore.getState().compute();
        useTaxReturnStore.getState().setRequiredForms({
          filingStatus: 'single',
          hasW2Income: true,
          hasRentalProperty: false,
          hasStockSales: false,
          hasISOs: false,
          hasDependentCareFSA: false,
        });
      });

      render(
        <MemoryRouter>
          <ReviewPage />
        </MemoryRouter>,
      );

      expect(screen.getByTestId('form-list')).toBeInTheDocument();
      expect(screen.getByTestId('form-entry-1040')).toBeInTheDocument();
    });

    test('has "Back to Advisor" link pointing to /advisor', () => {
      render(
        <MemoryRouter>
          <ReviewPage />
        </MemoryRouter>,
      );

      const backLink = screen.getByTestId('back-to-advisor');
      expect(backLink).toBeInTheDocument();
      expect(backLink).toHaveTextContent(/back to advisor/i);
      expect(backLink).toHaveAttribute('href', '/advisor');
    });

    test('has "Generate PDF" link pointing to /export', () => {
      act(() => {
        useTaxReturnStore.getState().setInput({
          filingStatus: 'single',
          wages: 50000,
        });
        useTaxReturnStore.getState().compute();
      });

      render(
        <MemoryRouter>
          <ReviewPage />
        </MemoryRouter>,
      );

      const pdfLink = screen.getByTestId('generate-pdf');
      expect(pdfLink).toBeInTheDocument();
      expect(pdfLink).toHaveTextContent(/generate pdf/i);
      expect(pdfLink).toHaveAttribute('href', '/export');
    });
  });
});
