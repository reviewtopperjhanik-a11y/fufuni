/**
 * Copyright (c) 2024-2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import { useEffect, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Star } from "lucide-react";

import DefaultLayout from "@/layouts/default";
import { useAuth } from "@/authentication";
import { ProductReviews } from "@/components/product-reviews";
import { getApiBase } from "@/lib/api-base";

// Shape of the order returned by GET /v1/orders/:id/status
interface OrderStatus {
  number: string;
  status: string;
  currency: string;
  subtotal_cents: number;
  discount_cents: number;
  tax_cents: number;
  shipping_cents: number;
  total_cents: number;
  created_at: string;
  tracking_number: string | null;
  tracking_url: string | null;
  shipped_at: string | null;
  items: { sku: string; title: string; qty: number; unit_price_cents: number; product_id: string | null }[];
}

function formatPrice(cents: number, currency: string, locale: string = "en-US") {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

function formatDate(dateStr: string, locale: string = "en-US") {
  try {
    return new Date(dateStr).toLocaleDateString(locale, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

// Maps database status values to colors and i18n translation keys
const STATUS_COLORS: Record<string, string> = {
  pending: "text-warning-600 bg-warning-100",
  paid: "text-success-600 bg-success-100",
  processing: "text-primary-600 bg-primary-100",
  shipped: "text-primary-700 bg-primary-100",
  delivered: "text-success-700 bg-success-100",
  refunded: "text-default-600 bg-default-100",
  canceled: "text-danger-600 bg-danger-100",
};

const STATUS_I18N_KEYS: Record<string, string> = {
  pending: "status-pending",
  paid: "status-paid",
  processing: "status-processing",
  shipped: "status-shipped",
  delivered: "status-delivered",
  refunded: "status-refunded",
  canceled: "status-canceled",
};

// Guest review form — uses the signed order token as auth proof.
// Only rendered on the /order/:id page for delivered orders.
function GuestReviewForm({
  productId,
  orderId,
  orderToken,
  onDone,
}: {
  productId: string;
  orderId: string;
  orderToken: string;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const apiBase = getApiBase();
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch(
        `${apiBase}/v1/products/${productId}/reviews/guest`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rating,
            title: title || undefined,
            body: body || undefined,
            author_name: authorName || undefined,
            order_id: orderId,
            order_token: orderToken,
          }),
        }
      );
      if (res.status === 409) {
        setErr(t("reviews-already-submitted"));
        return;
      }
      if (!res.ok) {
        setErr(t("reviews-error"));
        return;
      }
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <p className="text-sm text-success py-2">{t("reviews-submitted")}</p>
    );
  }

  return (
    <div className="space-y-2 pt-3">
      {/* Star selector */}
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((s) => (
          <button key={s} type="button" onClick={() => setRating(s)}>
            <Star
              size={22}
              className={s <= rating ? "fill-amber-400 text-amber-400" : "text-default-300"}
            />
          </button>
        ))}
      </div>
      <input
        className="w-full border border-default-200 rounded px-3 py-1.5 text-sm"
        maxLength={80}
        placeholder={t("reviews-guest-name-placeholder")}
        value={authorName}
        onChange={(e) => setAuthorName(e.target.value)}
      />
      <input
        className="w-full border border-default-200 rounded px-3 py-1.5 text-sm"
        maxLength={120}
        placeholder={t("reviews-title-placeholder")}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        className="w-full border border-default-200 rounded px-3 py-1.5 text-sm"
        maxLength={2000}
        placeholder={t("reviews-body-placeholder")}
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      {err && <p className="text-xs text-danger">{err}</p>}
      <div className="flex gap-2">
        <button
          className="text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground disabled:opacity-50"
          disabled={submitting}
          type="button"
          onClick={handleSubmit}
        >
          {submitting ? "…" : t("reviews-submit")}
        </button>
        <button
          className="text-xs px-3 py-1.5 rounded border border-default-200"
          type="button"
          onClick={onDone}
        >
          {t("cancel")}
        </button>
      </div>
    </div>
  );
}

