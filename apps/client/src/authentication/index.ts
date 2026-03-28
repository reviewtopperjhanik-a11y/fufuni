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

// Re-export components and hooks
export {
  useAuth,
  getNameWithFallback,
  withAuthentication,
} from "@/features/auth/providers/use-auth";
export {
  useAuth0Provider,
  withAuth0Authentication,
} from "@/features/auth/providers/auth0-provider";
// export { useDexProvider } from '@/features/auth/providers/dex-provider';
export {
  AuthenticationProvider,
  type AuthenticationType,
} from "@/features/auth/auth-root";

// Export interfaces
export type {
  AuthProvider,
  AuthUser,
  TokenOptions,
  LoginOptions,
  LogoutOptions,
  AuthProviderConfig,
  AuthGuardProps,
  AuthPermissionGuardProps,
} from "@/features/auth/providers/auth-provider";

// Export UI components
export {
  Profile,
  LoginButton,
  LoginLink,
  LogoutButton,
  LogoutLink,
  LoginLogoutButton,
  LoginLogoutLink,
  AuthenticationGuard,
  AuthenticationGuardWithPermission,
  useSecuredApi,
} from "@/features/auth/components/auth-components";
