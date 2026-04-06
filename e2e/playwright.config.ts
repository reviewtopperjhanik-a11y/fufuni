import { defineConfig, devices } from "@playwright/test";

const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ??
  (process.env.PLAYWRIGHT_ENV === "local"
    ? "http://localhost:5173"
    : "https://sctg-development.github.io/fufuni/");

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : 1,
  reporter: [
    ["html", { outputFolder: "../playwright-report" }],
    ["github"],
    ["list"],
  ],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    ignoreHTTPSErrors: BASE_URL.startsWith("http://localhost"),
  },
  projects: [
    {
      name: "public-chromium",
      use: { ...devices["Desktop Chrome"] },
      testMatch: "**/public/**/*.spec.ts",
    },
    {
      name: "public-firefox",
      use: { ...devices["Desktop Firefox"] },
      testMatch: "**/public/**/*.spec.ts",
    },
    {
      name: "public-mobile",
      use: { ...devices["iPhone 14"] },
      testMatch: "**/public/**/*.spec.ts",
    },
    {
      name: "auth-user",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "./fixtures/storage-state-user.json",
      },
      testMatch: "**/auth/**/*.spec.ts",
      dependencies: ["setup-user"],
    },
    {
      name: "auth-admin",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "./fixtures/storage-state-admin.json",
      },
      testMatch: "**/admin/**/*.spec.ts",
      dependencies: ["setup-admin"],
    },
    {
      name: "setup-user",
      testMatch: "**/setup/user.setup.ts",
    },
    {
      name: "setup-admin",
      testMatch: "**/setup/admin.setup.ts",
    },
  ],
});
