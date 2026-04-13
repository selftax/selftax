import { useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTaxReturnStore, getFormLabel } from '../stores/taxReturnStore';
import { useExportStore } from '../stores/exportStore';
import {
  generateFormPDF,
  pdfBytesToBlobUrl,
} from '../services/pdfService';
import type { TaxFormType } from '@selftax/core';
import { build1040Fields } from '@selftax/core';

export default function ExportPage() {
  const { result, requiredForms, input } = useTaxReturnStore();
  const {
    selectedForms,
    generatedPDFs,
    status,
    progress,
    error,
    setSelectedForms,
    toggleForm,
    setGeneratedPDF,
    setStatus,
    setProgress,
    setError,
  } = useExportStore();

  // Initialize selected forms from required forms on mount
  useEffect(() => {
    if (selectedForms.length === 0 && requiredForms.length > 0) {
      setSelectedForms([...requiredForms]);
    }
  }, [requiredForms, selectedForms.length, setSelectedForms]);

  const handleGenerate = useCallback(async () => {
    if (selectedForms.length === 0) return;

    setStatus('generating');
    setProgress(0);

    try {
      const total = selectedForms.length;
      for (let i = 0; i < total; i++) {
        const formType = selectedForms[i];

        // Build field data based on form type
        let fields: Record<string, string | number | boolean> = {};
        if (formType === '1040' && result) {
          fields = build1040Fields(result, {
            filingStatus: input.filingStatus,
          });
        }
        // For other form types, we'd use the appropriate builder.
        // For now, use empty fields for forms without specific builders wired up.

        const pdfBytes = await generateFormPDF(formType, fields);
        const blobUrl = pdfBytesToBlobUrl(pdfBytes);
        setGeneratedPDF(formType, blobUrl);
        setProgress(Math.round(((i + 1) / total) * 100));
      }

      setStatus('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate PDF');
    }
  }, [
    selectedForms,
    result,
    input.filingStatus,
    setStatus,
    setProgress,
    setGeneratedPDF,
    setError,
  ]);

  const handleCheckboxChange = (form: TaxFormType) => {
    toggleForm(form);
  };

  return (
    <div className="mx-auto max-w-3xl p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="mb-2 text-2xl font-bold text-gray-900">
          Export Tax Forms
        </h1>
        <p className="text-gray-600">
          Select the forms you want to generate and download as PDF.
        </p>
      </div>

      {/* Form Checkboxes */}
      <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          Forms to Export
        </h2>

        {requiredForms.length === 0 ? (
          <p className="text-sm text-gray-500">
            No forms available. Please complete the previous steps first.
          </p>
        ) : (
          <div className="space-y-3">
            {requiredForms.map((form) => (
              <label
                key={form}
                className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3 hover:bg-gray-100"
              >
                <input
                  type="checkbox"
                  checked={selectedForms.includes(form)}
                  onChange={() => handleCheckboxChange(form)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600"
                />
                <span className="text-sm font-medium text-gray-800">
                  {getFormLabel(form)}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Progress Indicator */}
      {status === 'generating' && (
        <div
          data-testid="progress-indicator"
          className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-blue-800">
              Generating PDFs...
            </span>
            <span className="text-sm font-medium text-blue-800">
              {progress}%
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-blue-200">
            <div
              className="h-full rounded-full bg-blue-600 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Error Message */}
      {status === 'error' && error && (
        <div
          data-testid="error-message"
          className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4"
        >
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Download Links */}
      {status === 'done' && Object.keys(generatedPDFs).length > 0 && (
        <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-6">
          <h2 className="mb-4 text-lg font-semibold text-green-900">
            Download Your Forms
          </h2>
          <div className="space-y-3">
            {Object.entries(generatedPDFs).map(([formType, blobUrl]) => (
              <a
                key={formType}
                data-testid={`download-link-${formType}`}
                href={blobUrl}
                download={`${formType}-2025.pdf`}
                className="flex items-center gap-3 rounded-lg border border-green-200 bg-white p-3 text-green-700 hover:bg-green-100"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                <span className="text-sm font-medium">
                  {getFormLabel(formType as TaxFormType)}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center justify-between">
        <Link
          to="/review"
          data-testid="back-to-review"
          className="rounded-lg bg-gray-200 px-6 py-3 text-gray-700 hover:bg-gray-300"
        >
          Back to Review
        </Link>
        <button
          data-testid="generate-all-btn"
          onClick={handleGenerate}
          disabled={
            selectedForms.length === 0 || status === 'generating'
          }
          className={`rounded-lg px-6 py-3 text-white ${
            selectedForms.length === 0 || status === 'generating'
              ? 'cursor-not-allowed bg-gray-300'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {status === 'generating'
            ? 'Generating...'
            : status === 'done'
              ? 'Regenerate PDFs'
              : 'Generate All PDFs'}
        </button>
      </div>
    </div>
  );
}
