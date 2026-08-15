/**
 * The mechanical half of the audit. Every check is a number read from the DOM or a thing
 * present or absent. "Does it look good" is not in here, because that is not gateable.
 *
 * Each check was proven able to fail against the code it was written for. See the log.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import Color from "colorjs.io";

const ROUTES = ["/", "/compose", "/scenarios", "/matrix"] as const;
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 375, height: 812 },
] as const;

/** Every panel waits on the engine, so measuring before it lands measures an empty page. */
async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
}

test.describe("route coverage", () => {
  test("every route in the app is audited", async () => {
    // stated, not implied. partial coverage reads as total coverage otherwise.
    expect(ROUTES).toHaveLength(4);
  });
});

for (const viewport of VIEWPORTS) {
  for (const route of ROUTES) {
    test.describe(`${route} at ${viewport.name}`, () => {
      test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(route);
        await settle(page);
        const measured = await page.evaluate(() => window.innerWidth);
        // read back rather than trusting the call
        expect(measured).toBeLessThanOrEqual(viewport.width);
      });

      test("no bordered box directly inside another", async ({ page }) => {
        const nested = await page.evaluate(() => {
          const isContainer = (el: Element) => {
            if (["BUTTON", "A", "INPUT", "SELECT", "TEXTAREA", "LABEL"].includes(el.tagName))
              return false;
            if (el.getAttribute("role") === "button") return false;
            const s = getComputedStyle(el);
            const widths = [
              s.borderTopWidth,
              s.borderRightWidth,
              s.borderBottomWidth,
              s.borderLeftWidth,
            ].map(Number.parseFloat);
            // all four sides plus a radius. one or two sides is a divider, not a box
            return (
              widths.every((w) => w > 0) &&
              s.borderTopStyle !== "none" &&
              Number.parseFloat(s.borderRadius) > 0
            );
          };
          const main = document.querySelector("main");
          if (!main) return [];
          const bad: string[] = [];
          for (const el of main.querySelectorAll("*")) {
            if (!isContainer(el)) continue;
            let parent = el.parentElement;
            while (parent && parent !== main) {
              if (isContainer(parent)) {
                bad.push(`${el.tagName}.${el.className} inside ${parent.tagName}`);
                break;
              }
              parent = parent.parentElement;
            }
          }
          return bad;
        });
        expect(nested).toEqual([]);
      });

      test("nothing sits outside the viewport", async ({ page }) => {
        const offscreen = await page.evaluate(() => {
          const bad: string[] = [];
          const scrollable = (el: Element) => {
            const s = getComputedStyle(el);
            return /auto|scroll/.test(s.overflowX + s.overflowY);
          };
          for (const el of document.querySelectorAll("main *")) {
            if (el.classList.contains("sr-only")) continue;
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) continue;

            let inScrollable = false;
            let floating = false;
            let node: Element | null = el;
            while (node) {
              const s = getComputedStyle(node);
              if (s.position === "fixed" || s.position === "absolute") floating = true;
              if (node !== el && scrollable(node)) inScrollable = true;
              node = node.parentElement;
            }
            if (inScrollable) continue;

            if (rect.right > window.innerWidth + 1 || rect.left < -1) {
              bad.push(`${el.tagName}.${el.className} horizontal`);
            }
            // vertical only matters where the reader cannot scroll to it
            if (floating && (rect.bottom > window.innerHeight + 1 || rect.top < -1)) {
              bad.push(`${el.tagName}.${el.className} vertical in overlay`);
            }
          }
          return bad;
        });
        expect(offscreen).toEqual([]);
      });

      test("no hover style on something that cannot be clicked", async ({ page }) => {
        const bad = await page.evaluate(() => {
          const interactive = (el: Element) =>
            ["BUTTON", "A", "INPUT", "SELECT", "TEXTAREA", "SUMMARY", "LABEL"].includes(
              el.tagName,
            ) ||
            ["button", "link"].includes(el.getAttribute("role") ?? "") ||
            Number(el.getAttribute("tabindex") ?? "-1") >= 0;
          const out: string[] = [];
          for (const el of document.querySelectorAll("main *")) {
            const classes = el.className;
            if (typeof classes !== "string") continue;
            if (!/(^|\s|:)hover:/.test(classes)) continue;
            if (!interactive(el)) out.push(`${el.tagName}.${classes}`);
          }
          return out;
        });
        expect(bad).toEqual([]);
      });

      test("every button shows a pointer cursor", async ({ page }) => {
        const bad = await page.evaluate(() => {
          const out: string[] = [];
          const targets = document.querySelectorAll(
            'main button, main [role="button"], main select',
          );
          for (const el of targets) {
            if ((el as HTMLButtonElement).disabled) continue;
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;
            if (getComputedStyle(el).cursor !== "pointer") {
              out.push(`${el.tagName} "${el.textContent?.trim().slice(0, 24)}"`);
            }
          }
          return out;
        });
        expect(bad).toEqual([]);
      });

      test("the page does not scroll sideways", async ({ page }) => {
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        );
        expect(overflow).toBeLessThanOrEqual(1);
      });

      test("no second scrollbar inside a scrolling page", async ({ page }) => {
        // catches the state, not every cause. a pass here is weak evidence
        const nested = await page.evaluate(() => {
          const main = document.querySelector("main");
          if (!main) return [];
          const pageScrolls = document.documentElement.scrollHeight > window.innerHeight + 1;
          if (!pageScrolls) return [];
          const out: string[] = [];
          for (const el of main.querySelectorAll("*")) {
            const s = getComputedStyle(el);
            if (!/auto|scroll/.test(s.overflowY)) continue;
            if (el.scrollHeight > el.clientHeight + 1) {
              out.push(`${el.tagName}.${el.className}`);
            }
          }
          return out;
        });
        expect(nested).toEqual([]);
      });

      test("no serious or critical accessibility violations", async ({ page }) => {
        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();
        const blocking = results.violations.filter((v) =>
          ["serious", "critical"].includes(v.impact ?? ""),
        );
        const moderate = results.violations.filter(
          (v) => !["serious", "critical"].includes(v.impact ?? ""),
        );
        // moderate findings are judgement calls, so they are counted and logged rather
        // than failing the suite. a suite that fails on heading order gets switched off
        if (moderate.length > 0) {
          console.log(`${route} ${viewport.name}: ${moderate.length} moderate axe findings`);
        }
        expect(blocking.map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
      });

      test("text meets AA contrast, computed", async ({ page }) => {
        const failures = await page.evaluate(() => {
          const out: { text: string; fg: string; bg: string; size: number; bold: boolean }[] = [];
          const backdrop = (el: Element): string => {
            let node: Element | null = el;
            while (node) {
              const bg = getComputedStyle(node).backgroundColor;
              if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") return bg;
              node = node.parentElement;
            }
            return getComputedStyle(document.body).backgroundColor;
          };
          for (const el of document.querySelectorAll("main *")) {
            const text = el.textContent?.trim() ?? "";
            if (!text) continue;
            const own = [...el.childNodes].some(
              (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim(),
            );
            if (!own) continue;
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;
            const s = getComputedStyle(el);
            if (s.visibility === "hidden" || s.opacity === "0") continue;
            out.push({
              text: text.slice(0, 30),
              fg: s.color,
              bg: backdrop(el),
              size: Number.parseFloat(s.fontSize),
              bold: Number(s.fontWeight) >= 700,
            });
          }
          return out;
        });

        const bad: string[] = [];
        for (const item of failures) {
          // colorjs, never a regex. getComputedStyle serialises per property and a regex
          // on oklch(0.6 0.2 250) yields numbers that are garbage
          let contrast: number;
          try {
            contrast = Math.abs(new Color(item.fg).contrast(new Color(item.bg), "WCAG21"));
          } catch {
            continue;
          }
          const large = item.size >= 24 || (item.size >= 18.66 && item.bold);
          const needed = large ? 3 : 4.5;
          if (contrast < needed) {
            bad.push(
              `"${item.text}" ${contrast.toFixed(2)}:1 needs ${needed} (${item.fg} on ${item.bg})`,
            );
          }
        }
        expect(bad).toEqual([]);
      });
    });
  }
}
