/**
 * @jest-environment jsdom
 */
/**
 * Spec: Document Upload UI
 *
 * Status: hypothesis
 * Confirm: Users can drag-and-drop or click-to-browse files, see validation
 *          feedback, view an upload list with file details, and remove files.
 *          State is managed via Zustand store. Only supported file types accepted.
 * Invalidate: Browser drag-and-drop API too inconsistent across browsers
 *
 * Covers:
 * - DropZone component: drag-and-drop + click-to-browse
 * - File type validation using @selftax/core's isSupportedFileType
 * - FileList component: displays uploaded files with type, name, size
 * - Remove file from list
 * - Zustand document store: add, remove, list documents
 * - DocumentsPage integrates DropZone + FileList
 */

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { isSupportedFileType, isFileSizeValid, MAX_FILE_SIZE } from '@selftax/core';
import DropZone from '@selftax/web/components/DropZone';
import FileList, { formatFileSize } from '@selftax/web/components/FileList';
import { useDocumentStore } from '@selftax/web/stores/documentStore';
import type { DocumentEntry } from '@selftax/web/stores/documentStore';
import DocumentsPage from '@selftax/web/pages/DocumentsPage';

// Mock the document processor to prevent actual extraction during UI tests
jest.mock('@selftax/web/services/documentProcessor', () => ({
  processDocument: jest.fn().mockResolvedValue(undefined),
}));

function createMockFile(name: string, size: number, type: string): File {
  const buffer = new ArrayBuffer(size);
  return new File([buffer], name, { type });
}

function createDropEvent(files: File[]) {
  return { dataTransfer: { files } };
}

