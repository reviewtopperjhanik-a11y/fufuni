// Reciprocal Rank Fusion — merges multiple ranked lists into one.
// Produces better results than simple score averaging when the two
// systems use incompatible score scales (BM25 unbounded vs cosine [0,1]).

export function reciprocalRankFusion(
  lists: Array<Array<{ id: string; score: number }>>,
  k = 60,
): Array<{ id: string; score: number }> {
  const fused = new Map<string, number>();
  for (const list of lists) {
    list.forEach((hit, rank) => {
      const contrib = 1 / (k + rank + 1);
      fused.set(hit.id, (fused.get(hit.id) ?? 0) + contrib);
    });
  }
  return [...fused.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
}
