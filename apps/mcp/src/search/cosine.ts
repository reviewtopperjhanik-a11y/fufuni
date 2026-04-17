// Cosine similarity search over pre-computed embeddings.
// Vectors are decoded from base64 at runtime (once per isolate).

export interface VectorIndex {
  readonly VECTOR_DIM: number;
  readonly VECTOR_COUNT: number;
  readonly VECTORS_B64: string;
  readonly CHUNK_IDS: readonly string[];
}

/**
 * Decode the base64 blob into one big Float32Array (lazy, done once per isolate).
 * On Cloudflare Workers this evaluates at cold start; warm invocations reuse it.
 */
function decodeVectors(index: VectorIndex): Float32Array {
  const bin = atob(index.VECTORS_B64);
  const buf = new ArrayBuffer(bin.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
  return new Float32Array(buf);
}

let cachedCorpus: Float32Array | null = null;
let cachedIndex: VectorIndex | null = null;

function getCorpus(index: VectorIndex): Float32Array {
  if (cachedCorpus && cachedIndex === index) return cachedCorpus;
  cachedCorpus = decodeVectors(index);
  cachedIndex = index;
  return cachedCorpus;
}

/**
 * Return top-k chunk IDs ranked by cosine similarity against the query vector.
 * Query vector is expected to be L2-normalised already. Corpus vectors are
 * normalised at index time.
 */
export function cosineTopK(
  index: VectorIndex,
  queryVec: Float32Array,
  k = 20,
): Array<{ id: string; score: number }> {
  const cbuf = getCorpus(index);
  const results: Array<{ id: string; score: number }> = [];
  for (let i = 0; i < index.VECTOR_COUNT; i++) {
    let dot = 0;
    const offset = i * index.VECTOR_DIM;
    for (let d = 0; d < index.VECTOR_DIM; d++) {
      dot += queryVec[d] * cbuf[offset + d];
    }
    results.push({ id: index.CHUNK_IDS[i], score: dot });
  }
  return results.sort((a, b) => b.score - a.score).slice(0, k);
}
