/**
 * Copyright (c) 2026 Ronan LE MEILLAT - SCTG Development
 * License: AGPL-3.0-or-later
 */
import type { Topic } from '../base.js';
import { BASE_SYSTEM } from '../base.js';

const topic: Topic = {
  name: 'seed-data-patterns',
  description: 'How the seed script works, how to add new seed data',
  sources: [
    'apps/merchant/scripts/seed.ts',
  ],
  systemPrompt: BASE_SYSTEM,
  buildPrompt: (src) => `
Below is the seed.ts script (may be truncated).

${src}

Task: Write a "Seed Data Script Reference".
Include:
1. How to run the seed script (exact command, required arguments).
2. The PRODUCT_CATALOG structure: how to add a new product with variants and pricing.
3. How to add a new seed category.
4. The apiWithRetry helper: why it exists, how to use it for custom seed data.
5. How currency conversion works (EUR → USD / GBP).
6. How images are embedded: toWebpDataUri helper, base64 fallback.
7. How to add a new seed helper function following the existing pattern.
`,
};

export default topic;
