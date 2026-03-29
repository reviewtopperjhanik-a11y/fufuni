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
 * Lightweight client for the public Merchant storefront API.
 *
 * The examples shipped with Merchant use a simple PK (public key) in a
 * `Bearer` header.  We replicate that here so that the React frontend can
 * fetch products without requiring any authentication state.
 *
 * You may expand this module later with helpers for cart/checkout.
 */

import { getApiBase } from "@/lib/api-base";

const API_BASE = getApiBase();
const PUBLIC_KEY = import.meta.env.MERCHANT_PK;

if (!PUBLIC_KEY) {
  console.warn(
    "store-api: no MERCHANT_PK environment variable defined, API calls may fail",
  );
}

/**
 * Methods for making secured authenticated API requests using getJson/postJson etc.
 */
export interface SecuredApi {
  getJson(url: string): Promise<any>;
  postJson(url: string, data: any): Promise<any>;
  postForm(url: string, formData: FormData): Promise<any>;
  putJson(url: string, data: any): Promise<any>;
  patchJson(url: string, data: any): Promise<any>;
  deleteJson(url: string): Promise<any>;
}

/**
 * Internal request helper used by all public API methods.
 *
 * @template T
 * @param endpoint - API path (prefixed by API_BASE).
 * @param options - Fetch options. JSON string bodies are parsed for secured calls.
 * @param secured - When true, calls the provided securedApi method to use auth token flows.
 * @param securedApi - useSecuredApi() helper with getJson/postJson/etc.
 * @returns Parsed JSON response.
 * @throws API error message when non-2xx response.
 */
async function request<T>(
  endpoint: string,
  options: any = {},
  secured?: boolean,
  securedApi?: SecuredApi,
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;

  if (secured) {
    if (!securedApi) {
      throw new Error(
        "store-api: secured request requires a securedApi instance from useSecuredApi()",
      );
    }

    const method = (options.method || "GET").toUpperCase();
    const body = options.body;
    let parsedBody: any = undefined;

    if (body instanceof FormData) {
      parsedBody = body;
    } else if (typeof body === "string" && body.length > 0) {
      try {
        parsedBody = JSON.parse(body);
      } catch {
        parsedBody = body;
      }
    } else {
      parsedBody = body;
    }

    switch (method) {
      case "GET":
        return securedApi.getJson(url);
      case "POST":
        if (parsedBody instanceof FormData) {
          return securedApi.postForm(url, parsedBody);
        }

        return securedApi.postJson(url, parsedBody);
      case "PUT":
        return securedApi.putJson(url, parsedBody);
      case "PATCH":
        return securedApi.patchJson(url, parsedBody);
      case "DELETE":
        return securedApi.deleteJson(url);
      default:
        throw new Error(`Unsupported secured method: ${method}`);
    }
  }

  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${PUBLIC_KEY || ""}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error?.message || "API request failed");
  }

  return data;
}

// -- products --------------------------------------------------------------

/**
 * Variant data for a product.
 */
export interface StoreVariant {
  id: string;
  sku: string;
  title: string;
  price_cents: number;
  currency?: string; // ISO 4217 code (e.g. USD, EUR)
  image_url?: string;
  thumbnail_url?: string | null;
  weight_g?: number;
  dims_cm?: { l: number; w: number; h: number } | null;
  requires_shipping?: boolean;
  barcode?: string | null;
  compare_at_price_cents?: number | null;
  tax_code?: string | null;
  tax_rate_percentage?: number | null;
  tax_inclusive?: boolean;
  tax_display_name?: string | null;
}

/**
 * Product data shape returned by storefront endpoints.
 */
export interface StoreProduct {
  id: string;
  title: string;
  description?: string;
  status?: string;
  variants: StoreVariant[];
  image_url?: string;
  vendor?: string | null;
  tags?: string[] | null;
  handle?: string | null;
  review_count?: number;
  average_rating?: number;
}

/**
 * Retrieve all active products from the storefront API.
 *
 * @returns Promise resolving to an array of StoreProduct.
 */
