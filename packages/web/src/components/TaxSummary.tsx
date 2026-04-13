import type { Form1040Output, FilingStatus } from '@selftax/core';

interface TaxSummaryProps {
  result: Form1040Output;
  filingStatus: FilingStatus;
}

const FILING_STATUS_LABELS: Record<FilingStatus, string> = {
  single: 'Single',
  mfj: 'Married Filing Jointly',
  mfs: 'Married Filing Separately',
  hoh: 'Head of Household',
  qw: 'Qualifying Widow(er)',
};

function formatCurrency(amount: number): string {
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return amount < 0 ? `(${formatted})` : formatted;
}

export default function TaxSummary({ result, filingStatus }: TaxSummaryProps) {
  return (
    <div data-testid="tax-summary" className="rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Tax Return Summary</h2>

      <div className="space-y-3">
        {/* Filing Status */}
        <div className="flex items-center justify-between border-b border-gray-100 pb-2">
          <span className="text-sm text-gray-600">Filing Status</span>
          <span data-testid="filing-status" className="text-sm font-medium text-gray-900">
            {FILING_STATUS_LABELS[filingStatus]}
          </span>
        </div>

        {/* Total Income */}
        <div className="flex items-center justify-between border-b border-gray-100 pb-2">
          <span className="text-sm text-gray-600">Total Income (Line 9)</span>
          <span data-testid="total-income" className="text-sm font-medium text-gray-900">
            {formatCurrency(result.totalIncome)}
          </span>
        </div>

        {/* AGI */}
        <div className="flex items-center justify-between border-b border-gray-100 pb-2">
          <span className="text-sm text-gray-600">Adjusted Gross Income (Line 11)</span>
          <span data-testid="agi" className="text-sm font-medium text-gray-900">
            {formatCurrency(result.agi)}
          </span>
        </div>

        {/* Deductions */}
        <div className="flex items-center justify-between border-b border-gray-100 pb-2">
          <span className="text-sm text-gray-600">
            Deduction ({result.deductionType === 'standard' ? 'Standard' : 'Itemized'})
          </span>
          <span data-testid="deduction" className="text-sm font-medium text-gray-900">
            {formatCurrency(result.deduction)}
          </span>
        </div>

        {/* Taxable Income */}
        <div className="flex items-center justify-between border-b border-gray-100 pb-2">
          <span className="text-sm text-gray-600">Taxable Income (Line 15)</span>
          <span data-testid="taxable-income" className="text-sm font-medium text-gray-900">
            {formatCurrency(result.taxableIncome)}
          </span>
        </div>

        {/* Tax */}
        <div className="flex items-center justify-between border-b border-gray-100 pb-2">
          <span className="text-sm text-gray-600">Tax (Line 16)</span>
          <span data-testid="tax" className="text-sm font-medium text-gray-900">
            {formatCurrency(result.tax)}
          </span>
        </div>

        {/* Credits */}
        <div className="flex items-center justify-between border-b border-gray-100 pb-2">
          <span className="text-sm text-gray-600">Total Credits</span>
          <span data-testid="total-credits" className="text-sm font-medium text-gray-900">
            {formatCurrency(result.totalCredits)}
          </span>
        </div>

        {/* Total Tax */}
        <div className="flex items-center justify-between border-b border-gray-100 pb-2">
          <span className="text-sm text-gray-600">Total Tax (Line 24)</span>
          <span data-testid="total-tax" className="text-sm font-medium text-gray-900">
            {formatCurrency(result.totalTax)}
          </span>
        </div>

        {/* Total Payments */}
        <div className="flex items-center justify-between border-b border-gray-100 pb-2">
          <span className="text-sm text-gray-600">Total Payments (Line 33)</span>
          <span data-testid="total-payments" className="text-sm font-medium text-gray-900">
            {formatCurrency(result.totalPayments)}
          </span>
        </div>

        {/* Refund or Amount Owed */}
        <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
          <span className={`text-sm font-semibold ${result.isRefund ? 'text-green-700' : 'text-red-700'}`}>
            {result.isRefund ? 'Refund' : 'Amount Owed'}
          </span>
          <span
            data-testid="refund-or-owed"
            className={`text-lg font-bold ${result.isRefund ? 'text-green-700' : 'text-red-700'}`}
          >
            {formatCurrency(Math.abs(result.refundOrOwed))}
          </span>
        </div>
      </div>
    </div>
  );
}
