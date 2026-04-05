/**
 * Copyright (c) 2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 *
 * Global context for the cart drawer open/close state.
 * Allows any component (ProductCard, ProductCardFull, etc.) to
 * open the drawer after addItem() without prop drilling.
 */
import React, { createContext, useContext, useState, useCallback } from 'react';

interface CartDrawerContextType {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const CartDrawerContext = createContext<CartDrawerContextType | null>(null);

export function CartDrawerProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  return (
    <CartDrawerContext.Provider value={{ isOpen, open, close }}>
      {children}
    </CartDrawerContext.Provider>
  );
}

export function useCartDrawer(): CartDrawerContextType {
  const ctx = useContext(CartDrawerContext);
  if (!ctx) throw new Error('useCartDrawer must be used inside <CartDrawerProvider>');
  return ctx;
}
