/**
 * Tax Return Adapters — convert TaxReturnData to output formats.
 *
 * Both adapters read from the SAME TaxReturnData. No tax calculation
 * logic exists here — only format translation.
 *
 * - toPDFFieldMap: TaxReturnData → { pdfFieldName: value }
 * - toFreeFileFieldMap: TaxReturnData → { cssSelector: value }
 */

import type { TaxReturnData, PIIData } from '../types/taxReturnData';
import { PDF_FIELD_MAPPINGS, type FormKey } from './pdfFieldMappings';
import { FREE_FILE_FIELD_MAPPINGS } from './freeFileFieldMappings';

/** Resolve a dotted path like 'form1040.line1a' against TaxReturnData */
function resolveField(
  data: TaxReturnData,
  path: string,
): string | number | boolean | undefined {
  // PII fields
  if (path.startsWith('pii.')) {
    return resolvePII(data.pii, path.slice(4));
  }

  // Filing status checkbox — special case
  if (path.startsWith('form1040.filingStatus.')) {
    const status = path.split('.')[2];
    return data.form1040.filingStatus === status;
  }

  // Form data fields
  const [formKey, ...rest] = path.split('.');
  const fieldPath = rest.join('.');
  const section = data[formKey as keyof TaxReturnData];

  if (section === undefined || section === null) return undefined;
  if (typeof section !== 'object') return undefined;

  // Handle array indexing: 'properties.0.line3'
  return resolveNestedField(section as unknown as Record<string, unknown>, fieldPath);
}

function resolvePII(pii: PIIData, path: string): string | undefined {
  // pii paths: primary.firstName, spouse.ssn, dependents.0.name, address.street, etc.
  if (path.startsWith('primary.')) {
    const key = path.slice(8) as keyof PIIData['primary'];
    return pii.primary[key];
  }
  if (path.startsWith('spouse.')) {
    if (!pii.spouse) return undefined;
    // 'spouse.name' → full name for CA 540
    if (path === 'spouse.name') {
      return `${pii.spouse.firstName} ${pii.spouse.lastName}`;
    }
    const key = path.slice(7) as keyof NonNullable<PIIData['spouse']>;
    return pii.spouse[key];
  }
  if (path.startsWith('dependents.')) {
    const parts = path.slice(11).split('.');
    const idx = parseInt(parts[0], 10);
    const dep = pii.dependents[idx];
    if (!dep) return undefined;
    const field = parts[1];
    if (field === 'firstName') return dep.firstName;
    if (field === 'lastName') return dep.lastName;
    if (field === 'name') return `${dep.firstName} ${dep.lastName}`;
    if (field === 'ssn') return dep.ssn;
    if (field === 'relationship') return dep.relationship;
    return undefined;
  }
  if (path.startsWith('address.')) {
    const key = path.slice(8) as keyof PIIData['address'];
    return pii.address[key];
  }
  // 'primary.name' → full name for form headers
  if (path === 'primary.name') {
    return `${pii.primary.firstName} ${pii.primary.lastName}`;
  }
  if (path === 'occupation') return pii.occupation;
  return undefined;
}

function resolveNestedField(
  obj: Record<string, unknown>,
  path: string,
): string | number | boolean | undefined {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    if (Array.isArray(current)) {
      const idx = parseInt(part, 10);
      current = current[idx];
    } else if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  if (typeof current === 'string' || typeof current === 'number' || typeof current === 'boolean') {
    return current;
  }
  return undefined;
}

/**
 * Convert TaxReturnData to PDF AcroForm field name → value pairs
 * for a specific form.
 *
 * Returns only fields that have non-empty, non-zero values.
 */
export function toPDFFieldMap(
  data: TaxReturnData,
  formKey: FormKey,
): Record<string, string | number | boolean> {
  const mapping = PDF_FIELD_MAPPINGS[formKey];
  if (!mapping) return {};

  const result: Record<string, string | number | boolean> = {};

  for (const [canonicalPath, pdfFieldName] of Object.entries(mapping)) {
    const value = resolveField(data, canonicalPath);
    if (value !== undefined && value !== '' && value !== 0 && value !== false) {
      result[pdfFieldName] = value;
    }
  }

  return result;
}

/**
 * Convert TaxReturnData to CSS selector → value pairs for IRS Free File.
 *
 * Returns only fields that have non-empty, non-zero values.
 */
export function toFreeFileFieldMap(
  data: TaxReturnData,
  formKey: FormKey,
): Record<string, string | number> {
  const mapping = FREE_FILE_FIELD_MAPPINGS[formKey];
  if (!mapping) return {};

  const result: Record<string, string | number> = {};

  for (const [canonicalPath, cssSelector] of Object.entries(mapping)) {
    const value = resolveField(data, canonicalPath);
    if (value !== undefined && value !== '' && value !== 0 && value !== false) {
      if (typeof value === 'boolean') {
        result[cssSelector] = value ? 1 : 0;
      } else {
        result[cssSelector] = value;
      }
    }
  }

  return result;
}
