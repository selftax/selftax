import type { PIIDetection } from '@selftax/core';

const TYPE_COLORS: Record<string, string> = {
  ssn: 'bg-red-200 text-red-800',
  ein: 'bg-orange-200 text-orange-800',
  name: 'bg-yellow-200 text-yellow-800',
  address: 'bg-purple-200 text-purple-800',
  phone: 'bg-blue-200 text-blue-800',
  email: 'bg-teal-200 text-teal-800',
  dob: 'bg-pink-200 text-pink-800',
  'account-number': 'bg-indigo-200 text-indigo-800',
};

interface PIIHighlighterProps {
  text: string;
  detections: PIIDetection[];
  onRemoveDetection?: (index: number) => void;
}

/**
 * Renders text with PII detections highlighted inline.
 * Each highlighted span shows the PII type and an optional remove button.
 */
export default function PIIHighlighter({
  text,
  detections,
  onRemoveDetection,
}: PIIHighlighterProps) {
  // Build segments: alternating plain text and highlighted PII
  const sorted = [...detections].sort((a, b) => a.startIndex - b.startIndex);
  const segments: Array<
    | { kind: 'text'; content: string }
    | { kind: 'pii'; content: string; type: string; index: number }
  > = [];

  let cursor = 0;
  for (let i = 0; i < sorted.length; i++) {
    const det = sorted[i];
    if (det.startIndex > cursor) {
      segments.push({ kind: 'text', content: text.slice(cursor, det.startIndex) });
    }
    segments.push({
      kind: 'pii',
      content: text.slice(det.startIndex, det.endIndex),
      type: det.type,
      index: i,
    });
    cursor = det.endIndex;
  }
  if (cursor < text.length) {
    segments.push({ kind: 'text', content: text.slice(cursor) });
  }

  return (
    <div data-testid="pii-highlighter" className="whitespace-pre-wrap font-mono text-sm">
      {segments.map((seg, idx) => {
        if (seg.kind === 'text') {
          return <span key={idx}>{seg.content}</span>;
        }
        const colorClass = TYPE_COLORS[seg.type] ?? 'bg-gray-200 text-gray-800';
        return (
          <span
            key={idx}
            data-testid={`pii-highlight-${seg.index}`}
            className={`inline-flex items-center gap-1 rounded px-1 ${colorClass}`}
          >
            <span className="text-xs font-semibold uppercase">[{seg.type}]</span>
            {seg.content}
            {onRemoveDetection && (
              <button
                data-testid={`remove-detection-${seg.index}`}
                onClick={() => onRemoveDetection(seg.index)}
                className="ml-1 text-xs font-bold opacity-60 hover:opacity-100"
                title="Remove this detection"
              >
                x
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}
