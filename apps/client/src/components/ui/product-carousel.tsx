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

import { useRef } from "react";
import { Link } from "react-router-dom";

import type { StoreProduct } from "@/lib/store-api";
import { formatMoney } from "@/utils/currency";
import { resolveTitle } from "@/utils/description";
import { useTranslation } from "react-i18next";

interface ProductCarouselProps {
  title: string;
  products: StoreProduct[];
}

function CarouselProductCard({ product }: { product: StoreProduct }) {
  const { i18n } = useTranslation();
  const variant = product.variants[0];
  const image =
    (variant?.thumbnail_url ?? variant?.image_url) ||
    product.image_url ||
    "https://placehold.co/400x600/1a1a1a/666?text=No+Image";
  const price = variant
    ? formatMoney(variant.price_cents, variant.currency)
    : "";
  const title = resolveTitle(product.title, i18n.language);

  return (
    <Link
      to={`/product/${product.id}`}
      className="group flex flex-col cursor-pointer"
    >
      <div className="relative overflow-hidden bg-brand-100 aspect-3/4">
        <img
          alt={title}
          className="object-cover w-full h-full transition-transform duration-700 group-hover:scale-105"
          loading="lazy"
          src={image}
        />
        <div className="absolute bottom-0 left-0 w-full translate-y-full group-hover:translate-y-0 transition-transform duration-300">
          <span className="block w-full bg-black/80 backdrop-blur-sm text-white py-3 text-xs uppercase tracking-widest text-center">
            Voir le produit
          </span>
        </div>
      </div>
      <div className="flex flex-col pt-4">
        <h3 className="font-sans text-sm tracking-wide text-brand-900 line-clamp-2">
          {title}
        </h3>
        <p className="font-sans font-semibold text-sm mt-1">{price}</p>
      </div>
    </Link>
  );
}

export function ProductCarousel({ title, products }: ProductCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  if (!products || products.length === 0) return null;

  return (
    <section className="py-16 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex justify-between items-end mb-8 border-b border-gray-200 pb-4">
        <h2 className="font-serif text-3xl text-brand-900">{title}</h2>
        <Link
          className="text-sm font-sans uppercase tracking-wider text-brand-500 hover:text-brand-900 transition-colors"
          to="/products"
        >
          Voir tout
        </Link>
      </div>
      <div
        ref={scrollRef}
        className="flex gap-6 overflow-x-auto snap-x snap-mandatory hide-scrollbar pb-8"
      >
        {products.map((product) => (
          <div
            key={product.id}
            className="min-w-70 md:min-w-80 snap-start"
          >
            <CarouselProductCard product={product} />
          </div>
        ))}
      </div>
    </section>
  );
}
