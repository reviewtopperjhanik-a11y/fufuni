import { test as setup, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const FIXTURE_PATH = path.join(__dirname, "../../fixtures/storage-state-user.json");

setup("validate user storage state exists", async () => {
  const exists = fs.existsSync(FIXTURE_PATH);
  if (!exists) {
    throw new Error(
      `Fixture manquante : ${FIXTURE_PATH}\n` +
      `Exportez une session depuis la modale UserTechnicalInfo (utilisateur standard)\n` +
      `et décompressez storage-state.json dans e2e/fixtures/storage-state-user.json`
    );
  }

  const raw = fs.readFileSync(FIXTURE_PATH, "utf-8");
  const state = JSON.parse(raw);

  expect(state).toHaveProperty("origins");
  expect(state.origins[0].localStorage.some(
    (e: { name: string }) => e.name.startsWith("@@auth0spajs@@")
  )).toBe(true);
});
