/**
 * Copyright (c) 2026 Ronan LE MEILLAT - SCTG Development
 * License: AGPL-3.0-or-later
 */
import type { Topic } from '../base.js';
import { BASE_SYSTEM, appendFacts } from '../base.js';

const topic: Topic = {
  name: 'admin-crud-pattern',
  description: 'Standardized admin list/edit architecture built from AdminCrudLayout, useAdminCrud hook, and RowActions — the three-part composition every admin page uses.',
  tags: ["design","theming"],
  sources: [
    'apps/client/src/shared/ui/admin/admin-crud-layout.tsx',
    'apps/client/src/shared/ui/admin/row-actions.tsx',
    'apps/client/src/hooks/use-admin-crud.ts',
  ],
  systemPrompt: BASE_SYSTEM,
  manualFacts: [
    'Every admin list page uses the same three-part pattern: AdminCrudLayout (outer shell with header, add button, table), useAdminCrud() hook (fetch + mutate logic), RowActions (per-row edit/delete controls).',
    'useAdminCrud<T>({ listUrl, createUrl, updateUrl, deleteUrl, queryKey }) returns { items, isLoading, create, update, remove, selectedItem, setSelectedItem, isModalOpen, openModal, closeModal }.',
    'AdminCrudLayout props: title, addLabel, columns (TanStack Table ColumnDef[]), data, isLoading, renderModal (JSX for create/edit modal), onAdd.',
    'RowActions renders an icon-button group. Props: onEdit(() => void), onDelete(() => void), deleteConfirmMessage?: string.',
    'Confirmation for delete is handled inside RowActions via a HeroUI popover — no external dialog needed.',
    'The modal for create/edit is a controlled HeroUI Modal component. isModalOpen / openModal / closeModal from useAdminCrud wire the open state.',
    'Form inside the modal uses react-hook-form + zod. Pass the zodSchema to useAdminCrud to enable client-side validation before API calls.',
    'All admin pages require the AuthenticationGuardWithPermission wrapper with permission="admin:store" in app.tsx. Wrap the route, not the component.',
  ],
  buildPrompt: (src) => appendFacts(`
Below are AdminCrudLayout, RowActions, and the useAdminCrud hook.

${src}

Task: Write an "Admin CRUD Pattern Guide".
Include:
1. The three-component pattern and how they compose.
2. useAdminCrud() hook: all returned values, type parameter, all option fields.
3. AdminCrudLayout: all props, column definition format (ColumnDef[]).
4. RowActions: props, delete confirmation, how edit wires to modal.
5. Modal pattern: how create vs edit is distinguished in the same modal.
6. Form validation: react-hook-form + zod integration.
7. Route protection: where to put AuthenticationGuardWithPermission.
8. A complete worked example: "ProductTags" admin page (list, add, edit, delete).
`, topic.manualFacts),
};

export default topic;
