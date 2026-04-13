import type { PIIDetection } from '../types';

/**
 * Describes a rectangular region to black out in an image.
 * Extracted from PIIDetection bounding boxes.
 */
export interface RedactionRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Extract redaction regions from PII detections that have bounding boxes.
 * This is the pure logic — actual pixel manipulation happens in the platform layer.
 */
export function getRedactionRegions(detections: PIIDetection[]): RedactionRegion[] {
  return detections
    .filter((d) => d.boundingBox != null)
    .map((d) => ({
      x: d.boundingBox!.x,
      y: d.boundingBox!.y,
      width: d.boundingBox!.width,
      height: d.boundingBox!.height,
    }));
}

/**
 * Apply black rectangles to raw RGBA pixel data.
 * Works in both Node (Buffer) and browser (Uint8ClampedArray).
 *
 * @param pixels - RGBA pixel data (4 bytes per pixel)
 * @param imageWidth - Width of the image in pixels
 * @param regions - Regions to black out
 * @returns Modified pixel data with regions blacked out
 */
export function applyRedactionToPixels(
  pixels: Uint8Array | Uint8ClampedArray,
  imageWidth: number,
  regions: RedactionRegion[],
): Uint8Array | Uint8ClampedArray {
  const result = new Uint8Array(pixels);

  for (const region of regions) {
    const startX = Math.max(0, Math.floor(region.x));
    const startY = Math.max(0, Math.floor(region.y));
    const endX = Math.min(imageWidth, Math.ceil(region.x + region.width));
    const imageHeight = pixels.length / (imageWidth * 4);
    const endY = Math.min(imageHeight, Math.ceil(region.y + region.height));

    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const offset = (y * imageWidth + x) * 4;
        result[offset] = 0;     // R
        result[offset + 1] = 0; // G
        result[offset + 2] = 0; // B
        result[offset + 3] = 255; // A (fully opaque)
      }
    }
  }

  return result;
}
