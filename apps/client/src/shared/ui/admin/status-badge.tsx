/**
 * Copyright (c) 2024-2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 */

import { Chip } from "@heroui/react";

type StatusValue = "active" | "inactive" | string;
type ChipColor = "default" | "success" | "warning" | "danger" | "accent";

/** Props for the {@link StatusBadge} component. */
interface StatusBadgeProps {
  status: StatusValue;
  /**
   * Custom color map: `{ [statusValue]: heroui chip color name }`.
   * Falls back to `active → success`, `inactive → default`.
   */
  colorMap?: Record<string, ChipColor>;
  className?: string;
}

const DEFAULT_COLOR_MAP: Record<string, ChipColor> = {
  active: "success",
  inactive: "default",
  draft: "warning",
  pending: "warning",
  paid: "success",
  processing: "warning",
  shipped: "accent",
  delivered: "success",
  refunded: "danger",
  canceled: "danger",
};

/**
 * Colored status chip for entity rows.
 *
 * Replaces the repeated inline pattern:
 * ```tsx
 * <span className={status === "active" ? "text-green-600" : "text-gray-600"}>
 *   {status}
 * </span>
 * ```
 */
export function StatusBadge({ status, colorMap, className }: StatusBadgeProps) {
  const map = colorMap ?? DEFAULT_COLOR_MAP;
  const color: ChipColor = map[status] ?? "default";

  return (
    <Chip
      className={className}
      color={color}
      size="sm"
      variant="soft"
    >
      {status}
    </Chip>
  );
}