export async function getProducts(): Promise<StoreProduct[]> {
  const resp = await request<{ items: StoreProduct[] }>(
    `/v1/products?limit=20&status=active&thumbnail=true`,
  );

  return (resp.items || []).filter((p) => p.variants && p.variants.length > 0);
}

/**
 * Fetch a page of active products for infinite-scroll listing.
 * Returns only thumbnails for smaller payloads.
 *
 * @param cursor - Optional pagination cursor from a previous response.
 * @param limit  - Number of products per page (default 20).
 */
export async function getProductsPage(
  cursor?: string | null,
  limit = 20,
): Promise<{ items: StoreProduct[]; pagination: { has_more: boolean; next_cursor: string | null } }> {
  const params = new URLSearchParams({ limit: String(limit), status: 'active', thumbnail: 'true' });
  if (cursor) params.set('cursor', cursor);
  const resp = await request<{ items: StoreProduct[]; pagination: { has_more: boolean; next_cursor: string | null } }>(
    `/v1/products?${params}`,
  );
  return {
    items: (resp.items || []).filter((p) => p.variants && p.variants.length > 0),
    pagination: resp.pagination,
  };
}

/**
 * Retrieve a single product by ID.
 *
 * @param id - Product identifier.
 * @returns Promise resolving to a StoreProduct.
 */
export async function getProduct(id: string): Promise<StoreProduct> {
  return request<StoreProduct>(`/v1/products/${id}`);
}

/**
 * Fetch a paginated list of products belonging to a category (by handle).
 * Uses the `/v1/categories/:handle/products` endpoint with cursor pagination.
 *
 * @param handle  - Category URL slug (e.g. "t-shirts").
 * @param cursor  - Optional pagination cursor from a previous response.
 * @param limit   - Number of products per page (default 20).
 */
export async function getCategoryProductsPage(
  handle: string,
  cursor?: string | null,
  limit = 20,
): Promise<{ items: StoreProduct[]; pagination: { has_more: boolean; next_cursor: string | null } }> {
  const params = new URLSearchParams({ limit: String(limit), thumbnail: 'true' });
  if (cursor) params.set('cursor', cursor);
  const resp = await request<{ items: StoreProduct[]; pagination: { has_more: boolean; next_cursor: string | null } }>(
    `/v1/categories/${encodeURIComponent(handle)}/products?${params}`,
  );
  return {
    items: (resp.items || []).filter((p) => p.variants && p.variants.length > 0),
    pagination: resp.pagination,
  };
}

/**
 * Search products using the new `/v1/products/search?q=...` endpoint.
 * Returns the same item list structure; q is required and will be URL-encoded.
 */
export async function searchProducts(query: string): Promise<StoreProduct[]> {
  const q = encodeURIComponent(query.trim());

  if (!q) return [];
  const resp = await request<{ items: StoreProduct[] }>(
    `/v1/products/search?q=${q}&limit=100&thumbnail=true`,
  );

  return (resp.items || []).filter((p) => p.variants && p.variants.length > 0);
}

// helper functions for cart creation and checkout, mirroring the example API client

/**
 * Response object returned for cart endpoints.
 */
export interface CartResponse {
  id: string;
  status: string;
  currency: string;
  customer_email: string;
  locale: string;
  items: any[];
  totals?: {
    subtotal_cents: number;
    discount_cents: number;
    shipping_cents: number;
    tax_cents: number;
    total_cents: number;
  };
}

/**
 * Response object for add items request.
 */
export interface AddItemsResponse {
  success: boolean;
}

/**
 * Response object for checkout creation.
 */
export interface CheckoutResponse {
  checkout_url: string;
}

/**
 * Create a new cart for a customer.
 *
 * @param email - Customer email.
 * @param locale - Optional locale string.
 * @returns Promise resolving to CartResponse.
 */
export async function createCart(
  email: string,
  locale?: string,
): Promise<CartResponse> {
  return request<CartResponse>(`/v1/carts`, {
    method: "POST",
    body: JSON.stringify({ customer_email: email, locale }),
  });
}

/**
 * Retrieve a cart by id.
 *
 * @param cartId - Cart identifier.
 * @returns Promise resolving to CartResponse.
 */
