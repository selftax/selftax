import type { DocumentEntry } from '../stores/documentStore';

interface FileListProps {
  files: DocumentEntry[];
  onRemove: (id: string) => void;
}

const TYPE_LABELS: Record<string, string> = {
  w2: 'W-2',
  '1099-b': '1099-B',
  '1099-int': '1099-INT',
  '1099-div': '1099-DIV',
  '1099-misc': '1099-MISC',
  '1099-nec': '1099-NEC',
  '1098': '1098',
  receipt: 'Receipt',
  spreadsheet: 'Spreadsheet',
  statement: 'Statement',
  other: 'Other',
};

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileList({ files, onRemove }: FileListProps) {
  if (files.length === 0) {
    return (
      <p className="py-4 text-center text-gray-400">
        No documents uploaded yet
      </p>
    );
  }

  return (
    <ul className="divide-y divide-gray-200" data-testid="file-list">
      {files.map((file) => (
        <li
          key={file.id}
          className="flex items-center justify-between py-3"
          data-testid="file-row"
        >
          <div className="flex items-center gap-3">
            <span className="font-medium" data-testid="file-name">
              {file.name}
            </span>
            <span className="text-sm text-gray-500" data-testid="file-size">
              {formatFileSize(file.size)}
            </span>
            <span
              className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
              data-testid="file-type"
            >
              {TYPE_LABELS[file.type] ?? file.type}
            </span>
            <span data-testid="processing-status">
              {file.processingStatus === 'processing' && (
                <span className="text-sm text-blue-600">Processing...</span>
              )}
              {file.processingStatus === 'done' && (
                <span className="text-sm text-green-600">Text extracted</span>
              )}
              {file.processingStatus === 'error' && (
                <span className="text-sm text-red-600" title={file.processingError}>
                  Extraction failed
                </span>
              )}
            </span>
          </div>
          <button
            onClick={() => onRemove(file.id)}
            className="text-sm text-red-500 hover:text-red-700"
            data-testid="remove-button"
          >
            Remove
          </button>
        </li>
      ))}
    </ul>
  );
}
