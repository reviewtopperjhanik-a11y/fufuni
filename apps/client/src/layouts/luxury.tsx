/**
 * Copyright (c) 2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 */

import type React from "react";
import { useState } from "react";

import { Navbar } from "@/components/navbar";
import { CartDrawer } from "@/components/cart-drawer";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { Footer } from "@/components/footer";

/**
 * LuxuryLayout — full-bleed layout for luxury/editorial pages.
 *
 * Differences from DefaultLayout:
 * - No horizontal padding on <main> (components manage their own max-width)
 * - Uses the dark luxury Footer instead of the standard one
 * - Still includes Navbar, CartDrawer and ThemeSwitcher
 */
export default function LuxuryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isCartOpen, setIsCartOpen] = useState(false);

  return (
    <div className="relative flex flex-col min-h-screen">
      <Navbar onCartOpen={() => setIsCartOpen(true)} />
      <CartDrawer isOpen={isCartOpen} onClose={setIsCartOpen} />
      <main className="w-full grow pt-16">{children}</main>
      <Footer />
      <ThemeSwitcher />
    </div>
  );
}
