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

// apps/client/src/pages/admin/reviews.tsx
// Admin page to moderate product reviews (approve / reject).
// Uses the existing DefaultLayout pattern from other admin pages.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Button, Chip } from '@heroui/react';
import { useSecuredApi } from '@/authentication';
import { getApiBase } from '@/lib/api-base';
import { resolveTitle } from '@/utils/description';
import DefaultLayout from '@/layouts/default';

export default function AdminReviewsPage() {
  const { t, i18n } = useTranslation();
  const { getJson, patchJson } = useSecuredApi();
  const apiBase = getApiBase();
  const [moderating, setModerating] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery<{ items: any[] }>({
    queryKey: ['admin-reviews'],
    queryFn: () =>
      getJson(`${apiBase}/v1/reviews/admin?status=pending`) as Promise<{
        items: any[];
      }>,
  });
  const reviews = data?.items ?? [];

  const moderate = async (reviewId: string, status: 'approved' | 'rejected') => {
    setModerating(reviewId);
    try {
      await patchJson(`${apiBase}/v1/reviews/${reviewId}/status`, { status });
      await refetch();
    } finally {
      setModerating(null);
    }
  };

  return (
    <DefaultLayout>
      <h1 className="text-2xl font-bold mb-4">{t('admin-reviews-title')}</h1>
      {isLoading ? (
        <p>{t('admin-common-loading')}</p>
      ) : reviews.length === 0 ? (
        <p className="text-default-400">{t('admin-reviews-empty')}</p>
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => (
            <div key={r.id} className="border rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="font-semibold">
                  {resolveTitle(r.product_title, i18n.language)}
                </p>
                <Chip size="sm">{r.status}</Chip>
              </div>
              <p className="text-sm">
                {r.author_name} — {r.rating}★
              </p>
              {r.title && <p className="font-medium text-sm">{r.title}</p>}
              {r.body && <p className="text-sm text-default-600">{r.body}</p>}
              <div className="flex gap-2">
                <Button
                  isPending={moderating === r.id}
                  size="sm"
                  variant="secondary"
                  onPress={() => moderate(r.id, 'approved')}
                >
                  {t('admin-reviews-approve')}
                </Button>
                <Button
                  isPending={moderating === r.id}
                  size="sm"
                  variant="danger"
                  onPress={() => moderate(r.id, 'rejected')}
                >
                  {t('admin-reviews-reject')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </DefaultLayout>
  );
}