export async function getCart(cartId: string): Promise<CartResponse> {
  return request<CartResponse>(`/v1/carts/${cartId}`);
}

/**
 * Add items to an existing cart.
 *
 * @param cartId - Cart identifier.
 * @param items - Array of items (sku + quantity) to add.
 * @returns Promise resolving to CartResponse.
 */
export async function addItemsToCart(
  cartId: string,
  items: Array<{ sku: string; qty: number }>,
): Promise<CartResponse> {
  return request<CartResponse>(`/v1/carts/${cartId}/items`, {
    method: "POST",
    body: JSON.stringify({ items }),
  });
}

/**
 * Start checkout for a cart and return the redirect URL.
 *
 * @param cartId - Cart identifier.
 * @param successUrl - Redirect URL on success.
 * @param cancelUrl - Redirect URL on cancel.
 * @returns Promise resolving to CheckoutResponse.
 */
export async function checkoutCart(
  cartId: string,
  successUrl: string,
  cancelUrl: string,
): Promise<CheckoutResponse> {
  return request<CheckoutResponse>(`/v1/carts/${cartId}/checkout`, {
    method: "POST",
    body: JSON.stringify({
      success_url: successUrl,
      cancel_url: cancelUrl,
    }),
  });
}

/**
 * Update the shipping address for a cart.
 *
 * @param cartId - Cart identifier.
 * @param address - Shipping address fields.
 * @returns Promise resolving to CartResponse.
 */
export async function setShippingAddress(
  cartId: string,
  address: ShippingAddressInput,
): Promise<CartResponse> {
  return request<CartResponse>(`/v1/carts/${cartId}/shipping-address`, {
    method: "PUT",
    body: JSON.stringify(address),
  });
}

/**
 * Shipping address object used to set cart shipping information.
 */
export interface ShippingAddressInput {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postal_code: string;
  country: string;
  billing_same_as_shipping?: boolean;
}

/**
 * Individual shipping rate option for a cart.
 */
export interface AvailableShippingRateItem {
  id: string;
  display_name: string;
  description?: string;
  amount_cents: number;
  currency: string;
  min_delivery_days?: number;
  max_delivery_days?: number;
  shipping_class_id?: string | null;
}

/**
 * Response object containing available shipping rates.
 */
export interface AvailableShippingRatesResponse {
  items: AvailableShippingRateItem[];
  cart_weight_g?: number;
}

/**
 * List available shipping rates for the given cart.
 *
 * @param cartId - Cart identifier.
 * @returns Promise resolving to available shipping rates response.
 */
export async function getAvailableShippingRates(
  cartId: string,
): Promise<AvailableShippingRatesResponse> {
  return request<AvailableShippingRatesResponse>(
    `/v1/carts/${cartId}/available-shipping-rates`,
  );
}

/**
 * Request body for selecting a shipping rate on a cart.
 */
export interface SelectShippingRateBody {
  shipping_rate_id: string;
}

/**
 * Apply a shipping rate to the given cart.
 *
 * @param cartId - Cart identifier.
 * @param rateId - Shipping rate ID to apply.
 * @returns Promise resolving to CartResponse.
 */
export async function selectShippingRate(
  cartId: string,
  rateId: string,
): Promise<CartResponse> {
  return request<CartResponse>(`/v1/carts/${cartId}/shipping-rate`, {
    method: "PUT",
    body: JSON.stringify({ shipping_rate_id: rateId }),
  });
}

// ============================================================
// MULTI-REGION API HELPERS
// ============================================================

/**
 * Currency metadata used in multi-region configuration.
 */
export interface Currency {
  id: string;
  code: string;
  display_name: string;
  symbol: string;
  decimal_places: number;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
}

/**
 * Country metadata used in multi-region configuration.
 */
export interface Country {
  id: string;
  code: string;
  display_name: string;
  country_name: string;
  language_code: string;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
}

/**
 * Warehouse metadata used in multi-region configuration.
 */
export interface Warehouse {
  id: string;
  display_name: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  state?: string;
  postal_code: string;
  country_code: string;
  priority: number;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
}

/**
 * Shipping rate metadata used in multi-region configuration.
 */
