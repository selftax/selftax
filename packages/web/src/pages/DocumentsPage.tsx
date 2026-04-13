import { useState } from 'react';
import { Link } from 'react-router-dom';
import DropZone from '../components/DropZone';
import FileList from '../components/FileList';
import { useDocumentStore } from '../stores/documentStore';
import { processDocument } from '../services/documentProcessor';

export default function DocumentsPage() {
  const { documents, addDocument, removeDocument } = useDocumentStore();
  const [error, setError] = useState<string | null>(null);

  const handleFilesAdded = (files: File[]) => {
    setError(null);
    for (const file of files) {
      const entry = addDocument(file);
      processDocument(entry.id, file);
    }
  };

  const handleError = (message: string) => {
    setError(message);
  };

  const hasDocuments = documents.length > 0;

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="mb-4 text-2xl font-bold">Upload Documents</h1>
      <p className="mb-8 text-gray-600">
        Upload your W-2s, 1099s, receipts, and spreadsheets. We'll strip
        sensitive info before analyzing them.
      </p>
      <div className="mb-4">
        <DropZone onFilesAdded={handleFilesAdded} onError={handleError} />
      </div>
      {error && (
        <p className="mb-4 text-sm text-red-600" data-testid="upload-error">
          {error}
        </p>
      )}
      <div className="mb-8">
        <FileList files={documents} onRemove={removeDocument} />
      </div>
      {hasDocuments ? (
        <Link
          to="/verify"
          className="rounded-lg bg-blue-600 px-6 py-3 text-white hover:bg-blue-700"
        >
          Continue to Verify
        </Link>
      ) : (
        <span className="cursor-not-allowed rounded-lg bg-gray-300 px-6 py-3 text-gray-500">
          Continue to Verify
        </span>
      )}
    </div>
  );
}
