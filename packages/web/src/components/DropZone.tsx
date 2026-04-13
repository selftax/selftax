import { useCallback, useRef, useState } from 'react';
import { isSupportedFileType, isFileSizeValid } from '@selftax/core';

interface DropZoneProps {
  onFilesAdded: (files: File[]) => void;
  onError?: (message: string) => void;
}

export default function DropZone({ onFilesAdded, onError }: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateAndAdd = useCallback(
    (files: FileList | File[]) => {
      const valid: File[] = [];
      const fileArray = Array.from(files);

      for (const file of fileArray) {
        if (!isSupportedFileType(file.type)) {
          onError?.(`Unsupported file type: ${file.name}`);
          continue;
        }
        if (!isFileSizeValid(file.size)) {
          onError?.(`File too large: ${file.name}`);
          continue;
        }
        valid.push(file);
      }

      if (valid.length > 0) {
        onFilesAdded(valid);
      }
    },
    [onFilesAdded, onError],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      validateAndAdd(e.dataTransfer.files);
    },
    [validateAndAdd],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        validateAndAdd(e.target.files);
      }
    },
    [validateAndAdd],
  );

  return (
    <div
      data-testid="dropzone"
      onClick={handleClick}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`cursor-pointer rounded-lg border-2 border-dashed p-12 text-center transition-colors ${
        isDragOver
          ? 'border-blue-500 bg-blue-50'
          : 'border-gray-300 hover:border-gray-400'
      }`}
    >
      <p className="text-gray-400">
        Drag and drop files here, or click to browse
      </p>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleInputChange}
        data-testid="file-input"
      />
    </div>
  );
}
