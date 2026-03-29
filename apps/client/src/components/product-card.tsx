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
import { Button } from "@heroui/react";
import { StoreProduct } from "@/lib/store-api";
import { useTranslation } from "react-i18next";
import { useCart } from "@/hooks/use-cart";
import { formatMoney } from "@/utils/currency";
import { resolveTitle } from "@/utils/description";
import { ProductImage } from "@/components/product-image";

interface Props {
  product: StoreProduct;
  selectedSku?: string;
  onSelectVariant?: (productId: string, sku: string) => void;
}

export const ProductCard: React.FC<Props> = ({
  product,
  selectedSku,
  onSelectVariant,
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

  const image =
    (variant?.thumbnail_url ?? variant?.image_url) || product.image_url ||
    "https://placehold.co/400x400/1a1a1a/666?text=No+Image";

  return (
    <div className="group">
      <ProductImage
        src={image}
        alt={displayTitle}
        variantCount={product.variants.length}
        onClick={() => navigate(`/product/${product.id}`)}
      />
      <h3 className="font-medium text-default-900 mb-1">{displayTitle}</h3>
      <p className="text-default-500 text-sm mb-3">{price}</p>
      {product.variants.length > 1 && onSelectVariant && (
        <select
          value={selectedSku || variant.sku}
          onChange={(e) => onSelectVariant(product.id, e.target.value)}
          className="w-full bg-default-100 border border-default-300 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none"
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
      )}
      <Button
        onPress={() => {
          const sku = selectedSku || variant.sku;
          addItem({
            sku,
            title: `${displayTitle}${variant.title ? ` - ${variant.title}` : ""}`,
            price_cents: variant.price_cents,
            currency: variant.currency ?? "USD",
            image_url: variant.image_url || product.image_url,
            qty: 1,
          });
        }}
        variant="primary"
        className="rounded-md w-full"
      >
        {t("add-to-cart")}
      </Button>
    </div>
  );
};
