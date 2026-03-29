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
import { AlertTriangle, Package, TrendingUp, Users } from "lucide-react";

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
          </>
        )}
      </div>
    </DefaultLayout>
  );
}
