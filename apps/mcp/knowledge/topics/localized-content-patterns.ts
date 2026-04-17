/**
 * Copyright (c) 2026 Ronan LE MEILLAT - SCTG Development
 * License: AGPL-3.0-or-later
 */
import type { Topic } from '../base.js';
import { BASE_SYSTEM, appendFacts } from '../base.js';

const topic: Topic = {
  name: 'localized-content-patterns',
  description: 'LocalizedText type, useLocalizedTextInput hook, description rendering utils',
  sources: [
    'apps/client/src/utils/description.ts',
    'apps/client/src/hooks/use-localized-text-input.ts',
  ],
  systemPrompt: BASE_SYSTEM,
  manualFacts: [
    'LocalizedText is an object keyed by locale code: { "en-US": "Hello", "fr-FR": "Bonjour", ... }. Used for product names, descriptions, category names, and any multi-language text field.',
    'getLocalizedText(localizedText, locale, fallbackLocale?) picks the best available translation for the given locale, falling back to the fallback locale then to the first available key.',
    'stripHtml(html) removes all HTML tags for use in text-only contexts (SEO description, PDF invoice).',
    'renderDescription(localizedText, locale) returns the HTML string for the current locale, safe to inject via dangerouslySetInnerHTML (server-escaped by the backend).',
    'useLocalizedTextInput({ value, onChange, locales }) returns per-locale input props. Use in admin forms where you need one text field per locale.',
    'The admin product form uses useLocalizedTextInput for the description field, rendering one <RichTextEditor> per supported locale in a tab-pane layout.',
    'Rich text descriptions are stored as HTML strings per locale inside the LocalizedText JSON. The backend stores this as a TEXT column (JSON serialized).',
    'Adding a new locale to the UI: add the locale code to the locales array passed to useLocalizedTextInput. The component auto-renders a new tab.',
  ],
  buildPrompt: (src) => appendFacts(`
Below are description.ts and use-localized-text-input.ts.

${src}

Task: Write a "Localized Content Patterns Reference".
Include:
1. LocalizedText type definition and storage format.
2. getLocalizedText(): signature, fallback chain, usage example.
3. renderDescription() and stripHtml(): when to use each.
4. useLocalizedTextInput() hook: props, return value, usage in an admin form.
5. How rich-text HTML is stored in LocalizedText fields.
6. How to add support for a new locale in an existing admin form.
`, topic.manualFacts),
};

export default topic;
