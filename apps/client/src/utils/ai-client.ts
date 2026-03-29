/**
 * Copyright (c) 2024-2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

/**
 * ai-client.ts
 *
 * Multi-provider AI client for client-side translation requests.
 * Supports: OpenAI, Groq (OpenAI-compatible), Claude/Anthropic
 *
 * All requests are made directly from the client without backend routing.
 */

/**
 * Connection parameters for the AI provider used by {@link translateWithAi}.
 * Supports OpenAI, Groq (OpenAI-compatible), and Anthropic.
 */
export interface AiParams {
  /** The API key for the AI provider. */
  apiKey: string;
  /** The model identifier to use (e.g. `"gpt-4o"`, `"claude-3-haiku-20240307"`). */
  model: string;
  /** The base URL of the completions endpoint (e.g. `"https://api.openai.com/v1"`). */
  url: string;
  /**
   * Explicit provider hint. When omitted the provider is auto-detected from
   * the `url`. Supported values: `"openai"` | `"groq"` | `"anthropic"` | `"auto"`.
   */
  provider?: "openai" | "groq" | "anthropic" | "auto";
}

/**
 * Result returned by {@link analyzeReviewWithAi}.
 */
export interface ReviewAnalysisResult {
  /** `true` when the analysis completed successfully. */
  success: boolean;
  /** `"approve"` if the review seems legitimate, `"reject"` if it should be rejected. Present only when `success` is `true`. */
  recommendation?: 'approve' | 'reject';
  /** Short human-readable reason for the recommendation. Present only when `success` is `true`. */
  reason?: string;
  /** Human-readable error message. Present only when `success` is `false`. */
  error?: string;
}

/**
 * Input for a single review to analyze.
 */
export interface ReviewInput {
  id: string;
  rating: number;
  title?: string | null;
  body?: string | null;
  author_name?: string | null;
}

/**
 * Ask the AI to moderate a product review.
 * Returns `"approve"` if the review is legitimate and helpful,
 * `"reject"` if it is spam, offensive, or off-topic.
 */
export async function analyzeReviewWithAi(
  review: ReviewInput,
  aiParams: AiParams,
): Promise<ReviewAnalysisResult> {
  const provider = detectProvider(aiParams.url, aiParams.provider);

  const prompt =
    `You are a content moderator for an e-commerce platform.\n` +
    `Analyze the following customer product review and decide whether to APPROVE or REJECT it.\n` +
    `Approve if: the review is genuine, relevant to the product, and respectful.\n` +
    `Reject if: it is spam, offensive, contains personal data, is off-topic, or is clearly fake.\n\n` +
    `Review:\n` +
    `- Rating: ${review.rating}/5\n` +
    (review.title ? `- Title: ${review.title}\n` : '') +
    (review.body ? `- Body: ${review.body}\n` : '') +
    (review.author_name ? `- Author: ${review.author_name}\n` : '') +
    `\nRespond with a JSON object ONLY, no markdown, no explanation:\n` +
    `{"recommendation":"approve","reason":"<one sentence>"}\n` +
    `or\n` +
    `{"recommendation":"reject","reason":"<one sentence>"}`;

  try {
    let rawText: string | undefined;

    if (provider === 'anthropic') {
      const baseUrl = aiParams.url.endsWith('/') ? aiParams.url : aiParams.url + '/';
      const endpoint = new URL('messages', baseUrl).toString();
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'x-api-key': aiParams.apiKey,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: aiParams.model,
          max_tokens: 128,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!res.ok) return { success: false, error: `HTTP ${res.status}` };
      const data = (await res.json()) as { content?: Array<{ type: string; text: string }> };
      rawText = data.content?.[0]?.text?.trim();
    } else {
      const baseUrl = aiParams.url.endsWith('/') ? aiParams.url : aiParams.url + '/';
      const endpoint = new URL('chat/completions', baseUrl).toString();
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aiParams.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: aiParams.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 128,
        }),
      });
      if (!res.ok) return { success: false, error: `HTTP ${res.status}` };
      const data = (await res.json()) as { choices?: Array<{ message?: { content: string } }> };
      rawText = data.choices?.[0]?.message?.content?.trim();
    }

    if (!rawText) return { success: false, error: 'No response from AI' };

    // Strip optional markdown code fences before parsing
    const cleaned = rawText.replace(/^```[a-z]*\n?/i, '').replace(/```$/, '').trim();
    const parsed = JSON.parse(cleaned) as { recommendation: string; reason: string };
    if (parsed.recommendation !== 'approve' && parsed.recommendation !== 'reject') {
      return { success: false, error: 'Unexpected recommendation value' };
    }
    return { success: true, recommendation: parsed.recommendation, reason: parsed.reason };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Analyze multiple reviews in parallel (up to 5 concurrent requests).
 * Returns a map of review id → analysis result.
 */