export interface ShippingRate {
  id: string;
  display_name: string;
  description?: string;
  max_weight_g?: number;
  min_delivery_days?: number;
  max_delivery_days?: number;
  shipping_class_id?: string | null;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
}

/**
 * Region metadata used in multi-region configuration.
 */
export interface Region {
  id: string;
  display_name: string;
  currency_id: string;
  currency_code?: string;
  is_default: boolean;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
}

/**
 * Generic pagination response envelope used by listing endpoints.
 */
export interface PaginationResponse<T> {
  items: T[];
  pagination: {
    has_more: boolean;
    next_cursor: string | null;
  };
}

/**
 * Fetch list of regions with optional pagination.
 *
 * @param limit - Max number of regions to return.
 * @param cursor - (optional) pagination cursor.
 * @param securedApi - Secured API helper from useSecuredApi.
 * @returns Pagination response of Region.
 */
export async function getRegions(
  limit?: number,
  cursor?: string,
  securedApi?: SecuredApi,
): Promise<PaginationResponse<Region>> {
  const params = new URLSearchParams();

  if (limit) params.append("limit", limit.toString());
  if (cursor) params.append("cursor", cursor);

  return request<PaginationResponse<Region>>(
    `/v1/regions?${params.toString()}`,
    {},
    true,
    securedApi,
  );
}

/**
 * Fetch a single region by ID.
 *
 * @param id - Region identifier.
 * @param securedApi - Secured API helper from useSecuredApi.
 * @returns Region object.
 */
export async function getRegion(
  id: string,
  securedApi?: SecuredApi,
): Promise<Region> {
  return request<Region>(`/v1/regions/${id}`, {}, true, securedApi);
}

/**
 * Create a new region.
 *
 * @param data - Region creation payload.
 * @param securedApi - Secured API helper from useSecuredApi.
 * @returns Created region.
 */
export async function createRegion(
  data: {
    display_name: string;
    currency_id: string;
    is_default?: boolean;
    country_ids?: string[];
    warehouse_ids?: string[];
    shipping_rate_ids?: string[];
  },
  securedApi?: SecuredApi,
): Promise<Region> {
  return request<Region>(
    `/v1/regions`,
    {
      method: "POST",
      body: JSON.stringify(data),
    },
    true,
    securedApi,
  );
}

/**
 * Update an existing region.
 *
 * @param id - Region identifier.
 * @param data - Update payload.
 * @param securedApi - Secured API helper from useSecuredApi.
 * @returns Updated region.
 */
export async function updateRegion(
  id: string,
  data: {
    display_name?: string;
    currency_id?: string;
    is_default?: boolean;
    status?: "active" | "inactive";
  },
  securedApi?: SecuredApi,
): Promise<Region> {
  return request<Region>(
    `/v1/regions/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify(data),
    },
    true,
    securedApi,
  );
}

/**
 * Delete a region by ID.
 *
 * @param id - Region identifier.
 * @param securedApi - Secured API helper from useSecuredApi.
 * @returns Deletion result.
 */
export async function deleteRegion(
  id: string,
  securedApi?: SecuredApi,
): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>(
    `/v1/regions/${id}`,
    {
      method: "DELETE",
    },
    true,
    securedApi,
  );
}

/**
 * Fetch list of currencies with optional pagination.
 *
 * @param limit - Max number of items.
 * @param cursor - Pagination cursor.
 * @param securedApi - Secured API helper from useSecuredApi.
 * @returns Pagination response of Currency.
 */
export async function getCurrencies(
  limit?: number,
  cursor?: string,
  securedApi?: SecuredApi,
): Promise<PaginationResponse<Currency>> {
  const params = new URLSearchParams();

  if (limit) params.append("limit", limit.toString());
  if (cursor) params.append("cursor", cursor);

  return request<PaginationResponse<Currency>>(
    `/v1/regions/currencies?${params.toString()}`,
    {},
    true,
    securedApi,
  );
}

/**
 * Fetch a currency by ID.
 *
 * @param id - Currency identifier.
 * @param securedApi - Secured API helper from useSecuredApi.
 * @returns Currency object.
 */
export async function getCurrency(
  id: string,
  securedApi?: SecuredApi,
): Promise<Currency> {
  return request<Currency>(
    `/v1/regions/currencies/${id}`,
    {},
    true,
    securedApi,
  );
}

/**
 * Create a new currency entry.
 *
 * @param data - Currency creation payload.
 * @param securedApi - Secured API helper from useSecuredApi.
 * @returns Created Currency.
 */
export async function createCurrency(
  data: {
    code: string;
    display_name: string;
    symbol: string;
    decimal_places?: number;
  },
  securedApi?: SecuredApi,
): Promise<Currency> {
  return request<Currency>(
    `/v1/regions/currencies`,
    {
      method: "POST",
      body: JSON.stringify(data),
    },
    true,
    securedApi,
  );
}

/**
 * Update an existing currency.
 *
 * @param id - Currency identifier.
 * @param data - Partial currency update payload.
 * @param securedApi - Secured API helper from useSecuredApi.
 * @returns Updated Currency.
 */
export async function updateCurrency(
  id: string,
  data: {
    display_name?: string;
    symbol?: string;
    decimal_places?: number;
    status?: "active" | "inactive";
  },
  securedApi?: SecuredApi,
): Promise<Currency> {
  return request<Currency>(
    `/v1/regions/currencies/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify(data),
    },
    true,
    securedApi,
  );
}

