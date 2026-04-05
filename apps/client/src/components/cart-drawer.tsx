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

import { Button, Drawer } from "@heroui/react";
import { useNavigate } from "react-router-dom";

import { useCart } from "@/hooks/use-cart";
import { formatMoney } from "@/utils/currency";

interface CartDrawerProps {
  isOpen: boolean;
  onClose: (open: boolean) => void;
}

export function CartDrawer({ isOpen, onClose }: CartDrawerProps) {
  const { items, totalCents, updateQuantity, removeItem } = useCart();
  const navigate = useNavigate();

  const handleCheckout = () => {
    onClose(false);
    navigate("/cart");
  };

  const currency = items[0]?.currency ?? "EUR";
  const total = formatMoney(totalCents, currency);

  return (
    <Drawer.Backdrop isOpen={isOpen} onOpenChange={onClose}>
      <Drawer.Content placement="right" className="max-w-md w-full">
        <Drawer.Dialog className="rounded-none h-dvh">
          <Drawer.CloseTrigger />
          <Drawer.Header className="border-b border-separator">
            <Drawer.Heading className="text-2xl">
              Votre Panier
            </Drawer.Heading>
          </Drawer.Header>

          <Drawer.Body>
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-muted">
                <p className="font-sans font-light">Votre panier est vide.</p>
                <Button
                  className="uppercase tracking-widest text-xs"
                  variant="secondary"
                  onPress={() => onClose(false)}
                >
                  Continuer mes achats
                </Button>
              </div>
            ) : (
              <ul className="divide-y divide-separator">
                {items.map((item) => (
                  <li key={item.sku} className="flex gap-4 py-5">
                    {item.image_url && (
                      <img
                        alt={item.title}
                        className="w-20 h-24 object-cover shrink-0"
                        src={item.image_url}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <h5 className="font-sans text-sm leading-snug line-clamp-2">
                        {item.title}
                      </h5>
                      <p className="text-muted text-xs mt-1">
                        {formatMoney(item.price_cents, item.currency ?? "EUR")}
                      </p>
                      <div className="flex items-center gap-2 mt-3">
                        <Button
                          isIconOnly
                          size="sm"
                          variant="bordered"
                          radius="none"
                          className="w-6 h-6 min-w-0 text-xs"
                          aria-label="Diminuer la quantité"
                          onPress={() =>
                            item.qty > 1
                              ? updateQuantity(item.sku, item.qty - 1)
                              : removeItem(item.sku)
                          }
                        >
                          −
                        </Button>
                        <span className="font-sans text-sm w-4 text-center select-none">
                          {item.qty}
                        </span>
                        <Button
                          isIconOnly
                          size="sm"
                          variant="bordered"
                          radius="none"
                          className="w-6 h-6 min-w-0 text-xs"
                          aria-label="Augmenter la quantité"
                          onPress={() => updateQuantity(item.sku, item.qty + 1)}
                        >
                          +
                        </Button>
                      </div>
                    </div>
                    <p className="font-semibold text-sm shrink-0">
                      {formatMoney(item.price_cents * item.qty, item.currency ?? "EUR")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Drawer.Body>

          {items.length > 0 && (
            <Drawer.Footer className="border-t border-separator flex-col gap-4">
              <div className="flex justify-between w-full text-xl">
                <span>Total</span>
                <span>{total}</span>
              </div>
              <Button
                className="w-full bg-foreground text-background uppercase tracking-widest font-semibold h-12 "
                onPress={handleCheckout}
              >
                Commander
              </Button>
            </Drawer.Footer>
          )}
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}
