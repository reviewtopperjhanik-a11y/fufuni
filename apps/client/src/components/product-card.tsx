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

import React from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card } from "@heroui/react";
import { Star } from "lucide-react";
import { StoreProduct } from "@/lib/store-api";
import { useTranslation } from "react-i18next";
import { useCart } from "@/hooks/use-cart";
import { formatMoney } from "@/utils/currency";
import { resolveTitle } from "@/utils/description";
import { ProductImage } from "@/components/product-image";
import { WishlistButton } from "@/components/wishlist-button";

interface Props {
  product: StoreProduct;
  selectedSku?: string;
  onSelectVariant?: (productId: string, sku: string) => void;
  /** Optional category handle — forwarded via router state so product.tsx can build breadcrumbs */
  categoryHandle?: string;
}

export const ProductCard: React.FC<Props> = ({
  product,
  selectedSku,
  onSelectVariant,
  categoryHandle,
}) => {
  const { t, i18n } = useTranslation();
  const { addItem } = useCart();
  const navigate = useNavigate();

  const displayTitle = resolveTitle(product.title, i18n.language);

  const variant =
    product.variants.find((v) => v.sku === selectedSku) ||
    product.variants[0];

  const currency = variant?.currency ?? "";
  const price = variant ? formatMoney(variant.price_cents, currency) : formatMoney(0, currency);
  const comparePrice = variant?.compare_at_price_cents
    ? formatMoney(variant.compare_at_price_cents, currency)
    : null;

  const image =
    (variant?.thumbnail_url ?? variant?.image_url) || product.image_url ||
    "https://placehold.co/400x400/1a1a1a/666?text=No+Image";

  return (
    <Card className="overflow-hidden flex flex-col h-full">
      {/* Product image — clickable to navigate to detail page */}
      <div
        className="cursor-pointer"
        role="button"
        tabIndex={0}
        onClick={() => navigate(`/product/${product.id}`, { state: categoryHandle ? { from: categoryHandle } : undefined })}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(`/product/${product.id}`, { state: categoryHandle ? { from: categoryHandle } : undefined }); }}
      >
        <ProductImage
          src={image}
          alt={displayTitle}
          variantCount={product.variants.length}
        />
      </div>

      <Card.Content className="flex flex-col flex-1 gap-2 p-3">
        {/* Title */}
        <button
          type="button"
          className="text-left font-medium text-foreground hover:text-primary line-clamp-2 text-sm"
          onClick={() => navigate(`/product/${product.id}`, { state: categoryHandle ? { from: categoryHandle } : undefined })}
        >
          {displayTitle}
        </button>

        {/* Rating */}
        {(product.review_count ?? 0) > 0 && (
          <div className="flex items-center gap-1">
            <span className="flex gap-0.5" aria-hidden>
              {[1, 2, 3, 4, 5].map((s) => {
                const avg = product.average_rating ?? 0;
                const fill = Math.min(1, Math.max(0, avg - s + 1));
                return (
                  <span key={s} className="relative inline-block">
                    <Star size={12} className="text-default-200" />
                    <span
                      className="absolute inset-0 overflow-hidden"
                      style={{ width: `${fill * 100}%` }}
                    >
                      <Star size={12} className="fill-amber-400 text-amber-400" />
                    </span>
                  </span>
                );
              })}
            </span>
            <span className="text-xs text-default-500">({product.review_count})</span>
          </div>
        )}

        {/* Price */}
        <p className="text-sm font-semibold text-foreground">
          {price}
          {comparePrice && (
            <span className="ml-2 text-xs text-default-400 line-through">{comparePrice}</span>
          )}
        </p>

        {/* Variant chips — show only when multiple variants and callback provided */}
        {product.variants.length > 1 && onSelectVariant && (
          <div className="flex flex-wrap gap-1 mt-1">
            {product.variants.map((v) => {
              const isSelected = (selectedSku || variant.sku) === v.sku;
              return (
                <Button
                  key={v.sku}
                  size="sm"
                  variant={isSelected ? "primary" : "outline"}
                  onPress={() => onSelectVariant(product.id, v.sku)}
                  className="text-xs h-7 px-2 min-w-0"
                >
                  {v.title}
                </Button>
              );
            })}
          </div>
        )}

        {/* Spacer to push actions to bottom */}
        <div className="flex-1" />

        {/* Actions */}
        <div className="flex gap-2 mt-2">
          <Button
            onPress={() => {
              addItem({
                sku: variant.sku,
                title: `${displayTitle}${variant.title ? ` - ${variant.title}` : ""}`,
                price_cents: variant.price_cents,
                currency: variant.currency ?? "USD",
                image_url: variant.image_url || product.image_url,
                qty: 1,
              });
            }}
            variant="primary"
            className="rounded-md flex-1 text-sm"
            size="sm"
          >
            {t("add-to-cart")}
          </Button>
          <WishlistButton productId={product.id} />
        </div>
      </Card.Content>
    </Card>
  );
};