/**
 * Delete a currency by ID.
 *
 * @param id - Currency identifier.
 * @param securedApi - Secured API helper from useSecuredApi.
 * @returns Deletion result.
 */
export async function deleteCurrency(
  id: string,
  securedApi?: SecuredApi,
): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>(
    `/v1/regions/currencies/${id}`,
    {
      method: "DELETE",
    },
    true,
    securedApi,
  );
}

// Countries
/**
 * Fetch list of countries with optional pagination.
 *
 * @param limit - Max number of items.
 * @param cursor - Pagination cursor.
 * @param securedApi - Secured API helper from useSecuredApi.
 * @returns Pagination response of Country.
 */
export async function getCountries(
  limit?: number,
  cursor?: string,
  securedApi?: SecuredApi,
): Promise<PaginationResponse<Country>> {
  const params = new URLSearchParams();

  if (limit) params.append("limit", limit.toString());
  if (cursor) params.append("cursor", cursor);

  return request<PaginationResponse<Country>>(
    `/v1/regions/countries?${params.toString()}`,
    {},
    true,
    securedApi,
  );
}

export async function getCountry(
  id: string,
  securedApi?: SecuredApi,
): Promise<Country> {
  return request<Country>(`/v1/regions/countries/${id}`, {}, true, securedApi);
}

/**
 * Create a new country entry.
 *
 * @param data - Country creation payload.
 * @param securedApi - Secured API helper from useSecuredApi.
 * @returns Created Country.
 */
export async function createCountry(
  data: {
    code: string;
    display_name: string;
    country_name: string;
    language_code?: string;
  },
  securedApi?: SecuredApi,
): Promise<Country> {
  return request<Country>(
    `/v1/regions/countries`,
    {
      method: "POST",
      body: JSON.stringify(data),
    },
    true,
    securedApi,
  );
}

/**
 * Update a country by ID.
 *
 * @param id - Country identifier.
 * @param data - Partial country update payload.
 * @param securedApi - Secured API helper from useSecuredApi.
 * @returns Updated Country.
 */
