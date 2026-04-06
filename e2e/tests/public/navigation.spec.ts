import { test, expect, request as playwrightRequest } from "@playwright/test";

const API_BASE_URL =
  process.env.PLAYWRIGHT_API_BASE_URL ??
  (process.env.PLAYWRIGHT_ENV === "local" ? "http://localhost:8787" : null);

const hasApiUrl = !!API_BASE_URL;

test.describe("Public navigation", () => {
  test("Homepage loads successfully", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Fufuni/i);
    await expect(page.locator("nav")).toBeVisible();
    await expect(page.locator("footer")).toBeVisible();
  });

  test("Category navigation works", async ({ page }) => {
    await page.goto("/");
    const categoryLink = page.locator("nav a[href*='/category'], a[href*='/categories']").first();
    if (await categoryLink.count() > 0) {
      await categoryLink.click();
      await expect(page).not.toHaveURL(/error/i);
    }
  });

  test("Static pages are accessible", async ({ page }) => {
    const staticPages = [
      "/pages/about",
      "/pages/faq",
      "/pages/privacy-policy",
      "/pages/terms-of-service",
    ];

    for (const route of staticPages) {
      await page.goto(route);
      await expect(page.locator("main")).toBeVisible();
      await expect(page).not.toHaveURL(/404|error/i);
    }
  });

  test("Worker API /ucp/v1/checkout returns unauthorized or validation error without token", async () => {
    test.skip(!hasApiUrl, "PLAYWRIGHT_API_BASE_URL not defined — skipping Worker API test");
    const apiContext = await playwrightRequest.newContext({ baseURL: API_BASE_URL! });
    const resp = await apiContext.post("/ucp/v1/checkout", { data: {} });
    expect([400, 401, 403, 422]).toContain(resp.status());
    await apiContext.dispose();
  });

  test("Worker API /.well-known/ucp is reachable", async () => {
    test.skip(!hasApiUrl, "PLAYWRIGHT_API_BASE_URL not defined — skipping Worker API test");
    const apiContext = await playwrightRequest.newContext({ baseURL: API_BASE_URL! });
    const resp = await apiContext.get("/.well-known/ucp");
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body).toHaveProperty("ucp");
    expect(body).toHaveProperty("payment");
    expect(body.ucp).toHaveProperty("capabilities");
    await apiContext.dispose();
  });
});
