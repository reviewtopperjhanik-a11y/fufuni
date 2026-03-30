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

/**
 * Gets the base URL for the application.
 * @returns The base URL without a trailing slash, or an empty string if not set.
 * This is used to ensure that all API calls are correctly prefixed, especially when the app is deployed under a subpath.
 */
export function getBaseURL() {
  const envBase = import.meta.env.BASE_URL;

  if (envBase) {
    return envBase.endsWith("/") ? envBase.slice(0, -1) : envBase;
  }

  return "";
}