export async function updateCountry(
  id: string,
  data: {
    display_name?: string;
    country_name?: string;
    language_code?: string;
    status?: "active" | "inactive";
  },
  securedApi?: SecuredApi,
): Promise<Country> {
  return request<Country>(
    `/v1/regions/countries/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify(data),
    },
    true,
    securedApi,
  );
}

export async function deleteCountry(
  id: string,
  securedApi?: SecuredApi,
): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>(
    `/v1/regions/countries/${id}`,
    {
      method: "DELETE",
    },
    true,
    securedApi,
  );
}

// Warehouses
/**
 * Fetch list of warehouses with optional pagination.
 *
 * @param limit - Max number of items.
 * @param cursor - Pagination cursor.
 * @param securedApi - Secured API helper from useSecuredApi.
 * @returns Pagination response of Warehouse.
 */
export async function getWarehouses(
  limit?: number,
  cursor?: string,
  securedApi?: SecuredApi,
): Promise<PaginationResponse<Warehouse>> {
  const params = new URLSearchParams();

  if (limit) params.append("limit", limit.toString());
  if (cursor) params.append("cursor", cursor);

  return request<PaginationResponse<Warehouse>>(
    `/v1/regions/warehouses?${params.toString()}`,
    {},
    true,
    securedApi,
  );
}

export async function getWarehouse(
  id: string,
  securedApi?: SecuredApi,
): Promise<Warehouse> {
  return request<Warehouse>(
    `/v1/regions/warehouses/${id}`,
    {},
    true,
    securedApi,
  );
}

/**
 * Create a new warehouse.
 *
 * @param data - Warehouse creation payload.
 * @param securedApi - Secured API helper from useSecuredApi.
 * @returns Created Warehouse.
 */
export async function createWarehouse(
  data: {
    display_name: string;
    address_line1: string;
    address_line2?: string;
    city: string;
    state?: string;
    postal_code: string;
    country_code: string;
    priority?: number;
  },
  securedApi?: SecuredApi,
): Promise<Warehouse> {
  return request<Warehouse>(
    `/v1/regions/warehouses`,
    {
      method: "POST",
      body: JSON.stringify(data),
    },
    true,
    securedApi,
  );
}

export async function updateWarehouse(
  id: string,
  data: {
    display_name?: string;
    address_line1?: string;
    address_line2?: string | null;
    city?: string;
    state?: string | null;
    postal_code?: string;
    country_code?: string;
    priority?: number;
    status?: "active" | "inactive";
  },
  securedApi?: SecuredApi,
): Promise<Warehouse> {
  return request<Warehouse>(
    `/v1/regions/warehouses/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify(data),
    },
    true,
    securedApi,
  );
}

export async function deleteWarehouse(
  id: string,
  securedApi?: SecuredApi,
): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>(
    `/v1/regions/warehouses/${id}`,
    {
      method: "DELETE",
    },
    true,
    securedApi,
  );
}

/**
 * Shipping class metadata used for shipping rate calculations.
 */
/**
 * Shipping class metadata used in multi-region configuration.
 */
export interface ShippingClass {
  id: string;
  code: string;
  display_name: string;
  description: string | null;
  resolution: "exclusive" | "additive";
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
}

/**
 * Fetch shipping classes with optional pagination.
 *
 * @param limit - Max number of items.
 * @param cursor - Pagination cursor.
 * @param securedApi - Secured API helper from useSecuredApi.
 * @returns Pagination response of ShippingClass.
 */
export async function getShippingClasses(
  limit?: number,
  cursor?: string,
  securedApi?: SecuredApi,
): Promise<PaginationResponse<ShippingClass>> {
  const params = new URLSearchParams();

  if (limit) params.append("limit", limit.toString());
  if (cursor) params.append("cursor", cursor);

  return request<PaginationResponse<ShippingClass>>(
    `/v1/regions/shipping-classes?${params.toString()}`,
    {},
    true,
    securedApi,
  );
}

/**
 * Fetch a shipping class by ID.
 *
 * @param id - Shipping class identifier.
 * @param securedApi - Secured API helper from useSecuredApi.
 * @returns ShippingClass object.
 */
export async function getShippingClass(
  id: string,
  securedApi?: SecuredApi,
): Promise<ShippingClass> {
  return request<ShippingClass>(
    `/v1/regions/shipping-classes/${id}`,
    {},
    true,
    securedApi,
  );
}

/**
 * Create a new shipping class.
 *
 * @param data - Shipping class creation payload.
 * @param securedApi - Secured API helper from useSecuredApi.
 * @returns Created ShippingClass.
 */
export async function createShippingClass(
  data: {
    code: string;
    display_name: string;
    description?: string;
    resolution?: "exclusive" | "additive";
  },
  securedApi?: SecuredApi,
): Promise<ShippingClass> {
  return request<ShippingClass>(
    `/v1/regions/shipping-classes`,
    {
      method: "POST",
      body: JSON.stringify(data),
    },
    true,
    securedApi,
  );
}

