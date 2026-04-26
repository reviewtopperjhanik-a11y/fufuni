// Copyright (c) 2024-2026 Ronan LE MEILLAT - SCTG Development
// License: AGPL-3.0-or-later

import { join } from 'path';
import { isAnthropicApi, isGeminiApi } from './ai.js';
import type { OfflineRequestMeta } from './types.js';

export type { OfflineRequestMeta };

/**
 * Build the request metadata needed to generate offline scripts for a topic.
 *
 * @param systemPrompt - The AI system prompt for the topic.
 * @param userPrompt - The AI user prompt for the topic.
 * @param model - The model identifier to use.
 * @param apiKey - The API key to embed in the offline script.
 * @param opts - API configuration.
 * @returns Metadata describing the full offline request.
 */
export function buildOfflineRequestMeta(
  systemPrompt: string,
  userPrompt: string,
  model: string,
  apiKey: string,
  opts: {
    apiUrl: string;
    aigToken?: string;
    getModelBudget: (model: string) => { maxOutputTokens: number };
  },
): OfflineRequestMeta {
  const isAnthropic = isAnthropicApi(opts.apiUrl);
  const isGemini = isGeminiApi(opts.apiUrl);
  const includeAigHeader = Boolean(opts.aigToken);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  let url = '';
  let usesApiKeyInUrl = false;
  let body: unknown;

  if (includeAigHeader && opts.aigToken) {
    headers['cf-aig-authorization'] = `Bearer ${opts.aigToken}`;
  }

  const maxOutputTokens = opts.getModelBudget(model).maxOutputTokens;

  if (isAnthropic) {
    url = `${opts.apiUrl}/messages`;
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
    body = {
      model,
      max_tokens: maxOutputTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    };
  } else if (isGemini) {
    url = `${opts.apiUrl}/models/${model}:generateContent`;
    usesApiKeyInUrl = true;
    body = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: { maxOutputTokens },
    };
  } else {
    url = `${opts.apiUrl}/chat/completions`;
    headers['Authorization'] = `Bearer ${apiKey}`;
    body = {
      model,
      max_tokens: maxOutputTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    };
  }

  return {
    url,
    headers,
    body,
    model,
    isAnthropic,
    isGemini,
    usesApiKeyInUrl,
    includeAigHeader,
    apiKey,
    aigToken: opts.aigToken,
  };
}

/**
 * Build a TypeScript fetch script for offline use.
 *
 * @param topicName - The topic identifier (used for naming).
 * @param meta - Request metadata from buildOfflineRequestMeta.
 * @returns The script source code.
 */
