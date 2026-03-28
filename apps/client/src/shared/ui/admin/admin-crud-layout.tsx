/**
 * Copyright (c) 2024-2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 */

import type { ReactNode } from "react";
import { Button, Card, Input, TextField, Label } from "@heroui/react";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

/** Props for the {@link AdminCrudLayout} shared admin page wrapper. */
interface AdminCrudLayoutProps {
  /** Page title shown as an h1. */
  title: string;
  /** Optional subtitle below the title. */
  subtitle?: string;
  /** Optional icon rendered to the left of the title. */
  icon?: ReactNode;
  /** Label for the "Add" button. */
  addLabel: string;
  onAdd: () => void;
  /** Search filter value. */
  globalFilter: string;
  onGlobalFilterChange: (v: string) => void;
  filterPlaceholder?: string;
  /** Status dropdown value. */
  statusFilter: string;
  onStatusFilterChange: (v: string) => void;
  statusLabel?: string;
  statusAllLabel?: string;
  statusActiveLabel?: string;
  statusInactiveLabel?: string;
  /**
   * Extra content inserted between the page header and the filter card.
   * Useful for informational banners specific to a page.
   */
  headerExtra?: ReactNode;
  /** The main table / content rendered below the filters. */
  children: ReactNode;
}

/**
 * Shared layout shell for admin CRUD pages.
 *
 * Renders:
 *   1. Page header with title (+ optional icon/subtitle) and an "Add" button.
 *   2. Optional extra content area (info banners, etc.).
 *   3. Filter card with a text search field and a status dropdown.
 *   4. `children` — the data table.
 */
export function AdminCrudLayout({
  title,
  subtitle,
  icon,
  addLabel,
  onAdd,
  globalFilter,
  onGlobalFilterChange,
  filterPlaceholder = "Search…",
  statusFilter,
  onStatusFilterChange,
  statusLabel,
  statusAllLabel = "All",
  statusActiveLabel = "Active",
  statusInactiveLabel = "Inactive",
  headerExtra,
  children,
}: AdminCrudLayoutProps) {
  const { t } = useTranslation();

  return (
    <div className="p-6">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          {icon}
          <div>
            <h1 className="text-3xl font-bold">{title}</h1>
            {subtitle && (
              <p className="text-sm text-default-500 mt-1">{subtitle}</p>
            )}
          </div>
        </div>
        <Button variant="primary" onPress={onAdd}>
          <Plus className="w-4 h-4" />
          {addLabel}
        </Button>
      </div>

      {/* ── Extra content (info banners, etc.) ───────────────────────── */}
      {headerExtra}

      {/* ── Filters ──────────────────────────────────────────────────── */}
      <Card className="mb-6">
        <Card.Content className="flex gap-4">
          <TextField className="flex-1">
            <Label>{filterPlaceholder}</Label>
            <Input
              placeholder={filterPlaceholder}
              value={globalFilter}
              onChange={(e) => onGlobalFilterChange(e.target.value)}
            />
          </TextField>
          <div className="flex flex-col gap-1">
            <Label>{statusLabel ?? t("admin-common-status")}</Label>
            <select
              className="px-3 py-2 rounded-lg bg-default-100 border border-default-300 text-sm focus:outline-none focus:ring-2"
              value={statusFilter}
              onChange={(e) => onStatusFilterChange(e.target.value)}
            >
              <option value="">{statusAllLabel}</option>
              <option value="active">{statusActiveLabel}</option>
              <option value="inactive">{statusInactiveLabel}</option>
            </select>
          </div>
        </Card.Content>
      </Card>

      {/* ── Table / content ──────────────────────────────────────────── */}
      {children}
    </div>
  );
}
