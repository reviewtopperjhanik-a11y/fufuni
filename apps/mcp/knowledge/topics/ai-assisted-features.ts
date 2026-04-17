/**
 * Copyright (c) 2026 Ronan LE MEILLAT - SCTG Development
 * License: AGPL-3.0-or-later
 */
import type { Topic } from '../base.js';
import { BASE_SYSTEM, appendFacts } from '../base.js';

const topic: Topic = {
  name: 'ai-assisted-features',
  description: 'AI review moderation, auto-translation, ai-client.ts, backend AI routes',
  sources: [
    'apps/client/src/utils/ai-client.ts',
    'apps/merchant/src/routes/ai.ts',
    'apps/merchant/src/lib/ai-enc.ts',
  ],
  systemPrompt: BASE_SYSTEM,
  manualFacts: [
    'AI API credentials (key, model, url) are stored encrypted in the DB (ai_settings table) via lib/ai-enc.ts. The encryption key is the ENCRYPTION_KEY Wrangler secret.',
    'GET /v1/ai/parameters returns { apiKey, model, url } (decrypted) to authenticated admin users only. The frontend fetches this then calls the AI API directly from the browser.',
    'ai-client.ts (apps/client/src/utils/ai-client.ts) exports: createChatCompletion(apiKey, model, url, messages), moderateReview(review, apiKey, model, url), autoTranslate(text, targetLocale, apiKey, model, url).',
    'Review moderation: the admin reviews page calls moderateReview() before displaying the approve/reject buttons. Returns { safe: boolean, reason?: string }.',
    'Auto-translation: the product form admin calls autoTranslate() to pre-fill localized name/description fields. The AI translates from the base language (en-US) to all other locales.',
    'The AI provider is OpenAI-compatible (any provider supporting the /v1/chat/completions endpoint). Configured via admin settings page.',
    'POST /v1/ai/settings (admin) stores new credentials. POST /v1/ai/test (admin) tests the connection with a simple ping prompt.',
    'If AI settings are not configured, auto-translate buttons are hidden and review moderation silently skips the AI check.',
  ],
  buildPrompt: (src) => appendFacts(`
Below are ai-client.ts, the AI routes, and the AI encryption lib.

${src}

Task: Write an "AI-Assisted Features Reference".
Include:
1. Architecture: why AI calls are made from the browser (not backend inference).
2. Credential storage: ai_settings table, encryption, ENCRYPTION_KEY secret.
3. GET /v1/ai/parameters: who can call it, what it returns.
4. ai-client.ts exports: createChatCompletion, moderateReview, autoTranslate — signatures and examples.
5. Review moderation: where it is called, what it returns, how the UI uses it.
6. Auto-translation: workflow, target locales, fallback when AI not configured.
7. Admin setup: POST /v1/ai/settings fields, POST /v1/ai/test.
8. Graceful degradation when AI is not configured.
`, topic.manualFacts),
};

export default topic;
