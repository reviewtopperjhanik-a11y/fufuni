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

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Input,
  Table,
  Modal,
  Card,
  Separator,
  Label,
  TextField,
  Chip,
  Pagination,
} from "@heroui/react";

import DefaultLayout from "@/layouts/default";
import { useSecuredApi } from "@/authentication";
import { getApiBase } from "@/lib/api-base";
import { SearchIcon } from "@/shared/ui/icons";
import { formatMoney } from "@/utils/currency";

// --- typings -------------------------------------------------------------
/**
 * A customer record as returned by the backend API.
 */
interface Customer {
  id: string;
  email: string;
  name?: string;
  phone?: string;
  created_at: string;
  stats: {
    order_count: number;
    total_spent_cents: number;
    last_order_at?: string;
  };
}

/**
 * A postal address associated with a customer.
 */
interface Address {
  id: string;
  label?: string;
  is_default: boolean;
  name?: string;
  company?: string;
  line1: string;
  line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
}

/**
 * A simplified order record shown in the customer detail view.
 */
interface Order {
  id: string;
  number: string;
  created_at: string;
  amounts: {
    total_cents: number;
  };
  status: string;
}

// -------------------------------------------------------------------------
/**
 * Admin interface for browsing and editing customer records, including
 * filtering, detail inspection, and inline field editing.
 */
