/**
 * Copyright (c) 2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 *
 * Dynamically sets <head> meta tags for SEO and Open Graph.
 * Call at the top of every page component.
 * Does not depend on react-helmet — uses DOM API directly.
 */
import { useEffect } from 'react';

interface SeoMeta {
  title: string;
  description?: string;
  imageUrl?: string;
  type?: 'website' | 'product';
  priceCents?: number;
  currency?: string;
}

export function useSeoMeta({
  title,
  description,
  imageUrl,
  type = 'website',
  priceCents,
  currency,
}: SeoMeta): void {
  useEffect(() => {
    document.title = `${title} | Fufuni`;
    upsertMeta('name', 'description', description ?? '');
    upsertMeta('property', 'og:title', title);
    upsertMeta('property', 'og:description', description ?? '');
    upsertMeta('property', 'og:type', type);
    if (imageUrl) upsertMeta('property', 'og:image', imageUrl);
    if (priceCents !== undefined && currency) {
      upsertMeta('property', 'product:price:amount', String(priceCents / 100));
      upsertMeta('property', 'product:price:currency', currency.toUpperCase());
    }
    return () => {
      document.title = 'Fufuni';
    };
  }, [title, description, imageUrl, type, priceCents, currency]);
}

function upsertMeta(attrKey: string, attrValue: string, content: string): void {
  const selector = `meta[${attrKey}="${attrValue}"]`;
  let el = document.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attrKey, attrValue);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}
