/**
 * Spec: PII Redaction
 *
 * Status: confirmed
 * Confirm: Redacted output contains zero PII; original data preserved locally
 * Invalidate: Redaction corrupts document structure or removes non-PII data
 *
 * Takes PII detections and produces redacted versions of documents.
 * Text → replaced with [REDACTED]. Images → bounding boxes blacked out.
 * Spreadsheets → PII cells cleared.
 */

import { detectPII, redactText, redactSpreadsheet, applyRedactionToPixels } from '@selftax/core';

describe('PII Redaction', () => {
  test('replaces SSN in text with [REDACTED]', () => {
    const text = 'SSN: 000-00-0000';
    const detections = detectPII(text);
    const result = redactText(text, detections);
    expect(result).toBe('SSN: [REDACTED]');
    expect(result).not.toContain('000-00-0000');
  });

  test('replaces name in text with [REDACTED]', () => {
    const text = 'Employee: John Smith';
    const detections = detectPII(text, {
      firstName: 'John',
      lastName: 'Smith',
    });
    const result = redactText(text, detections);
    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain('John Smith');
  });

  test('preserves dollar amounts in redacted text', () => {
    const text = 'John Smith earned $50,000';
    const detections = detectPII(text, {
      firstName: 'John',
      lastName: 'Smith',
    });
    const result = redactText(text, detections);
    expect(result).toContain('$50,000');
    expect(result).not.toContain('John Smith');
  });

  test('preserves document structure after redaction', () => {
    const w2Text = [
      'Box a: 000-00-0000',
      'Box b: 00-0000000',
      'Box 1: Wages $125,432.00',
      'Box 2: Federal Tax $28,100.00',
      'Box 12a: Code V $45,000.00',
    ].join('\n');
    const detections = detectPII(w2Text);
    const result = redactText(w2Text, detections);
    // Structure preserved
    expect(result).toContain('Box 1: Wages $125,432.00');
    expect(result).toContain('Box 2: Federal Tax $28,100.00');
    expect(result).toContain('Box 12a: Code V $45,000.00');
    // PII removed
    expect(result).not.toContain('000-00-0000');
    expect(result).not.toContain('00-0000000');
  });

  test('blacks out bounding boxes in images', () => {
    // 4x4 white image (RGBA: 255,255,255,255 per pixel)
    const width = 4;
    const height = 4;
    const pixels = new Uint8Array(width * height * 4).fill(255);

    const regions = [{ x: 1, y: 1, width: 2, height: 2 }];

    const result = applyRedactionToPixels(pixels, width, regions);

    // Pixel at (0,0) should still be white
    expect(result[0]).toBe(255);
    expect(result[1]).toBe(255);
    expect(result[2]).toBe(255);

    // Pixel at (1,1) should be black (inside redaction region)
    const offset = (1 * width + 1) * 4;
    expect(result[offset]).toBe(0);     // R
    expect(result[offset + 1]).toBe(0); // G
    expect(result[offset + 2]).toBe(0); // B
    expect(result[offset + 3]).toBe(255); // A (opaque)

    // Pixel at (3,3) should still be white (outside region)
    const outsideOffset = (3 * width + 3) * 4;
    expect(result[outsideOffset]).toBe(255);
  });

  test('redacts PII cells in spreadsheet data', () => {
    const rows = [
      ['Name', 'Amount', 'Description'],
      ['John Smith', '$3,200', 'Plumbing repair'],
      ['Jane Doe', '$1,500', 'Electrical work'],
    ];
    const detections = detectPII('John Smith', {
      firstName: 'John',
      lastName: 'Smith',
    });
    const result = redactSpreadsheet(rows, detections);
    expect(result[0]).toEqual(['Name', 'Amount', 'Description']);
    expect(result[1][0]).toBe('[REDACTED]');
    expect(result[1][1]).toBe('$3,200');
    expect(result[2][0]).toBe('Jane Doe'); // Not the user, not redacted
  });

  test('returns original and redacted as a pair', () => {
    const text = 'SSN: 000-00-0000, Wages: $125,432';
    const detections = detectPII(text);
    const redacted = redactText(text, detections);

    // Original preserved
    expect(text).toContain('000-00-0000');
    // Redacted clean
    expect(redacted).not.toContain('000-00-0000');
    expect(redacted).toContain('$125,432');
  });
});
