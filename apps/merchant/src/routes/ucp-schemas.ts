/**
 * MIT License
 *
 * Copyright (c) 2026 Ronan Le Meillat - SCTG Development
 *
 * Zod schemas for the Universal Commerce Protocol (UCP) routes.
 * Used by @hono/zod-openapi to generate the OpenAPI spec automatically.
 */

import { z } from '@hono/zod-openapi';

// ============================================================
// SHARED PRIMITIVES
// ============================================================

export const UCPAmountSchema = z.object({
  amount: z.number().int().openapi({ example: 2999 }),
  currency: z.string().openapi({ example: 'EUR' }),
});

export const UCPEnvelopeSchema = z.object({
  version: z.string().openapi({ example: '2026-01-11' }),
  capabilities: z.array(z.object({
    name: z.string().openapi({ example: 'dev.ucp.shopping.checkout' }),
    version: z.string().openapi({ example: '2026-01-11' }),
  })),
}).openapi('UCPEnvelope');

// ============================================================
// RESPONSE SCHEMAS
// ============================================================

export const UCPLineItemSchema = z.object({
  id: z.string().uuid(),
  item: z.object({
    id: z.string().openapi({ example: 'SKU-001' }),
    title: z.string().optional(),
    description: z.string().optional(),
    image_url: z.string().optional(),
  }),
  quantity: z.number().int().min(1).openapi({ example: 2 }),
  unit_price: UCPAmountSchema,
  total_price: UCPAmountSchema,
}).openapi('UCPLineItem');

export const UCPBuyerSchema = z.object({
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  full_name: z.string().optional(),
  email: z.string().email().optional().openapi({ example: 'buyer@example.com' }),
  phone_number: z.string().optional(),
}).openapi('UCPBuyer');

export const UCPTotalSchema = z.object({
  type: z.enum(['subtotal', 'tax', 'shipping', 'discount', 'grand_total']),
  amount: z.number().int().openapi({ example: 2999 }),
  currency: z.string().openapi({ example: 'EUR' }),
  label: z.string().optional().openapi({ example: 'TVA 20%' }),
}).openapi('UCPTotal');

export const UCPMessageSchema = z.object({
  type: z.enum(['error', 'warning', 'info']),
  code: z.string().openapi({ example: 'no_payment_handler' }),
  content: z.string(),
  severity: z.enum(['recoverable', 'requires_buyer_input', 'requires_buyer_review']).optional(),
}).openapi('UCPMessage');

export const UCPLinkSchema = z.object({
  rel: z.string().openapi({ example: 'privacy_policy' }),
  href: z.string().openapi({ example: 'https://example.com/privacy' }),
  title: z.string().optional(),
}).openapi('UCPLink');

export const UCPPaymentHandlerSchema = z.object({
  id: z.string().openapi({ example: 'stripe_checkout' }),
  name: z.string().openapi({ example: 'com.stripe.checkout' }),
  version: z.string(),
  spec: z.string().openapi({ example: 'https://stripe.com/docs/payments/checkout' }),
  config_schema: z.string().optional(),
  instrument_schemas: z.array(z.string()),
  config: z.record(z.string(), z.unknown()).optional(),
}).openapi('UCPPaymentHandler');

export const UCPPaymentResponseSchema = z.object({
  handlers: z.array(UCPPaymentHandlerSchema),
  instruments: z.array(z.unknown()).optional(),
}).openapi('UCPPaymentResponse');

export const UCPOrderConfirmationSchema = z.object({
  id: z.string().uuid(),
  number: z.string().openapi({ example: 'ORD-00001' }),
  permalink_url: z.string().optional(),
}).openapi('UCPOrderConfirmation');

export const UCPCheckoutStatusSchema = z.enum([
  'incomplete', 'requires_escalation', 'ready_for_complete',
  'complete_in_progress', 'completed', 'canceled',
]);

export const UCPCheckoutSessionSchema = z.object({
  ucp: UCPEnvelopeSchema,
  id: z.string().uuid(),
  status: UCPCheckoutStatusSchema,
  currency: z.string().openapi({ example: 'EUR' }),
  line_items: z.array(UCPLineItemSchema),
  buyer: UCPBuyerSchema.optional(),
  totals: z.array(UCPTotalSchema),
  messages: z.array(UCPMessageSchema),
  links: z.array(UCPLinkSchema),
  payment: UCPPaymentResponseSchema,
  continue_url: z.string().optional(),
  expires_at: z.string().optional(),
  order: UCPOrderConfirmationSchema.optional(),
}).openapi('UCPCheckoutSession');

export const UCPShippingOptionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().openapi({ example: 'Standard Shipping' }),
  price_cents: z.number().int().openapi({ example: 599 }),
  currency: z.string().openapi({ example: 'EUR' }),
  estimated_days: z.number().int().nullable(),
}).openapi('UCPShippingOption');

// ============================================================
// REQUEST BODY SCHEMAS
// ============================================================

export const UCPLineItemRequestSchema = z.object({
  item: z.object({
    id: z.string().openapi({ example: 'SKU-001' }),
  }),
  quantity: z.number().int().min(1).openapi({ example: 1 }),
});

export const CreateCheckoutBodySchema = z.object({
  line_items: z.array(UCPLineItemRequestSchema).min(1),
  buyer: UCPBuyerSchema.optional(),
  currency: z.string().min(3).max(3).openapi({ example: 'EUR' }),
  payment: z.record(z.string(), z.unknown()).optional(),
});

export const UpdateCheckoutBodySchema = z.object({
  line_items: z.array(UCPLineItemRequestSchema).min(1),
  buyer: UCPBuyerSchema.optional(),
  currency: z.string().optional().openapi({ example: 'EUR' }),
  payment: z.record(z.string(), z.unknown()).optional(),
});

export const PatchCheckoutBodySchema = z.object({
  buyer: UCPBuyerSchema.optional(),
  line_items: z.array(z.object({
    id: z.string().uuid(),
    quantity: z.number().int().min(1),
  })).optional(),
});

export const CompleteCheckoutBodySchema = z.object({
  payment_data: z.object({
    handler_id: z.string().openapi({ example: 'stripe_checkout' }),
    success_url: z.string().optional(),
    cancel_url: z.string().optional(),
  }).optional(),
  risk_signals: z.record(z.string(), z.unknown()).optional(),
});

export const EstimateShippingBodySchema = z.object({
  country_code: z.string().min(2).max(2).openapi({ example: 'FR' }),
});

// ============================================================
// PATH / QUERY PARAMETER SCHEMAS
// ============================================================

export const SessionIdParamSchema = z.object({
  id: z.string().uuid().openapi({ param: { name: 'id', in: 'path' } }),
});

export const ProductsQuerySchema = z.object({
  limit: z.string().optional().openapi({ param: { name: 'limit', in: 'query' }, example: '20' }),
  offset: z.string().optional().openapi({ param: { name: 'offset', in: 'query' }, example: '0' }),
  category: z.string().optional().openapi({ param: { name: 'category', in: 'query' }, example: 'shirts' }),
  q: z.string().optional().openapi({ param: { name: 'q', in: 'query' }, example: 'blue shirt' }),
});

export const ProductIdParamSchema = z.object({
  id: z.string().openapi({ param: { name: 'id', in: 'path' }, example: 'prod_001' }),
});
