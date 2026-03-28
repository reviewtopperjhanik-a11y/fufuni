/**
 * Copyright (c) 2024-2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 */

import { useState, useMemo, useCallback, Dispatch, SetStateAction } from "react";

export interface HasIdAndStatus {
  id: string;
  status?: string;
}

export interface UseAdminCrudOptions<T extends HasIdAndStatus> {
  /**
   * Called to decide whether an item passes text search.
   * Receives the item and a lower-cased trimmed search term.
   */
  filterFn: (item: T, term: string) => boolean;
}

export interface UseAdminCrudResult<T extends HasIdAndStatus> {
  // ── list state ────────────────────────────────────────────────────────
  items: T[];
  setItems: Dispatch<SetStateAction<T[]>>;
  /** Filtered + searched subset of `items`, ready for rendering. */
  displayedItems: T[];

  // ── filter state ──────────────────────────────────────────────────────
  globalFilter: string;
  setGlobalFilter: (value: string) => void;
  statusFilter: string;
  setStatusFilter: (value: string) => void;

  // ── modal state ───────────────────────────────────────────────────────
  isModalOpen: boolean;
  setIsModalOpen: Dispatch<SetStateAction<boolean>>;
  isEditMode: boolean;
  editingItem: T | null;

  // ── modal helpers ─────────────────────────────────────────────────────
  /**
   * Sets edit mode to false, clears the editing item, and opens the modal.
   * Call `onOpenCreate` callback (if any) for form reset before invoking this.
   */
  openCreate: () => void;
  /**
   * Sets edit mode to true, stores `item` as the editing item, and opens
   * the modal. Call `onOpenEdit` callback (if any) for form prepopulation
   * before invoking this.
   */
  openEdit: (item: T) => void;
  closeModal: () => void;
}

/**
 * Hook that centralises the boilerplate shared by every admin CRUD page:
 *
 * - `items` list state with filter/search memoisation
 * - `globalFilter` / `statusFilter` state
 * - `isModalOpen` / `isEditMode` / `editingItem` modal state
 * - `openCreate`, `openEdit`, `closeModal` helpers
 *
 * Form data management (entity-specific) stays in the calling component.
 *
 * @example
 * ```tsx
 * const {
 *   items, setItems, displayedItems,
 *   globalFilter, setGlobalFilter,
 *   statusFilter, setStatusFilter,
 *   isModalOpen, setIsModalOpen,
 *   isEditMode, editingItem,
 *   openCreate, openEdit, closeModal,
 * } = useAdminCrud<Country>({
 *   filterFn: (c, term) =>
 *     c.code.toLowerCase().includes(term) ||
 *     c.display_name.toLowerCase().includes(term),
 * });
 * ```
 */
export function useAdminCrud<T extends HasIdAndStatus>(
  options: UseAdminCrudOptions<T>,
): UseAdminCrudResult<T> {
  const { filterFn } = options;

  // ── list ────────────────────────────────────────────────────────────────
  const [items, setItems] = useState<T[]>([]);

  // ── filters ─────────────────────────────────────────────────────────────
  const [globalFilter, setGlobalFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // ── modal ────────────────────────────────────────────────────────────────
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingItem, setEditingItem] = useState<T | null>(null);

  // ── derived ──────────────────────────────────────────────────────────────
  const displayedItems = useMemo(() => {
    let filtered = items;

    if (statusFilter) {
      filtered = filtered.filter((item) => item.status === statusFilter);
    }

    const term = globalFilter.trim().toLowerCase();

    if (term) {
      filtered = filtered.filter((item) => filterFn(item, term));
    }

    return filtered;
  }, [items, statusFilter, globalFilter, filterFn]);

  // ── helpers ──────────────────────────────────────────────────────────────
  const openCreate = useCallback(() => {
    setIsEditMode(false);
    setEditingItem(null);
    setIsModalOpen(true);
  }, []);

  const openEdit = useCallback((item: T) => {
    setIsEditMode(true);
    setEditingItem(item);
    setIsModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  return {
    items,
    setItems,
    displayedItems,
    globalFilter,
    setGlobalFilter,
    statusFilter,
    setStatusFilter,
    isModalOpen,
    setIsModalOpen,
    isEditMode,
    editingItem,
    openCreate,
    openEdit,
    closeModal,
  };
}
