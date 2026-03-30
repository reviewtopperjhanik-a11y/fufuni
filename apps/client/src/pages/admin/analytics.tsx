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

// apps/client/src/pages/admin/analytics.tsx
// Admin analytics dashboard: revenue, customers, top products, stock alerts.
// Data source: GET /v1/analytics/dashboard?period=<7d|30d|90d|all>

import type { Key } from "@heroui/react";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, Label, ListBox, Select } from "@heroui/react";
import { AlertTriangle, Cloud, Database, Package, TrendingUp, Users } from "lucide-react";

import DefaultLayout from "@/layouts/default";
import { useSecuredApi } from "@/authentication";
import { getApiBase } from "@/lib/api-base";
import { formatMoney } from "@/utils/currency";
import { resolveTitle } from "@/utils/description";

type Period = "7d" | "30d" | "90d" | "all";

interface DashboardData {
  revenue: {
    total_cents: number;
    order_count: number;
    avg_order_cents: number;
  };
  customers: {
    total: number;
    new: number;
    returning: number;
  };
  top_products: Array<{
    product_id: string;
    product_title: string;
    units_sold: number;
    revenue_cents: number;
  }>;
  orders_by_status: Array<{ status: string; count: number }>;
  low_stock_count: number;
}

interface CacheStatsData {
  kv: {
    hits: number;
    misses: number;
    hit_rate: number;
    entries: number;
    search_ttl_seconds: number;
    reviews_ttl_seconds: number;
    default_ttl_seconds: number;
  };
  cdn: {
    hits: number;
    misses: number;
    hit_rate: number;
  };
}

const PERIODS: Period[] = ["7d", "30d", "90d", "all"];

