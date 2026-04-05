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

import React, { useRef, useState } from "react";
import { StoreProduct } from "@/lib/store-api";
import { useTranslation } from "react-i18next";
import { useCart } from "@/hooks/use-cart";
import { useCartDrawer } from "@/contexts/cart-drawer-context";
import { formatMoney } from "@/utils/currency";
import { resolveDescription, resolveTitle, resolveVendor, resolveTags, resolveHandle, getTaxNameForLocale } from "@/utils/description";
import { Button } from "@heroui/react";
import { Star } from "lucide-react";
import { WishlistButton } from "./wishlist-button";
import { ProductImage } from "./product-image";
import { ProductReviews } from "./product-reviews";

interface Props {
  product: StoreProduct;
}

/**
 * Full product card component with rich HTML description.
 * Displays product details, variants, and localized description content.
 * Manages variant selection through local state.
 */
export const ProductCardFull: React.FC<Props> = ({ product }) => {
  const { t, i18n } = useTranslation();
  const { addItem } = useCart();
  const { open: openCartDrawer } = useCartDrawer();
  const reviewsRef = useRef<HTMLDivElement>(null);

  // Local state for managing variant selection
  const [selectedSku, setSelectedSku] = useState<string>(
    product.variants[0]?.sku || ""
  );

  const variant =
    product.variants.find((v) => v.sku === selectedSku) ||
    product.variants[0];

  const currency = variant?.currency ?? "";
  const price = variant ? formatMoney(variant.price_cents, currency) : formatMoney(0, currency);
  const comparePrice = variant?.compare_at_price_cents
    ? formatMoney(variant.compare_at_price_cents, currency)
    : null;

  const vendor = resolveVendor(product.vendor ?? "", i18n.language);
  const tagsRaw = Array.isArray(product.tags) ? product.tags.join(",") : product.tags ?? "";
  const tags = resolveTags(tagsRaw, i18n.language)
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const handle = resolveHandle(product.handle ?? "", i18n.language);

  const image =
    variant?.image_url || product.image_url ||
    "https://placehold.co/400x400/1a1a1a/666?text=No+Image";

  // Resolve description for current locale
  const descriptionHtml = resolveDescription(
    product.description ?? '',
    i18n.language
  );

  // Resolve title for current locale
  const displayTitle = resolveTitle(product.title, i18n.language);

  const taxRate = variant?.tax_rate_percentage ?? 0;
  const taxInclusive = !!variant?.tax_inclusive;
  const taxDisplayName = variant?.tax_display_name
    ? getTaxNameForLocale(variant.tax_display_name, i18n.language)
    : "";

  // User request: when tax_inclusive true, treat base price as composable with tax (59.99 * 20% = 12.00)
  // (Previous behavior computed reverse-inclusive portion as 10.00 for 59.99@20%)
  const taxAmountCents =
    variant && taxRate > 0
      ? Math.round(variant.price_cents * (taxRate / 100))
      : null;

  const taxAmount =
    taxAmountCents !== null && taxAmountCents !== undefined
      ? formatMoney(taxAmountCents, currency)
      : null;

  const resolvedTaxName = taxDisplayName || t("product-card-tax-default");
  const taxLabel = taxInclusive
    ? t("product-card-tax-included", { name: resolvedTaxName })
    : t("product-card-tax", { name: resolvedTaxName });

  /**
   * Handle variant selection and update state
   */
  const handleVariantChange = (sku: string) => {
    setSelectedSku(sku);
  };

  return (
    <div className="group">
      <ProductImage
        src={image}
        alt={displayTitle}
        variantCount={product.variants.length}
      />

      <h3 className="font-medium text-default-900 mb-2">{displayTitle}</h3>

      {/* Rating summary — Amazon/Fnac style: stars + score + count, links to reviews */}
      {(product.review_count ?? 0) > 0 && (
        <button
          type="button"
          className="flex items-center gap-1.5 mb-3 group/rating hover:underline focus:outline-none"
          onClick={() => reviewsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        >
          {/* Filled-star bar */}
          <span className="flex gap-0.5" aria-hidden>
            {[1, 2, 3, 4, 5].map((s) => {
              const avg = product.average_rating ?? 0;
              const fill = Math.min(1, Math.max(0, avg - s + 1));
              // full / partial / empty
              return (
                <span key={s} className="relative inline-block">
                  <Star size={15} className="text-default-200" />
                  <span
                    className="absolute inset-0 overflow-hidden"
                    style={{ width: `${fill * 100}%` }}
                  >
                    <Star size={15} className="fill-amber-400 text-amber-400" />
                  </span>
                </span>
              );
            })}
          </span>
          <span className="text-sm font-semibold text-amber-500">
            {(product.average_rating ?? 0).toFixed(1)}
          </span>
          <span className="text-sm text-default-500 group-hover/rating:text-primary">
            ({product.review_count} {t('reviews-count', { count: product.review_count })})
          </span>
        </button>
      )}

      {vendor && (
        <p className="text-xs text-default-500 mb-1">
          {t("vendor")}: {vendor}
        </p>
      )}

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center rounded-full bg-default-200 px-2 py-1 text-[11px] font-semibold text-default-700"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {handle && (
        <p className="text-xs text-default-400 mb-2">
          {t("handle")}: {handle}
        </p>
      )}

      {/* Rich description section */}
      {descriptionHtml && (
        <div
          className="prose prose-sm max-w-none mb-4 text-default-700"
          dangerouslySetInnerHTML={{ __html: descriptionHtml }}
        />
      )}

      <p className="text-default-500 text-sm mb-2 font-semibold">
        {price}
        {comparePrice && (
          <span className="ml-2 text-default-400 line-through">{comparePrice}</span>
        )}
      </p>

      {/* Variants selection */}
      {product.variants.length > 1 && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-default-700 mb-2">
            {t("admin-products-field-variant-title")}
          </label>
          <div className="flex flex-wrap gap-2 mb-3">
            {product.variants.map((v) => {
              const isSelected = selectedSku === v.sku;
              return (
                <Button
                  key={v.sku}
                  size="sm"
                  variant={isSelected ? "primary" : "outline"}
                  onPress={() => handleVariantChange(v.sku)}
                  className="text-xs"
                >
                  {v.title}
                </Button>
              );
            })}
          </div>
          {/* Alternative: Dropdown selector (hidden on small screens in favor of buttons) */}
          <select
            value={selectedSku}
            onChange={(e) => handleVariantChange(e.target.value)}
            className="hidden md:block w-full bg-default-100 border border-default-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
          >
            {product.variants.map((v) => {
              const variantCurrency = v.currency ?? "";
              return (
                <option key={v.sku} value={v.sku}>
                  {v.title} - {formatMoney(v.price_cents || 0, variantCurrency)}
                </option>
              );
            })}
          </select>
        </div>
      )}

      {/* Variant details (optional enrichment fields) */}
      {(variant?.barcode || variant?.tax_code || taxAmount || variant?.requires_shipping !== undefined) && (
        <div className="mb-4 text-xs text-default-600">
          {variant?.barcode && (
            <p>
              <span className="font-semibold">{t("barcode")}:</span> {variant.barcode}
            </p>
          )}
          {taxAmount ? (
            <p>
              <span className="font-semibold">{taxLabel}:</span> {taxAmount}
            </p>
          ) : (
            variant?.tax_code && (
              <p>
                <span className="font-semibold">{t("tax-code")}:</span> {variant.tax_code}
              </p>
            )
          )}
          {variant?.requires_shipping !== undefined && (
            <p>
              <span className="font-semibold">{t("requires-shipping")}:</span>{' '}
              {variant.requires_shipping ? t("yes") : t("no")}
            </p>
          )}
        </div>
      )}

      {/* Add to cart button */}
      <Button
        onPress={() => {
          addItem({
            sku: selectedSku,
            title: `${product.title}${variant.title ? ` - ${variant.title}` : ""}`,
            price_cents: variant.price_cents,
            currency: variant.currency ?? "USD",
            image_url: variant.thumbnail_url ?? variant.image_url ?? product.image_url,
            qty: 1,
          });
          openCartDrawer();
        }}
        variant="primary"
        className="rounded-md w-full"
      >
        {t("add-to-cart")}
      </Button>
      <WishlistButton productId={product.id} />

      {/* Reviews section — anchored so the rating summary can scroll here */}
      <div ref={reviewsRef} className="mt-8 pt-6 border-t border-default-200">
        <ProductReviews productId={product.id} />
      </div>
    </div>
  );
};
