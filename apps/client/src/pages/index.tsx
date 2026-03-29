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

import { Trans, useTranslation } from "react-i18next";
import { Link as RouterLink, useSearchParams } from "react-router-dom";

import { useAuth } from "@/authentication";
import { LoginButton, LogoutButton } from "@/authentication";
import { siteConfig } from "@/config/site";
import { title, subtitle } from "@/shared/ui/primitives";
import { GithubIcon } from "@/shared/ui/icons";
import DefaultLayout from "@/layouts/default";

import { useState, useCallback, useEffect, useRef } from "react";

import { StoreProduct, searchProducts, getProductsPage } from "@/lib/store-api";
import { ProductCard } from "@/components/product-card";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";


export default function IndexPage() {
  const { t } = useTranslation();
  const { isAuthenticated, user } = useAuth();

  // check for search query in URL
  const [searchParams] = useSearchParams();
  const term = searchParams.get("q") || "";

  const sentinelRef = useRef<HTMLDivElement>(null);

  // Search mode: single query when user types in the search box
  const {
    data: searchData,
    isLoading: searchLoading,
    isError: searchError,
  } = useQuery<StoreProduct[], Error>({
    queryKey: ['search', term],
    queryFn: () => searchProducts(term),
    enabled: !!term,
  });

  // Browse mode: infinite-scroll query when no search term
  const {
    data: browseData,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isLoading: browseLoading,
    isError: browseError,
  } = useInfiniteQuery({
    queryKey: ['products'],
    queryFn: ({ pageParam }) => getProductsPage(pageParam as string | null),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.has_more ? lastPage.pagination.next_cursor : undefined,
    enabled: !term,
  });

  const safeProducts: StoreProduct[] = term
    ? (searchData ?? [])
    : (browseData?.pages.flatMap((p) => p.items) ?? []);

  const productsLoading = term ? searchLoading : browseLoading;
  const productsError = term ? searchError : browseError;

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
      <section className="flex flex-col items-center justify-center gap-4 py-8 md:py-10">
        <div className="inline-block max-w-lg text-center justify-center">
          <span className={title()}>{t("make")}&nbsp;</span>
          <span className={title({ color: "violet" })}>
            {t("beautiful")}&nbsp;
          </span>
          <br />
          <span className={title()}>
            <Trans i18nKey="websites-regardless-of-your-design-experience" />
          </span>
          <div className={subtitle({ class: "mt-4" })}>
            <Trans i18nKey="beautiful-fast-and-modern-react-ui-library" />
          </div>
        </div>

        {/* call-to-action buttons */}
        <div className="flex gap-3">
          <a
            href={siteConfig().links.docs}
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-2 bg-linear-to-r from-purple-500 to-purple-600 text-white rounded-full font-semibold hover:opacity-90 shadow-lg transition-opacity"
          >
            <Trans i18nKey="documentation" />
          </a>
          <a
            href={siteConfig().links.github}
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-2 border border-current rounded-full font-semibold hover:bg-default-100 transition-colors flex items-center gap-2"
          >
            <GithubIcon size={20} />
            GitHub
          </a>
        </div>

        {/* dynamic area depending on auth state */}
        <div className="mt-8 text-center">
          {!isAuthenticated ? (
            <>
              <LoginButton />
              <p className="mt-4 text-sm">
                <Trans i18nKey="template_login_prompt" />
              </p>
              <div className="mt-2">
                <RouterLink
                  to="/openapi"
                  className="px-6 py-2 border border-current rounded-full font-semibold hover:bg-default-100 transition-colors inline-block"
                >
                  {t("openapi-docs")}
                </RouterLink>
                <p className="text-xs mt-1 opacity-70">
                  <Trans i18nKey="template_login_required" />
                </p>
              </div>
            </>
          ) : (
            <>
              <p>
                <Trans
                  i18nKey="template_welcome_back"
                  values={{ name: user?.nickname || user?.name }}
                />
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center mt-4">
                <RouterLink
                  to="/api"
                  className="px-6 py-2 border border-current rounded-full font-semibold hover:bg-default-100 transition-colors inline-block"
                >
                  {t("api")}
                </RouterLink>
                <RouterLink
                  to="/openapi"
                  className="px-6 py-2 border border-current rounded-full font-semibold hover:bg-default-100 transition-colors inline-block"
                >
                  {t("openapi-docs")}
                </RouterLink>
              </div>
              <div className="mt-4">
                <LogoutButton text={t("log-out")} />
              </div>
            </>
          )}
        </div>

      </section>

      {/* products grid */}
      <section className="max-w-6xl mx-auto px-6 py-12">
        <h2 className="text-2xl font-semibold mb-6 text-center">
          {t("shop-products-title")}
        </h2>
        {productsLoading ? (
          <p className="text-center">{t("admin-products-loading")}</p>
        ) : productsError ? (
          <p className="text-center text-red-500">{t("products-error")}</p>
        ) : safeProducts.length === 0 ? (
          <p className="text-center">{t("admin-products-empty")}</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {safeProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  selectedSku={selectedVariants[product.id]}
                  onSelectVariant={handleVariantChange}
                />
              ))}
            </div>
            {!term && (
              <div ref={sentinelRef} className="mt-8 flex justify-center">
                {isFetchingNextPage && (
                  <p className="text-sm text-default-400">{t("admin-products-loading")}</p>
                )}
              </div>
            )}
          </>
        )}
      </section>
    </DefaultLayout>
  );
}
