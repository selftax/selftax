import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import TaxSummary from '../components/TaxSummary';
import FormList from '../components/FormList';
import { useTaxReturnStore } from '../stores/taxReturnStore';
import { useDocumentStore } from '../stores/documentStore';
import { useProfileStore } from '../stores/profileStore';

export default function ReviewPage() {
  const { input, result, requiredForms, formSummaries, computed, computeFromDocuments } =
    useTaxReturnStore();
  const documents = useDocumentStore((s) => s.documents);
  const filingStatus = useProfileStore((s) => s.filingStatus);
  const stateOfResidence = useProfileStore((s) => s.stateOfResidence);
  const dependents = useProfileStore((s) => s.dependents);

  // Build Form1040Input from documents + profile, then compute
  useEffect(() => {
    if (!computed) {
      computeFromDocuments(documents, { filingStatus, stateOfResidence, dependents });
    }
  }, [computed, computeFromDocuments, documents, filingStatus, stateOfResidence, dependents]);

  return (
    <div className="mx-auto max-w-3xl p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="mb-2 text-2xl font-bold text-gray-900">Review Your Return</h1>
        <p className="text-gray-600">
          Review your tax return summary before generating forms.
          Make sure everything looks correct.
        </p>
      </div>

      {result ? (
        <div className="space-y-6">
          {/* Tax Summary */}
          <TaxSummary result={result} filingStatus={input.filingStatus} />

          {/* Form List */}
          <FormList requiredForms={requiredForms} formSummaries={formSummaries} />
        </div>
      ) : (
        <div className="mb-8 rounded-lg bg-gray-50 p-6">
          <p data-testid="no-data-message" className="text-gray-400">
            No tax data available. Please complete the previous steps first.
          </p>
        </div>
      )}

      {/* Navigation */}
      <div className="mt-8 flex items-center justify-between">
        <Link
          to="/advisor"
          data-testid="back-to-advisor"
          className="rounded-lg bg-gray-200 px-6 py-3 text-gray-700 hover:bg-gray-300"
        >
          Back to Advisor
        </Link>
        <Link
          to="/export"
          data-testid="generate-pdf"
          className={`rounded-lg px-6 py-3 text-white ${
            result
              ? 'bg-blue-600 hover:bg-blue-700'
              : 'pointer-events-none bg-gray-300'
          }`}
        >
          Generate PDF
        </Link>
      </div>
    </div>
  );
}
