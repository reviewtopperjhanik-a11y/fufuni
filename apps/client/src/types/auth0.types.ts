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

/**
 * Represents a user profile as returned by the Auth0 Management API.
 * Used for admin user-management operations.
 */
export interface Auth0User {
  /** The unique Auth0 user identifier (e.g. `"auth0|abc123"`). */
  user_id: string;
  /** The user's email address. */
  email: string;
  /** Whether the email address has been verified. */
  email_verified: boolean;
  /** Display name of the user. */
  name: string;
  /** URL of the user's profile picture. */
  picture: string;
  /** The user's short nickname/handle. */
  nickname: string;
  /** ISO 8601 timestamp of account creation. */
  created_at: string;
  /** ISO 8601 timestamp of the last profile update. */
  updated_at: string;
  /** ISO 8601 timestamp of the most recent login. */
  last_login: string;
  /** Total number of times the user has logged in. */
  logins_count: number;
}

/**
 * Represents an Auth0 role as returned by the Management API.
 */
export interface Auth0Role {
  /** The unique identifier of the role. */
  id: string;
  /** Human-readable name of the role (e.g. `"Admin"`). */
  name: string;
  /** Short description of the role's purpose. */
  description: string;
}

/**
 * Represents a single permission as returned by the Auth0 Management API.
 * Permissions are scoped to a specific resource server (API).
 */
export interface Auth0Permission {
  /** The permission scope string (e.g. `"read:orders"`). */
  permission_name: string;
  /** Human-readable description of the permission. */
  description: string;
  /** Audience identifier of the resource server this permission belongs to. */
  resource_server_identifier: string;
  /** Display name of the resource server. */
  resource_server_name: string;
}

/**
 * Response on success returned by the worker route /api/__auth0/token
 */
export interface Auth0ManagementTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  /** true si le token provient du cache KV (pas d'appel Auth0 fait) */
  from_cache?: boolean;
}

/** Error returned by the worker route /api/__auth0/token */
export interface Auth0ManagementTokenError {
  success: false;
  error: string;
}

/** Union type for /api/__auth0/token */
export type Auth0ManagementTokenApiResponse =
  | Auth0ManagementTokenResponse
  | Auth0ManagementTokenError;