export async function analyzeReviewsBatchWithAi(
  reviews: ReviewInput[],
  aiParams: AiParams,
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, ReviewAnalysisResult>> {
  const results = new Map<string, ReviewAnalysisResult>();
  const CONCURRENCY = 5;
  let done = 0;

  for (let i = 0; i < reviews.length; i += CONCURRENCY) {
    const chunk = reviews.slice(i, i + CONCURRENCY);
    const chunkResults = await Promise.all(chunk.map((r) => analyzeReviewWithAi(r, aiParams)));
    chunk.forEach((r, idx) => {
      results.set(r.id, chunkResults[idx]);
      done++;
      onProgress?.(done, reviews.length);
    });
  }
  return results;
}

/**
 * Result returned by {@link translateWithAi}.
 */
export interface TranslationResult {
  /** `true` when the translation completed successfully. */
  success: boolean;
  /** The translated text or HTML. Present only when `success` is `true`. */
  content?: string;
  /** Human-readable error message. Present only when `success` is `false`. */
  error?: string;
}

/**
 * Detect AI provider from URL or explicit provider setting
 */
function detectProvider(
  url: string,
  explicit?: string,
): "openai" | "groq" | "anthropic" {
  if (explicit && ["openai", "groq", "anthropic"].includes(explicit)) {
    return explicit as "openai" | "groq" | "anthropic";
  }

  if (url.includes("anthropic")) return "anthropic";
  if (url.includes("groq")) return "groq";

  // Default to OpenAI-compatible (OpenAI, local models, etc.)
  return "openai";
}

/**
 * Translate HTML content using AI
 * Automatically detects the provider and formats requests accordingly
 */
/**
 * Translate content using AI
 * Automatically detects the provider and formats requests accordingly
 */
export async function translateWithAi(
  sourceContent: string,
  targetLanguage: string,
  aiParams: AiParams,
  isHtml = true,
): Promise<TranslationResult> {
  const provider = detectProvider(aiParams.url, aiParams.provider);

  try {
    switch (provider) {
      case "anthropic":
        return await callAnthropicApi(
          sourceContent,
          targetLanguage,
          aiParams,
          isHtml,
        );
      case "groq":
      case "openai":
      default:
        return await callOpenAiCompatibleApi(
          sourceContent,
          targetLanguage,
          aiParams,
          isHtml,
        );
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Call OpenAI-compatible API (OpenAI, Groq, Ollama, etc.)
 */
async function callOpenAiCompatibleApi(
  content: string,
  targetLanguage: string,
  aiParams: AiParams,
  isHtml = true,
): Promise<TranslationResult> {
  const systemPrompt = isHtml
    ? `You are a professional e-commerce translator and copywriter. ` +
      `Translate the following HTML product description to ${targetLanguage}. ` +
      `Important: Preserve ALL HTML tags exactly as they are. ` +
      `Return ONLY the translated HTML content, no explanations or extra text.`
    : `You are a professional e-commerce copywriter. ` +
      `Translate the following product title to ${targetLanguage}. ` +
      `Return only the translated title as plain text, no quotes, no HTML, no extra text.`;

  // Ensure base URL ends with /
  const baseUrl = aiParams.url.endsWith("/")
    ? aiParams.url
    : aiParams.url + "/";
  const endpoint = new URL("chat/completions", baseUrl).toString();

  // Adapt max_tokens based on provider
  // Groq has strict limits per model, OpenAI is more generous
  let maxTokens = 2048;

  if (aiParams.url.includes("groq")) {
    maxTokens = 512; // Groq's typical limit
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${aiParams.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: aiParams.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content },
      ],
      temperature: 0.3,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}`;

    try {
      const errorData = await response.json();

      errorMessage = errorData?.error?.message || errorMessage;
    } catch {
      const text = await response.text();

      errorMessage = text.substring(0, 200);
    }

    return {
      success: false,
      error: `OpenAI-compatible API error: ${errorMessage}`,
    };
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content: string } }>;
  };
  const translated = data.choices?.[0]?.message?.content?.trim();

  if (!translated) {
    return {
      success: false,
      error: "No content returned from API",
    };
  }

  return {
    success: true,
    content: translated,
  };
}

/**
 * Call Anthropic Claude API
 */
async function callAnthropicApi(
  content: string,
  targetLanguage: string,
  aiParams: AiParams,
  isHtml = true,
): Promise<TranslationResult> {
  const systemPrompt = isHtml
    ? `You are a professional e-commerce translator and copywriter. ` +
      `Translate the following HTML product description to ${targetLanguage}. ` +
      `Important: Preserve ALL HTML tags exactly as they are. ` +
      `Return ONLY the translated HTML content, no explanations or extra text.`
    : `You are a professional e-commerce copywriter. ` +
      `Translate the following product title to ${targetLanguage}. ` +
      `Return only the translated title as plain text, no quotes, no HTML, no extra text.`;

  // Ensure base URL ends with /
  const baseUrl = aiParams.url.endsWith("/")
    ? aiParams.url
    : aiParams.url + "/";
  const endpoint = new URL("messages", baseUrl).toString();

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "x-api-key": aiParams.apiKey,
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: aiParams.model,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content }],
    }),
  });

  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}`;

    try {
      const errorData = await response.json();

      errorMessage = errorData?.error?.message || errorMessage;
    } catch {
      const text = await response.text();

      errorMessage = text.substring(0, 200);
    }

    return {
      success: false,
      error: `Anthropic API error: ${errorMessage}`,
    };
  }

  const data = (await response.json()) as {
    content?: Array<{ type: string; text: string }>;
  };
  const translated = data.content?.[0]?.text?.trim();

  if (!translated) {
    return {
      success: false,
      error: "No content returned from Anthropic API",
    };
  }

  return {
    success: true,
    content: translated,
  };
}
