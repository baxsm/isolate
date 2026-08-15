/**
 * Measurement harness for the audit. Not a gate: it prints numbers so a session can look at
 * relationships between elements rather than one element against a rule. The gates live in
 * `audit.spec.ts` and `states.spec.ts`.
 *
 * Run with `npx playwright test measure --reporter=line` and read stdout.
 */
import { expect, type Page, test } from "@playwright/test";

const ROUTES = ["/", "/compose", "/scenarios", "/matrix"] as const;

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
}

/** Nothing measured before this is evidence. An unhydrated page renders and does nothing. */
async function assertHydrated(page: Page) {
  const hydrated = await page.evaluate(() => {
    const el = document.querySelector("button, [role='button'], a");
    return el ? Object.keys(el).some((k) => k.startsWith("__react")) : false;
  });
  expect(hydrated, "page is hydrated").toBe(true);
}

test.describe("measurements", () => {
  test("panel density on compose at 1440", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/compose");
    await settle(page);
    await assertHydrated(page);

    const density = await page.evaluate(() => {
      // FigureCard is a `section` with a border, not a shadcn `[data-slot=card]`. Selecting
      // the latter returned an empty list and read as "no panels" rather than "wrong query".
      const cards = [...document.querySelectorAll("main section, main [data-slot='card']")];
      return cards.map((card) => {
        const box = card.getBoundingClientRect();
        const title =
          card.querySelector("h2, [data-slot='card-title']")?.textContent?.trim() ?? "?";
        const elements = card.querySelectorAll("*").length;
        return {
          title,
          w: Math.round(box.width),
          h: Math.round(box.height),
          area: Math.round(box.width * box.height),
          elements,
          perElement: Math.round((box.width * box.height) / Math.max(elements, 1)),
        };
      });
    });
    console.log("PANEL DENSITY", JSON.stringify(density, null, 2));
  });

  test("type scale and spacing across routes", async ({ page }) => {
    for (const route of ROUTES) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(route);
      await settle(page);
      const scale = await page.evaluate(() => {
        const sizes = new Map<string, number>();
        const radii = new Set<string>();
        const gaps = new Set<string>();
        for (const el of document.querySelectorAll("main *")) {
          const s = getComputedStyle(el);
          const box = el.getBoundingClientRect();
          if (box.width === 0 || box.height === 0) continue;
          const own = [...el.childNodes].some(
            (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim(),
          );
          if (own) sizes.set(s.fontSize, (sizes.get(s.fontSize) ?? 0) + 1);
          if (Number.parseFloat(s.borderTopWidth) > 0 && Number.parseFloat(s.borderRadius) > 0) {
            radii.add(s.borderRadius);
          }
          if (s.display.includes("flex") || s.display.includes("grid")) {
            if (s.gap && s.gap !== "normal") gaps.add(s.gap);
          }
        }
        return {
          fontSizes: [...sizes.entries()].sort(
            (a, b) => Number.parseFloat(b[0]) - Number.parseFloat(a[0]),
          ),
          radii: [...radii],
          gaps: [...gaps],
        };
      });
      console.log(`TYPE ${route}`, JSON.stringify(scale));
    }
  });

  test("interaction state deltas on every primitive", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/compose");
    await settle(page);
    await assertHydrated(page);

    const read = (selector: string, nth = 0) =>
      page.evaluate(
        ([sel, index]) => {
          const el = document.querySelectorAll(sel as string)[index as number];
          if (!el) return null;
          const s = getComputedStyle(el);
          // an svg `g` paints nothing itself, so its computed fill and stroke never move.
          // reading it reported four identical states for marks and nodes that do change.
          // the painted child is where the state actually lands.
          const painted = el.querySelector("rect, circle, path");
          const p = painted ? getComputedStyle(painted) : null;
          return {
            transform: s.transform,
            translate: s.translate,
            boxShadow: s.boxShadow,
            outline: `${s.outlineWidth} ${s.outlineStyle} ${s.outlineColor}`,
            background: s.backgroundColor,
            borderColor: s.borderColor,
            paintedStroke: p ? `${p.strokeWidth} @ ${p.strokeOpacity}` : null,
            paintedFill: p?.fill ?? null,
            paintedY: painted?.getBoundingClientRect().top.toFixed(1) ?? null,
          };
        },
        [selector, nth] as const,
      );

    const primitives = [
      { name: "button", sel: "button[data-slot='button']" },
      { name: "timeline mark", sel: "[data-testid^='mark-']" },
      { name: "graph node", sel: "[data-testid^='node-']" },
      { name: "version row", sel: "[data-testid='version-row']" },
      { name: "nav link", sel: "nav a" },
    ];

    for (const { name, sel } of primitives) {
      const target = page.locator(sel).first();
      if ((await target.count()) === 0) {
        console.log(`STATE ${name}: absent`);
        continue;
      }
      const rest = await read(sel);
      await target.hover();
      await page.waitForTimeout(200);
      const hover = await read(sel);
      await page.mouse.down();
      await page.waitForTimeout(120);
      const press = await read(sel);
      await page.mouse.up();
      await target.focus().catch(() => {});
      await page.keyboard.press("Tab").catch(() => {});
      await page.waitForTimeout(150);
      const focus = await read(sel);
      console.log(`STATE ${name}`, JSON.stringify({ rest, hover, press, focus }, null, 1));
      await page.mouse.move(0, 0);
      await page.waitForTimeout(150);
    }
  });

  test("motion sampled across frames, not at the endpoints", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/compose");
    await settle(page);
    await assertHydrated(page);

    const mark = page.locator("[data-testid^='mark-']").first();
    if ((await mark.count()) === 0) return;

    const samples = await page.evaluate(async () => {
      const el = document.querySelector("[data-testid^='mark-'] rect:last-of-type");
      if (!el) return [];
      const out: string[] = [];
      return await new Promise<string[]>((resolve) => {
        let frames = 0;
        const tick = () => {
          const s = getComputedStyle(el);
          out.push(`${s.y ?? "?"}|${s.transform}|${s.fill}`);
          if (++frames < 12) requestAnimationFrame(tick);
          else resolve(out);
        };
        requestAnimationFrame(tick);
      });
    });
    console.log("MOTION samples", JSON.stringify(samples));
  });
});