export function buildOfflineFetchScript(topicName: string, meta: OfflineRequestMeta): string {
  const urlExpression = meta.usesApiKeyInUrl
    ? `const url = new URL(${JSON.stringify(meta.url)});
url.searchParams.set('key', ${JSON.stringify(meta.apiKey)});`
    : `const url = ${JSON.stringify(meta.url)};`;

  const headersEntries = Object.entries(meta.headers)
    .map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`)
    .join(',\n');

  return `#!/usr/bin/env npx tsx

const url = (() => {
${urlExpression}
  return typeof url === 'string' ? url : url.toString();
})();

const headers = {
${headersEntries}
};

const body = ${JSON.stringify(meta.body, null, 2)};

const response = await fetch(url, {
  method: 'POST',
  headers,
  body: JSON.stringify(body),
});

if (!response.ok) {
  const text = await response.text();
  throw new Error('Request failed: ' + response.status + ' ' + text);
}

const output = await response.text();
console.log(output);
`;
}

/**
 * Build a bash curl script for offline use.
 *
 * @param topicName - The topic identifier (used for naming).
 * @param meta - Request metadata from buildOfflineRequestMeta.
 * @returns The script source code.
 */
export function buildOfflineBashScript(topicName: string, meta: OfflineRequestMeta): string {
  const authHeader = meta.isAnthropic
    ? `-H 'x-api-key: ${meta.apiKey}'`
    : meta.isGemini
      ? ''
      : `-H 'Authorization: Bearer ${meta.apiKey}'`;
  const aigHeader =
    meta.includeAigHeader && meta.aigToken
      ? `-H 'cf-aig-authorization: Bearer ${meta.aigToken}'`
      : '';
  const url = meta.usesApiKeyInUrl
    ? `${meta.url}?key=${encodeURIComponent(meta.apiKey)}`
    : meta.url;

  return `#!/usr/bin/env bash
set -euo pipefail

curl -sS -X POST ${JSON.stringify(url)} \
  -H 'Content-Type: application/json' \
  ${authHeader ? `${authHeader} \
  ` : ''}${aigHeader ? `${aigHeader} \
  ` : ''}-d @- <<'EOF'
${JSON.stringify(meta.body, null, 2)}
EOF
`;
}

/**
 * Build a YAML description of the offline request.
 *
 * @param topicName - The topic identifier (used for naming).
 * @param meta - Request metadata from buildOfflineRequestMeta.
 * @returns The YAML description.
 */
export function buildOfflineYamlScript(topicName: string, meta: OfflineRequestMeta): string {
  const toYamlScalar = (value: string): string => {
    const escaped = value.replace(/"/g, '\\"');
    return `"${escaped}"`;
  };

  const yamlBlock = (text: string): string => {
    const lines = text.split('\n');
    const indented = lines.map((line) => `    ${line}`).join('\n');
    return `|\n${indented}`;
  };

  const messages = [] as string[];
  if (meta.isAnthropic) {
    messages.push(`- role: system\n  content: ${yamlBlock((meta.body as any).system ?? '')}`);
    const anthroMessages = (meta.body as any).messages ?? [];
    for (const msg of anthroMessages) {
      messages.push(`- role: ${msg.role}\n  content: ${yamlBlock(msg.content ?? '')}`);
    }
  } else if (meta.isGemini) {
    messages.push(
      `- role: system\n  content: ${yamlBlock((meta.body as any).systemInstruction?.parts?.[0]?.text ?? '')}`,
    );
    const contents = (meta.body as any).contents ?? [];
    for (const msg of contents) {
      const role = msg.role ?? 'user';
      const content = msg.parts?.[0]?.text ?? '';
      messages.push(`- role: ${role}\n  content: ${yamlBlock(content)}`);
    }
  } else {
    const openaiMessages = (meta.body as any).messages ?? [];
    for (const msg of openaiMessages) {
      messages.push(`- role: ${msg.role}\n  content: ${yamlBlock(msg.content ?? '')}`);
    }
  }

  const header = `url: ${toYamlScalar(meta.url)}\nmethod: POST\nmodel: ${toYamlScalar(meta.model)}\nheaders:\n`;
  const headerLines = Object.entries(meta.headers)
    .map(([name, value]) => `  ${name}: ${toYamlScalar(value)}`)
    .join('\n');

  return `${header}${headerLines}\nmessages:\n${messages.join('\n')}`;
}

/**
 * Write offline request scripts for a topic based on the active offline mode flags.
 *
 * @param topicName - The topic slug, used as the output file name.
 * @param meta - Request metadata from buildOfflineRequestMeta.
 * @param opts - Active flags and I/O helpers.
 */
export function writeOfflineScripts(
  topicName: string,
  meta: OfflineRequestMeta,
  opts: {
    offlineFetch: boolean;
    offlineBash: boolean;
    offlineYaml: boolean;
    mcpDir: string;
    writeGeneratedFile: (path: string, content: string) => void;
    writeGeneratedScript: (path: string, content: string) => void;
  },
): void {
  if (opts.offlineFetch) {
    const scriptPath = join(opts.mcpDir, `${topicName}.ts`);
    opts.writeGeneratedScript(scriptPath, buildOfflineFetchScript(topicName, meta));
    console.log(`  → written offline fetch script ${topicName}.ts`);
  }
  if (opts.offlineBash) {
    const scriptPath = join(opts.mcpDir, `${topicName}.sh`);
    opts.writeGeneratedScript(scriptPath, buildOfflineBashScript(topicName, meta));
    console.log(`  → written offline bash script ${topicName}.sh`);
  }
  if (opts.offlineYaml) {
    const yamlPath = join(opts.mcpDir, `${topicName}.yaml`);
    opts.writeGeneratedFile(yamlPath, buildOfflineYamlScript(topicName, meta));
    console.log(`  → written offline yaml ${topicName}.yaml`);
  }
}
