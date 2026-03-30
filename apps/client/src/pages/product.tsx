/**
 * MIT License
 *
 * Copyright (c) 2026 Ronan LE MEILLAT - SCTG Development
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

import { useParams, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, Breadcrumbs, Spinner } from "@heroui/react";
import { getBaseURL } from "@/utils/base-url";

import DefaultLayout from "@/layouts/default";
import { getProduct, StoreProduct } from "@/lib/store-api";
import { ProductCardFull } from "@/components/product-card-full";
import { useCategories } from "@/hooks/use-categories";
import { resolveTitle } from "@/utils/description";

export default function ProductPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const location = useLocation();

  // Category handle forwarded via router state when navigating from a category browse page
  const fromCategory = (location.state as { from?: string } | null)?.from ?? "";

  const {
    data: product,
    isLoading,
    isError,
    error,
  } = useQuery<StoreProduct, Error>({
    queryKey: ["product", id],
    queryFn: () => {
      if (!id) throw new Error("Product ID not provided");
      return getProduct(id);
    },
    enabled: !!id,
  });

  // Fetch category flat list so we can resolve the category name for breadcrumbs
  const { data: categories } = useCategories();
  const categoryName = fromCategory
    ? categories?.find((c) => c.handle === fromCategory)?.name ?? fromCategory
    : "";

  const displayTitle = product ? resolveTitle(product.title, i18n.language) : "";

  return (
    <DefaultLayout>
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Breadcrumbs */}
        <Breadcrumbs className="mb-4">
          <Breadcrumbs.Item
            href={`${getBaseURL()}/`}
            onClick={(event) => {
              event.preventDefault();
              navigate("/");
            }}
          >
            {t("home")}
          </Breadcrumbs.Item>
          {fromCategory ? (
            <Breadcrumbs.Item
              href={`${getBaseURL()}/products?category=${fromCategory}`}
              onClick={(event) => {
                event.preventDefault();
                navigate(`/products?category=${fromCategory}`);
              }}
            >
              {resolveTitle(categoryName, i18n.language)}
            </Breadcrumbs.Item>
          ) : (
            <Breadcrumbs.Item
              href={`${getBaseURL()}/products`}
              onClick={(event) => {
                event.preventDefault();
                navigate("/products");
              }}
            >
              {t("shop-products-title")}
            </Breadcrumbs.Item>
          )}
          {displayTitle && (
            <Breadcrumbs.Item>{displayTitle}</Breadcrumbs.Item>
          )}
        </Breadcrumbs>

        {isLoading && (
          <div className="flex justify-center items-center py-20">
            <div className="flex flex-col items-center gap-2">
              <Spinner size="lg" />
              <span className="text-default-500">{t("loading")}</span>
            </div>
          </div>
        )}

        {isError && (
          <Card className="border-danger-200 bg-danger-50">
            <Card.Content className="text-danger-800">
              <p className="font-semibold mb-2">{t("error")}</p>
              <p>{error?.message || t("admin-products-error-loading")}</p>
            </Card.Content>
          </Card>
        )}

        {product && (
          <ProductCardFull product={product} />
        )}

        {!isLoading && !product && !isError && (
          <Card>
            <Card.Content className="text-center text-default-500">
              {t("admin-products-empty")}
            </Card.Content>
          </Card>
        )}
      </div>
    </DefaultLayout>
  );
}
