/**
 * Copyright (c) 2024-2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 */

import { Button, Tooltip } from "@heroui/react";
import { Edit2, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

interface RowActionsProps {
  onEdit: () => void;
  onDelete: () => void;
  /** Override the edit button aria-label. */
  editLabel?: string;
  /** Override the delete button aria-label. */
  deleteLabel?: string;
  className?: string;
}

/**
 * Standardized edit + delete icon buttons for admin table rows.
 *
 * Encapsulates the repeated pattern:
 * ```tsx
 * <div className="flex gap-2">
 *   <Button isIconOnly size="sm" variant="tertiary" onPress={onEdit}><Edit2 /></Button>
 *   <Button isIconOnly size="sm" variant="tertiary" onPress={onDelete}><Trash2 /></Button>
 * </div>
 * ```
 */
export function RowActions({
  onEdit,
  onDelete,
  editLabel,
  deleteLabel,
  className,
}: RowActionsProps) {
  const { t } = useTranslation();
  const editText = editLabel ?? t("admin-common-edit");
  const deleteText = deleteLabel ?? t("admin-common-delete");

  return (
    <div className={`flex gap-2${className ? ` ${className}` : ""}`}>
      <Tooltip>
        <Tooltip.Trigger>
          <Button
            isIconOnly
            aria-label={editText}
            size="sm"
            variant="tertiary"
            onPress={onEdit}
          >
            <Edit2 className="w-4 h-4" />
          </Button>
        </Tooltip.Trigger>
        <Tooltip.Content>{editText}</Tooltip.Content>
      </Tooltip>
      <Tooltip>
        <Tooltip.Trigger>
          <Button
            isIconOnly
            aria-label={deleteText}
            size="sm"
            variant="tertiary"
            onPress={onDelete}
          >
            <Trash2 className="w-4 h-4 text-danger" />
          </Button>
        </Tooltip.Trigger>
        <Tooltip.Content>{deleteText}</Tooltip.Content>
      </Tooltip>
    </div>
  );
}
