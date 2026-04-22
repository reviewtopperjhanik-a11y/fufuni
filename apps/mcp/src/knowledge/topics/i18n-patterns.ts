/**
 * Copyright (c) 2026 Ronan LE MEILLAT - SCTG Development
 * License: AGPL-3.0-or-later
 */
import type { Topic } from '../base.js';
import { BASE_SYSTEM, appendFacts } from '../base.js';

const topic: Topic = {
  name: 'i18n-patterns',
  description: 'react-i18next usage across the six supported locales — locale files layout, useTranslation hook, and fallback-language behaviour.',
  tags: ["frontend","i18n","localization","react","ui"],
  sources: [
    'apps/client/src/i18n.ts',
    'apps/client/src/locales/base/en-US.json',
    'apps/client/src/locales/base/fr-FR.json',
    'apps/client/src/locales/base/es-ES.json',
    'apps/client/src/locales/base/zh-CN.json',
    'apps/client/src/locales/base/ar-SA.json',
    'apps/client/src/locales/base/he-IL.json',
  ],
  systemPrompt: BASE_SYSTEM,
  manualFacts: [
    'New languages must be declared in i18n.ts within availableLanguages.',
    'Add a new object to the availableLanguages array with the following properties: code (e.g. "en-US"), nativeName (e.g. "English"), isRTL (boolean, true for ar-SA and he-IL). Optionally set isDefault: true to make it the fallback language (only one entry should have isDefault: true, currently en-US).',
    'json files contains the translation keys for each language. Keys use kebab-case. ex: "admin-users-page-title": "Admin Users Page Title"',
    'rtl styles are automatically applied to the layout when the language is set to a rtl language.',
    'Master language is en-US.json. All other languages are derived from this file.',
    'NEVER use t() default value parameter always add at least the en-US translation key as default value.',
  ],
  buildPrompt: (src) => appendFacts(`
Below is the i18n configuration file.

${src}

Task: Write an "Internationalisation (i18n) Reference" for frontend developers.
Include:
1. The 6 supported locales (en-US, fr-FR, es-ES, zh-CN, ar-SA, he-IL) and where
   the locale JSON files live.
2. How to add a new translation key:
   a. Which files to edit.
   b. JSON structure (flat keys, interpolation syntax).
3. How to use the hook in a component: useTranslation(), t('key'), t('key', {count}).
4. How to handle RTL languages (ar-SA, he-IL) in layout.
5. A worked example: adding a new "product tags" feature with 3 translation keys.
`, topic.manualFacts),
};

export default topic;
