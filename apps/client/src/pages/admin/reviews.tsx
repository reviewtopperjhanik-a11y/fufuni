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
// Users with AI_PERMISSION can use AI-assisted analysis, including batch processing.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Button, Chip } from '@heroui/react';
import { Sparkles } from 'lucide-react';
import { useSecuredApi } from '@/authentication';
import { getApiBase } from '@/lib/api-base';
import { resolveTitle } from '@/utils/description';
import DefaultLayout from '@/layouts/default';
import {
  analyzeReviewsBatchWithAi,
  type AiParams,
  type ReviewAnalysisResult,
} from '@/utils/ai-client';

export default function AdminReviewsPage() {
  const { t, i18n } = useTranslation();
  const { getJson, patchJson, hasPermission } = useSecuredApi();
  const apiBase = getApiBase();

  // Per-row moderation state
  const [moderating, setModerating] = useState<string | null>(null);

  // AI permission + analysis state
  const [canUseAi, setCanUseAi] = useState(false);
  const [aiAnalyses, setAiAnalyses] = useState<Map<string, ReviewAnalysisResult>>(new Map());
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState<{ done: number; total: number } | null>(null);

  // Batch selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const aiPermission = (import.meta as any).env?.AI_PERMISSION || 'ai:api';

  useEffect(() => {
    hasPermission(aiPermission)
      .then(setCanUseAi)
      .catch(() => setCanUseAi(false));
  }, [hasPermission, aiPermission]);

  const { data, isLoading, refetch } = useQuery<{ items: any[] }>({
    queryKey: ['admin-reviews'],
    queryFn: () =>
      getJson(`${apiBase}/v1/reviews/admin?status=pending`) as Promise<{ items: any[] }>,
  });
  const reviews = data?.items ?? [];

  // ── Individual moderation ─────────────────────────────────────────────────

  const moderate = async (reviewId: string, status: 'approved' | 'rejected') => {
    setModerating(reviewId);
    try {
      await patchJson(`${apiBase}/v1/reviews/${reviewId}/status`, { status });
      setSelected((s) => { const n = new Set(s); n.delete(reviewId); return n; });
      setAiAnalyses((m) => { const n = new Map(m); n.delete(reviewId); return n; });
      await refetch();
    } finally {
      setModerating(null);
    }
  };

  // ── Batch moderation ──────────────────────────────────────────────────────

  const [batchModerating, setBatchModerating] = useState(false);

  const moderateBatch = async (ids: string[], status: 'approved' | 'rejected') => {
    setBatchModerating(true);
    try {
      await Promise.all(ids.map((id) => patchJson(`${apiBase}/v1/reviews/${id}/status`, { status })));
      setSelected(new Set());
      setAiAnalyses((m) => {
        const n = new Map(m);
        ids.forEach((id) => n.delete(id));
        return n;
      });
      await refetch();
    } finally {
      setBatchModerating(false);
    }
  };

  // ── AI analysis ───────────────────────────────────────────────────────────

  const runAiAnalysis = async (targets: any[]) => {
    setAnalyzing(true);
    setAnalyzeProgress({ done: 0, total: targets.length });
    try {
      const params = await getJson(
        `${(import.meta as any).env?.API_BASE_URL || ''}/v1/ai/parameters`,
      ) as AiParams;

      const results = await analyzeReviewsBatchWithAi(
        targets.map((r) => ({
          id: r.id,
          rating: r.rating,
          title: r.title,
          body: r.body,
          author_name: r.author_name,
        })),
        params,
        (done, total) => setAnalyzeProgress({ done, total }),
      );
      setAiAnalyses((prev) => new Map([...prev, ...results]));
    } catch (err) {
      console.error('AI analysis failed', err);
    } finally {
      setAnalyzing(false);
      setAnalyzeProgress(null);
    }
  };

  // ── Selection helpers ─────────────────────────────────────────────────────

  const toggleSelect = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const selectAll = () => setSelected(new Set(reviews.map((r) => r.id)));
  const clearSelection = () => setSelected(new Set());

  const selectedReviews = reviews.filter((r) => selected.has(r.id));
  const aiRecommendedApprove = [...selected].filter(
    (id) => aiAnalyses.get(id)?.recommendation === 'approve',
  );
  const aiRecommendedReject = [...selected].filter(
    (id) => aiAnalyses.get(id)?.recommendation === 'reject',
  );

  return (
    <DefaultLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-bold">{t('admin-reviews-title')}</h1>

          {/* AI + batch controls */}
          {reviews.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {/* Select all / clear */}
              <Button
                size="sm"
                variant="tertiary"
                onPress={selected.size === reviews.length ? clearSelection : selectAll}
              >
                {selected.size === reviews.length
                  ? t('admin-reviews-clear-selection')
                  : t('admin-reviews-select-all')}
              </Button>

              {/* AI analyze selected (or all if nothing selected) */}
              {canUseAi && (
                <Button
                  isPending={analyzing}
                  size="sm"
                  variant="secondary"
                  onPress={() =>
                    runAiAnalysis(selected.size > 0 ? selectedReviews : reviews)
                  }
                >
                  <Sparkles size={14} className="mr-1" />
                  {analyzing
                    ? analyzeProgress
                      ? `${analyzeProgress.done}/${analyzeProgress.total}`
                      : t('admin-reviews-ai-analyzing')
                    : selected.size > 0
                      ? t('admin-reviews-ai-analyze-selected', { count: selected.size })
                      : t('admin-reviews-ai-analyze-all')}
                </Button>
              )}

              {/* Batch approve/reject for selected */}
              {selected.size > 0 && (
                <>
                  <Button
                    isPending={batchModerating}
                    size="sm"
                    variant="secondary"
                    onPress={() => moderateBatch([...selected], 'approved')}
                  >
                    {t('admin-reviews-batch-approve', { count: selected.size })}
                  </Button>
                  <Button
                    isPending={batchModerating}
                    size="sm"
                    variant="danger"
                    onPress={() => moderateBatch([...selected], 'rejected')}
                  >
                    {t('admin-reviews-batch-reject', { count: selected.size })}
                  </Button>
                </>
              )}

              {/* AI-guided batch: approve all AI-approved / reject all AI-rejected */}
              {canUseAi && aiRecommendedApprove.length > 0 && (
                <Button
                  isPending={batchModerating}
                  size="sm"
                  variant="secondary"
                  onPress={() => moderateBatch(aiRecommendedApprove, 'approved')}
                >
                  {t('admin-reviews-ai-approve-all', { count: aiRecommendedApprove.length })}
                </Button>
              )}
              {canUseAi && aiRecommendedReject.length > 0 && (
                <Button
                  isPending={batchModerating}
                  size="sm"
                  variant="danger"
                  onPress={() => moderateBatch(aiRecommendedReject, 'rejected')}
                >
                  {t('admin-reviews-ai-reject-all', { count: aiRecommendedReject.length })}
                </Button>
              )}
            </div>
          )}
        </div>

        {isLoading ? (
          <p>{t('admin-common-loading')}</p>
        ) : reviews.length === 0 ? (
          <p className="text-default-400">{t('admin-reviews-empty')}</p>
        ) : (
          <div className="space-y-3">
            {reviews.map((r) => {
              const analysis = aiAnalyses.get(r.id);
              const isSelected = selected.has(r.id);
              return (
                <div
                  key={r.id}
                  className={`border rounded-xl p-4 space-y-2 transition-colors cursor-pointer ${
                    isSelected ? 'border-primary bg-primary-50/30' : 'border-default-200'
                  }`}
                  onClick={() => toggleSelect(r.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {/* Checkbox */}
                      <input
                        checked={isSelected}
                        className="shrink-0 accent-primary"
                        type="checkbox"
                        onChange={() => toggleSelect(r.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <p className="font-semibold truncate">
                        {resolveTitle(r.product_title, i18n.language)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {/* AI recommendation badge */}
                      {analysis && (
                        <Chip
                          color={analysis.recommendation === 'approve' ? 'success' : 'danger'}
                          size="sm"
                          variant="soft"
                        >
                          <Sparkles size={10} className="inline mr-0.5" />
                          {analysis.recommendation === 'approve'
                            ? t('admin-reviews-ai-rec-approve')
                            : t('admin-reviews-ai-rec-reject')}
                        </Chip>
                      )}
                      <Chip size="sm">{r.status}</Chip>
                    </div>
                  </div>

                  <p className="text-sm">
                    {r.author_name} — {r.rating}★
                  </p>
                  {r.title && <p className="font-medium text-sm">{r.title}</p>}
                  {r.body && <p className="text-sm text-default-600">{r.body}</p>}

                  {/* AI reason */}
                  {analysis?.reason && (
                    <p className="text-xs text-default-400 italic flex items-center gap-1">
                      <Sparkles size={10} />
                      {analysis.reason}
                    </p>
                  )}

                  {/* Per-row actions */}
                  <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                    {canUseAi && !analysis && (
                      <Button
                        isPending={analyzing}
                        size="sm"
                        variant="tertiary"
                        onPress={() => runAiAnalysis([r])}
                      >
                        <Sparkles size={12} className="mr-1" />
                        {t('admin-reviews-ai-analyze-one')}
                      </Button>
                    )}
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
              );
            })}
          </div>
        )}
      </div>
    </DefaultLayout>
  );
}
