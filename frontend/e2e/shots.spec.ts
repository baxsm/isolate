/**
 * Capture the assembled screens so they can be looked at. Not a gate and not a visual
 * regression: `screenshots.spec.ts` owns baselines. This exists so a session reviews the
 * composition rather than reviewing its own DOM reads.
 */
import { type Page, test } from "@playwright/test";

const ROUTES = [
  { path: "/", name: "article" },
  { path: "/compose?scenario=G2-item", name: "compose" },
  { path: "/scenarios", name: "scenarios" },
  { path: "/matrix", name: "matrix" },
] as const;

const VIEWPORTS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "375", width: 375, height: 812 },
] as const;

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(700);
  // the dev overlay sits over the corner of every capture
  await page.addStyleTag({
    content: "nextjs-portal, #__next-dev-overlay, [data-nextjs-toast] { display: none !important }",
  });
  await page.waitForTimeout(150);
}

for (const theme of ["light", "dark"] as const) {
  for (const viewport of VIEWPORTS) {
    for (const route of ROUTES) {
      test(`shot ${route.name} ${viewport.name} ${theme}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.emulateMedia({ colorScheme: theme });
        await page.goto(route.path);
        // `layout.tsx` no longer pins a theme, but emulateMedia alone left every "dark"
        // capture byte-identical to its light pair when it did. Setting the attribute the
        // app's own css keys off is what makes the two captures actually differ.
        await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
        await settle(page);
        await page.screenshot({
          path: `e2e/screenshots/look-${route.name}-${viewport.name}-${theme}.png`,
          fullPage: true,
        });
      });
    }
  }
}