describe('Document Upload UI', () => {
  describe('DropZone component', () => {
    test('renders a drop zone with visual prompt text', () => {
      const onFilesAdded = jest.fn();
      render(<DropZone onFilesAdded={onFilesAdded} />);
      expect(screen.getByText(/drag and drop/i)).toBeInTheDocument();
      expect(screen.getByTestId('file-input')).toHaveAttribute('type', 'file');
      expect(screen.getByTestId('file-input')).toHaveClass('hidden');
    });

    test('accepts files via click-to-browse (file input)', () => {
      const onFilesAdded = jest.fn();
      render(<DropZone onFilesAdded={onFilesAdded} />);

      const input = screen.getByTestId('file-input');
      const file = createMockFile('w2.pdf', 1024, 'application/pdf');
      fireEvent.change(input, { target: { files: [file] } });
      expect(onFilesAdded).toHaveBeenCalledWith([file]);
    });

    test('shows active drag-over visual state', () => {
      const onFilesAdded = jest.fn();
      render(<DropZone onFilesAdded={onFilesAdded} />);
      const zone = screen.getByTestId('dropzone');

      fireEvent.dragOver(zone, { dataTransfer: { files: [] } });
      expect(zone.className).toContain('border-blue');

      fireEvent.dragLeave(zone);
      expect(zone.className).not.toContain('border-blue');
    });

    test('accepts files via drag-and-drop', () => {
      const onFilesAdded = jest.fn();
      render(<DropZone onFilesAdded={onFilesAdded} />);
      const zone = screen.getByTestId('dropzone');
      const file = createMockFile('receipt.png', 2048, 'image/png');

      fireEvent.drop(zone, createDropEvent([file]));
      expect(onFilesAdded).toHaveBeenCalledWith([file]);
    });

    test('rejects unsupported file types with error message', () => {
      const onFilesAdded = jest.fn();
      const onError = jest.fn();
      render(<DropZone onFilesAdded={onFilesAdded} onError={onError} />);
      const zone = screen.getByTestId('dropzone');

      const file = createMockFile('malware.exe', 1024, 'application/x-msdownload');
      fireEvent.drop(zone, createDropEvent([file]));

      expect(onError).toHaveBeenCalledWith(expect.stringContaining('Unsupported file type'));
      expect(onFilesAdded).not.toHaveBeenCalled();
    });

    test('accepts multiple files at once', () => {
      const onFilesAdded = jest.fn();
      render(<DropZone onFilesAdded={onFilesAdded} />);
      const zone = screen.getByTestId('dropzone');

      const files = [
        createMockFile('w2.pdf', 1024, 'application/pdf'),
        createMockFile('receipt.jpg', 2048, 'image/jpeg'),
        createMockFile('expenses.csv', 512, 'text/csv'),
      ];
      fireEvent.drop(zone, createDropEvent(files));

      expect(onFilesAdded).toHaveBeenCalledWith(files);
    });
  });

  describe('FileList component', () => {
    test('displays uploaded files with name, size, and detected type', () => {
      const files: DocumentEntry[] = [
        {
          id: '1',
          name: 'w2-2025.pdf',
          size: 1258291,
          mimeType: 'application/pdf',
          type: 'w2',
          file: createMockFile('w2-2025.pdf', 1258291, 'application/pdf'),
          createdAt: new Date(),
          extractedText: '',
          piiDetections: [],
          verified: false,
          processingStatus: 'done',
        },
      ];
      render(<FileList files={files} onRemove={jest.fn()} />);

      expect(screen.getByTestId('file-name')).toHaveTextContent('w2-2025.pdf');
      expect(screen.getByTestId('file-size')).toHaveTextContent('1.2 MB');
      expect(screen.getByTestId('file-type')).toHaveTextContent('W-2');
    });

    test('allows removing a file from the list', () => {
      const onRemove = jest.fn();
      const files: DocumentEntry[] = [
        {
          id: 'abc-123',
          name: 'receipt.jpg',
          size: 2048,
          mimeType: 'image/jpeg',
          type: 'receipt',
          file: createMockFile('receipt.jpg', 2048, 'image/jpeg'),
          createdAt: new Date(),
          extractedText: '',
          piiDetections: [],
          verified: false,
          processingStatus: 'pending',
        },
      ];
      render(<FileList files={files} onRemove={onRemove} />);

      const removeBtn = screen.getByTestId('remove-button');
      fireEvent.click(removeBtn);
      expect(onRemove).toHaveBeenCalledWith('abc-123');
    });

    test('shows empty state when no files uploaded', () => {
      render(<FileList files={[]} onRemove={jest.fn()} />);
      expect(screen.getByText(/no documents uploaded yet/i)).toBeInTheDocument();
    });
  });

  describe('Document store (Zustand)', () => {
    beforeEach(() => {
      useDocumentStore.setState({ documents: [] });
    });

    test('addDocument stores file with generated id and createdAt', () => {
      const file = createMockFile('w2.pdf', 1024, 'application/pdf');
      const before = new Date();

      let entry: DocumentEntry;
      act(() => {
        entry = useDocumentStore.getState().addDocument(file);
      });

      const docs = useDocumentStore.getState().documents;
      expect(docs).toHaveLength(1);
      expect(typeof docs[0].id).toBe('string');
      expect(docs[0].id.length).toBeGreaterThan(0);
      expect(docs[0].createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(docs[0].name).toBe('w2.pdf');
    });

    test('removeDocument removes file by id', () => {
      const file = createMockFile('w2.pdf', 1024, 'application/pdf');

      let entry: DocumentEntry;
      act(() => {
        entry = useDocumentStore.getState().addDocument(file);
      });
      expect(useDocumentStore.getState().documents).toHaveLength(1);

      act(() => {
        useDocumentStore.getState().removeDocument(entry!.id);
      });
      expect(useDocumentStore.getState().documents).toHaveLength(0);
    });

    test('auto-detects document type on add using detectDocumentType', () => {
      const file = createMockFile('scan.pdf', 1024, 'application/pdf');

      act(() => {
        useDocumentStore.getState().addDocument(file, 'Form W-2 Wage and Tax Statement');
      });

      const docs = useDocumentStore.getState().documents;
      expect(docs[0].type).toBe('w2');
    });
  });

  describe('DocumentsPage integration', () => {
    beforeEach(() => {
      useDocumentStore.setState({ documents: [] });
    });

    test('renders DropZone and FileList together', () => {
      render(
        <MemoryRouter>
          <DocumentsPage />
        </MemoryRouter>,
      );
      expect(screen.getByTestId('dropzone')).toBeInTheDocument();
      expect(screen.getByText(/no documents uploaded yet/i)).toBeInTheDocument();
      expect(screen.getByText(/continue to verify/i)).toBeInTheDocument();
    });

    test('files added via DropZone appear in FileList', () => {
      render(
        <MemoryRouter>
          <DocumentsPage />
        </MemoryRouter>,
      );

      const input = screen.getByTestId('file-input');
      const file = createMockFile('w2.pdf', 5120, 'application/pdf');
      fireEvent.change(input, { target: { files: [file] } });

      expect(screen.getByTestId('file-name')).toHaveTextContent('w2.pdf');
    });

    test('disables Continue button when no files uploaded', () => {
      render(
        <MemoryRouter>
          <DocumentsPage />
        </MemoryRouter>,
      );

      // No files — Continue should be a disabled span, not a link
      const disabledBtn = screen.getByText(/continue to verify/i);
      expect(disabledBtn.tagName).not.toBe('A');
      expect(disabledBtn).toHaveClass('cursor-not-allowed');

      // Add a file — Continue should become a link
      const input = screen.getByTestId('file-input');
      const file = createMockFile('w2.pdf', 1024, 'application/pdf');
      fireEvent.change(input, { target: { files: [file] } });

      const activeLink = screen.getByText(/continue to verify/i);
      expect(activeLink.tagName).toBe('A');
    });
  });

  describe('File validation', () => {
    test('supported types pass validation (core function)', () => {
      expect(isSupportedFileType('image/jpeg')).toBe(true);
      expect(isSupportedFileType('image/png')).toBe(true);
      expect(isSupportedFileType('application/pdf')).toBe(true);
      expect(isSupportedFileType('text/csv')).toBe(true);
    });

    test('unsupported types fail validation (core function)', () => {
      expect(isSupportedFileType('application/x-msdownload')).toBe(false);
      expect(isSupportedFileType('text/html')).toBe(false);
      expect(isSupportedFileType('application/zip')).toBe(false);
    });

    test('validates file size — rejects files over 50 MB', () => {
      expect(isFileSizeValid(MAX_FILE_SIZE)).toBe(true);
      expect(isFileSizeValid(MAX_FILE_SIZE - 1)).toBe(true);
      expect(isFileSizeValid(MAX_FILE_SIZE + 1)).toBe(false);
      expect(isFileSizeValid(100 * 1024 * 1024)).toBe(false);
    });
  });
});