/**
 * Update an existing shipping class.
 *
 * @param id - Shipping class identifier.
 * @param data - Partial shipping class update payload.
 * @param securedApi - Secured API helper from useSecuredApi.
 * @returns Updated ShippingClass.
 */
export async function updateShippingClass(
  id: string,
  data: {
    display_name?: string;
    description?: string | null;
    resolution?: "exclusive" | "additive";
    status?: "active" | "inactive";
  },
  securedApi?: SecuredApi,
): Promise<ShippingClass> {
  return request<ShippingClass>(
    `/v1/regions/shipping-classes/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify(data),
    },
    true,
    securedApi,
  );
}

/**
 * Delete an existing shipping class.
 *
 * @param id - Shipping class identifier.
 * @param securedApi - Secured API helper from useSecuredApi.
 * @returns Deletion result.
 */
export async function deleteShippingClass(
  id: string,
  securedApi?: SecuredApi,
): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>(
    `/v1/regions/shipping-classes/${id}`,
    {
      method: "DELETE",
    },
    true,
    securedApi,
  );
}

// Shipping Rates
/**
 * Fetch shipping rates with optional pagination.
 *
 * @param limit - Max number of items.
 * @param cursor - Pagination cursor.
 * @param securedApi - Secured API helper from useSecuredApi.
 * @returns Pagination response of ShippingRate.
 */
export async function getShippingRates(
  limit?: number,
  cursor?: string,
  securedApi?: SecuredApi,
): Promise<PaginationResponse<ShippingRate>> {
  const params = new URLSearchParams();

  if (limit) params.append("limit", limit.toString());
  if (cursor) params.append("cursor", cursor);

  return request<PaginationResponse<ShippingRate>>(
    `/v1/regions/shipping-rates?${params.toString()}`,
    {},
    true,
    securedApi,
  );
}

/**
 * Fetch a shipping rate by ID.
 *
 * @param id - Shipping rate identifier.
 * @param securedApi - Secured API helper from useSecuredApi.
 * @returns ShippingRate object.
 */
export async function getShippingRate(
  id: string,
  securedApi?: SecuredApi,
): Promise<ShippingRate> {
  return request<ShippingRate>(
    `/v1/regions/shipping-rates/${id}`,
    {},
    true,
    securedApi,
  );
}

/**
 * Create a new shipping rate.
 *
 * @param data - Shipping rate creation payload.
 * @param securedApi - Secured API helper from useSecuredApi.
 * @returns Created ShippingRate.
 */
export async function createShippingRate(
  data: {
    display_name: string;
    description?: string;
    max_weight_g?: number;
    min_delivery_days?: number;
    max_delivery_days?: number;
  },
  securedApi?: SecuredApi,
): Promise<ShippingRate> {
  return request<ShippingRate>(
    `/v1/regions/shipping-rates`,
    {
      method: "POST",
      body: JSON.stringify(data),
    },
    true,
    securedApi,
  );
}

/**
 * Update an existing shipping rate.
 *
 * @param id - Shipping rate identifier.
 * @param data - Partial shipping rate update payload.
 * @param securedApi - Secured API helper from useSecuredApi.
 * @returns Updated ShippingRate.
 */
export async function updateShippingRate(
  id: string,
  data: {
    display_name?: string;
    description?: string | null;
    max_weight_g?: number | null;
    min_delivery_days?: number | null;
    max_delivery_days?: number | null;
    status?: "active" | "inactive";
  },
  securedApi?: SecuredApi,
): Promise<ShippingRate> {
  return request<ShippingRate>(
    `/v1/regions/shipping-rates/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify(data),
    },
    true,
    securedApi,
  );
}

/**
 * Delete an existing shipping rate.
 *
 * @param id - Shipping rate identifier.
 * @param securedApi - Secured API helper from useSecuredApi.
 * @returns Deletion result.
 */
export async function deleteShippingRate(
  id: string,
  securedApi?: SecuredApi,
): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>(
    `/v1/regions/shipping-rates/${id}`,
    {
      method: "DELETE",
    },
    true,
    securedApi,
  );
}
