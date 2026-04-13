import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { redactText } from '@selftax/core';
import PIIHighlighter from '../components/PIIHighlighter';
import RedactedPreview from '../components/RedactedPreview';
import { useDocumentStore } from '../stores/documentStore';

const TYPE_LABELS: Record<string, string> = {
  ssn: 'SSN',
  ein: 'EIN',
  name: 'Name',
  address: 'Address',
  phone: 'Phone',
  email: 'Email',
  dob: 'Date of Birth',
  'account-number': 'Account #',
};

/**
 * PII Verification page: users review what PII was detected
 * in their documents before data is sent to the AI advisor.
 */
export default function VerifyPage() {
  const { documents, updatePIIDetections, setVerified } = useDocumentStore();
  const navigate = useNavigate();
  const [showRedacted, setShowRedacted] = useState<Record<string, boolean>>({});

  if (documents.length === 0) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <h1 className="mb-4 text-2xl font-bold">Verify PII Redactions</h1>
        <p className="mb-4 text-gray-600">No documents to verify.</p>
        <Link
          to="/documents"
          className="rounded-lg bg-blue-600 px-6 py-3 text-white hover:bg-blue-700"
        >
          Upload Documents
        </Link>
      </div>
    );
  }

  // Aggregate PII counts across all documents
  const allDetections = documents.flatMap((d) => d.piiDetections);
  const countByType = allDetections.reduce(
    (acc, d) => {
      acc[d.type] = (acc[d.type] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const handleRemoveDetection = (docId: string, detectionIndex: number) => {
    const doc = documents.find((d) => d.id === docId);
    if (!doc) return;
    const updated = doc.piiDetections.filter((_, i) => i !== detectionIndex);
    updatePIIDetections(docId, updated);
  };

  const toggleRedacted = (docId: string) => {
    setShowRedacted((prev) => ({ ...prev, [docId]: !prev[docId] }));
  };

  const handleApproveAndContinue = () => {
    for (const doc of documents) {
      setVerified(doc.id, true);
    }
    navigate('/advisor');
  };

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="mb-2 text-2xl font-bold">Verify PII Redactions</h1>
      <p className="mb-6 text-gray-600">
        Review what personal information was detected. Remove false positives or approve to continue.
      </p>

      {/* PII Summary */}
      {allDetections.length > 0 && (
        <div data-testid="pii-summary" className="mb-6 rounded-lg bg-blue-50 p-4">
          <h2 className="mb-2 text-sm font-semibold text-blue-800">
            PII Detected ({allDetections.length} items)
          </h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries(countByType).map(([type, count]) => (
              <span
                key={type}
                className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700"
              >
                {TYPE_LABELS[type] ?? type}: {count}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Document Cards */}
      <div className="space-y-6">
        {documents.map((doc) => {
          const isRedactedView = showRedacted[doc.id] ?? false;
          const redacted = redactText(doc.extractedText, doc.piiDetections);

          return (
            <div
              key={doc.id}
              className="rounded-lg border border-gray-200 p-4"
              data-testid="verify-document-card"
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold">{doc.name}</h3>
                {doc.piiDetections.length > 0 && (
                  <button
                    data-testid="toggle-redacted"
                    onClick={() => toggleRedacted(doc.id)}
                    className="rounded bg-gray-100 px-3 py-1 text-xs text-gray-600 hover:bg-gray-200"
                  >
                    {isRedactedView ? 'Show Original' : 'Show Redacted'}
                  </button>
                )}
              </div>

              {doc.extractedText ? (
                doc.piiDetections.length > 0 ? (
                  isRedactedView ? (
                    <RedactedPreview redactedText={redacted} />
                  ) : (
                    <PIIHighlighter
                      text={doc.extractedText}
                      detections={doc.piiDetections}
                      onRemoveDetection={(idx) => handleRemoveDetection(doc.id, idx)}
                    />
                  )
                ) : (
                  <p className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
                    No PII detected in this document.
                  </p>
                )
              ) : (
                <p className="text-sm text-gray-400">No text extracted yet.</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="mt-8 flex items-center gap-4">
        <Link
          to="/documents"
          className="rounded-lg bg-gray-200 px-6 py-3 text-gray-700 hover:bg-gray-300"
        >
          Back
        </Link>
        <button
          data-testid="approve-continue"
          onClick={handleApproveAndContinue}
          className="rounded-lg bg-green-600 px-6 py-3 text-white hover:bg-green-700"
        >
          Approve &amp; Continue
        </button>
      </div>
    </div>
  );
}