export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const { t, i18n } = useTranslation();
  const { isAuthenticated } = useAuth() as any;

  const [order, setOrder] = useState<OrderStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [activeReview, setActiveReview] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !token) {
      setErrorKey("tracking-link-invalid-message");
      setLoading(false);
      return;
    }

    // Call the public status endpoint — no Authorization header needed
    const merchantAPI = import.meta.env.API_BASE_URL || "http://localhost:8787";
    fetch(`${merchantAPI}/v1/orders/${id}/status?token=${encodeURIComponent(token)}`)
      .then((res) => {
        if (res.status === 401) {
          setErrorKey("tracking-link-expired-message");
          throw new Error("");
        }
        if (!res.ok) {
          setErrorKey("order-not-found-message");
          throw new Error("");
        }
        return res.json();
      })
      .then((data) => setOrder(data))
      .catch(() => {
        if (!errorKey) setErrorKey("unable-to-load-order");
      })
      .finally(() => setLoading(false));
  }, [id, token]);

  if (loading) {
    return (
      <DefaultLayout>
        <div className="max-w-2xl mx-auto py-12 px-6 text-center">
          <p className="text-default-500">{t("loading")}</p>
        </div>
      </DefaultLayout>
    );
  }

  if (error || errorKey || !order) {
    return (
      <DefaultLayout>
        <div className="max-w-2xl mx-auto py-12 px-6 text-center">
          <div className="mb-6">
            <div className="text-5xl mb-3">⚠️</div>
            <h1 className="text-2xl font-bold mb-2">{t("tracking-link-invalid")}</h1>
            <p className="text-default-500 mb-6">
              {errorKey ? t(errorKey) : (error || t("unable-to-load-order"))}
            </p>
            <p className="text-sm text-default-400">
              {t("tracking-link-valid-30days")}
            </p>
          </div>
          <Link className="inline-block px-6 py-2 rounded-full bg-primary text-primary-foreground hover:bg-primary/80 font-semibold" to="/">
            {t("return-home")}
          </Link>
        </div>
      </DefaultLayout>
    );
  }

  const statusKey = STATUS_I18N_KEYS[order.status] || "status";
  const statusColor =
    STATUS_COLORS[order.status] || "text-default-600 bg-default-100";

  return (
    <DefaultLayout>
      <div className="max-w-2xl mx-auto py-12 px-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold">{t("order-tracking")}</h1>
          <p className="text-default-500 mt-1">
            {t("order-number")}<strong>{order.number}</strong>
            &nbsp;·&nbsp;
            {formatDate(order.created_at, i18n.language)}
          </p>
        </div>

        {/* Status */}
        <div className="rounded-lg border border-default-200 p-4 mb-6 flex items-center justify-between">
          <span className="text-sm font-medium text-default-600">{t("status")}</span>
          <span className={`text-sm font-semibold px-3 py-1 rounded-full ${statusColor}`}>
            {t(statusKey)}
          </span>
        </div>

        {/* Tracking */}
        {order.tracking_number && (
          <div className="rounded-lg bg-primary-50 p-4 mb-6">
            <p className="font-medium mb-1">{t("tracking")}</p>
            <p className="text-sm text-default-500 mb-2">{t("tracking-number")} {order.tracking_number}</p>
            {order.shipped_at && (
              <p className="text-sm text-default-400 mb-2">
                {t("shipped-on")} {formatDate(order.shipped_at, i18n.language)}
              </p>
            )}
            {order.tracking_url && (
              <a
                href={order.tracking_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary underline"
              >
                {t("track-on-carrier")} →
              </a>
            )}
          </div>
        )}

        {/* Items */}
        <div className="border border-default-200 rounded-lg divide-y mb-6">
          {order.items.map((item) => (
            <div key={item.sku} className="flex justify-between items-start p-4 gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{item.title}</p>
                <p className="text-xs text-default-400">{t("qty")}: {item.qty}</p>
                {order.status === "delivered" && item.product_id && (
                  <div className="mt-2">
                    {isAuthenticated ? (
                      <>
                        <button
                          className="text-xs text-primary underline"
                          type="button"
                          onClick={() =>
                            setActiveReview(
                              activeReview === item.product_id ? null : item.product_id
                            )
                          }
                        >
                          {activeReview === item.product_id
                            ? t("reviews-hide")
                            : t("reviews-write")}
                        </button>
                        {activeReview === item.product_id && (
                          <div className="mt-3 border-t border-default-100 pt-3">
                            <ProductReviews productId={item.product_id} />
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <button
                          className="text-xs text-primary underline"
                          type="button"
                          onClick={() =>
                            setActiveReview(
                              activeReview === item.product_id ? null : item.product_id
                            )
                          }
                        >
                          {activeReview === item.product_id
                            ? t("reviews-hide")
                            : t("reviews-write")}
                        </button>
                        {activeReview === item.product_id && id && token && (
                          <GuestReviewForm
                            orderId={id}
                            orderToken={token}
                            productId={item.product_id}
                            onDone={() => setActiveReview(null)}
                          />
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
              <p className="text-sm font-medium shrink-0">
                {formatPrice(item.unit_price_cents * item.qty, order.currency, i18n.language)}
              </p>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="bg-default-50 rounded-lg p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-default-600">{t("subtotal")}</span>
            <span>{formatPrice(order.subtotal_cents, order.currency, i18n.language)}</span>
          </div>
          {order.discount_cents > 0 && (
            <div className="flex justify-between text-success-600">
              <span>{t("discount")}</span>
              <span>−{formatPrice(order.discount_cents, order.currency, i18n.language)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-default-600">{t("tax")}</span>
            <span>{formatPrice(order.tax_cents, order.currency, i18n.language)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-default-600">{t("shipping")}</span>
            <span>{formatPrice(order.shipping_cents, order.currency, i18n.language)}</span>
          </div>
          <div className="flex justify-between font-bold text-base pt-2 border-t border-default-200">
            <span>{t("total")}</span>
            <span>{formatPrice(order.total_cents, order.currency, i18n.language)}</span>
          </div>
        </div>

        {/* Action */}
        <div className="mt-8 text-center">
          <Link className="inline-block px-6 py-2 rounded-full border-2 border-current hover:bg-default-100 font-semibold" to="/">
            {t("continue-shopping")}
          </Link>
        </div>
      </div>
    </DefaultLayout>
  );
}
