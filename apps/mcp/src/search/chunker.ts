// Copyright (c) 2024-2026 Ronan LE MEILLAT
// License: AGPL-3.0-or-later
//
// Chunker — split Markdown documents into digestible pieces (~150–400 words)
// aligned to section boundaries.

export type GeneratedChunk = {
  /** "slug#index" */
  id: string;
  topic: string;
  heading: string;        // "## Refund flow"
  heading_path: string[]; // ["Database", "Orders table", "Refund flow"]
  text: string;
  word_count: number;
};

const MIN_WORDS = 150;
const MAX_WORDS = 400;

/**
 * Split a Markdown document into chunks of ~150-400 words,
 * cut at heading boundaries (## to ####).
 * Preserves heading path so each chunk is self-contained.
 *
 * @param slug - Topic slug (e.g. "db-schema")
 * @param markdown - Full markdown content
 * @returns Array of chunks
 */
export function chunkMarkdown(slug: string, markdown: string): GeneratedChunk[] {
  // Remove header comment (<!--...-->)
  const body = markdown.replace(/^<!--[\s\S]*?-->\s*/m, "");
  const lines = body.split("\n");
  const chunks: GeneratedChunk[] = [];
  const stack: string[] = [];
  let buffer: string[] = [];
  let currentHeading = "";
  let index = 0;

  const flush = () => {
    const text = buffer.join("\n").trim();
    if (!text) return;

    const words = text.split(/\s+/).filter(w => w.length > 0).length;

    // If chunk is too short and we have previous chunks, merge with the last one
    if (words < MIN_WORDS && chunks.length > 0) {
      const prev = chunks[chunks.length - 1];
      prev.text = `${prev.text}\n\n${text}`;
      prev.word_count += words;
    } else if (words > 0) {
      chunks.push({
        id: `${slug}#${index++}`,
        topic: slug,
        heading: currentHeading,
        heading_path: [...stack],
        text,
        word_count: words,
      });
    }
    buffer = [];
  };

  for (const line of lines) {
    // Match headings: ## to ####
    const headingMatch = line.match(/^(#{2,4})\s+(.+)$/);
    if (headingMatch) {
      flush();
      const level = headingMatch[1].length; // 2, 3, or 4
      const title = headingMatch[2].trim();

      // Adjust stack to match heading level
      // Level 2 → stack[0], Level 3 → stack[1], Level 4 → stack[2]
      stack.splice(level - 2);
      stack.push(title);

      currentHeading = line;
      buffer.push(line);
      continue;
    }

    buffer.push(line);

    // Check if buffer exceeds MAX_WORDS
    const words = buffer.join(" ").split(/\s+/).filter(w => w.length > 0).length;
    if (words >= MAX_WORDS) {
      flush();
      // Repeat heading so the next chunk is self-contained
      buffer.push(currentHeading);
    }
  }

  flush();
  return chunks;
}
