/**
 * Constraint: FreeFile Field Mapping Validation
 *
 * Every field name in FREE_FILE_FIELD_MAPPINGS must exist in the
 * FREEFILE_FIELD_DICTIONARY. This prevents mapping typos and ensures
 * every field we autofill has been verified against the actual FreeFile form.
 *
 * If this test fails, either:
 * 1. The field name in freeFileFieldMappings.ts is wrong (typo or wrong field)
 * 2. The field needs to be added to freeFileFieldDictionary.ts with correct annotation
 */

import { FREE_FILE_FIELD_MAPPINGS } from '@selftax/core/forms/freeFileFieldMappings';
import { FREEFILE_FIELD_DICTIONARY } from '@selftax/core/forms/freeFileFieldDictionary';

describe('FreeFile field mappings are verified against dictionary', () => {
  for (const [formKey, mapping] of Object.entries(FREE_FILE_FIELD_MAPPINGS)) {
    const dict = FREEFILE_FIELD_DICTIONARY[formKey];

    // Skip forms that don't have a dictionary entry yet
    if (!dict) continue;

    for (const [canonicalPath, freeFileFieldName] of Object.entries(mapping)) {
      // Skip pos: fields — these are position-based (random IDs per session)
      if (freeFileFieldName.startsWith('pos:')) continue;

      test(`${formKey}: ${canonicalPath} → ${freeFileFieldName} exists in dictionary`, () => {
        expect(dict[freeFileFieldName]).toBeDefined();
      });
    }
  }

  test('all mapped form keys have dictionary entries', () => {
    const mappedKeys = Object.keys(FREE_FILE_FIELD_MAPPINGS)
      .filter((k) => Object.keys(FREE_FILE_FIELD_MAPPINGS[k as keyof typeof FREE_FILE_FIELD_MAPPINGS]).length > 0);
    const dictKeys = Object.keys(FREEFILE_FIELD_DICTIONARY);

    for (const key of mappedKeys) {
      if (key === 'ca540' || key === 'form4562') continue; // State/no FreeFile equivalent
      expect(dictKeys).toContain(key);
    }
  });
});
