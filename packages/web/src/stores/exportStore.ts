import { create } from 'zustand';
import type { TaxFormType } from '@selftax/core';

export type ExportStatus = 'idle' | 'generating' | 'done' | 'error';

export interface ExportState {
  /** Which forms the user has selected for export */
  selectedForms: TaxFormType[];
  /** Map of formType -> blob URL for generated PDFs */
  generatedPDFs: Record<string, string>;
  /** Current generation status */
  status: ExportStatus;
  /** Progress percentage (0-100) */
  progress: number;
  /** Error message if status is 'error' */
  error: string | null;

  /** Replace the entire selected forms list */
  setSelectedForms: (forms: TaxFormType[]) => void;
  /** Toggle a single form in/out of the selection */
  toggleForm: (form: TaxFormType) => void;
  /** Store a generated PDF blob URL for a form */
  setGeneratedPDF: (form: TaxFormType, blobUrl: string) => void;
  /** Update generation status */
  setStatus: (status: ExportStatus) => void;
  /** Update progress percentage */
  setProgress: (progress: number) => void;
  /** Set error message */
  setError: (error: string) => void;
  /** Reset all state */
  reset: () => void;
}

export const useExportStore = create<ExportState>((set, get) => ({
  selectedForms: [],
  generatedPDFs: {},
  status: 'idle',
  progress: 0,
  error: null,

  setSelectedForms: (forms) => set({ selectedForms: forms }),

  toggleForm: (form) => {
    const { selectedForms } = get();
    if (selectedForms.includes(form)) {
      set({ selectedForms: selectedForms.filter((f) => f !== form) });
    } else {
      set({ selectedForms: [...selectedForms, form] });
    }
  },

  setGeneratedPDF: (form, blobUrl) => {
    set((state) => ({
      generatedPDFs: { ...state.generatedPDFs, [form]: blobUrl },
    }));
  },

  setStatus: (status) => set({ status }),

  setProgress: (progress) => set({ progress }),

  setError: (error) => set({ error, status: 'error' }),

  reset: () =>
    set({
      selectedForms: [],
      generatedPDFs: {},
      status: 'idle',
      progress: 0,
      error: null,
    }),
}));
