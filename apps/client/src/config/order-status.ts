/**
 * Copyright (c) 2024-2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 */

/** Maps order status strings to HeroUI Chip color variants. */
export const ORDER_STATUS_COLORS = {
  paid: "success",
  processing: "accent",
  shipped: "accent",
  delivered: "success",
  refunded: "danger",
  canceled: "danger",
  pending: "warning",
} as const satisfies Record<
  string,
  "success" | "warning" | "danger" | "default" | "accent"
>;
