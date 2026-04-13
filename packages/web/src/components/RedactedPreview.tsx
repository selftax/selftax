interface RedactedPreviewProps {
  redactedText: string;
}

/**
 * Shows the redacted version of document text.
 * PII has already been replaced with [REDACTED].
 */
export default function RedactedPreview({ redactedText }: RedactedPreviewProps) {
  return (
    <div
      data-testid="redacted-preview"
      className="whitespace-pre-wrap rounded-lg bg-gray-50 p-4 font-mono text-sm text-gray-700"
    >
      {redactedText}
    </div>
  );
}
