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

import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  RefreshCw,
  Plus,
  Trash2,
  Copy,
  Check,
  AlertCircle,
  CheckCircle,
  Clock,
  RotateCw,
  FileCode,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, Modal, useOverlayState } from "@heroui/react";
import clsx from "clsx";

import { useSecuredApi } from "@/authentication";
import { getApiBase } from "@/lib/api-base";
import DefaultLayout from "@/layouts/default";

/**
 * Predefined events that can be subscribed to when creating or editing a
 * webhook. The `value` is sent to the backend; `label` and `description`
 * are i18n keys resolved via `t()` in the render.
 */
const WEBHOOK_EVENTS = [
  {
    value: "order.created",
    label: "admin-webhooks-event-order-created",
    description: "admin-webhooks-event-order-created-desc",
  },
  {
    value: "order.updated",
    label: "admin-webhooks-event-order-updated",
    description: "admin-webhooks-event-order-updated-desc",
  },
  {
    value: "order.shipped",
    label: "admin-webhooks-event-order-shipped",
    description: "admin-webhooks-event-order-shipped-desc",
  },
  {
    value: "order.refunded",
    label: "admin-webhooks-event-order-refunded",
    description: "admin-webhooks-event-order-refunded-desc",
  },
  {
    value: "inventory.low",
    label: "admin-webhooks-event-inventory-low",
    description: "admin-webhooks-event-inventory-low-desc",
  },
  {
    value: "order.*",
    label: "admin-webhooks-event-order-all",
    description: "admin-webhooks-event-order-all-desc",
  },
  {
    value: "ai_tokens.key_created",
    label: "admin-webhooks-event-ai-tokens-key-created",
    description: "admin-webhooks-event-ai-tokens-key-created-desc",
  },
  {
    value: "ai_tokens.credited",
    label: "admin-webhooks-event-ai-tokens-credited",
    description: "admin-webhooks-event-ai-tokens-credited-desc",
  },
  {
    value: "ai_tokens.*",
    label: "admin-webhooks-event-ai-tokens-all",
    description: "admin-webhooks-event-ai-tokens-all-desc",
  },
  {
    value: "*",
    label: "admin-webhooks-event-all",
    description: "admin-webhooks-event-all-desc",
  },
] as const;

/** HTTP headers included in every webhook delivery. Values shown are examples. */
const EXAMPLE_HTTP_HEADERS: [string, string][] = [
  ["Content-Type", "application/json"],
  [
    "X-Fufuni-Signature",
    "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
  ],
  ["X-Fufuni-Timestamp", "1748000000"],
  ["X-Fufuni-Delivery-Id", "550e8400-e29b-41d4-a716-446655440000"],
  ["User-Agent", "Fufuni-Webhook/1.0"],
];

const _BASE_ORDER = {
  id: "9a8b7c6d-5e4f-3a2b-1c0d-9e8f7a6b5c4d",
  number: 1042,
  customer_email: "customer@example.com",
  customer_id: "cus_AbCdEf123456",
  shipping: {
    name: "Jean Dupont",
    phone: "+33612345678",
    address: {
      line1: "12 rue de la Paix",
      line2: null,
      city: "Paris",
      postal_code: "75001",
      state: null,
      country: "FR",
    },
  },
  stripe: {
    checkout_session_id: "cs_test_a1b2c3d4e5f6",
    payment_intent_id: "pi_test_a1b2c3d4e5f6",
  },
  items: [{ sku: "1M", title: "AI Tokens — 1M", qty: 1, unit_price_cents: 4990 }],
  created_at: "2026-05-16T10:30:00.000Z",
};

/**
 * Realistic example payloads for each concrete event type.
 * Keys match the `value` fields in WEBHOOK_EVENTS (no wildcards).
 */
