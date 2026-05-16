/**
 * MIT License
 *
 * Copyright (c) 2025 ygwyg
 * Copyright (c) 2026 Ronan Le Meillat - SCTG Development
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import { Hono } from 'hono';
import Stripe from 'stripe';
import { getDb } from '../db';
import { ApiError, uuid, now, generateOrderNumber, type HonoEnv } from '../types';
import { dispatchWebhooks } from '../lib/webhooks';
import { handleUCPStripeWebhook } from './ucp';
import { sendOrderConfirmationEmail, sendOrderStatusEmail } from '../lib/order-email';
import { creditAiTokens } from './ai-tokens';

// ============================================================
// WEBHOOK ROUTES
// ============================================================

export const webhooks = new Hono<HonoEnv>();

// POST /v1/webhooks/stripe
webhooks.post('/stripe', async (c) => {
  const signature = c.req.header('stripe-signature');
  const body = await c.req.text();

  if (!signature) throw ApiError.invalidRequest('Missing stripe-signature header');

  const db = getDb(c.var.db);

  // For simplicity and to avoid an extra DB query, we read the webhook secret directly from env vars
  let stripeConfig = {
    secret_key: c.env.STRIPE_SECRET_KEY,
    webhook_secret: c.env.STRIPE_WEBHOOK_SECRET,
  };

  if (!stripeConfig.secret_key || !stripeConfig.webhook_secret) {
    // Get stripe keys from config table if not set in env vars (legacy support)
    const [config] = await db.query<any>(`SELECT * FROM config WHERE key = 'stripe'`);
    if (!config?.value) {
      throw ApiError.invalidRequest('Stripe not configured');
    }

    stripeConfig = JSON.parse(config.value);
  }

  if (!stripeConfig.secret_key || !stripeConfig.webhook_secret) {
    throw ApiError.invalidRequest('Stripe not configured. Missing secret key or webhook secret.');
  }
  // Verify signature
  const stripe = new Stripe(stripeConfig.secret_key);
  let event: Stripe.Event;

  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, stripeConfig.webhook_secret);
  } catch (e: any) {
    throw new ApiError('webhook_signature_invalid', 400, e.message);
  }

  // Dedupe
  const [existing] = await db.query<any>(`SELECT id FROM events WHERE stripe_event_id = ?`, [
    event.id,
  ]);
  if (existing) return c.json({ ok: true });

  if (event.type === 'checkout.session.completed') {
    const webhookSession = event.data.object as Stripe.Checkout.Session;
    
    if (webhookSession.metadata?.ucp_checkout_session_id) {
      await handleUCPStripeWebhook(db, webhookSession.id, webhookSession);
    }
    
    const cartId = webhookSession.metadata?.cart_id;

    if (cartId) {
      const [cart] = await db.query<any>(`SELECT * FROM carts WHERE id = ?`, [cartId]);
      if (cart) {
        // Fetch cart items with product titles for proper line item display
        const itemRows = await db.query<any>(
          `SELECT ci.*,
                  p.title AS product_title
           FROM cart_items ci
           LEFT JOIN variants v ON v.sku = ci.sku
           LEFT JOIN products p ON p.id = v.product_id
           WHERE ci.cart_id = ?`,
          [cartId]
        );
        const items = itemRows.map((ci: any) => {
          let productTitle = ci.title;
          if (ci.product_title) {
            try {
              const parsed = JSON.parse(ci.product_title);
              productTitle = parsed['en-US'] ?? parsed[Object.keys(parsed)[0]] ?? ci.title;
            } catch {
              productTitle = ci.product_title;
            }
          }
          const displayName =
            !ci.title || ci.title === 'Standard' || ci.title === productTitle
              ? productTitle
              : `${productTitle} – ${ci.title}`;
          return { ...ci, display_name: displayName };
        });

        // Retrieve full session from Stripe with PaymentIntent expanded.
        // In Stripe Dahlia, when we collect shipping in our own UI and pass it via
        // payment_intent_data.shipping, the authoritative address lives on the PaymentIntent —
        // NOT on customer_details.address (which only captures what Stripe's form collected,
        // i.e. billing address when billing_address_collection is enabled).
        const session = await stripe.checkout.sessions.retrieve(webhookSession.id, {
          expand: ['payment_intent'],
        });
        const paymentIntent = session.payment_intent as Stripe.PaymentIntent | null;
        const paymentIntentId = paymentIntent?.id ?? null;
        const piShipping = paymentIntent?.shipping ?? null;

        // Handle discount
        let discountCode = null;
        let discountId = null;
        let discountAmountCents = 0;
        let discount: any = null;

        if (session.metadata?.discount_id) {
          const [discountRow] = await db.query<any>(`SELECT * FROM discounts WHERE id = ?`, [
            session.metadata.discount_id,
          ]);

          if (discountRow) {
            discount = discountRow;
            discountCode = discount.code;
            discountId = discount.id;
            discountAmountCents = cart.discount_amount_cents || 0;

            // We don't increment again here to avoid double-counting
            // The usage_count was reserved at checkout and is now being committed with the order
          }
        }

        // Calculate subtotal from cart items (before discounts)
        // session.amount_subtotal includes discounts as negative line items, so we calculate from original items
        const subtotalCents = items.reduce(
          (sum, item) => sum + item.unit_price_cents * item.qty,
          0
        );

        // Generate order number (timestamp-based to avoid race conditions)
        const orderNumber = generateOrderNumber();

        // Extract customer / shipping details from session + expanded PaymentIntent.
        const customerEmail = cart.customer_email;
        // For the Stripe/customer record: cardholder name confirmed on Stripe's payment form.
        const customerName = session.customer_details?.name || cart.shipping_name || null;
        // For the shipping address: the name entered in our own checkout form (delivery recipient),
        // falling back to the cardholder name confirmed by Stripe.
        const shippingName = piShipping?.name || cart.shipping_name || session.customer_details?.name || null;
        const shippingPhone = session.customer_details?.phone || null;

        // Address priority:
        //  1. PaymentIntent.shipping — what we explicitly set via payment_intent_data.shipping
        //     at Checkout Session creation (confirmed by Stripe).
        //  2. cart.shipping_* — what the customer entered in our own checkout form (same source
        //     as what we forwarded to Stripe, serves as fallback if PI shipping is absent).
        // NOTE: session.customer_details.address only provides country because we do not use
        // Stripe's billing_address_collection; the shipping address lives on the PaymentIntent.
        const shippingAddress = piShipping?.address?.line1
          ? {
              line1: piShipping.address.line1,
              line2: piShipping.address.line2 ?? null,
              city: piShipping.address.city ?? null,
              state: piShipping.address.state ?? null,
              postal_code: piShipping.address.postal_code ?? null,
              country: piShipping.address.country ?? null,
            }
          : (cart.shipping_line1
            ? {
                line1: cart.shipping_line1,
                line2: cart.shipping_line2 ?? null,
                city: cart.shipping_city ?? null,
                state: cart.shipping_state ?? null,
                postal_code: cart.shipping_postal_code ?? null,
                country: cart.shipping_country ?? session.customer_details?.address?.country ?? null,
              }
            : null);

        // Upsert customer (create or update on email match)
        let customerId: string | null = null;
        const [existingCustomer] = await db.query<any>(
          `SELECT id, order_count, total_spent_cents FROM customers WHERE email = ?`,
          [customerEmail]
        );

        if (existingCustomer) {
          // Update existing customer
          customerId = existingCustomer.id;
          await db.run(
            `UPDATE customers SET 
              name = COALESCE(?, name),
              phone = COALESCE(?, phone),
              order_count = order_count + 1,
              total_spent_cents = total_spent_cents + ?,
              last_order_at = ?,
              updated_at = ?
            WHERE id = ?`,
            [customerName, shippingPhone, session.amount_total ?? 0, now(), now(), customerId]
          );
        } else {
          // Create new customer
          customerId = uuid();
          await db.run(
            `INSERT INTO customers (id, email, name, phone, order_count, total_spent_cents, last_order_at)
             VALUES (?, ?, ?, ?, 1, ?, ?)`,
            [
              customerId,
              customerEmail,
              customerName,
              shippingPhone,
              session.amount_total ?? 0,
              now(),
            ]
          );
        }

        // Attach the verified shipping address to the Stripe Customer so it appears correctly
        // in the Stripe dashboard (non-blocking – a failure here must not abort the webhook).
        if (session.customer && shippingAddress?.line1) {
          c.executionCtx.waitUntil(
            stripe.customers
              .update(session.customer as string, {
                shipping: {
                  name: shippingName ?? '',
                  address: {
                    line1: shippingAddress.line1,
                    ...(shippingAddress.line2 ? { line2: shippingAddress.line2 } : {}),
                    ...(shippingAddress.city ? { city: shippingAddress.city } : {}),
                    ...(shippingAddress.state ? { state: shippingAddress.state } : {}),
                    ...(shippingAddress.postal_code ? { postal_code: shippingAddress.postal_code } : {}),
                    ...(shippingAddress.country ? { country: shippingAddress.country } : {}),
                  },
                },
              })
              .catch((err) => console.warn('Failed to update Stripe customer shipping:', err))
          );
        }

        // Save shipping address to customer if provided
        if (shippingAddress && shippingAddress.line1 && customerId) {
          const [existingAddress] = await db.query<any>(
            `SELECT id FROM customer_addresses WHERE customer_id = ? AND line1 = ? AND postal_code = ?`,
            [customerId, shippingAddress.line1, shippingAddress.postal_code]
          );

          if (!existingAddress) {
            // Check if customer has any addresses
            const [addressCount] = await db.query<any>(
              `SELECT COUNT(*) as count FROM customer_addresses WHERE customer_id = ?`,
              [customerId]
            );
            const isDefault = addressCount.count === 0 ? 1 : 0;

            await db.run(
              `INSERT INTO customer_addresses (id, customer_id, is_default, name, line1, line2, city, state, postal_code, country, phone)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                uuid(),
                customerId,
                isDefault,
                shippingName,
                shippingAddress.line1,
                shippingAddress.line2 || null,
                shippingAddress.city,
                shippingAddress.state,
                shippingAddress.postal_code,
                shippingAddress.country,
                shippingPhone,
              ]
            );
          }
        }

        // Create order (now with customer link, shipping details, and discount)
        const orderId = uuid();
        await db.run(
          `INSERT INTO orders (id, customer_id, number, status, customer_email,
           shipping_name, shipping_phone, ship_to,
           subtotal_cents, tax_cents, shipping_cents, total_cents, currency,
           discount_code, discount_id, discount_amount_cents,
           stripe_checkout_session_id, stripe_payment_intent_id, taxes_json, locale)
           VALUES (?, ?, ?, 'paid', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            orderId,
            customerId,
            orderNumber,
            customerEmail,
            shippingName,
            shippingPhone,
            shippingAddress ? JSON.stringify(shippingAddress) : null,
            subtotalCents,
            session.total_details?.amount_tax ?? 0,
            cart.shipping_cents ?? 0,
            session.amount_total ?? 0,
            cart.currency,
            discountCode,
            discountId,
            discountAmountCents,
            session.id,
            paymentIntentId,
            cart.taxes_json,
            cart.locale ?? 'en-US',
          ]
        );

        // Send order confirmation email with a signed view token (non-blocking).
        // If Mailgun is not configured, the call will be a no-op.
        if (c.env.ORDER_TOKEN_SECRET) {
          c.executionCtx.waitUntil(
            (async () => {
              try {
                await sendOrderConfirmationEmail(c.env, db, {
                  orderId,
                  regenerateToken: false,
                });
              } catch (err) {
                console.warn('Failed to send order confirmation email', err);
              }
            })(),
          );
        }

        // Track discount usage for per-customer limit tracking
        // Note: usage_count was already incremented at checkout time (atomic reservation)
        // We only record the usage here for per-customer tracking and audit purposes
        if (discountId && discountAmountCents > 0) {
          // Check if already recorded (idempotency)
          const [existing] = await db.query<any>(
            `SELECT id FROM discount_usage WHERE order_id = ? AND discount_id = ?`,
            [orderId, discountId]
          );

          if (!existing) {
            // Enforce per-customer limit atomically using conditional INSERT
            // This prevents race conditions from concurrent checkouts
            // Reuse discount object from earlier in the function
            if (discount?.usage_limit_per_customer !== null) {
              // Use atomic conditional INSERT: only insert if current usage count is below limit
              // This prevents concurrent checkouts from bypassing the per-customer limit
              const usageId = uuid();
              const customerEmailLower = cart.customer_email.toLowerCase();

              // For SQLite/D1: Use INSERT with SELECT and WHERE clause to atomically check limit
              const result = await db.run(
                `INSERT INTO discount_usage (id, discount_id, order_id, customer_email, discount_amount_cents)
                 SELECT ?, ?, ?, ?, ?
                 WHERE (
                   SELECT COUNT(*) FROM discount_usage 
                   WHERE discount_id = ? AND customer_email = ?
                 ) < ?`,
                [
                  usageId,
                  discountId,
                  orderId,
                  customerEmailLower,
                  discountAmountCents,
                  discountId,
                  customerEmailLower,
                  discount.usage_limit_per_customer,
                ]
              );

              // If insert failed (changes === 0), the limit was exceeded
              // This can happen with concurrent checkouts - the order is already created and paid,
              // so we log this but don't fail the webhook
              if (result.changes === 0) {
                // Limit exceeded - this shouldn't happen if checkout validation worked correctly,
                // but can occur with concurrent checkouts. Log for monitoring.
                console.warn(
                  `Discount usage limit exceeded for customer ${customerEmailLower} and discount ${discountId}, ` +
                    `but order ${orderId} already created (payment succeeded). This may indicate a race condition.`
                );
              }
            } else {
              // No per-customer limit, safe to insert directly
              await db.run(
                `INSERT INTO discount_usage (id, discount_id, order_id, customer_email, discount_amount_cents)
                 VALUES (?, ?, ?, ?, ?)`,
                [
                  uuid(),
                  discountId,
                  orderId,
                  cart.customer_email.toLowerCase(),
                  discountAmountCents,
                ]
              );
            }
          }
          // If already exists, silently skip
        }

        // Create order items & update inventory
        for (const item of items) {
          await db.run(
            `INSERT INTO order_items (id, order_id, sku, title, qty, unit_price_cents) VALUES (?, ?, ?, ?, ?, ?)`,
            [uuid(), orderId, item.sku, item.display_name ?? item.title, item.qty, item.unit_price_cents]
          );

          await db.run(
            `UPDATE inventory SET reserved = reserved - ?, on_hand = on_hand - ?, updated_at = ? WHERE sku = ?`,
            [item.qty, item.qty, now(), item.sku]
          );

          await db.run(
            `INSERT INTO inventory_logs (id, sku, delta, reason) VALUES (?, ?, ?, 'sale')`,
            [uuid(), item.sku, -item.qty]
          );
        }

        // Credit AI token packages included in this order.
        // Runs non-blocking so a failure here never aborts the webhook.
        if (customerId) {
          c.executionCtx.waitUntil(
            (async () => {
              try {
                const aiTokenItems = await db.query<any>(
                  `SELECT oi.qty, v.ai_token_units
                   FROM order_items oi
                   JOIN variants v ON v.sku = oi.sku
                   WHERE oi.order_id = ? AND v.variant_type = 'ai_tokens'`,
                  [orderId]
                );
                for (const aiItem of aiTokenItems) {
                  if (aiItem.ai_token_units) {
                    await creditAiTokens(db, customerId, orderId, aiItem.ai_token_units * aiItem.qty, c.var.db, c.executionCtx);
                  }
                }
              } catch (err) {
                console.warn('Failed to credit AI tokens for order', orderId, err);
              }
            })()
          );
        }

        // Update cart status to prevent cron from treating it as abandoned checkout
        // This prevents the abandoned checkout cleanup from incorrectly decrementing discount usage_count
        await db.run(`UPDATE carts SET status = 'expired', updated_at = ? WHERE id = ?`, [
          now(),
          cartId,
        ]);

        // Dispatch order.created webhook
        const orderItems = await db.query<any>(`SELECT * FROM order_items WHERE order_id = ?`, [
          orderId,
        ]);
        await dispatchWebhooks(c.var.db, c.executionCtx, 'order.created', {
          order: {
            id: orderId,
            number: orderNumber,
            status: 'paid',
            customer_email: customerEmail,
            customer_id: customerId,
            shipping: {
              name: shippingName,
              phone: shippingPhone,
              address: shippingAddress,
            },
            amounts: {
              subtotal_cents: session.amount_subtotal ?? 0,
              tax_cents: session.total_details?.amount_tax ?? 0,
              shipping_cents: cart.shipping_cents ?? 0,
              total_cents: session.amount_total ?? 0,
              currency: cart.currency,
            },
            items: orderItems.map((i: any) => ({
              sku: i.sku,
              title: i.title,
              qty: i.qty,
              unit_price_cents: i.unit_price_cents,
            })),
            stripe: {
              checkout_session_id: session.id,
              payment_intent_id: session.payment_intent,
            },
          },
        });
      }
    }
  }

  if (event.type === 'payment_intent.payment_failed') {
    const pi = event.data.object as Stripe.PaymentIntent;
    const [failedOrder] = await db.query<any>(
      `SELECT id FROM orders WHERE stripe_payment_intent_id = ?`,
      [pi.id],
    );
    if (failedOrder) {
      c.executionCtx.waitUntil(
        sendOrderStatusEmail(c.env, db, failedOrder.id, 'payment_failed').catch(() => {}),
      );
    }
  }

  // Log event
  await db.run(
    `INSERT INTO events (id, stripe_event_id, type, payload) VALUES (?, ?, ?, ?)`,
    [uuid(), event.id, event.type, JSON.stringify(event.data.object)]
  );

  return c.json({ ok: true });
});
