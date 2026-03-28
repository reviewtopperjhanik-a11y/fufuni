/**
 * Copyright (c) 2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 *
 * Admin Categories Management Page
 * Displays the CategoryAdmin component for managing product categories
 */

import { useTranslation } from "react-i18next";

import { CategoryAdmin } from "@/components/category-admin";
import { AuthenticationGuardWithPermission } from "@/authentication";
import DefaultLayout from "@/layouts/default";

export default function CategoriesPage() {
  const { t } = useTranslation();

  return (
    <DefaultLayout>
      <AuthenticationGuardWithPermission permission="admin:store">
        <div className="min-h-screen  py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-foreground">
                {t("categories")}
              </h1>
              <p className="mt-2 text-default-500">
                {t("manage-product-categories")}
              </p>
            </div>
            <CategoryAdmin />
          </div>
        </div>
      </AuthenticationGuardWithPermission>
    </DefaultLayout>
  );
}
