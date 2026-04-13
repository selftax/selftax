import type { TaxFormType } from '@selftax/core';
import type { FormSummaryEntry } from '../stores/taxReturnStore';
import { getFormLabel } from '../stores/taxReturnStore';

interface FormListProps {
  requiredForms: TaxFormType[];
  formSummaries: FormSummaryEntry[];
}

function formatValue(value: string | number): string {
  if (typeof value === 'number') {
    return value.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  }
  return value;
}

export default function FormList({ requiredForms, formSummaries }: FormListProps) {
  if (requiredForms.length === 0) {
    return (
      <div data-testid="form-list" className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-2 text-lg font-semibold text-gray-900">Required Forms</h2>
        <p className="text-sm text-gray-500">No forms determined yet.</p>
      </div>
    );
  }

  // Build a lookup of summaries by formType
  const summaryMap = new Map<TaxFormType, FormSummaryEntry>();
  for (const s of formSummaries) {
    summaryMap.set(s.formType, s);
  }

  return (
    <div data-testid="form-list" className="rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">
        Required Forms ({requiredForms.length})
      </h2>

      <div className="space-y-3">
        {requiredForms.map((formType) => {
          const summary = summaryMap.get(formType);
          return (
            <div
              key={formType}
              data-testid={`form-entry-${formType}`}
              className="rounded-lg border border-gray-100 bg-gray-50 p-4"
            >
              <h3 className="text-sm font-semibold text-gray-800">
                {getFormLabel(formType)}
              </h3>
              {summary && summary.keyFields.length > 0 && (
                <div className="mt-2 space-y-1">
                  {summary.keyFields.map((field) => (
                    <div
                      key={field.name}
                      className="flex items-center justify-between text-xs text-gray-600"
                    >
                      <span>{field.name}</span>
                      <span className="font-medium text-gray-800">
                        {formatValue(field.value)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
