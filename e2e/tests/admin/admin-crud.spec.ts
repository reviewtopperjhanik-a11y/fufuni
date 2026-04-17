/// <reference types="node" />
import * as fs from "fs";
import * as path from "path";
import { test, expect } from "@playwright/test";

/**
 * Tests CRUD administration — rôle admin requis.
 *
 * Sélecteurs — stratégie ARIA-first :
 *   - Bouton créer : getByRole("button", { name: /créer une catégorie/i })
 *     (t('create-category') = "Créer une catégorie" en fr-FR)
 *   - Champ Nom : getByPlaceholder("T-Shirts")   (category-admin.tsx:485)
 *   - Champ Handle : getByPlaceholder("t-shirts") (category-admin.tsx:454)
 *   - Bouton submit du formulaire : texte "create" (clé i18n sans traduction → fallback key)
 *   - Bouton supprimer par ligne : locator('[title="Supprimer"] button')
 *     (les boutons icônes sont dans un <div title={t('delete')}> sans aria-label propre)
 *   - Confirmation suppression : getByRole("button", { name: /supprimer/i }) dans l'AlertDialog
 *
 * ⚠️  Les tests CRUD créent une catégorie réelle dans l'environnement de test.
 *     Le test de suppression doit toujours s'exécuter pour nettoyer les données.
 *     Utiliser un handle unique basé sur timestamp pour éviter les collisions.
 */

const TEST_HANDLE = `playwright-test-${Date.now()}`;
const TEST_NAME = `__Playwright Test ${Date.now()}`;

/** Ferme la bannière cookies si elle est visible */
async function dismissCookieBanner(page: import("@playwright/test").Page) {
  const acceptBtn = page.getByRole("button", { name: /accept all|tout accepter/i });
  if (await acceptBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await acceptBtn.click();
    await page.locator('[data-slot="modal-backdrop"]').waitFor({ state: "hidden", timeout: 5_000 }).catch(() => {});
  }
}

test.describe("Admin — CRUD catégories", () => {
  test("Accès au panel admin", async ({ page }) => {
    // /admin has no route — navigate to a real sub-page
    await page.goto("/admin/categories");
    await page.waitForLoadState("networkidle");
    await expect(page).not.toHaveURL(/login|unauthorized|403/i);
    await dismissCookieBanner(page);
    await expect(page.getByRole("button", { name: /créer une catégorie|create category/i })).toBeVisible({ timeout: 10_000 });
  });

  test("Créer une catégorie de test", async ({ page }) => {
    await page.goto("/admin/categories");
    await page.waitForLoadState("networkidle");
    await dismissCookieBanner(page);

    // t('create-category') = "Créer une catégorie" (fr-FR)
    const createBtn = page.getByRole("button", { name: /créer une catégorie|create category/i });
    await expect(createBtn).toBeEnabled({ timeout: 10_000 });
    // force: true bypasses transient backdrop from cookie-consent closing animation
    await createBtn.click({ force: true });

    // Wait for the handle input to confirm the modal is fully open
    await page.locator('input[placeholder="t-shirts"]').waitFor({ state: "visible", timeout: 5_000 });

    // CSS attribute selectors are exact + case-sensitive — no ambiguity risk
    await page.locator('input[placeholder="t-shirts"]').fill(TEST_HANDLE);
    await page.locator('input[placeholder="T-Shirts"]').fill(TEST_NAME);

    // Submit — force: true bypasses the modal backdrop z-index interception
    await page.locator('button').filter({ hasText: /^create$/i }).click({ force: true });

    // Wait for the modal to close (handle input disappears)
    await page.locator('input[placeholder="t-shirts"]').waitFor({ state: "hidden", timeout: 10_000 });

    // Reload to bypass KV cache — invalidateQueries refetch may still get a cached HIT
    await page.reload();
    await page.waitForLoadState("networkidle");

    // Le nom de la catégorie est dans un rowheader (première colonne du grid HeroUI)
    await expect(page.getByRole("rowheader", { name: new RegExp(TEST_NAME) })).toBeVisible({ timeout: 15_000 });
  });

  test("Supprimer la catégorie de test", async ({ page }) => {
    await page.goto("/admin/categories");
    await page.waitForLoadState("networkidle");
    await dismissCookieBanner(page);

    // Trouver la ligne contenant le nom de la catégorie de test
    const row = page.getByRole("row").filter({ hasText: TEST_NAME });
    await expect(row).toBeVisible({ timeout: 15_000 });

    // Les boutons d'action icône sont dans un <div title="Supprimer"> (fr-FR)
    // sans aria-label sur le bouton lui-même — on cible via le title du wrapper
    await row.locator('[title="Supprimer"] button, [title="Delete"] button').click();

    // AlertDialog de confirmation — bouton "Supprimer"
    const confirmBtn = page.getByRole("button", { name: /supprimer|delete/i }).last();
    await expect(confirmBtn).toBeVisible({ timeout: 3_000 });
    await confirmBtn.click();

    // Reload to bypass KV cache stale data after deletion
    await page.reload();
    await page.waitForLoadState("networkidle");

    // La catégorie ne doit plus apparaître
    await expect(page.getByRole("rowheader", { name: new RegExp(TEST_NAME) })).not.toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Admin — accès refusé sans permission admin", () => {
  // Override : utilise la fixture utilisateur standard même si le projet est auth-admin
  test.use({ storageState: "./fixtures/storage-state-user.json" });

  test("Un utilisateur standard ne peut pas accéder au panel admin", async ({ page }) => {
    // Skip if both fixtures contain the same session (e.g. exported from the same admin account).
    // To enable this test, export a storage state from a non-admin account into
    // e2e/fixtures/storage-state-user.json (distinct from storage-state-admin.json).
    const adminRaw = fs.readFileSync(path.join(__dirname, "../../fixtures/storage-state-admin.json"), "utf-8");
    const userRaw = fs.readFileSync(path.join(__dirname, "../../fixtures/storage-state-user.json"), "utf-8");
    const adminToken = JSON.parse(adminRaw).origins?.[0]?.localStorage
      ?.find((e: { name: string }) => e.name.startsWith("@@auth0spajs@@"))?.value;
    const userToken = JSON.parse(userRaw).origins?.[0]?.localStorage
      ?.find((e: { name: string }) => e.name.startsWith("@@auth0spajs@@"))?.value;
    test.skip(adminToken === userToken, "Fixtures identiques — exportez une session utilisateur standard séparée dans storage-state-user.json");

    await page.goto("/admin/categories");
    await page.waitForLoadState("networkidle");
    await dismissCookieBanner(page);

    // AuthenticationGuardWithPermission renders an empty fallback (no redirect, no 403 alert).
    // Blocking is confirmed by absence of admin-specific UI.
    const url = page.url();
    const isRedirected = /login|unauthorized/i.test(url) || !url.includes("/admin/categories");
    const hasAdminContent = await page
      .getByRole("button", { name: /créer une catégorie|create category/i })
      .isVisible()
      .catch(() => false);
    expect(isRedirected || !hasAdminContent).toBe(true);
  });
});