const WEBHOOK_PAYLOAD_EXAMPLES: Record<string, object> = {
  "order.created": {
    id: "550e8400-e29b-41d4-a716-446655440000",
    type: "order.created",
    created_at: "2026-05-16T10:30:00.000Z",
    data: {
      order: {
        ..._BASE_ORDER,
        status: "paid",
        amounts: {
          subtotal_cents: 4990,
          tax_cents: 998,
          shipping_cents: 490,
          total_cents: 6478,
          currency: "eur",
        },
      },
    },
  },
  "order.updated": {
    id: "550e8400-e29b-41d4-a716-446655440000",
    type: "order.updated",
    created_at: "2026-05-16T11:00:00.000Z",
    data: {
      order: {
        ..._BASE_ORDER,
        status: "processing",
        amounts: {
          subtotal_cents: 4990,
          discount_cents: 0,
          tax_cents: 998,
          taxes: [],
          shipping_cents: 490,
          total_cents: 6478,
          currency: "eur",
        },
        discount: null,
        tracking: { number: null, url: null, shipped_at: null },
      },
      previous_status: "paid",
    },
  },
  "order.shipped": {
    id: "550e8400-e29b-41d4-a716-446655440000",
    type: "order.shipped",
    created_at: "2026-05-16T14:00:00.000Z",
    data: {
      order: {
        ..._BASE_ORDER,
        status: "shipped",
        amounts: {
          subtotal_cents: 4990,
          discount_cents: 0,
          tax_cents: 998,
          taxes: [],
          shipping_cents: 490,
          total_cents: 6478,
          currency: "eur",
        },
        discount: null,
        tracking: {
          number: "1Z999AA10123456784",
          url: "https://track.carrier.com/1Z999AA10123456784",
          shipped_at: "2026-05-16T14:00:00.000Z",
        },
      },
      previous_status: "processing",
    },
  },
  "order.refunded": {
    id: "550e8400-e29b-41d4-a716-446655440000",
    type: "order.refunded",
    created_at: "2026-05-17T09:00:00.000Z",
    data: {
      order: {
        ..._BASE_ORDER,
        status: "refunded",
        amounts: {
          subtotal_cents: 4990,
          discount_cents: 0,
          tax_cents: 998,
          taxes: [],
          shipping_cents: 490,
          total_cents: 6478,
          currency: "eur",
        },
        discount: null,
        tracking: { number: null, url: null, shipped_at: null },
      },
      refund: {
        stripe_refund_id: "re_test_a1b2c3d4e5f6",
        amount_cents: 6478,
      },
    },
  },
  "inventory.low": {
    id: "550e8400-e29b-41d4-a716-446655440000",
    type: "inventory.low",
    created_at: "2026-05-16T15:30:00.000Z",
    data: { sku: "SHIRT-M-BLU", available: 3, threshold: 5 },
  },
  "ai_tokens.key_created": {
    id: "550e8400-e29b-41d4-a716-446655440000",
    type: "ai_tokens.key_created",
    created_at: "2026-05-16T10:30:00.000Z",
    data: {
      customer_id: "cus_AbCdEf123456",
      order_id: "9a8b7c6d-5e4f-3a2b-1c0d-9e8f7a6b5c4d",
      api_key: "fufkey_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789AB",
      credited_units: 1000000,
      balance_units: 1000000,
    },
  },
  "ai_tokens.credited": {
    id: "550e8400-e29b-41d4-a716-446655440000",
    type: "ai_tokens.credited",
    created_at: "2026-05-16T11:00:00.000Z",
    data: {
      customer_id: "cus_AbCdEf123456",
      order_id: "b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e",
      api_key: "fufkey_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789AB",
      credited_units: 100000,
      balance_units: 1100000,
    },
  },
};

/**
 * Basic webhook record returned in the list endpoint.
 */
interface Webhook {
  id: string;
  url: string;
  events: string[];
  status: string;
}

/**
 * Detailed webhook record used in the detail view. Includes recent delivery
 * attempts and the signing secret (rotated on demand).
 */
interface WebhookDetail extends Webhook {
  secret?: string;
  recent_deliveries: Array<{
    id: string;
    status: string;
    event_type: string;
    response_code?: number;
    attempts: number;
    created_at: string;
  }>;
  created_at: string;
}

/**
 * Page for managing webhooks: listing existing hooks, viewing details,
 * creating new subscriptions, rotating secrets, and deleting hooks.
 *
 * Utilizes react-query for data fetching and mutations, and Hero UI for the
 * modal dialogs.
 */
