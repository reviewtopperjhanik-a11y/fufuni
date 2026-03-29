/**
 * Client-side image conversion utilities.
 *
 * Storage rule:
 *  - Converted WebP < IMAGE_SIZE_THRESHOLD bytes → base64 data URI (stored inline in D1)
 *  - Converted WebP ≥ IMAGE_SIZE_THRESHOLD bytes → upload to R2 and store the URL
 */

/** 1 MB threshold that separates inline base64 storage from R2 upload. */
export const IMAGE_SIZE_THRESHOLD = 1_000_000;

/**
 * Convert any browser-readable image (File or Blob) to a WebP Blob using the
 * native Canvas API.  The image is scaled proportionally so neither dimension
 * exceeds `maxSide`.
 *
 * @param source  Source image file or blob (any format the browser can decode)
 * @param maxSide Maximum dimension in pixels; larger images are downscaled
 * @param quality WebP quality, 0.0–1.0 (default 0.80)
 */
export async function convertToWebp(
  source: File | Blob,
  maxSide: number,
  quality = 0.8,
): Promise<Blob> {
  const objectUrl = URL.createObjectURL(source);
  try {
    const img = await loadImage(objectUrl);

    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.round(img.naturalWidth * scale);
    const height = Math.round(img.naturalHeight * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D canvas context');
    ctx.drawImage(img, 0, 0, width, height);

    return await canvasToBlob(canvas, 'image/webp', quality);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Convert a Blob/File to a base64 data URI string.
 * Useful after `convertToWebp` when the blob is below the size threshold.
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('canvas.toBlob returned null'));
      },
      type,
      quality,
    );
  });
}
