/**
 * Copyright (c) 2026 Ronan LE MEILLAT
 * License: MIT
 */

import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

export interface Category {
  id: string;
  handle: string;
  name: string;
  parent_id: string | null;
  position: number;
  image_url: string | null;
  status: "active" | "inactive";
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface CategoryTree extends Category {
  children: CategoryTree[];
}

/**
 * Build a hierarchical tree from flat category list
 */
function buildCategoryTree(categories: Category[]): CategoryTree[] {
  const map = new Map<string, CategoryTree>();

  // Create tree nodes
  for (const cat of categories) {
    map.set(cat.id, { ...cat, children: [] });
  }

  // Build parent-child relationships
  const roots: CategoryTree[] = [];

  for (const cat of categories) {
    const node = map.get(cat.id)!;

    if (!cat.parent_id) {
      roots.push(node);
    } else {
      const parent = map.get(cat.parent_id);

      if (parent) {
        parent.children.push(node);
      }
    }
  }

  // Sort by position
  const sortByPosition = (items: CategoryTree[]) => {
    items.sort((a, b) => a.position - b.position);
    items.forEach((item) => sortByPosition(item.children));
  };

  sortByPosition(roots);

  return roots;
}

/**
 * Hook to fetch and cache the category list for storefront navigation
 */
export const useCategories = () => {
  const { t } = useTranslation();

  return useQuery<Category[], Error>({
    queryKey: ["categories"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.API_BASE_URL}/v1/categories`);

      if (!res.ok) {
        const error = await res.json().catch(() => ({}));

        throw new Error(error.error?.message || t("error-loading-categories"));
      }
      const data = await res.json();

      return data.items || [];
    },
    staleTime: 60 * 60 * 1000, // 1 hour
    gcTime: 24 * 60 * 60 * 1000, // 24 hours (formerly cacheTime)
  });
};

/**
 * Hook to fetch products in a specific category
 */
export const useCategoryProducts = (handle: string | null, limit = 20) => {
  const { t } = useTranslation();

  return useQuery({
    queryKey: ["category-products", handle],
    queryFn: async () => {
      if (!handle) return null;
      const res = await fetch(
        `${import.meta.env.API_BASE_URL}/v1/categories/${handle}/products?limit=${limit}`,
      );

      if (!res.ok) {
        throw new Error(t("error-loading-products"));
      }

      return res.json();
    },
    enabled: !!handle,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
};

/**
 * Hook to get categories as a hierarchical tree
 */
export const useCategoryTree = () => {
  const { data: categories, isLoading, error } = useCategories();

  const tree = categories ? buildCategoryTree(categories) : [];
  const flatList = categories || [];

  const rootCategories = flatList.filter((c) => !c.parent_id);
  const getChildren = (parentId: string) =>
    flatList.filter((c) => c.parent_id === parentId);

  return {
    tree,
    flatList,
    rootCategories,
    getChildren,
    isLoading,
    error,
  };
};
