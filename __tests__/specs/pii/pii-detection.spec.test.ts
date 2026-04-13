/**
 * Spec: PII Detection Engine
 *
 * Status: confirmed
 * Confirm: All PII types detected with >95% recall on test documents
 * Invalidate: Regex approach misses too many PII formats, needs ML
 *
 * The PII detector scans extracted text and identifies sensitive data
 * using regex patterns + profile matching. No AI needed — PII formats
 * are standardized (SSN, EIN, phone, email, etc.).
 */

import { detectPII } from '@selftax/core';
import type { OCRBoundingBoxes } from '@selftax/core';

describe('PII Detection', () => {
  test('detects SSN in XXX-XX-XXXX format', () => {
    const result = detectPII('Your SSN is 000-00-0000');
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('ssn');
    expect(result[0].value).toBe('000-00-0000');
    expect(result[0].confidence).toBe('pattern');
  });

  test('detects SSN without dashes (XXXXXXXXX)', () => {
    const result = detectPII('SSN 000000000');
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('ssn');
    expect(result[0].value).toBe('000000000');
  });

  test('detects EIN in XX-XXXXXXX format', () => {
    const result = detectPII('EIN: 00-0000000');
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('ein');
    expect(result[0].value).toBe('00-0000000');
  });

  test('detects phone numbers', () => {
    const result = detectPII('Call (555) 123-4567');
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('phone');
    expect(result[0].value).toBe('(555) 123-4567');
  });

  test('detects email addresses', () => {
    const result = detectPII('Contact jane@example.com for info');
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('email');
    expect(result[0].value).toBe('jane@example.com');
  });

  test('matches names from user profile', () => {
    const result = detectPII('John Smith earned $50,000', {
      firstName: 'John',
      lastName: 'Smith',
    });
    const nameDetections = result.filter((d) => d.type === 'name');
    expect(nameDetections.length).toBeGreaterThanOrEqual(1);
    // Should find "John Smith" as a full name match
    const fullNameMatch = nameDetections.find((d) => d.value === 'John Smith');
    expect(fullNameMatch).toBeDefined();
    expect(fullNameMatch!.confidence).toBe('profile-match');
  });

  test('matches address from user profile', () => {
    const result = detectPII('123 Main St, Anytown, CA 90210', {
      address: {
        street: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zip: '90210',
      },
    });
    const addressDetections = result.filter((d) => d.type === 'address');
    expect(addressDetections.length).toBeGreaterThanOrEqual(1);
    expect(addressDetections[0].confidence).toBe('profile-match');
  });

  test('does not flag dollar amounts as PII', () => {
    const result = detectPII('Wages: $125,432.00');
    expect(result).toHaveLength(0);
  });

  test('does not flag dates as SSN', () => {
    const result = detectPII('Date: 01-15-2025');
    expect(result).toHaveLength(0);
  });

  test('returns bounding boxes when OCR data is provided', () => {
    const boxes: OCRBoundingBoxes = new Map();
    boxes.set('12-23', { x: 100, y: 200, width: 150, height: 20 });

    const result = detectPII('Your SSN is 000-00-0000', undefined, boxes);
    expect(result).toHaveLength(1);
    expect(result[0].boundingBox).toEqual({
      x: 100,
      y: 200,
      width: 150,
      height: 20,
    });
  });
});
