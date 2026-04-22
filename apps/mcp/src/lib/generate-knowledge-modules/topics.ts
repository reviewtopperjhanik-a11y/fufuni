// Copyright (c) 2024-2026 Ronan LE MEILLAT
// License: AGPL-3.0-or-later

import type { Topic } from '../../knowledge/base.js';
import type { GeneratedChunk, TopicManifest } from './types.js';
import { parseHeaderChecksums } from './checksum.js';

/**
 * Convert topic markdown files into generated search chunks.
 *
 * Each topic currently becomes a single chunk containing its full text.
 * This helper is used by the bundle generation pipeline.
 *
 * @param topics - List of topic definitions.
 * @param loadTopicMarkdown - Function returning markdown content for each topic.
 * @returns Array of generated chunks ready for indexing.
 */
export function generateChunks(
  topics: Topic[],
  loadTopicMarkdown: (topicName: string) => string,
): GeneratedChunk[] {
  const chunks: GeneratedChunk[] = [];

  for (const topic of topics) {
    const mdContent = loadTopicMarkdown(topic.name);
    const text = mdContent.replace(/<!--[\s\S]*?-->/, '');
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    chunks.push({
      id: `${topic.name}#0`,
      topic: topic.name,
      heading: `## ${topic.description}`,
      heading_path: [topic.description],
      text,
      word_count: wordCount,
    });
  }

  return chunks;
}

/**
 * Build the generated topic manifest with metadata for each topic.
 *
 * The manifest is used by runtime tools and developer scripts to discover topics.
 *
 * @param generatedTopics - Topics included in the generation run.
 * @param options - Commit identifier and markdown loader.
 * @returns A manifest object describing all generated topics.
 */
export function buildManifest(
  generatedTopics: Topic[],
  options: {
    commit: string;
    now?: string;
    getTopicMarkdown: (topicName: string) => string;
  },
): TopicManifest {
  const generatedAt = options.now ?? new Date().toISOString();

  const topics = generatedTopics.map((topic) => {
    const mdContent = options.getTopicMarkdown(topic.name);
    const words = mdContent.replace(/<!--[\s\S]*?-->/, '').split(/\s+/).filter(Boolean).length;
    const checksums = parseHeaderChecksums(mdContent);
    const titleMatch = mdContent.match(/^#{1,2}\s+(.+)$/m);
    const title = titleMatch?.[1]?.trim() ?? topic.name;

    return {
      slug: topic.name,
      title,
      description: topic.description,
      tags: topic.tags || [],
      updated_at: generatedAt,
      word_count: words,
      sources_checksum: checksums.sourcesChecksum || '',
    };
  });

  return {
    generated_at: generatedAt,
    commit: options.commit,
    manifest_version: '1.0.0',
    topics,
  };
}
