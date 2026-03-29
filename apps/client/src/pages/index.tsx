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

import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { Spinner } from "@heroui/react";

import DefaultLayout from "@/layouts/default";

import { useState, useCallback, useEffect, useRef } from "react";

import { StoreProduct, searchProducts, getProductsPage, getCategoryProductsPage } from "@/lib/store-api";
import { ProductCard } from "@/components/product-card";
import { CategoryNav } from "@/components/category-nav";
import { useCategories } from "@/hooks/use-categories";
import { resolveTitle } from "@/utils/description";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";


export default function IndexPage() {
  const { t, i18n } = useTranslation();

  // Parse URL params — q for search, category for category filter
  const [searchParams] = useSearchParams();
  const term = searchParams.get("q") || "";
  const categoryHandle = searchParams.get("category") || "";

  const sentinelRef = useRef<HTMLDivElement>(null);

  // Resolve localised category name for the page heading
  const { data: categories } = useCategories();
  const categoryName = categoryHandle
    ? resolveTitle(
        categories?.find((c) => c.handle === categoryHandle)?.name ?? categoryHandle,
        i18n.language,
      )
    : "";

  // Search mode — active when ?q= is present
  const {
    data: searchData,
    isLoading: searchLoading,
    isError: searchError,
  } = useQuery<StoreProduct[], Error>({
    queryKey: ['search', term],
    queryFn: () => searchProducts(term),
    enabled: !!term,
  });

  // Category mode — active when ?category= is present (and no search term)
  const {
    data: categoryData,
    hasNextPage: categoryHasNextPage,
    fetchNextPage: categoryFetchNextPage,
    isFetchingNextPage: categoryIsFetchingNextPage,
    isLoading: categoryLoading,
    isError: categoryError,
  } = useInfiniteQuery({
    queryKey: ['category-products', categoryHandle],
    queryFn: ({ pageParam }) => getCategoryProductsPage(categoryHandle, pageParam as string | null),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.has_more ? lastPage.pagination.next_cursor : undefined,
    enabled: !!categoryHandle && !term,
  });

  // Browse mode — active when no search term and no category
  const {
    data: browseData,
    hasNextPage: browseHasNextPage,
    fetchNextPage: browseFetchNextPage,
    isFetchingNextPage: browseIsFetchingNextPage,
    isLoading: browseLoading,
    isError: browseError,
  } = useInfiniteQuery({
    queryKey: ['products'],
    queryFn: ({ pageParam }) => getProductsPage(pageParam as string | null),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.has_more ? lastPage.pagination.next_cursor : undefined,
    enabled: !term && !categoryHandle,
  });

  const safeProducts: StoreProduct[] = term
    ? (searchData ?? [])
    : categoryHandle
      ? (categoryData?.pages.flatMap((p) => p.items) ?? [])
      : (browseData?.pages.flatMap((p) => p.items) ?? []);

  const productsLoading = term ? searchLoading : categoryHandle ? categoryLoading : browseLoading;
  const productsError = term ? searchError : categoryHandle ? categoryError : browseError;
  const hasNextPage = categoryHandle ? categoryHasNextPage : browseHasNextPage;
  const fetchNextPage = categoryHandle ? categoryFetchNextPage : browseFetchNextPage;
  const isFetchingNextPage = categoryHandle ? categoryIsFetchingNextPage : browseIsFetchingNextPage;

  const [selectedVariants, setSelectedVariants] =
    useState<Record<string, string>>({});

  const handleVariantChange = (productId: string, sku: string) => {
    setSelectedVariants((prev) => ({ ...prev, [productId]: sku }));
  };

  const handleIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
        void fetchNextPage();
      }
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage],
  );

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || term) return;
    const observer = new IntersectionObserver(handleIntersect, {
      rootMargin: '200px',
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [handleIntersect, term]);

  return (
    <DefaultLayout>
      <div className="max-w-7xl mx-auto px-4 py-6 flex gap-6">
        {/* Sidebar — categories navigation (hidden on mobile) */}
        <aside className="hidden md:block w-56 shrink-0">
          <CategoryNav showImages={false} />
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0">
          {/* Page heading */}
          <h1 className="text-2xl font-semibold mb-6">
            {term
              ? t("search-results-for", { term })
              : categoryHandle
                ? categoryName
                : t("shop-products-title")}
          </h1>

          {/* State: loading */}
          {productsLoading && (
            <div className="flex justify-center items-center py-20">
              <Spinner size="lg" />
            </div>
          )}

          {/* State: error */}
          {productsError && !productsLoading && (
            <p className="text-center text-danger">{t("products-error")}</p>
          )}

          {/* State: empty */}
          {!productsLoading && !productsError && safeProducts.length === 0 && (
            <p className="text-center text-default-500">{t("admin-products-empty")}</p>
          )}

          {/* Product grid */}
          {safeProducts.length > 0 && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {safeProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    selectedSku={selectedVariants[product.id]}
                    onSelectVariant={handleVariantChange}
                    categoryHandle={categoryHandle || undefined}
                  />
                ))}
              </div>

              {/* Infinite scroll sentinel */}
              {!term && (
                <div ref={sentinelRef} className="mt-8 flex justify-center">
                  {isFetchingNextPage && (
                    <Spinner size="sm" />
                  )}
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </DefaultLayout>
  );
}
