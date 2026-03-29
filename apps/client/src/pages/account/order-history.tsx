/**
 * Copyright (c) 2024-2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Card, Button, Chip, Table } from "@heroui/react";

import { useAuth } from "@/authentication";
import { getApiBase } from "@/lib/api-base";
import { ORDER_STATUS_COLORS } from "@/config/order-status";
import { LoadingPane } from "@/shared/ui/feedback/loading-pane";
import { ProductReviews } from "@/components/product-reviews";

interface OrderItem {
  sku: string;
  title: string;
  qty: number;
  unit_price_cents: number;
  product_id: string | null;
}

interface Order {
  id: string;
  number: string;
  status: string;
  currency: string;
  subtotal_cents: number;
  tax_cents: number;
  shipping_cents: number;
  total_cents: number;
  created_at: string;
  tracking_number: string | null;
  tracking_url: string | null;
  shipped_at: string | null;
  items: OrderItem[];
}

interface OrderListResponse {
  items: Order[];
  pagination: {
    hasMore: boolean;
    nextCursor: string | null;
  };
}

/**
 * Displays the paginated order history for the authenticated customer.
 */
export default function OrderHistory() {
  const { t } = useTranslation();
  const auth = useAuth() as any;
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [activeReview, setActiveReview] = useState<string | null>(null);
  const apiBase = getApiBase();

  const fetchOrders = async (nextCursor?: string) => {
    setLoading(true);
    try {
      const url = nextCursor
        ? `${apiBase}/v1/me/orders?limit=10&cursor=${encodeURIComponent(nextCursor)}`
        : `${apiBase}/v1/me/orders?limit=10`;

      const result: OrderListResponse = await auth.getJson(url);

      setOrders(result.items);
      setCursor(result.pagination.nextCursor);
      setHasMore(result.pagination.hasMore);
    } catch (error) {
      console.error("Error fetching orders:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (auth?.getJson) {
      fetchOrders();
    }
  }, [auth]);

  if (loading) {
    return <LoadingPane />;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("account-orders")}</h1>

      {orders.length === 0 ? (
        <Card>
          <Card.Content>{t("account-no-orders")}</Card.Content>
        </Card>
      ) : (
        <>
          <Table>
            <Table.Header>
              <Table.Column>{t("account-order-number")}</Table.Column>
              <Table.Column>{t("account-date")}</Table.Column>
              <Table.Column>{t("account-status")}</Table.Column>
              <Table.Column>{t("account-total")}</Table.Column>
              <Table.Column>{t("account-actions")}</Table.Column>
            </Table.Header>
            <Table.Body>
              {orders.map((order) => (
                <Table.Row key={order.id}>
                  <Table.Cell>{order.number}</Table.Cell>
                  <Table.Cell>
                    {new Date(order.created_at).toLocaleDateString()}
                  </Table.Cell>
                  <Table.Cell>
                    <Chip
                      color={
                        ORDER_STATUS_COLORS[order.status as keyof typeof ORDER_STATUS_COLORS] || "default"
                      }
                      size="sm"
                      variant="primary"
                    >
                      {order.status}
                    </Chip>
                  </Table.Cell>
                  <Table.Cell>
                    ${(order.total_cents / 100).toFixed(2)} {order.currency}
                  </Table.Cell>
                  <Table.Cell>
                    <Link to={`/account/orders/${order.number}`}>
                      <Button size="sm" variant="tertiary">
                        {t("account-view")}
                      </Button>
                    </Link>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>

          {hasMore && (
            <div className="flex justify-center">
              <Button onClick={() => fetchOrders(cursor ?? undefined)}>
                {t("account-load-more")}
              </Button>
            </div>
          )}

          {/* Review section: one entry per distinct product from delivered orders */}
          {(() => {
            const seen = new Set<string>();
            const reviewableItems = orders
              .filter((o) => o.status === "delivered")
              .flatMap((o) => o.items)
              .filter((i) => {
                if (!i.product_id || seen.has(i.product_id)) return false;
                seen.add(i.product_id);
                return true;
              });
            if (reviewableItems.length === 0) return null;
            return (
              <div className="space-y-3">
                <h2 className="text-xl font-semibold">
                  {t("account-review-delivered")}
                </h2>
                {reviewableItems.map((item) => (
                  <Card key={item.product_id}>
                    <Card.Content className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{item.title}</span>
                        <Button
                          size="sm"
                          variant="tertiary"
                          onPress={() =>
                            setActiveReview(
                              activeReview === item.product_id
                                ? null
                                : item.product_id
                            )
                          }
                        >
                          {t("reviews-write")}
                        </Button>
                      </div>
                      {activeReview === item.product_id && (
                        <ProductReviews productId={item.product_id!} />
                      )}
                    </Card.Content>
                  </Card>
                ))}
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}
