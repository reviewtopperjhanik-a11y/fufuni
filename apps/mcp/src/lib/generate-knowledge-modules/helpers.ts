// Copyright (c) 2024-2026 Ronan LE MEILLAT
// License: AGPL-3.0-or-later

/**
 * Shuffle an array in place using the Fisher-Yates algorithm.
 *
 * This helper is intentionally simple and deterministic enough for
 * internal key and data shuffling without introducing external dependencies.
 *
 * @param items - The array to shuffle.
 * @returns The same array instance with its elements reordered.
 */
export function shuffleArray<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/**
 * Encode a Float32Array into a base64 string.
 *
 * The generated base64 payload is used by buildVectorsModule to embed
 * vectors in a text-based TypeScript module.
 *
 * @param data - The binary Float32Array to encode.
 * @returns A base64 string representing the Float32Array bytes.
 */
export function float32ArrayToBase64(data: Float32Array): string {
  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  if (typeof (globalThis as any).btoa === 'function') {
    return (globalThis as any).btoa(binary);
  }

  const nodeBuffer = (globalThis as any).Buffer;
  if (typeof nodeBuffer === 'function') {
    return nodeBuffer.from(binary, 'binary').toString('base64');
  }

  throw new Error('Unable to encode base64 in this environment.');
}
