/**
 * Copyright (c) 2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 */

import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Spinner } from "@heroui/react";
import { useQuery } from "@tanstack/react-query";

import LuxuryLayout from "@/layouts/luxury";
import { HeroBanner } from "@/components/ui/hero-banner";
import { ProductCarousel } from "@/components/ui/product-carousel";
import { CategoryBentoGrid } from "@/components/ui/bento-grid";
import { useCategories } from "@/hooks/use-categories";
import { getProductsPage } from "@/lib/store-api";
import FreeFly from "@/assets/freeflying.png";

/** Placehold hero image — replace with a real asset or R2 URL */
const HERO_IMAGE =
  FreeFly;

export default function IndexLuxuryPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  /* ── Categories for the bento grid ──────────────────────────── */
  const { data: categories, isLoading: categoriesLoading } = useCategories();

  /* ── First page of products for the carousel ────────────────── */
  const { data: productsPage, isLoading: productsLoading } = useQuery({
    queryKey: ["products", "luxury-carousel"],
    queryFn: () => getProductsPage(null),
  });

  const products = productsPage?.items ?? [];

  return (
    <LuxuryLayout>
      {/* ── Hero ──────────────────────────────────────────────────── */}
      <HeroBanner
        ctaText={t("discover-collection", "Découvrir la collection")}
        imageUrl={HERO_IMAGE}
        subtitle={t(
          "hero-subtitle",
          "Une sélection intemporelle, pensée pour ceux qui exigent l'excellence.",
        )}
        title={t("hero-title", "L'Équipement Réinventé")}
        overlayOpacity={0.35}
        onCtaClick={() => navigate("/products")}
      />

      {/* ── Category bento grid ───────────────────────────────────── */}
      {categoriesLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : (
        categories &&
        categories.length >= 2 && (
          <CategoryBentoGrid categories={categories} />
        )
      )}

      {/* ── Product carousel ──────────────────────────────────────── */}
      {productsLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : (
        products.length > 0 && (
          <ProductCarousel
            products={products}
            title={t("featured-products", "Sélection du Moment")}
          />
        )
      )}
    </LuxuryLayout>
  );
}
