/**
 * Captures the README images from the running app. Not an assertion suite: it exists so
 * the screenshots in the README are the real screens with real engine output in them.
 *
 * Run with `npx playwright test e2e/screenshots.spec.ts`.
 */
import { expect, type Page, test } from "@playwright/test";

const SHOTS = "public/readme";

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  // panels animate in, and a capture mid transition looks like a bug that is not there
  await page.waitForTimeout(600);
}

async function stepToEnd(page: Page) {
  await page.getByRole("button", { name: "Last step" }).first().click();
  await page.waitForTimeout(500);
}

test.use({ viewport: { width: 1280, height: 900 } });

test("workbench with a write skew cycle", async ({ page }) => {
  await page.goto("/compose?scenario=G2-item");
  await settle(page);
  await stepToEnd(page);
  await expect(page.locator(".cycle-edge").first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/workbench.png` });
});

test("the same schedule at serializable", async ({ page }) => {
  await page.goto("/compose?scenario=G2-item");
  await settle(page);
  for (const select of await page.getByLabel(/^Isolation level/).all()) {
    await select.selectOption("serializable");
  }
  await page.waitForTimeout(700);
  await stepToEnd(page);
  await page.screenshot({ path: `${SHOTS}/serializable.png` });
});

test("the matrix", async ({ page }) => {
  await page.goto("/matrix");
  await settle(page);
  await page.screenshot({ path: `${SHOTS}/matrix.png` });
});

test("the article", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  await page.screenshot({ path: `${SHOTS}/article.png` });
});
