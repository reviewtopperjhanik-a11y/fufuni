// Minimal BM25 (Okapi) implementation — ~5 KB bundled, zero deps.
// Tokenisation: lowercase, split on [^a-z0-9_-]+, strip stop words.

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from",
  "has", "have", "in", "is", "it", "its", "of", "on", "or", "that",
  "the", "to", "was", "were", "will", "with", "from", "this",
  "about", "also", "any", "been", "but", "can", "could", "do", "does",
  "doing", "down", "each", "few", "get", "had", "has", "have", "he",
  "her", "here", "hers", "him", "his", "how", "i", "if", "into",
  "just", "like", "me", "might", "more", "most", "my", "myself",
  "no", "not", "of", "off", "only", "other", "our", "out", "over",
  "such", "than", "then", "these", "they", "this", "too", "under",
  "up", "very", "we", "what", "when", "which", "while", "who", "why",
  "you", "your",
]);

export function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_\-]+/g)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

export type Bm25Doc = {
  id: string;
  terms: string[];
};

export class Bm25Index {
  private readonly k1 = 1.5;
  private readonly b = 0.75;
  private readonly avgdl: number;
  private readonly df: Map<string, number>;
  private readonly docLen: Map<string, number>;
  private readonly tf: Map<string, Map<string, number>>;
  private readonly N: number;

  constructor(docs: Bm25Doc[]) {
    this.N = docs.length;
    this.df = new Map();
    this.docLen = new Map();
    this.tf = new Map();
    let totalLen = 0;

    for (const doc of docs) {
      const seen = new Set<string>();
      const localTf = new Map<string, number>();
      for (const term of doc.terms) {
        localTf.set(term, (localTf.get(term) ?? 0) + 1);
        seen.add(term);
      }
      for (const term of seen) {
        this.df.set(term, (this.df.get(term) ?? 0) + 1);
      }
      this.tf.set(doc.id, localTf);
      this.docLen.set(doc.id, doc.terms.length);
      totalLen += doc.terms.length;
    }
    this.avgdl = totalLen / Math.max(1, this.N);
  }

  search(query: string[], k = 20): Array<{ id: string; score: number }> {
    const scores = new Map<string, number>();
    for (const [docId, tfMap] of this.tf) {
      const dl = this.docLen.get(docId) ?? 0;
      let score = 0;
      for (const qTerm of query) {
        const tf = tfMap.get(qTerm) ?? 0;
        if (tf === 0) continue;
        const df = this.df.get(qTerm) ?? 0;
        const idf = Math.log(1 + (this.N - df + 0.5) / (df + 0.5));
        const norm = (tf * (this.k1 + 1)) /
          (tf + this.k1 * (1 - this.b + this.b * (dl / this.avgdl)));
        score += idf * norm;
      }
      if (score > 0) scores.set(docId, score);
    }
    return [...scores.entries()]
      .map(([id, score]) => ({ id, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
}
