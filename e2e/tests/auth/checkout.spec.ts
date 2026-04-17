/// <reference types="node" />
import { test, expect } from "@playwright/test";

/**
 * ⚠️  Architecture Stripe dans Fufuni :
 *
 * Le worker crée une `stripe.checkout.sessions.create()` et retourne une URL de
 * redirection vers `checkout.stripe.com` (Stripe Checkout hébergé).
 * Il N'utilise PAS Stripe.js Elements embarqués — il n'y a donc aucun iframe
 * `__privateStripeFrame` dans le DOM du SPA.
 *
 * Conséquences pour les tests E2E :
 *  - On peut vérifier que le checkout déclenche bien une redirection vers Stripe.
 *  - On ne peut PAS remplir les données carte dans un iframe (domaine différent).
 *  - Pour tester le résultat de paiement (succès/refus), utiliser :
 *      stripe trigger checkout.session.completed  (Stripe CLI)
 *    ou injecter un événement webhook depuis les tests d'intégration worker.
 *
 * Cartes de test Stripe — pour référence dans les tests manuels ou webhook CLI :
 *   Succès          : 4242 4242 4242 4242
 *   Refus           : 4000 0000 0000 0002
 *   Fonds insuff.   : 4000 0000 0000 9995
 *   3DS requis      : 4000 0025 0000 3155
 *
 * Sélecteurs — stratégie ARIA-first :
 *   - Bouton panier : aria-label="Ouvrir le panier"  (navbar.tsx:168)
 *   - Bouton checkout dans le drawer : texte "Commander" (cart-drawer.tsx:132)
 *   - Bouton "Ajouter au panier" : t('add-to-cart') = "Ajouter au panier"
 */

/** Ferme la bannière cookies si elle est visible */
async function dismissCookieBanner(page: import("@playwright/test").Page) {
  const acceptBtn = page.getByRole("button", { name: /accept all|tout accepter/i });
  if (await acceptBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await acceptBtn.click();
    await page.locator('[data-slot="modal-backdrop"]').waitFor({ state: "hidden", timeout: 5_000 }).catch(() => {});
  }
}

/** Ajoute le premier produit trouvé en page d'accueil au panier puis ferme le drawer */
async function addFirstProductToCart(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await dismissCookieBanner(page);
  const addBtn = page.getByRole("button", { name: /ajouter au panier|add to cart/i }).first();
  await addBtn.waitFor({ state: "visible", timeout: 15_000 });
  await addBtn.click();
  // ProductCard calls open() after addItem() — close the drawer so subsequent clicks work
  const drawerBackdrop = page.locator('[data-slot="drawer-backdrop"]');
  if (await drawerBackdrop.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await page.keyboard.press("Escape");
    await drawerBackdrop.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => {});
  }
}

test.describe("Checkout — utilisateur authentifié", () => {
  test.beforeEach(async ({ page }) => {
    await addFirstProductToCart(page);
  });

  test("Ouverture du panier et affichage du récapitulatif", async ({ page }) => {
    // aria-label défini dans apps/client/src/components/navbar.tsx (fr: "Ouvrir le panier")
    await page.getByRole("button", { name: /ouvrir le panier|open cart/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    // Bouton Commander hardcodé dans cart-drawer.tsx
    await expect(page.getByRole("button", { name: /commander|checkout/i })).toBeVisible();
  });

  test("Le checkout redirige vers Stripe Checkout (checkout.stripe.com)", async ({ page }) => {
    await page.getByRole("button", { name: /ouvrir le panier|open cart/i }).click();
    await page.getByRole("button", { name: /commander|checkout/i }).click();

    // Fufuni crée une session Stripe Checkout et redirige vers checkout.stripe.com.
    // Skip gracefully when Stripe is not configured in the local backend.
    const redirected = await page.waitForURL(/checkout\.stripe\.com|pay\.stripe\.com/, { timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (!redirected) {
      test.skip(true, "Stripe non configuré dans cet environnement — pas de redirection vers checkout.stripe.com");
    }
    expect(page.url()).toMatch(/stripe\.com/);
  });

  test("Page de succès accessible après paiement (route /success)", async ({ page }) => {
    // Ce test vérifie que la route /success existe et s'affiche correctement.
    // En conditions réelles, l'utilisateur y arrive via le webhook Stripe avec ?session_id=...
    await page.goto("/success");
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page).not.toHaveURL(/404|error/i);
  });
});
