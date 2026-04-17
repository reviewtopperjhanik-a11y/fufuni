/**
 * Copyright (c) 2026 Ronan LE MEILLAT - SCTG Development
 * License: AGPL-3.0-or-later
 */
import type { Topic } from '../base.js';
import { BASE_SYSTEM } from '../base.js';

const topic: Topic = {
  name: 'api-error-patterns',
  description: 'ApiError class, static helpers, error response format',
  sources: [
    'apps/merchant/src/types.ts',
  ],
  systemPrompt: BASE_SYSTEM,
  buildPrompt: (src) => `
Below is types.ts which contains the ApiError class.

${src}

Task: Write an "API Error Handling Reference".
Include:
1. The ApiError class static helpers table: method | HTTP status | use case.
2. How Hono converts thrown ApiError into JSON responses.
3. Code examples for each common error type (notFound, unauthorized, forbidden,
   conflict, invalidRequest, insufficientInventory, internalServerError).
4. How to create custom error messages with ApiError.
5. Frontend: how to handle API errors from useSecuredApi() callers.
`,
};

export default topic;
