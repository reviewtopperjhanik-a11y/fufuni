/**
 * Copyright (c) 2026 Ronan LE MEILLAT
 * License: MIT
 *
 * CategoryNav — Public storefront category navigation component
 * Uses HeroUI v3 Card, Link, Skeleton, Badge, ScrollShadow components
 */

import { useTranslation } from 'react-i18next';
import { Card, Link, Skeleton, Badge, ScrollShadow } from '@heroui/react';
import { useNavigate } from 'react-router-dom';
import { useCategoryTree } from '@/hooks/use-categories';
import { resolveTitle } from '@/utils/description';

export interface CategoryNavProps {
  showImages?: boolean;
  className?: string;
}

/**
 * Recursive category item renderer
 */
function CategoryItem({
  handle,
  name,
  image_url,
  children,
  onSelect,
  showImages,
  locale,
}: {
  handle: string;
  name: string;
  image_url: string | null;
  children: any[];
  onSelect?: (handle: string) => void;
  showImages?: boolean;
  locale: string;
}) {
  const navigate = useNavigate();
  const displayName = resolveTitle(name, locale);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    onSelect?.(handle);
    navigate(`/products?category=${handle}`);
  };

  return (
    <li className="py-1">
      <div className="flex items-center gap-2">
        <Link
          href={`/products?category=${handle}`}
          onClick={handleClick}
          className="text-sm font-medium flex-1"
        >
          {showImages && image_url && (
            <img
              src={image_url}
              alt={displayName}
              className="w-6 h-6 rounded-sm object-cover inline-block mr-2"
            />
          )}
          <span>{displayName}</span>
        </Link>
        {children && children.length > 0 && (
          <Badge.Anchor>
            <div/>
            <Badge color="default" size="sm" className='mr-2'>
              {children.length}
            </Badge>
          </Badge.Anchor>
        )}
      </div>
      {children && children.length > 0 && (
        <ul className="ml-4 mt-1 space-y-1 border-l border-default-200 pl-2">
          {children.map((child) => (
            <CategoryItem
              key={child.id}
              handle={child.handle}
              name={child.name}
              image_url={child.image_url}
              children={child.children}
              onSelect={onSelect}
              showImages={showImages}
              locale={locale}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * CategoryNav — Header or sidebar navigation for product categories
 * 
 * Usage:
 * ```tsx
 * <CategoryNav showImages={true} />
 * ```
 */
export function CategoryNav({
  showImages = false,
  className = '',
}: CategoryNavProps) {
  const { t, i18n } = useTranslation();
  const { tree, isLoading, error } = useCategoryTree();

  if (isLoading) {
    return (
      <Card className={`p-4 ${className}`}>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 rounded-lg" />
          ))}
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={`p-4 bg-danger-100 ${className}`}>
        <p className="text-sm text-danger-600">{t('categories-error')}</p>
      </Card>
    );
  }

  if (!tree || tree.length === 0) {
    return (
      <Card className={`p-4 ${className}`}>
        <p className="text-sm text-default-500">{t('categories-empty')}</p>
      </Card>
    );
  }

  return (
    <Card className={`p-4 ${className}`}>
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-foreground">
          {t('categories-title')}
        </h3>
      </div>
      <ScrollShadow hideScrollBar className="h-auto max-h-125">
        <ul className="space-y-1">
          {tree.map((category) => (
            <CategoryItem
              key={category.id}
              handle={category.handle}
              name={category.name}
              image_url={category.image_url}
              children={category.children}
              showImages={showImages}
              locale={i18n.language}
            />
          ))}
        </ul>
      </ScrollShadow>
    </Card>
  );
}

/**
 * CategoryBreadcrumb — Show current category path
 * 
 * Usage:
 * ```tsx
 * <CategoryBreadcrumb categoryHandle="t-shirts" />
 * ```
 */
export function CategoryBreadcrumb({ categoryHandle }: { categoryHandle?: string }) {
  const { t } = useTranslation();
  const { flatList } = useCategoryTree();

  if (!categoryHandle) {
    return (
      <nav className="text-sm text-default-600">
        <Link href="/">
          {t('home')}
        </Link>
      </nav>
    );
  }

  // Find category and build breadcrumb
  const category = flatList.find((c) => c.handle === categoryHandle);
  if (!category) return null;

  const breadcrumbs: typeof category[] = [category];
  let current = category;

  while (current.parent_id) {
    const parent = flatList.find((c) => c.id === current.parent_id);
    if (!parent) break;
    breadcrumbs.unshift(parent);
    current = parent;
  }

  return (
    <nav className="text-sm text-default-600 flex items-center gap-2">
      <Link href="/">
        {t('home')}
      </Link>
      {breadcrumbs.map((breadcrumb, index) => (
        <div key={breadcrumb.id} className="flex items-center gap-2">
          <span>/</span>
          <Link
            href={`/products?category=${breadcrumb.handle}`}
            className={index === breadcrumbs.length - 1 ? 'text-primary' : ''}
          >
            {breadcrumb.name}
          </Link>
        </div>
      ))}
    </nav>
  );
}

/**
 * CategoryHero — Large category feature card
 * 
 * Usage:
 * ```tsx
 * <CategoryHero categoryId={categoryId} />
 * ```
 */
export function CategoryHero({ categoryHandle }: { categoryHandle: string }) {
  const { flatList, isLoading } = useCategoryTree();
  const category = flatList.find((c) => c.handle === categoryHandle);

  if (isLoading || !category) {
    return <Skeleton className="w-full h-64 rounded-lg" />;
  }

  return (
    <div
      className="w-full h-64 col-span-12 sm:col-span-7 bg-cover bg-center rounded-lg overflow-hidden"
      style={{
        backgroundImage: category.image_url
          ? `url(${category.image_url})`
          : undefined,
      }}
    >
      <div className="flex flex-col justify-between h-full p-6 bg-black/40">
        <h1 className="text-3xl font-bold text-white">{category.name}</h1>
        {category.description && (
          <p className="text-white/80 text-sm line-clamp-2">
            {category.description}
          </p>
        )}
      </div>
    </div>
  );
}
