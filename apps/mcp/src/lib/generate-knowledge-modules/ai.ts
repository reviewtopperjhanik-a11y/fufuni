// Copyright (c) 2024-2026 Ronan LE MEILLAT
// License: AGPL-3.0-or-later

import { estimateTokens } from './text.js';
import type { CallAiOptions } from './types.js';

/**
 * Detect whether the provided API URL belongs to Anthropic.
 *
 * @param apiUrl - The AI API endpoint URL.
 * @returns True when the URL appears to be Anthropic.
 */
export function isAnthropicApi(apiUrl: string): boolean {
  return apiUrl.includes('anthropic.com');
}

/**
 * Detect whether the provided API URL belongs to Google Gemini.
 *
 * @param apiUrl - The AI API endpoint URL.
 * @returns True when the URL appears to be a Gemini endpoint.
 */
export function isGeminiApi(apiUrl: string): boolean {
  return (
    (apiUrl.includes('generativelanguage.googleapis.com') || apiUrl.includes('gemini.googleapis.com')) &&
    !apiUrl.includes('openai')
  );
}

/**
 * Call an AI model API to generate text from a system and user prompt.
 *
 * Supports Anthropic, Gemini, and OpenAI-compatible endpoints.
 *
 * @param systemPrompt - System-level prompt to guide the model.
 * @param userPrompt - User-facing prompt to send to the model.
 * @param opts - Request configuration including endpoint and API key.
 * @returns Model output text and token usage metrics.
 */
export async function callAi(
  systemPrompt: string,
  userPrompt: string,
  opts: CallAiOptions,
): Promise<{ content: string; tokensIn: number; tokensOut: number }> {
  const fetchFn = opts.fetch ?? globalThis.fetch;
  const isAnthropic = isAnthropicApi(opts.apiUrl);
  const isGemini = isGeminiApi(opts.apiUrl);

  if (opts.verbose) {
    console.log(`  [ai] model=${opts.model} endpoint=${opts.apiUrl}`);
    console.log(`  [ai] input tokens ≈ ${estimateTokens(systemPrompt + userPrompt)}`);
  }

  const response = await fetchFn(
    isAnthropic
      ? `${opts.apiUrl}/messages`
      : isGemini
        ? `${opts.apiUrl}/models/${opts.model}:generateContent?key=${opts.apiKey}`
        : `${opts.apiUrl}/chat/completions`,
    {
      method: 'POST',
      headers: (() => {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (isAnthropic) {
          headers['x-api-key'] = opts.apiKey;
          headers['anthropic-version'] = '2023-06-01';
        }
        if (!isAnthropic && !isGemini) {
          headers['Authorization'] = `Bearer ${opts.apiKey}`;
        }
        return headers;
      })(),
      body: JSON.stringify(
        isAnthropic
          ? {
              model: opts.model,
              max_tokens: opts.maxTokens,
              system: systemPrompt,
              messages: [{ role: 'user', content: userPrompt }],
            }
          : isGemini
            ? {
                systemInstruction: { parts: [{ text: systemPrompt }] },
                contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
                generationConfig: { maxOutputTokens: opts.maxTokens },
              }
            : {
                model: opts.model,
                max_tokens: opts.maxTokens,
                messages: [
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: userPrompt },
                ],
              },
      ),
      signal: opts.abortSignal,
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    const label = isAnthropic ? 'Anthropic' : isGemini ? 'Gemini' : 'OpenAI/Groq';
    throw new Error(`AI API error (${label}) ${response.status}: ${errorText}`);
  }

  if (isAnthropic) {
    const data = await response.json() as any;
    return {
      content: data.content?.[0]?.text ?? '',
      tokensIn: data.usage?.input_tokens ?? estimateTokens(systemPrompt + userPrompt),
      tokensOut: data.usage?.output_tokens ?? 0,
    };
  }

  if (isGemini) {
    const data = await response.json() as any;
    return {
      content: data.candidates?.[0]?.content?.parts?.[0]?.text ?? '',
      tokensIn: data.usageMetadata?.promptTokenCount ?? estimateTokens(systemPrompt + userPrompt),
      tokensOut: data.usageMetadata?.candidatesTokenCount ?? 0,
    };
  }

  const data = await response.json() as {
    choices: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const content = data.choices?.[0]?.message?.content ?? '';
  const tokensIn = data.usage?.prompt_tokens ?? estimateTokens(systemPrompt + userPrompt);
  const tokensOut = data.usage?.completion_tokens ?? estimateTokens(content);
  return { content, tokensIn, tokensOut };
}

/**
 * Mask an API key for safe logging.
 *
 * Shows a small prefix and suffix while hiding the middle portion.
 *
 * @param key - Full API key string.
 * @param keepStart - Number of leading characters to keep.
 * @param keepEnd - Number of trailing characters to keep.
 * @returns The masked key string.
 */
export function maskApiKey(key: string, keepStart = 6, keepEnd = 8): string {
  if (key.length <= keepStart + keepEnd) {
    return '*'.repeat(key.length);
  }
  const start = key.slice(0, keepStart);
  const end = key.slice(-keepEnd);
  return `${start}...${end}`;
}
