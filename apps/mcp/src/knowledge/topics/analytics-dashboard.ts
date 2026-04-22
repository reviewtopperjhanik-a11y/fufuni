/**
 * Copyright (c) 2026 Ronan LE MEILLAT - SCTG Development
 * License: AGPL-3.0-or-later
 */
import type { Topic } from '../base.js';
import { BASE_SYSTEM, appendFacts } from '../base.js';

const topic: Topic = {
  name: 'analytics-dashboard',
  description: 'Merchant analytics surface — revenue, orders and traffic endpoints plus the chart wrappers rendered on the admin analytics page.',
  tags: ["metrics","observability"],
  sources: [
    'apps/merchant/src/routes/analytics.ts',
    'apps/client/src/pages/admin/analytics.tsx',
  ],
  systemPrompt: BASE_SYSTEM,
  maxSourceChars: 4000,
  manualFacts: [
    'Analytics routes are under /v1/analytics (admin only). All endpoints accept: ?from=ISO&to=ISO date range and ?currency=EUR.',
    'GET /v1/analytics/revenue — returns { total, byDay: [{date, amount}], byProduct: [{productId, name, amount}] }.',
    'GET /v1/analytics/orders — returns { total, byStatus: { pending, paid, processing, shipped, delivered, cancelled, refunded }, avgOrderValue }.',
    'GET /v1/analytics/customers — returns { total, newInPeriod, returningRate }.',
    'GET /v1/analytics/products/top — returns top 10 products by revenue in the date range.',
    'GET /v1/analytics/funnel — returns checkout funnel: { cartCreated, checkoutStarted, checkoutCompleted, conversionRate }.',
    'All monetary values in analytics responses are in the smallest unit (cents) for the requested currency.',
    'The analytics page uses Recharts for all charts. It does NOT use a third-party analytics service — all data comes from the local DB.',
    'Analytics are computed on-demand (no pre-aggregation). For large stores, consider adding DB indexes on orders.created_at and order_items.product_id.',
  ],
  buildPrompt: (src) => appendFacts(`
Below are analytics.ts and the admin analytics page.

${src}

Task: Write an "Analytics Dashboard Reference".
Include:
1. All analytics endpoints: method, path, query params, response shape.
2. Date range handling: how from/to params work, default range.
3. Currency handling: conversion, default currency.
4. Revenue chart: what data it uses, how byDay is structured.
5. Orders by status chart: statuses tracked, avgOrderValue.
6. Customer metrics: what returningRate means.
7. Top products: how ranking is computed.
8. Checkout funnel: what each step means.
9. Performance note: on-demand computation, index recommendations.
`, topic.manualFacts),
};

export default topic;
