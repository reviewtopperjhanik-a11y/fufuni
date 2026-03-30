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

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Card, Radio, RadioGroup } from "@heroui/react";

import { useAuth } from "@/authentication";
import { getApiBase } from "@/lib/api-base";
import { setShippingAddress } from "@/lib/store-api";

interface SavedAddress {
  id: string;
  label: string | null;
  is_default: number;
  name: string | null;
  line1: string;
  line2: string | null;
  city: string;
  state: string | null;
  postal_code: string;
  country: string;
}

interface SavedAddressesSelectorProps {
  cartId: string;
  /** Called with the updated cart once the selected address has been saved. */
  onSuccess: (cart: any) => void;
  /** Called when the user wants to enter a new/different address manually. */
  onAddNew: () => void;
}

/**
 * Fetches the authenticated customer's saved addresses and lets them pick one.
 * On confirm it persists the choice via setShippingAddress and calls onSuccess.
 * If no addresses are stored it automatically falls through to onAddNew.
 */
export function SavedAddressesSelector({
  cartId,
  onSuccess,
  onAddNew,
}: SavedAddressesSelectorProps) {
  const { t } = useTranslation();
  const auth = useAuth() as any;
  const apiBase = getApiBase();

  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth?.getJson) {
      setLoading(false);
      return;
    }
    auth
      .getJson(`${apiBase}/v1/me/addresses`)
      .then((data: { items: SavedAddress[] }) => {
        const items = data.items ?? [];
        setAddresses(items);
        if (items.length === 0) {
          // No saved addresses — skip the selector and go straight to the form
          onAddNew();
          return;
        }
        // Pre-select the default address, or the most recent one
        const def = items.find((a) => a.is_default === 1) ?? items[0];
        setSelectedId(def.id);
      })
      .catch((err: any) => {
        console.error("Failed to load saved addresses:", err);
        // On error fall through to manual form
        onAddNew();
      })
      .finally(() => setLoading(false));
  }, []);

  const handleConfirm = async () => {
    const addr = addresses.find((a) => a.id === selectedId);
    if (!addr) return;

    setSaving(true);
    setError(null);
    try {
      const cart = await setShippingAddress(cartId, {
        name: addr.name ?? "",
        line1: addr.line1,
        line2: addr.line2 ?? "",
        city: addr.city,
        state: addr.state ?? "",
        postal_code: addr.postal_code,
        country: addr.country,
        billing_same_as_shipping: true,
      });
      onSuccess(cart);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className="w-full">
        <Card.Content className="py-6 text-center">
          <p className="text-default-500 text-sm">{t("loading")}</p>
        </Card.Content>
      </Card>
    );
  }

  if (addresses.length === 0) return null;

  return (
    <Card className="w-full">
      <Card.Header>
        <h2 className="text-lg font-semibold">
          {t("checkout-saved-addresses")}
        </h2>
      </Card.Header>
      <Card.Content className="space-y-4">
        <RadioGroup
          value={selectedId ?? ""}
          onChange={setSelectedId}
          className="space-y-2"
        >
          {addresses.map((addr) => (
            <div
              key={addr.id}
              className={`flex items-start gap-3 p-4 rounded-lg border-2 transition cursor-pointer ${
                selectedId === addr.id
                  ? "border-primary bg-primary-50"
                  : "border-default-200 hover:border-default-300"
              }`}
              onClick={() => setSelectedId(addr.id)}
            >
              <Radio value={addr.id} className="mt-0.5 shrink-0">
                <Radio.Control>
                  <Radio.Indicator />
                </Radio.Control>
              </Radio>
              <div className="flex-1 min-w-0 text-sm">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-default-900">{addr.name}</p>
                  {addr.label && (
                    <span className="text-xs text-default-400">
                      ({addr.label})
                    </span>
                  )}
                  {addr.is_default === 1 && (
                    <span className="text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full">
                      {t("checkout-default-address")}
                    </span>
                  )}
                </div>
                <p className="text-default-500 mt-0.5">
                  {addr.line1}
                  {addr.line2 ? `, ${addr.line2}` : ""}
                </p>
                <p className="text-default-500">
                  {addr.postal_code} {addr.city}
                  {addr.state ? `, ${addr.state}` : ""} — {addr.country}
                </p>
              </div>
            </div>
          ))}
        </RadioGroup>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            variant="primary"
            className="flex-1"
            isDisabled={!selectedId || saving}
            isPending={saving}
            onPress={handleConfirm}
          >
            {t("checkout-use-this-address")}
          </Button>
          <Button variant="outline" isDisabled={saving} onPress={onAddNew}>
            {t("checkout-use-different-address")}
          </Button>
        </div>
      </Card.Content>
    </Card>
  );
}