export default function CustomersPage() {
  const { t } = useTranslation();
  const { getJson, putJson } = useSecuredApi();

  const apiBase = getApiBase();

  // list state
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [globalFilter, setGlobalFilter] = useState<string>("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [cursorHistory, setCursorHistory] = useState<Array<string | null>>([]);
  const currentPage = cursorHistory.length + 1;

  // selected customer / details
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null,
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [customerDetail, setCustomerDetail] = useState<
    (Customer & { addresses: Address[] }) | null
  >(null);
  const [customerOrders, setCustomerOrders] = useState<Order[] | null>(null);

  /**
   * Retrieve customer list from the API, optionally filtering by the current
   * search term, and update component state.
   */
  const loadCustomers = async (cursorParam: string | null = null) => {
    setLoading(true);
    try {
      let url = `${apiBase}/v1/customers?limit=10`;
      const term = globalFilter.trim();

      if (term) {
        url += `&search=${encodeURIComponent(term)}`;
      }
      if (cursorParam) {
        url += `&cursor=${encodeURIComponent(cursorParam)}`;
      }
      const resp = await getJson(url);

      setCustomers(resp.items || []);
      const pagination = resp.pagination || {};
      setHasMore(pagination.has_more ?? pagination.hasMore ?? false);
      setNextCursor(pagination.next_cursor ?? pagination.nextCursor ?? null);
    } catch (err) {
      console.error("Failed to load customers", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers(cursor);
  }, [globalFilter, cursor]);

  const goToNextPage = () => {
    if (!hasMore || !nextCursor) return;

    setCursorHistory((prev) => [...prev, cursor]);
    setCursor(nextCursor);
  };

  const goToPreviousPage = () => {
    if (cursorHistory.length === 0) return;

    const previousCursor = cursorHistory[cursorHistory.length - 1];
    setCursorHistory((prev) => prev.slice(0, -1));
    setCursor(previousCursor);
  };

  useEffect(() => {
    setCursor(null);
    setCursorHistory([]);
  }, [globalFilter]);

  /**
   * Load detailed information and recent orders for the given customer, then
   * display the detail modal.
   *
   * @param c - customer to open
   */
  const openCustomer = async (c: Customer) => {
    setSelectedCustomer(c);
    setIsModalOpen(true);
    setCustomerDetail(null);
    setCustomerOrders(null);
    try {
      const detail = await getJson(`${apiBase}/v1/customers/${c.id}`);

      setCustomerDetail(detail);
      const ordersResp = await getJson(
        `${apiBase}/v1/customers/${c.id}/orders?limit=10`,
      );

      setCustomerOrders(ordersResp.items || []);
    } catch (err) {
      console.error("Failed to load customer detail/orders", err);
    }
  };

  /**
   * Send an update for the selected customer's editable field (name or phone)
   * and update both list and detail state optimistically.
   *
   * @param field - field key to update
   * @param value - new value for the field
   */
  const updateField = async (field: "name" | "phone", value: string) => {
    if (!selectedCustomer) return;
    try {
      await putJson(`${apiBase}/v1/customers/${selectedCustomer.id}`, {
        [field]: value || undefined,
      });
      setCustomers((prev) =>
        prev.map((c) =>
          c.id === selectedCustomer.id
            ? { ...c, [field]: value || undefined }
            : c,
        ),
      );
      if (customerDetail)
        setCustomerDetail({ ...customerDetail, [field]: value || undefined });
    } catch (err) {
      console.error("Error updating customer", err);
    }
  };

  return (
    <DefaultLayout>
      <div className="px-4 py-6">
        {/* header */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold">
            {t("admin-customers-title")}
          </h1>
          <div className="flex items-center gap-2">
            <div className="relative flex flex-1">
              <Input
                className="pl-8"
                placeholder={t("search") + "..."}
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
              />
              <SearchIcon className="absolute left-2 top-1/2 transform -translate-y-1/2 pointer-events-none text-default-400 w-4 h-4" />
            </div>
          </div>
        </div>

        {/* customer list */}
        {loading ? (
          <p className="text-default-500">{t("admin-customers-loading")}</p>
        ) : customers.length === 0 ? (
          <p>{t("admin-customers-empty")}</p>
        ) : (
          <Table aria-label="Customers">
            <Table.Content
              aria-label={t("admin-customers-title")}
              selectionMode="none"
            >
              <Table.Header>
                <Table.Column isRowHeader>
                  {t("admin-customers-col-name")}
                </Table.Column>
                <Table.Column>{t("admin-customers-col-email")}</Table.Column>
                <Table.Column>{t("admin-customers-col-orders")}</Table.Column>
                <Table.Column>{t("admin-customers-col-spent")}</Table.Column>
                <Table.Column>
                  {t("admin-customers-col-first-order")}
                </Table.Column>
              </Table.Header>
              <Table.Body renderEmptyState={() => ""}>
                {customers.map((c) => (
                  <Table.Row
                    key={c.id}
                    className="cursor-pointer hover:bg-default-100 transition-colors"
                  >
                    <Table.Cell onClick={() => openCustomer(c)}>
                      {c.name || "-"}
                    </Table.Cell>
                    <Table.Cell onClick={() => openCustomer(c)}>
                      {c.email}
                    </Table.Cell>
                    <Table.Cell onClick={() => openCustomer(c)}>
                      {c.stats.order_count}
                    </Table.Cell>
                    <Table.Cell onClick={() => openCustomer(c)}>
                      {formatMoney(c.stats.total_spent_cents, "EUR")}
                    </Table.Cell>
                    <Table.Cell onClick={() => openCustomer(c)}>
                      {new Date(c.created_at).toLocaleDateString()}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Content>
            <Table.Footer>
              <div className="w-full p-2">
                <Pagination className="justify-between">
                  <Pagination.Summary>
                    {customers.length === 0
                      ? t("admin-customers-empty")
                      : `${(currentPage - 1) * 10 + 1} - ${(currentPage - 1) * 10 +
                          customers.length} / page ${currentPage}`}
                  </Pagination.Summary>
                  <Pagination.Content>
                    <Pagination.Item>
                      <Pagination.Previous
                        isDisabled={cursorHistory.length === 0}
                        onPress={goToPreviousPage}
                      >
                        <Pagination.PreviousIcon />
                        <span>{t("previous")}</span>
                      </Pagination.Previous>
                    </Pagination.Item>
                    <Pagination.Item>
                      <Pagination.Next
                        isDisabled={!hasMore}
                        onPress={goToNextPage}
                      >
                        <span>{t("next")}</span>
                        <Pagination.NextIcon />
                      </Pagination.Next>
                    </Pagination.Item>
                  </Pagination.Content>
                </Pagination>
              </div>
            </Table.Footer>
          </Table>
        )}
      </div>

      {/* customer detail modal */}
      <Modal
        isOpen={isModalOpen}
        onOpenChange={(open) => {
          setIsModalOpen(open);
          if (!open) {
            setSelectedCustomer(null);
            setCustomerDetail(null);
            setCustomerOrders(null);
          }
        }}
      >
        <Modal.Backdrop>
          <Modal.Container size="lg">
            <Modal.Dialog>
              {({ close }) => (
                <>
                  <Modal.CloseTrigger onPress={close} />
                  <Modal.Header>
                    {customerDetail?.name ||
                      selectedCustomer?.email ||
                      t("customer")}
                  </Modal.Header>
                  <Modal.Body>
                    {customerDetail && selectedCustomer ? (
                      <div className="space-y-5">
                        <div className="grid grid-cols-2 gap-5">
                          {/* Left column */}
                          <div className="space-y-4">
                            {/* Contact Info */}
                            <Card>
                              <Card.Content className="gap-4">
                                <h4 className="text-sm font-semibold">
                                  {t("admin-customers-contact-info")}
                                </h4>
                                <TextField>
                                  <Label>{t("admin-customers-col-name")}</Label>
                                  <Input
                                    defaultValue={customerDetail.name || ""}
                                    placeholder={t("customer-name-placeholder")}
                                    onBlur={(e) =>
                                      updateField("name", e.target.value || "")
                                    }
                                  />
                                </TextField>
                                <div>
                                  <Label className="text-xs">{t("admin-customers-col-email")}</Label>
                                  <div className="mt-1 px-3 py-2 rounded-lg bg-default-100 text-sm ">
                                    {customerDetail.email}
                                  </div>
                                </div>
                                <TextField>
                                  <Label>{t("account-phone")}</Label>
                                  <Input
                                    defaultValue={customerDetail.phone || ""}
                                    placeholder={t("phone-number-placeholder")}
                                    type="tel"
                                    onBlur={(e) =>
                                      updateField("phone", e.target.value || "")
                                    }
                                  />
                                </TextField>
                              </Card.Content>
                            </Card>

                            {/* Stats */}
                            <div className="grid grid-cols-2 gap-3">
                              <Card>
                                <Card.Content className="items-center justify-center py-4">
                                  <p className="text-xs text-default-500 uppercase">
                                    {t("admin-customers-orders-stat")}
                                  </p>
                                  <p className="text-2xl font-bold mt-2">
                                    {customerDetail.stats.order_count}
                                  </p>
                                </Card.Content>
                              </Card>
                              <Card>
                                <Card.Content className="items-center justify-center py-4">
                                  <p className="text-xs text-default-500 uppercase">
                                    {t("admin-customers-col-spent")}
                                  </p>
                                  <p className="text-xl font-bold mt-2">
                                    {formatMoney(
                                      customerDetail.stats.total_spent_cents,
                                      "EUR",
                                    )}
                                  </p>
                                </Card.Content>
                              </Card>
                            </div>

                            {/* Addresses */}
                            {customerDetail.addresses &&
                              customerDetail.addresses.length > 0 && (
                                <Card>
                                  <Card.Content className="gap-3">
                                    <h4 className="text-sm font-semibold">
                                      Addresses
                                    </h4>
                                    <div className="space-y-3">
                                      {customerDetail.addresses.map((addr) => (
                                        <div
                                          key={addr.id}
                                          className="space-y-2 pb-3 last:pb-0 border-b last:border-0"
                                        >
                                          <div className="flex items-center gap-2">
                                            {addr.label && (
                                              <Chip
                                                color="accent"
                                                size="sm"
                                                variant="primary"
                                              >
                                                {addr.label}
                                              </Chip>
                                            )}
                                            {addr.is_default && (
                                              <Chip
                                                size="sm"
                                                variant="secondary"
                                              >
                                                Default
                                              </Chip>
                                            )}
                                          </div>
                                          <div className="text-sm space-y-1">
                                            {addr.name && (
                                              <p className="font-medium">
                                                {addr.name}
                                              </p>
                                            )}
                                            {addr.company && (
                                              <p className="text-default-500">
                                                {addr.company}
                                              </p>
                                            )}
                                            <p>{addr.line1}</p>
                                            {addr.line2 && <p>{addr.line2}</p>}
                                            <p>
                                              {[
                                                addr.city,
                                                addr.state,
                                                addr.postal_code,
                                              ]
                                                .filter(Boolean)
                                                .join(", ")}
                                            </p>
                                            <p>{addr.country}</p>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </Card.Content>
                                </Card>
                              )}
                          </div>

                          {/* Right column - Recent Orders */}
                          <Card>
                            <Card.Content className="gap-4">
                              <h4 className="text-sm font-semibold">
                                Recent Orders
                              </h4>
                              {customerOrders && customerOrders.length > 0 ? (
                                <div className="space-y-3">
                                  {customerOrders.map((order, idx) => (
                                    <div
                                      key={order.id}
                                      className={
                                        idx !== customerOrders.length - 1
                                          ? "pb-3 border-b"
                                          : ""
                                      }
                                    >
                                      <div className="flex items-center justify-between">
                                        <div>
                                          <p className="text-sm  font-medium">
                                            {order.number}
                                          </p>
                                          <p className="text-xs text-default-500">
                                            {new Date(
                                              order.created_at,
                                            ).toLocaleDateString()}
                                          </p>
                                        </div>
                                        <div className="text-right">
                                          <p className="text-sm  font-medium">
                                            {formatMoney(
                                              order.amounts.total_cents,
                                              "EUR",
                                            )}
                                          </p>
                                          <Chip
                                            className="mt-1"
                                            size="sm"
                                            variant="secondary"
                                          >
                                            <span className="text-xs capitalize">
                                              {order.status}
                                            </span>
                                          </Chip>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-sm text-default-500">
                                  No orders yet
                                </p>
                              )}
                            </Card.Content>
                          </Card>
                        </div>

                        <Separator />

                        {/* Timestamp */}
                        <div className="text-xs text-default-500 space-y-1">
                          <p>
                            Customer since{" "}
                            {new Date(
                              selectedCustomer.created_at,
                            ).toLocaleString()}
                          </p>
                          {selectedCustomer.stats.last_order_at && (
                            <p>
                              Last order{" "}
                              {new Date(
                                selectedCustomer.stats.last_order_at,
                              ).toLocaleString()}
                            </p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p>Loading…</p>
                    )}
                  </Modal.Body>
                </>
              )}
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </DefaultLayout>
  );
}
