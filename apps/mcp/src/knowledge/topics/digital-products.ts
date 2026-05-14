/**
 * Copyright (c) 2026 Ronan LE MEILLAT - SCTG Development
 * License: AGPL-3.0-or-later
 */
import type { Topic } from '../base.js';
import { BASE_SYSTEM, appendFacts } from '../base.js';

const topic: Topic = {
  name: 'digital-products',
  description: 'How to sell downloadable digital products in Fufuni: variant types, digital_assets table, upload workflow, JWT-signed download links, and frontend UX.',
  tags: ['digital-products', 'downloads', 'r2', 'jwt'],
  sources: [
    'apps/merchant/src/routes/digital-assets.ts',
    'apps/merchant/src/routes/downloads.ts',
    'apps/merchant/src/routes/catalog.ts',
    'apps/merchant/src/schemas.ts',
  ],
  systemPrompt: BASE_SYSTEM,
  manualFacts: [
    'Variants have a variant_type column (physical | digital | ai_tokens). Digital variants must have requires_shipping = 0.',
    'A digital_assets row links a variant to its file: either file_key (R2 object key) or file_url (external URL). Only one per variant (upsert semantics).',
    'Admin can upload files via POST /v1/admin/digital-assets/upload-url (presigned R2 URL) or PUT /v1/admin/digital-assets/upload/:key (proxy upload through the Worker). Requires DIGITAL_ASSETS_BUCKET R2 binding.',
    'GET /v1/orders/:orderId/downloads (customerAuth) returns a list of JWT-signed download URLs, one per digital item in the order. Only works when order status is paid|processing|shipped|delivered.',
    'Download tokens are HS256 JWTs signed with ORDER_TOKEN_SECRET. Claims: { type: "download", oid: orderId, sku }. TTL: 7 days.',
    'GET /v1/downloads/:token (public) verifies the JWT, re-validates order status, then either streams from R2 or issues a 302 redirect to the external URL.',
    'The "type: download" claim prevents cross-endpoint reuse of other order tokens.',
    'Frontend: order-detail page fetches /v1/orders/:id/downloads after loading the order. Download buttons are shown only when the array is non-empty.',
    'Setting variant_type = "digital" via PATCH /v1/products/:id/variants/:variantId automatically coerces requires_shipping to 0.',
    'Deleting a digital asset via DELETE /v1/products/:id/variants/:variantId/digital-asset resets the variant_type to "physical".',
  ],
  buildPrompt: (src) => appendFacts(`
The following source files implement the digital products feature in Fufuni:

${src}

Write a "Digital Products Integration Guide" that covers:
1. How to create a digital variant (variant_type, requires_shipping).
2. How to attach a downloadable file (R2 upload flow or external URL).
3. How the download token system works (JWT, TTL, security).
4. The complete customer download flow (purchase → order paid → download link).
5. Frontend integration notes (API call, UI component).
Summarise as prose with code snippets where helpful.
`, topic.manualFacts),
};

export default topic;
