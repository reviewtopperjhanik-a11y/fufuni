/**
 * Copyright (c) 2026 Ronan LE MEILLAT - SCTG Development
 * License: AGPL-3.0-or-later
 */
import type { Topic } from '../base.js';
import { BASE_SYSTEM, appendFacts } from '../base.js';

const topic: Topic = {
  name: 'product-reviews',
  description: 'Product review submission, moderation, AI moderation, admin review management',
  sources: [
    'apps/merchant/src/routes/reviews.ts',
    'apps/client/src/pages/admin/reviews.tsx',
  ],
  systemPrompt: BASE_SYSTEM,
  maxSourceChars: 4000,
  manualFacts: [
    'Reviews table: id, product_id, customer_id, rating (1-5), title, body, status (pending|approved|rejected), ai_moderation_result (JSON), created_at.',
    'POST /v1/products/:id/reviews (authenticated customer). Body: { rating, title, body }. Status is set to pending automatically.',
    'GET /v1/products/:id/reviews (public) returns only approved reviews with pagination.',
    'PATCH /v1/reviews/:id/status (admin) approves or rejects a review. Body: { status: "approved" | "rejected" }.',
    'AI moderation: when an admin opens the reviews page, moderateReview() from ai-client.ts is called for each pending review. The result is stored in the ai_moderation_result column and shown as a hint in the UI.',
    'GET /v1/reviews (admin) returns all reviews with filters: ?status=pending|approved|rejected&productId=.',
    'A customer can only submit one review per product. Second submission returns 409 Conflict.',
    'Review rating aggregates (avgRating, reviewCount) are stored as computed columns on the products table, updated after each PATCH /v1/reviews/:id/status.',
  ],
  buildPrompt: (src) => appendFacts(`
Below are reviews.ts and the admin reviews page.

${src}

Task: Write a "Product Reviews Reference".
Include:
1. Review data model: all fields, status values.
2. Public endpoints: submit review, list approved reviews.
3. Admin endpoints: list all reviews (with filters), approve/reject, bulk actions.
4. AI moderation integration: when it runs, what data it stores, how the UI shows it.
5. One-review-per-product constraint: how it is enforced.
6. Rating aggregates: how avgRating and reviewCount are kept up-to-date.
`, topic.manualFacts),
};

export default topic;