export default function WebhooksPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { getJson, postJson, putJson, deleteJson } = useSecuredApi();
  const createModalState = useOverlayState();
  const [selectedWebhook, setSelectedWebhook] = useState<string | null>(null);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const secretModalState = useOverlayState();
  const detailModalState = useOverlayState();

  // bumping this counter causes the query key to change, forcing a fresh network
  // request (provider caching is keyed by URL so we also append a cache-busting
  // query parameter when we call `getJson`).
  const [refreshIndex, setRefreshIndex] = useState(0);

  const examplesModalState = useOverlayState();
  const [examplesEventType, setExamplesEventType] = useState("order.created");
  const [copiedPayload, setCopiedPayload] = useState(false);

  const [newUrl, setNewUrl] = useState("");
  const [newEvents, setNewEvents] = useState<string[]>(["order.created"]);

  const apiBase = getApiBase();

  /**
   * Query for retrieving the list of webhooks. `refreshIndex` is a simple
   * counter used to bust cache when mutations change the data.
   */
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["webhooks", refreshIndex],
    queryFn: () => getJson(`${apiBase}/v1/webhooks?cb=${Date.now()}`),
  });

  const webhooks: Webhook[] = data?.items || [];

  // Manage secret modal visibility based on newSecret state
  useEffect(() => {
    if (newSecret) {
      secretModalState.open();
    } else {
      secretModalState.close();
    }
  }, [newSecret, secretModalState]);

  /**
   * Query for fetching the details of a single webhook when one is selected.
   * Disabled when `selectedWebhook` is null.
   */
  const { data: webhookDetail } = useQuery<WebhookDetail | null>({
    queryKey: ["webhook", selectedWebhook],
    queryFn: () =>
      selectedWebhook
        ? getJson(`${apiBase}/v1/webhooks/${selectedWebhook}`)
        : null,
    enabled: !!selectedWebhook,
  });

  // Update detail modal state when webhook is selected
  useEffect(() => {
    if (selectedWebhook) {
      detailModalState.open();
    } else {
      detailModalState.close();
    }
  }, [selectedWebhook, detailModalState]);

  /**
   * Mutation used to create a new webhook. On success it resets the creation
   * form, closes the modal, and displays the new secret if one was returned.
   */
  const createMutation = useMutation({
    mutationFn: (data: { url: string; events: string[] }) =>
      postJson(`${apiBase}/v1/webhooks`, data),
    onSuccess: (result: any) => {
      // bump the counter rather than relying solely on invalidateQueries so that
      // the url used by getJson is unique and bypasses the provider cache.
      setRefreshIndex((i) => i + 1);
      createModalState.close();
      setNewUrl("");
      setNewEvents(["order.created"]);
      setNewSecret(result.secret);
      secretModalState.open();
    },
  });

  /**
   * Mutation for updating an existing webhook record (status, etc.). After
   * success it invalidates both the list and detail queries.
   */
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      putJson(`${apiBase}/v1/webhooks/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      queryClient.invalidateQueries({ queryKey: ["webhook", selectedWebhook] });
    },
  });

  /**
   * Mutation for deleting a webhook. Clears the selected webhook and refreshes
   * the list on success.
   */
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteJson(`${apiBase}/v1/webhooks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      setSelectedWebhook(null);
    },
  });

  /**
   * Mutation that rotates a webhook's signing secret and shows the new value
   * in the secret modal.
   */
  const rotateSecretMutation = useMutation({
    mutationFn: (id: string) =>
      postJson(`${apiBase}/v1/webhooks/${id}/rotate-secret`, {}),
    onSuccess: (result: any) => {
      setNewSecret(result.secret);
    },
  });

  /**
   * Form submit handler for creating a webhook. Validates required fields and
   * triggers the creation mutation.
   *
   * @param e - form event
   */
  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl || newEvents.length === 0) return;
    createMutation.mutate({ url: newUrl, events: newEvents });
  };

  /**
   * Copy a webhook secret to the clipboard and show a temporary confirmation
   * indicator.
   *
   * @param secret - text to copy
   */
  const copySecret = async (secret: string) => {
    await navigator.clipboard.writeText(secret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  /**
   * Add or remove an event from the set of events selected in the create form.
   *
   * @param event - event value to toggle
   */
  const toggleEvent = (event: string) => {
    if (newEvents.includes(event)) {
      setNewEvents(newEvents.filter((e) => e !== event));
    } else {
      setNewEvents([...newEvents, event]);
    }
  };

  return (
    <DefaultLayout>
      <div className="px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 h-9">
          <h1
            className="text-lg font-semibold"
            style={{ color: "var(--text)" }}
          >
            {t("admin-webhooks-title")}
          </h1>
          <div className="flex items-center gap-2">
            <button
              className="p-2 rounded hover:bg-(--bg-hover) transition-colors disabled:opacity-50"
              disabled={isFetching}
              style={{ color: "var(--text-muted)" }}
              onClick={() => setRefreshIndex((i) => i + 1)}
            >
              <RefreshCw
                className={isFetching ? "animate-spin" : ""}
                size={16}
              />
            </button>
            <button
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded hover:bg-(--bg-hover) transition-colors"
              style={{ color: "var(--text-muted)" }}
              onClick={() => examplesModalState.open()}
            >
              <FileCode size={15} />
              {t("admin-webhooks-examples-btn")}
            </button>
            <Button
              className="inline-flex items-center gap-1.5"
              size="sm"
              variant="primary"
              onPress={() => createModalState.open()}
            >
              <Plus size={16} />
              {t("admin-webhooks-btn-add")}
            </Button>
          </div>
        </div>

        {/* List */}
        <div
          className="rounded overflow-hidden"
          style={{
            background: "var(--bg-content)",
            border: "1px solid var(--border)",
          }}
        >
          {isLoading ? (
            <div className="py-12 flex items-center justify-center">
              <Loader2
                className="animate-spin"
                size={20}
                style={{ color: "var(--text-muted)" }}
              />
            </div>
          ) : webhooks.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {t("admin-webhooks-empty")}
              </p>
              <p
                className="text-xs mt-1"
                style={{ color: "var(--text-muted)" }}
              >
                {t("admin-webhooks-empty-help")}
              </p>
            </div>
          ) : (
            <table className="w-full table-fixed">
              <thead>
                <tr
                  className="text-left text-xs font-medium uppercase tracking-wide"
                  style={{
                    color: "var(--text-muted)",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <th className="px-4 py-3">{t("admin-webhooks-col-url")}</th>
                  <th className="px-4 py-3">
                    {t("admin-webhooks-col-events")}
                  </th>
                  <th className="px-4 py-3">{t("status")}</th>
                </tr>
              </thead>
              <tbody
                className="divide-y"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                {webhooks.map((webhook) => (
                  <tr
                    key={webhook.id}
                    className="cursor-pointer transition-colors hover:bg-(--bg-hover)"
                    onClick={() => setSelectedWebhook(webhook.id)}
                  >
                    <td className="px-4 py-4  text-sm break-all">
                      {webhook.url}
                    </td>
                    <td
                      className="px-4 py-4 text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {webhook.events.join(", ")}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={clsx(
                          "text-xs px-2 py-0.5 rounded",
                          webhook.status === "active"
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
                        )}
                      >
                        {webhook.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Create Modal */}
        <Modal state={createModalState}>
          <Modal.Backdrop>
            <Modal.Container size="md">
              <Modal.Dialog>
                <Modal.Header>{t("admin-webhooks-modal-title")}</Modal.Header>
                <Modal.Body>
                  <form
                    data-webhook-create
                    className="space-y-4"
                    onSubmit={handleCreate}
                  >
                    <div>
                      <label
                        className="block text-xs font-medium uppercase tracking-wide mb-2"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {t("admin-webhooks-field-endpoint")}
                      </label>
                      <input
                        required
                        className="w-full px-3 py-2 text-sm  rounded-lg focus:outline-none focus:ring-2"
                        placeholder="https://your-server.com/webhook"
                        style={{
                          background: "var(--bg-card)",
                          border: "1px solid var(--border)",
                          color: "var(--text)",
                        }}
                        type="url"
                        value={newUrl}
                        onChange={(e) => setNewUrl(e.target.value)}
                      />
                    </div>

                    <div>
                      <label
                        className="block text-xs font-medium uppercase tracking-wide mb-2"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {t("admin-webhooks-field-events")}
                      </label>
                      <div
                        className="space-y-2 max-h-48 overflow-y-auto p-3 rounded-lg"
                        style={{ border: "1px solid var(--border)" }}
                      >
                        {WEBHOOK_EVENTS.map((event) => (
                          <label
                            key={event.value}
                            className="flex items-start gap-3 p-2 rounded-lg cursor-pointer transition-colors hover:bg-(--bg-hover)"
                          >
                            <input
                              checked={newEvents.includes(event.value)}
                              className="mt-0.5"
                              type="checkbox"
                              onChange={() => toggleEvent(event.value)}
                            />
                            <div>
                              <p className="text-sm ">{t(event.label)}</p>
                              <p
                                className="text-xs"
                                style={{ color: "var(--text-muted)" }}
                              >
                                {t(event.description)}
                              </p>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button onPress={() => createModalState.close()}>
                        {t("cancel")}
                      </Button>
                      <Button
                        isDisabled={
                          createMutation.isPending || newEvents.length === 0
                        }
                        variant="primary"
                        onPress={() => {
                          const formElement = document.querySelector(
                            "form[data-webhook-create]",
                          );

                          if (formElement instanceof HTMLFormElement) {
                            formElement.requestSubmit();
                          }
                        }}
                      >
                        {createMutation.isPending
                          ? t("admin-webhooks-creating")
                          : t("admin-webhooks-btn-create")}
                      </Button>
                    </div>
                  </form>
                </Modal.Body>
              </Modal.Dialog>
            </Modal.Container>
          </Modal.Backdrop>
        </Modal>

        {/* Secret Display Modal */}
        <Modal state={secretModalState}>
          <Modal.Backdrop>
            <Modal.Container size="sm">
              <Modal.Dialog>
                <Modal.Header>{t("admin-webhooks-secret-title")}</Modal.Header>
                <Modal.Body>
                  <div className="space-y-4">
                    <div
                      className="p-3 rounded-lg"
                      style={{ border: "1px solid var(--border)" }}
                    >
                      <p
                        className="text-xs font-medium mb-2"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {t("admin-webhooks-secret-savehint")}
                      </p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1  text-xs break-all">
                          {newSecret}
                        </code>
                        <button
                          className="p-2 rounded-lg hover:bg-(--bg-hover) shrink-0"
                          style={{ color: "var(--text-muted)" }}
                          onClick={() => copySecret(newSecret!)}
                        >
                          {copiedSecret ? (
                            <Check className="text-green-500" size={16} />
                          ) : (
                            <Copy size={16} />
                          )}
                        </button>
                      </div>
                    </div>
                    <p
                      className="text-xs "
                      style={{ color: "var(--text-muted)" }}
                    >
                      {t("admin-webhooks-secret-note")}
                    </p>
                    <Button
                      className="w-full"
                      variant="primary"
                      onPress={() => setNewSecret(null)}
                    >
                      {t("done")}
                    </Button>
                  </div>
                </Modal.Body>
              </Modal.Dialog>
            </Modal.Container>
          </Modal.Backdrop>
        </Modal>

        {/* Detail modal */}
        <Modal state={detailModalState}>
          <Modal.Backdrop>
            <Modal.Container size="lg">
              <Modal.Dialog>
                <Modal.Header>{t("admin-webhooks-detail-title")}</Modal.Header>
                <Modal.Body>
                  {webhookDetail && (
                    <div className="space-y-5">
                      {/* URL & Status */}
                      <div
                        className="p-3 rounded-lg"
                        style={{ border: "1px solid var(--border)" }}
                      >
                        <h4
                          className="text-xs font-medium uppercase tracking-wide mb-2"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {t("admin-webhooks-field-endpoint")}
                        </h4>
                        <p className=" text-sm break-all">
                          {webhookDetail.url}
                        </p>
                        <div
                          className="mt-3 pt-3 border-t"
                          style={{ borderColor: "var(--border-subtle)" }}
                        >
                          <h4
                            className="text-xs font-medium uppercase tracking-wide mb-2"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            {t("status")}
                          </h4>
                          <select
                            className="px-3 py-2 text-sm  rounded-lg focus:outline-none focus:ring-2"
                            disabled={updateMutation.isPending}
                            style={{
                              background: "var(--bg-card)",
                              border: "1px solid var(--border)",
                              color: "var(--text)",
                            }}
                            value={webhookDetail.status}
                            onChange={(e) =>
                              updateMutation.mutate({
                                id: webhookDetail.id,
                                data: { status: e.target.value },
                              })
                            }
                          >
                            <option value="active">active</option>
                            <option value="disabled">disabled</option>
                          </select>
                        </div>
                      </div>

                      {/* Events */}
                      <div
                        className="p-3 rounded-lg"
                        style={{ border: "1px solid var(--border)" }}
                      >
                        <h4
                          className="text-xs font-medium uppercase tracking-wide mb-2"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {t("admin-webhooks-subscribed-events")}
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {webhookDetail.events.map((event: string) => (
                            <span
                              key={event}
                              className="px-2 py-1 text-xs  rounded-lg"
                              style={{
                                background: "var(--bg-subtle)",
                                border: "1px solid var(--border-subtle)",
                              }}
                            >
                              {event}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Recent Deliveries */}
                      <div
                        className="p-3 rounded-lg"
                        style={{ border: "1px solid var(--border)" }}
                      >
                        <h4
                          className="text-xs font-medium uppercase tracking-wide mb-3"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {t("admin-webhooks-recent-deliveries")}
                        </h4>
                        {webhookDetail.recent_deliveries.length === 0 ? (
                          <p
                            className="text-sm "
                            style={{ color: "var(--text-secondary)" }}
                          >
                            {t("admin-webhooks-no-deliveries")}
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {webhookDetail.recent_deliveries.map(
                              (
                                delivery: WebhookDetail["recent_deliveries"][number],
                              ) => (
                                <div
                                  key={delivery.id}
                                  className="flex items-center justify-between py-2 border-b last:border-0"
                                  style={{
                                    borderColor: "var(--border-subtle)",
                                  }}
                                >
                                  <div className="flex items-center gap-2">
                                    {delivery.status === "success" && (
                                      <CheckCircle
                                        className="text-green-500"
                                        size={14}
                                      />
                                    )}
                                    {delivery.status === "failed" && (
                                      <AlertCircle
                                        className="text-red-500"
                                        size={14}
                                      />
                                    )}
                                    {delivery.status === "pending" && (
                                      <Clock
                                        className="text-amber-500"
                                        size={14}
                                      />
                                    )}
                                    <span className=" text-sm">
                                      {delivery.event_type}
                                    </span>
                                  </div>
                                  <div className="text-right">
                                    <span
                                      className="text-xs "
                                      style={{ color: "var(--text-muted)" }}
                                    >
                                      {delivery.response_code &&
                                        `${delivery.response_code} · `}
                                      {delivery.attempts}{" "}
                                      {t("admin-webhooks-attempt", {
                                        count: delivery.attempts,
                                      })}
                                    </span>
                                    <p
                                      className="text-xs "
                                      style={{ color: "var(--text-muted)" }}
                                    >
                                      {new Date(
                                        delivery.created_at,
                                      ).toLocaleString()}
                                    </p>
                                  </div>
                                </div>
                              ),
                            )}
                          </div>
                        )}
                      </div>

                      {/* Footer: Timestamp + Actions */}
                      <div
                        className="flex items-center justify-between pt-4 border-t"
                        style={{ borderColor: "var(--border)" }}
                      >
                        <p
                          className="text-xs "
                          style={{ color: "var(--text-muted)" }}
                        >
                          {t("admin-webhooks-created")}{" "}
                          {new Date(webhookDetail.created_at).toLocaleString()}
                        </p>
                        <div className="flex items-center gap-3">
                          <button
                            className="inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
                            disabled={rotateSecretMutation.isPending}
                            style={{ color: "var(--text-muted)" }}
                            onClick={() => {
                              if (confirm(t("admin-webhooks-confirm-rotate"))) {
                                rotateSecretMutation.mutate(webhookDetail.id);
                              }
                            }}
                          >
                            <RotateCw size={14} />
                            {rotateSecretMutation.isPending
                              ? t("admin-webhooks-rotating")
                              : t("admin-webhooks-rotate")}
                          </button>
                          <button
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-red-500 hover:text-red-600"
                            disabled={deleteMutation.isPending}
                            onClick={() => {
                              if (confirm(t("admin-webhooks-confirm-delete"))) {
                                deleteMutation.mutate(webhookDetail.id);
                              }
                            }}
                          >
                            <Trash2 size={14} />
                            {deleteMutation.isPending
                              ? t("admin-webhooks-deleting")
                              : t("delete")}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </Modal.Body>
              </Modal.Dialog>
            </Modal.Container>
          </Modal.Backdrop>
        </Modal>
        {/* Payload Examples Modal */}
        <Modal state={examplesModalState}>
          <Modal.Backdrop>
            <Modal.Container size="lg">
              <Modal.Dialog>
                <Modal.Header>
                  {t("admin-webhooks-examples-title")}
                </Modal.Header>
                <Modal.Body>
                  <div className="space-y-4">
                    {/* Event type selector */}
                    <div>
                      <label
                        className="block text-xs font-medium uppercase tracking-wide mb-2"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {t("admin-webhooks-examples-event")}
                      </label>
                      <select
                        className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none focus:ring-2"
                        style={{
                          background: "var(--bg-card)",
                          border: "1px solid var(--border)",
                          color: "var(--text)",
                        }}
                        value={examplesEventType}
                        onChange={(e) => setExamplesEventType(e.target.value)}
                      >
                        {WEBHOOK_EVENTS.filter(
                          (ev) => !ev.value.includes("*"),
                        ).map((ev) => (
                          <option key={ev.value} value={ev.value}>
                            {t(ev.label)}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Method badge */}
                    <div className="flex items-center gap-2">
                      <span
                        className="px-2 py-0.5 text-xs font-bold rounded font-mono"
                        style={{
                          background: "var(--bg-subtle)",
                          border: "1px solid var(--border-subtle)",
                          color: "var(--text)",
                        }}
                      >
                        POST
                      </span>
                      <span
                        className="text-sm"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {t("admin-webhooks-examples-endpoint-note")}
                      </span>
                    </div>

                    {/* Headers */}
                    <div>
                      <h4
                        className="text-xs font-medium uppercase tracking-wide mb-2"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {t("admin-webhooks-examples-headers")}
                      </h4>
                      <div
                        className="rounded-lg overflow-hidden"
                        style={{ border: "1px solid var(--border)" }}
                      >
                        <pre
                          className="p-3 text-xs overflow-x-auto leading-relaxed"
                          style={{
                            background: "var(--bg-subtle)",
                            color: "var(--text)",
                          }}
                        >
                          {EXAMPLE_HTTP_HEADERS.map(
                            ([k, v]) => `${k}: ${v}`,
                          ).join("\n")}
                        </pre>
                      </div>
                    </div>

                    {/* Body */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4
                          className="text-xs font-medium uppercase tracking-wide"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {t("admin-webhooks-examples-body")}
                        </h4>
                        <button
                          className="p-1.5 rounded hover:bg-(--bg-hover)"
                          style={{ color: "var(--text-muted)" }}
                          onClick={() => {
                            const payload =
                              WEBHOOK_PAYLOAD_EXAMPLES[examplesEventType];
                            if (payload) {
                              navigator.clipboard.writeText(
                                JSON.stringify(payload, null, 2),
                              );
                              setCopiedPayload(true);
                              setTimeout(() => setCopiedPayload(false), 2000);
                            }
                          }}
                        >
                          {copiedPayload ? (
                            <Check className="text-green-500" size={14} />
                          ) : (
                            <Copy size={14} />
                          )}
                        </button>
                      </div>
                      <div
                        className="rounded-lg overflow-hidden"
                        style={{ border: "1px solid var(--border)" }}
                      >
                        <pre
                          className="p-3 text-xs overflow-x-auto overflow-y-auto max-h-72 leading-relaxed"
                          style={{
                            background: "var(--bg-subtle)",
                            color: "var(--text)",
                          }}
                        >
                          {JSON.stringify(
                            WEBHOOK_PAYLOAD_EXAMPLES[examplesEventType],
                            null,
                            2,
                          )}
                        </pre>
                      </div>
                    </div>

                    {/* Signature note */}
                    <p
                      className="text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {t("admin-webhooks-examples-note")}
                    </p>

                    <div className="flex justify-end">
                      <Button onPress={() => examplesModalState.close()}>
                        {t("done")}
                      </Button>
                    </div>
                  </div>
                </Modal.Body>
              </Modal.Dialog>
            </Modal.Container>
          </Modal.Backdrop>
        </Modal>
      </div>
    </DefaultLayout>
  );
}
