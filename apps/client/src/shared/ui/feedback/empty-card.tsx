/**
 * Copyright (c) 2024-2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 */

import { Card, Button, Link as HeroUILink } from "@heroui/react";

/** Props for the {@link EmptyCard} component. */
interface EmptyCardProps {
  emoji?: string;
  title: string;
  description?: string;
  /** href for the optional CTA button. */
  ctaHref?: string;
  /** Label for the optional CTA button. */
  ctaLabel?: string;
  className?: string;
}

/**
 * Centered empty-state card with optional emoji, title, description, and a CTA link.
 * Used when a list (wishlist, saved-carts, order history…) has no items to show.
 */
export function EmptyCard({ emoji, title, description, ctaHref, ctaLabel, className }: EmptyCardProps) {
  return (
    <Card className={`border border-default-200 bg-default-50${className ? ` ${className}` : ""}`}>
      <Card.Content className="py-12 text-center">
        <div className="space-y-4">
          {emoji && <p className="text-5xl">{emoji}</p>}
          <p className="text-lg font-semibold text-default-700">{title}</p>
          {description && <p className="text-sm text-default-500">{description}</p>}
          {ctaHref && ctaLabel && (
            <HeroUILink href={ctaHref} className="mt-4">
              <Button variant="primary">{ctaLabel}</Button>
            </HeroUILink>
          )}
        </div>
      </Card.Content>
    </Card>
  );
}
