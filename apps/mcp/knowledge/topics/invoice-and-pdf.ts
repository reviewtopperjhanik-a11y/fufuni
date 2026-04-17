/**
 * Copyright (c) 2026 Ronan LE MEILLAT - SCTG Development
 * License: AGPL-3.0-or-later
 */
import type { Topic } from '../base.js';
import { BASE_SYSTEM, appendFacts } from '../base.js';

const topic: Topic = {
  name: 'invoice-and-pdf',
  description: 'Client-side PDF invoice generation with jsPDF, order-view tokens',
  sources: [
    'apps/client/src/lib/invoice-generator.ts',
    'apps/client/src/utils/invoice-pdf.ts',
    'apps/client/src/utils/currency.ts',
  ],
  systemPrompt: BASE_SYSTEM,
  manualFacts: [
    'Invoice PDFs are generated entirely client-side using jsPDF + jsPDF-AutoTable. No server-side PDF generation.',
    'generateInvoice(order, storeInfo, t) returns a jsPDF document instance. Call .save(filename) to trigger browser download or .output("datauristring") to open in a new tab.',
    'Invoice content: store header (logo, name, address), customer info, itemized table with quantity × unit price, tax per line, subtotal, tax total, grand total, payment method.',
    'Monetary values are formatted by formatCurrency(amount, currency, locale) in utils/currency.ts. amount is always in smallest unit (cents). formatCurrency divides by 100 before formatting.',
    'The invoice is accessible via a signed order-view token URL (/order-view/:token). The token is short-lived (1 h) and generated server-side by GET /v1/orders/:id/invoice.',
    'Order-view page (/order-view) is a public page (no login required). It reads the token from the URL, fetches order data from GET /v1/orders/view/:token, and renders the invoice with a download button.',
    'i18n: generateInvoice accepts the t() function from react-i18next so all labels are translated. All invoice translation keys have the prefix "invoice-".',
    'Store logo: stored as a base64 data URI in the store_settings table. If absent, the PDF shows the store name in text only.',
  ],
  buildPrompt: (src) => appendFacts(`
Below are invoice-generator.ts, invoice-pdf.ts, and currency.ts.

${src}

Task: Write an "Invoice & PDF Generation Reference".
Include:
1. PDF generation: library, generateInvoice() signature, how to save/open.
2. Invoice content: what sections are included and in what order.
3. Currency formatting: formatCurrency() signature, cents-to-display conversion.
4. Order-view token: server endpoint to get the token, token TTL.
5. Public order-view page: route, how it fetches data, download button.
6. Adding a new invoice field: which files to modify.
7. i18n in the PDF: how t() is passed in, key prefix convention.
8. Store logo: how it is stored, what happens when it is missing.
`, topic.manualFacts),
};

export default topic;
