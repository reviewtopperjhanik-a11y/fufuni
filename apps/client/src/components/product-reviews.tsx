/**
 * Copyright (c) 2026 Ronan LE MEILLAT
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

// apps/client/src/components/product-reviews.tsx
// Displays the star rating summary + list of approved reviews for a product.
// Also shows a "Write a review" form for authenticated customers.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@heroui/react';
import { Star } from 'lucide-react';
import { useAuth, useSecuredApi } from '@/authentication';
import { getApiBase } from '@/lib/api-base';

interface Review {
  id: string;
  author_name: string;
  rating: number;
  title: string | null;
  body: string | null;
  is_verified_purchase: number;
  helpful_count: number;
  created_at: string;
}

interface Props {
  productId: string;
}

/**
 * Renders star icons for a given rating value.
 * @param rating - Number between 1 and 5
 */
const StarRating = ({ rating }: { rating: number }) => (
  <div className="flex gap-0.5" aria-label={`${rating} out of 5 stars`}>
    {[1, 2, 3, 4, 5].map((star) => (
      <Star
        key={star}
        size={14}
        className={star <= rating ? 'fill-amber-400 text-amber-400' : 'text-default-300'}
      />
    ))}
  </div>
);

export function ProductReviews({ productId }: Props) {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const { getJson, postJson } = useSecuredApi();
  const apiBase = getApiBase();
  const [showForm, setShowForm] = useState(false);
  const [newRating, setNewRating] = useState(5);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const { data, isLoading } = useQuery<{ items: Review[] }>({
    queryKey: ['product-reviews', productId],
    queryFn: () =>
      getJson(`${apiBase}/v1/products/${productId}/reviews`) as Promise<{
        items: Review[];
      }>,
  });
  const reviews = data?.items ?? [];

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await postJson(`${apiBase}/v1/products/${productId}/reviews`, {
        rating: newRating,
        title: newTitle || undefined,
        body: newBody || undefined,
      });
      setSubmitted(true);
      setShowForm(false);
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) return <p className="text-sm text-default-400">{t('loading')}</p>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{t('reviews-title')}</h3>
        {isAuthenticated && !showForm && !submitted && (
          <Button size="sm" onPress={() => setShowForm(true)}>
            {t('reviews-write')}
          </Button>
        )}
      </div>

      {/* Write review form */}
      {showForm && (
        <div className="border rounded-xl p-4 space-y-3">
          {/* Star selector */}
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((s) => (
              <button key={s} type="button" onClick={() => setNewRating(s)}>
                <Star
                  size={24}
                  className={
                    s <= newRating ? 'fill-amber-400 text-amber-400' : 'text-default-300'
                  }
                />
              </button>
            ))}
          </div>
          <input
            className="w-full border rounded px-3 py-1.5 text-sm"
            maxLength={120}
            placeholder={t('reviews-title-placeholder')}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <textarea
            className="w-full border rounded px-3 py-1.5 text-sm"
            maxLength={2000}
            placeholder={t('reviews-body-placeholder')}
            rows={4}
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
          />
          <div className="flex gap-2">
            <Button isPending={submitting} size="sm" onPress={handleSubmit}>
              {t('reviews-submit')}
            </Button>
            <Button size="sm" variant="tertiary" onPress={() => setShowForm(false)}>
              {t('cancel')}
            </Button>
          </div>
        </div>
      )}

      {submitted && <p className="text-sm text-success">{t('reviews-submitted')}</p>}

      {/* Review list */}
      {reviews.length === 0 ? (
        <p className="text-sm text-default-400">{t('reviews-empty')}</p>
      ) : (
        <div className="space-y-4">
          {reviews.map((r) => (
            <div key={r.id} className="border-b pb-4 space-y-1">
              <div className="flex items-center gap-2">
                <StarRating rating={r.rating} />
                {r.is_verified_purchase === 1 && (
                  <span className="text-xs text-success font-medium">
                    {t('reviews-verified')}
                  </span>
                )}
              </div>
              {r.title && <p className="font-semibold text-sm">{r.title}</p>}
              {r.body && <p className="text-sm text-default-700">{r.body}</p>}
              <p className="text-xs text-default-400">
                {r.author_name} — {new Date(r.created_at).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
