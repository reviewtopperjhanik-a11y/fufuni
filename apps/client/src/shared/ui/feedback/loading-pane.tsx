/**
 * Copyright (c) 2024-2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 */

import { Spinner } from "@heroui/react";
import { useTranslation } from "react-i18next";

/** Props for the {@link LoadingPane} component. */
interface LoadingPaneProps {
  /** Tailwind padding utility class, e.g. "py-12" or "py-24". Defaults to "py-12". */
  className?: string;
  /** Override the default translated "loading" label. */
  text?: string;
  size?: "sm" | "md" | "lg";
}

/**
 * Centered loading spinner with an optional label.
 * Drop-in replacement for the repeated loading guard pattern used across account pages.
 */
export function LoadingPane({ className = "py-12", text, size = "md" }: LoadingPaneProps) {
  const { t } = useTranslation();

  return (
    <div className={`flex justify-center items-center ${className}`}>
      <div className="flex flex-col items-center gap-2">
        <Spinner size={size} />
        <span className="text-default-500">{text ?? t("loading")}</span>
      </div>
    </div>
  );
}
