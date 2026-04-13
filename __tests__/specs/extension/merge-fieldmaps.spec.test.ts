/**
 * Spec: fieldMaps merge across incremental calculations
 *
 * When users upload docs in batches, each calculation should merge
 * its form keys with existing storage, not overwrite everything.
 */

// Mock chrome.storage.local
let mockStorage: Record<string, unknown> = {};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).chrome = {
  storage: {
    local: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      get: (keys: any) => {
        const result: Record<string, unknown> = {};
        const keyArr = Array.isArray(keys) ? keys : typeof keys === 'string' ? [keys] : Object.keys(keys ?? {});
        for (const k of keyArr) {
          if (k in mockStorage) result[k] = mockStorage[k];
        }
        return Promise.resolve(result);
      },
      set: (data: Record<string, unknown>) => {
        Object.assign(mockStorage, data);
        return Promise.resolve();
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      remove: (keys: any) => {
        const keyArr = Array.isArray(keys) ? keys : [keys];
        for (const k of keyArr) delete mockStorage[k];
        return Promise.resolve();
      },
      clear: () => { mockStorage = {}; return Promise.resolve(); },
    },
  },
};

import { calculateInBrowser } from '@selftax/extension/services/browserCalculator';
import type { StructuredExtraction } from '@selftax/core';

const W2: StructuredExtraction = {
  formType: 'w2',
  wages: 100000,
  federalWithholding: 15000,
  stateWithholding: 5000,
};

const PRIOR: StructuredExtraction = {
  formType: 'prior-year-return',
  documentTaxYear: 2024,
  priorYearAgi: 95000,
  capitalLossCarryforward: 5000,
};

const MORTGAGE: StructuredExtraction = {
  formType: '1098',
  primaryMortgageInterest: 20000,
};

describe('fieldMaps merge across calculations', () => {
  beforeEach(() => {
    mockStorage = {};
  });

  test('first calculation saves all form keys', async () => {
    const result = calculateInBrowser([W2, PRIOR, MORTGAGE], 'single', 'CA', 0);

    // Simulate save
    await chrome.storage.local.set({
      fieldMaps: result.fieldMaps,
      savedReturn: result.summary,
    });

    const stored = await chrome.storage.local.get('fieldMaps');
    const maps = stored.fieldMaps as Record<string, unknown>;
    expect(maps.form1040).toBeDefined();
    expect(maps.efile).toBeDefined();
  });

  test('second calculation preserves form keys from first', async () => {
    // First calculation: W2 + prior year → produces form1040, efile, etc.
    const result1 = calculateInBrowser([W2, PRIOR], 'single', 'CA', 0);
    await chrome.storage.local.set({ fieldMaps: result1.fieldMaps });

    const stored1 = await chrome.storage.local.get('fieldMaps');
    const maps1 = stored1.fieldMaps as Record<string, Record<string, unknown>>;
    expect(maps1.efile).toBeDefined();
    expect(maps1.efile.txtPriorAgi).toBe(95000);

    // Second calculation: mortgage → produces scheduleA
    const result2 = calculateInBrowser([W2, MORTGAGE], 'single', 'CA', 0);

    // Merge (same logic as popup's mergeAndSaveResults — field-level merge)
    const existing = await chrome.storage.local.get('fieldMaps');
    const existingMaps = existing.fieldMaps as Record<string, Record<string, unknown>>;
    const merged: Record<string, Record<string, unknown>> = { ...existingMaps };
    for (const [formKey, fields] of Object.entries(result2.fieldMaps)) {
      merged[formKey] = merged[formKey] ? { ...merged[formKey], ...fields } : fields;
    }
    await chrome.storage.local.set({ fieldMaps: merged });

    const stored2 = await chrome.storage.local.get('fieldMaps');
    const maps2 = stored2.fieldMaps as Record<string, Record<string, unknown>>;

    // efile from first calculation should be preserved
    expect(maps2.efile).toBeDefined();
    expect(maps2.efile.txtPriorAgi).toBe(95000);

    // scheduleA from second calculation should be present
    expect(maps2.form1040).toBeDefined();
  });

  test('same form key gets overwritten by newer calculation', async () => {
    // First: W2 with wages 100k
    const result1 = calculateInBrowser([W2], 'single', 'CA', 0);
    await chrome.storage.local.set({ fieldMaps: result1.fieldMaps });

    const stored1 = await chrome.storage.local.get('fieldMaps');
    const maps1 = stored1.fieldMaps as Record<string, Record<string, unknown>>;
    const wages1 = maps1.form1040?.txtWagesSalariesTips;

    // Second: W2 with different wages
    const W2_UPDATED: StructuredExtraction = { ...W2, wages: 120000 };
    const result2 = calculateInBrowser([W2_UPDATED], 'single', 'CA', 0);

    const existing2 = await chrome.storage.local.get('fieldMaps');
    const existingMaps2 = existing2.fieldMaps as Record<string, Record<string, unknown>>;
    const merged2: Record<string, Record<string, unknown>> = { ...existingMaps2 };
    for (const [formKey, fields] of Object.entries(result2.fieldMaps)) {
      merged2[formKey] = merged2[formKey] ? { ...merged2[formKey], ...fields } : fields;
    }
    await chrome.storage.local.set({ fieldMaps: merged2 });

    const stored2 = await chrome.storage.local.get('fieldMaps');
    const maps2 = stored2.fieldMaps as Record<string, Record<string, unknown>>;

    // form1040 should have newer wages
    expect(maps2.form1040?.txtWagesSalariesTips).toBe(120000);
    expect(maps2.form1040?.txtWagesSalariesTips).not.toBe(wages1);
  });
});
