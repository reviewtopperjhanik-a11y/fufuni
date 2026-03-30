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

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./app.tsx";
import "./i18n";
import { Provider } from "./provider.tsx";
import { getBaseURL } from "@/utils/base-url";
import "@/styles/globals.css";
import { CookieConsentProvider } from "./contexts/cookie-consent-context.tsx";
import { CookieConsent } from "@/shared/ui/overlays/cookie-consent";
import { AuthenticationProvider } from "./authentication";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// create a shared client; could be moved to its own module if used elsewhere
const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename={getBaseURL()}>
      <Provider>
        <CookieConsentProvider>
          <AuthenticationProvider
            providerType={
              import.meta.env.AUTHENTICATION_PROVIDER_TYPE || "auth0"
            }
          >
            <QueryClientProvider client={queryClient}>
              <CookieConsent />
              <App />
            </QueryClientProvider>
          </AuthenticationProvider>
        </CookieConsentProvider>
      </Provider>
    </BrowserRouter>
  </React.StrictMode>,
);