export default function AnalyticsPage() {
  const { t, i18n } = useTranslation();
  const { getJson } = useSecuredApi();
  const apiBase = getApiBase();
  const [period, setPeriod] = useState<Period>("30d");

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["analytics-dashboard", period],
    queryFn: () =>
      getJson(
        `${apiBase}/v1/analytics/dashboard?period=${period}`,
      ) as Promise<DashboardData>,
  });

  const { data: cacheStats } = useQuery<CacheStatsData>({
    queryKey: ["cache-stats"],
    queryFn: () =>
      getJson(`${apiBase}/v1/analytics/cache-stats`) as Promise<CacheStatsData>,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });

  return (
    <DefaultLayout>
      <div className="p-6 space-y-6">
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">{t("admin-analytics-title")}</h1>

          <Select
            className="w-44"
            placeholder={t("admin-analytics-period-label")}
            value={period}
            onChange={(value: Key | null) =>
              setPeriod((value as Period) ?? "30d")
            }
          >
            <Label>{t("admin-analytics-period-label")}</Label>
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {PERIODS.map((p) => (
                  <ListBox.Item
                    key={p}
                    id={p}
                    textValue={t(`admin-analytics-period-${p}`)}
                  >
                    {t(`admin-analytics-period-${p}`)}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
        </div>

        {isLoading && (
          <p className="text-default-400">{t("admin-analytics-loading")}</p>
        )}

        {data && (
          <>
            {/* ── KPI cards ─────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <Card.Content className="flex items-center gap-3 p-4">
                  <TrendingUp className="text-primary" size={28} />
                  <div>
                    <p className="text-xs text-default-400">
                      {t("admin-analytics-revenue")}
                    </p>
                    <p className="text-xl font-bold">
                      {formatMoney(data.revenue.total_cents, "EUR")}
                    </p>
                    <p className="text-xs text-default-400">
                      {t("admin-analytics-avg")}{" "}
                      {formatMoney(data.revenue.avg_order_cents, "EUR")}
                    </p>
                  </div>
                </Card.Content>
              </Card>

              <Card>
                <Card.Content className="flex items-center gap-3 p-4">
                  <Package className="text-success" size={28} />
                  <div>
                    <p className="text-xs text-default-400">
                      {t("admin-analytics-orders")}
                    </p>
                    <p className="text-xl font-bold">
                      {data.revenue.order_count}
                    </p>
                  </div>
                </Card.Content>
              </Card>

              <Card>
                <Card.Content className="flex items-center gap-3 p-4">
                  <Users className="text-warning" size={28} />
                  <div>
                    <p className="text-xs text-default-400">
                      {t("admin-analytics-customers")}
                    </p>
                    <p className="text-xl font-bold">{data.customers.total}</p>
                    <p className="text-xs text-default-400">
                      {data.customers.new} {t("admin-analytics-customers-new")}
                    </p>
                  </div>
                </Card.Content>
              </Card>

              <Card>
                <Card.Content className="flex items-center gap-3 p-4">
                  <AlertTriangle className="text-danger" size={28} />
                  <div>
                    <p className="text-xs text-default-400">
                      {t("admin-analytics-low-stock")}
                    </p>
                    <p className="text-xl font-bold">{data.low_stock_count}</p>
                  </div>
                </Card.Content>
              </Card>
            </div>

            {/* ── Top products ──────────────────────────────────────────── */}
            <Card>
              <Card.Content className="p-4">
                <h2 className="font-semibold mb-3">
                  {t("admin-analytics-top-products")}
                </h2>
                {data.top_products.length === 0 ? (
                  <p className="text-sm text-default-400">
                    {t("admin-analytics-top-products-empty")}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {data.top_products.map((p) => (
                      <div
                        key={p.product_id}
                        className="flex justify-between text-sm"
                      >
                        <span className="truncate max-w-xs">
                          {resolveTitle(p.product_title, i18n.language)}
                        </span>
                        <span className="font-medium shrink-0 ml-4">
                          {p.units_sold} {t("admin-analytics-units")} —{" "}
                          {formatMoney(p.revenue_cents, "EUR")}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Card.Content>
            </Card>

            {/* ── Orders by status ──────────────────────────────────────── */}
            <Card>
              <Card.Content className="p-4">
                <h2 className="font-semibold mb-3">
                  {t("admin-analytics-orders-by-status")}
                </h2>
                <div className="grid grid-cols-3 md:grid-cols-7 gap-2">
                  {data.orders_by_status.map((s) => (
                    <div key={s.status} className="text-center">
                      <p className="text-2xl font-bold">{s.count}</p>
                      <p className="text-xs text-default-400">{s.status}</p>
                    </div>
                  ))}
                </div>
              </Card.Content>
            </Card>
            {/* ── Cache Performance ────────────────────────────────────────── */}
            <h2 className="text-xl font-semibold">
              {t("admin-analytics-cache-title")}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* KV Cache */}
              <Card>
                <Card.Content className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Database className="text-primary" size={22} />
                    <h3 className="font-semibold">{t("admin-analytics-cache-kv")}</h3>
                  </div>
                  {cacheStats ? (
                    <>
                      <div>
                        <div className="flex justify-between text-xs text-default-400 mb-1">
                          <span>{t("admin-analytics-cache-hit-rate")}</span>
                          <span
                            className={`font-semibold ${
                              cacheStats.kv.hit_rate >= 0.8
                                ? "text-success"
                                : cacheStats.kv.hit_rate >= 0.5
                                  ? "text-warning"
                                  : "text-danger"
                            }`}
                          >
                            {Math.round(cacheStats.kv.hit_rate * 100)}%
                          </span>
                        </div>
                        <div className="w-full bg-default-100 rounded-full h-2.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              cacheStats.kv.hit_rate >= 0.8
                                ? "bg-success"
                                : cacheStats.kv.hit_rate >= 0.5
                                  ? "bg-warning"
                                  : "bg-danger"
                            }`}
                            style={{ width: `${Math.round(cacheStats.kv.hit_rate * 100)}%` }}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 text-center gap-2">
                        <div>
                          <p className="text-lg font-bold text-success">{cacheStats.kv.hits}</p>
                          <p className="text-xs text-default-400">{t("admin-analytics-cache-hits")}</p>
                        </div>
                        <div>
                          <p className="text-lg font-bold text-danger">{cacheStats.kv.misses}</p>
                          <p className="text-xs text-default-400">{t("admin-analytics-cache-misses")}</p>
                        </div>
                        <div>
                          <p className="text-lg font-bold">{cacheStats.kv.entries}</p>
                          <p className="text-xs text-default-400">{t("admin-analytics-cache-entries")}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 text-center gap-2 pt-2 border-t border-default-200">
                        <div>
                          <p className="text-sm font-semibold">{cacheStats.kv.search_ttl_seconds}s</p>
                          <p className="text-xs text-default-400">{t("admin-analytics-cache-search-ttl")}</p>
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{cacheStats.kv.reviews_ttl_seconds}s</p>
                          <p className="text-xs text-default-400">{t("admin-analytics-cache-reviews-ttl")}</p>
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{cacheStats.kv.default_ttl_seconds}s</p>
                          <p className="text-xs text-default-400">{t("admin-analytics-cache-default-ttl")}</p>
                        </div>
                      </div>
                      <p className="text-xs text-default-400 text-right">
                        {t("admin-analytics-cache-do-saved")} :{" "}
                        <span className="font-semibold text-foreground">{cacheStats.kv.hits}</span>
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-default-400">{t("admin-analytics-loading")}</p>
                  )}
                </Card.Content>
              </Card>

              {/* CDN Cache */}
              <Card>
                <Card.Content className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Cloud className="text-secondary" size={22} />
                    <h3 className="font-semibold">{t("admin-analytics-cache-cdn")}</h3>
                  </div>
                  {cacheStats ? (
                    <>
                      <div>
                        <div className="flex justify-between text-xs text-default-400 mb-1">
                          <span>{t("admin-analytics-cache-hit-rate")}</span>
                          <span
                            className={`font-semibold ${
                              cacheStats.cdn.hit_rate >= 0.8
                                ? "text-success"
                                : cacheStats.cdn.hit_rate >= 0.5
                                  ? "text-warning"
                                  : "text-danger"
                            }`}
                          >
                            {Math.round(cacheStats.cdn.hit_rate * 100)}%
                          </span>
                        </div>
                        <div className="w-full bg-default-100 rounded-full h-2.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              cacheStats.cdn.hit_rate >= 0.8
                                ? "bg-success"
                                : cacheStats.cdn.hit_rate >= 0.5
                                  ? "bg-warning"
                                  : "bg-danger"
                            }`}
                            style={{ width: `${Math.round(cacheStats.cdn.hit_rate * 100)}%` }}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 text-center gap-2">
                        <div>
                          <p className="text-lg font-bold text-success">{cacheStats.cdn.hits}</p>
                          <p className="text-xs text-default-400">{t("admin-analytics-cache-hits")}</p>
                        </div>
                        <div>
                          <p className="text-lg font-bold text-danger">{cacheStats.cdn.misses}</p>
                          <p className="text-xs text-default-400">{t("admin-analytics-cache-misses")}</p>
                        </div>
                      </div>
                      <p className="text-xs text-default-400 italic">
                        {t("admin-analytics-cache-cdn-note")}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-default-400">{t("admin-analytics-loading")}</p>
                  )}
                </Card.Content>
              </Card>
            </div>          </>
        )}
      </div>
    </DefaultLayout>
  );
}
