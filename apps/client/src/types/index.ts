/**
 * Copyright (c) 2024-2026 Ronan LE MEILLAT
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

import { SVGProps } from "react";

/**
 * Common props for SVG icon components.
 * Extends the standard SVGSVGElement props with an optional `size` shorthand.
 */
export type IconSvgProps = SVGProps<SVGSVGElement> & {
  size?: number;
};

/**
 * Array of permission identifiers injected at build time via `import.meta.env.PERMISSIONS`.
 * Populated from the Vite environment configuration.
 */
export const PermissionEnumValues = import.meta.env.PERMISSIONS as string[];

/**
 * Identity map of all application permissions, keyed and valued by the permission string.
 * Allows type-safe permission references without hard-coding strings.
 *
 * @example
 * ```ts
 * if (hasPermission(Permission['read:orders'])) { ... }
 * ```
 */
export const Permission = PermissionEnumValues.reduce(
  (acc, key) => {
    acc[key] = key;

    return acc;
  },
  {} as Record<(typeof PermissionEnumValues)[number], string>,
);
