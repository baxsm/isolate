/**
 * Pass 2 of the audit: interaction states, exercised with a real pointer.
 *
 * Every assertion is a computed difference between two states. A control with a hover and
 * no press reads as a picture of a button, and no screenshot shows that.
 */
import { expect, type Locator, type Page, test } from "@playwright/test";

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
}

/**
 * Picks an option from a Base UI select. It is a button and a portalled listbox, not a
 * native `select`, so `selectOption` does not apply to it.
 */
async function choose(page: Page, label: RegExp | string, option: string) {
  const triggers = await page.getByLabel(label).all();
  for (const trigger of triggers) {
    await trigger.click();
    await page.getByRole("option", { name: option, exact: true }).click();
    await page.waitForTimeout(150);
  }
}

/** Reads the properties a state change is allowed to move. */
async function styleOf(target: Locator) {
  return target.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      background: s.backgroundColor,
      color: s.color,
      cursor: s.cursor,
      opacity: s.opacity,
      pointerEvents: s.pointerEvents,
      borderColor: s.borderTopColor,
    };
  });
}

test.describe("transport buttons", () => {
  test("rest, hover and press each differ", async ({ page }) => {
    await page.goto("/compose?scenario=G2-item");
    await settle(page);

    // enabled only once the schedule has more than one step, so step forward first
    const next = page.getByRole("button", { name: "Next step" }).first();
    await expect(next).toBeEnabled();
    const rest = await styleOf(next);
    expect(rest.cursor).toBe("pointer");

    await next.hover();
    await page.waitForTimeout(200);
    const hover = await styleOf(next);
    expect(hover.background).not.toBe(rest.background);

    // press is held open with the mouse down, or the style is gone before it is read
    await page.mouse.down();
    await page.waitForTimeout(150);
    const press = await styleOf(next);
    await page.mouse.up();
    expect(press.background).not.toBe(hover.background);
  });

  test("disabled at the first step and visibly so", async ({ page }) => {
    await page.goto("/compose?scenario=G2-item");
    await settle(page);

    const prev = page.getByRole("button", { name: "Previous step" }).first();
    await expect(prev).toBeDisabled();
    const disabled = await styleOf(prev);
    expect(Number(disabled.opacity)).toBeLessThan(1);
    // base ui disables with pointer-events: none, so the cursor never resolves to
    // not-allowed. the dimming plus the disabled attribute is what the reader gets
    expect(disabled.pointerEvents).toBe("none");
  });
});

test.describe("graph nodes", () => {
  test("hover and press change the node, and a click changes the version panel", async ({
    page,
  }) => {
    await page.goto("/compose?scenario=G2-item");
    await settle(page);
    await page.getByRole("button", { name: "Last step" }).first().click();
    await page.waitForTimeout(500);

    const node = page.getByTestId("node-2");
    const rect = node.locator(".graph-node");

    const restWidth = await rect.getAttribute("stroke-width");
    await node.hover();
    await page.waitForTimeout(200);
    const hoverWidth = await rect.getAttribute("stroke-width");
    expect(hoverWidth).not.toBe(restWidth);

    await page.mouse.down();
    await page.waitForTimeout(150);
    const pressWidth = await rect.getAttribute("stroke-width");
    await page.mouse.up();
    expect(pressWidth).not.toBe(hoverWidth);

    // the effect, not the render: clicking a node re-reads the chain as that transaction
    await expect(page.getByLabel("Read the chain as this transaction")).toContainText("T2");
    await expect(node).toHaveAttribute("aria-pressed", "true");
  });

  test("keyboard reaches a node and activates it", async ({ page }) => {
    await page.goto("/compose?scenario=G2-item");
    await settle(page);
    await page.getByRole("button", { name: "Last step" }).first().click();
    await page.waitForTimeout(400);

    const node = page.getByTestId("node-2");
    await node.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByLabel("Read the chain as this transaction")).toContainText("T2");
  });
});

test.describe("timeline marks", () => {
  test("a mark scrubs the step and carries its state in an attribute", async ({ page }) => {
    await page.goto("/compose?scenario=G2-item");
    await settle(page);

    const mark = page.getByTestId("mark-4");
    await expect(mark).toHaveAttribute("data-state", "future");
    await mark.click();
    await page.waitForTimeout(300);
    await expect(mark).toHaveAttribute("data-state", "current");
    await expect(page.getByTestId("mark-0")).toHaveAttribute("data-state", "past");
  });
});

test.describe("editor", () => {
  test("reordering an operation re-runs the schedule", async ({ page }) => {
    await page.goto("/compose?scenario=G2-item");
    await settle(page);

    // C1 sits at position 9, so moving it earlier swaps it with W2(2) at position 8
    const before = await page.getByTestId("mark-7").getAttribute("aria-label");
    expect(before).toContain("W2(2)");
    await page.getByRole("button", { name: /^Move C1 earlier$/ }).click();
    await page.waitForTimeout(900);
    const after = await page.getByTestId("mark-7").getAttribute("aria-label");
    expect(after).toContain("C1");
  });

  test("serializable removes the cycle and aborts a transaction", async ({ page }) => {
    await page.goto("/compose?scenario=G2-item");
    await settle(page);
    await page.getByRole("button", { name: "Last step" }).first().click();
    await page.waitForTimeout(400);
    expect(await page.locator(".cycle-edge").count()).toBeGreaterThan(0);

    await choose(page, /^Isolation level/, "serializable");
    // the run restarts at step 1, so walk back to the end rather than clicking a button
    // that is already disabled there
    await page.waitForTimeout(900);
    const last = page.getByRole("button", { name: "Last step" }).first();
    if (await last.isEnabled()) await last.click();
    await page.waitForTimeout(500);

    expect(await page.locator(".cycle-edge").count()).toBe(0);
    await expect(page.getByTestId("node-2")).toHaveAttribute("data-in-cycle", "false");
  });
});

test.describe("one state language", () => {
  /*
    Every other check measures one element against a rule. None asks whether two components
    agree, and that disagreement is what reads as incoherent. Measured before this existed:
    graph selection drew 2px at 0.45 while the timeline drew 4px at 0.25, and version rows
    had no hover, press or focus at all while both files claimed to share one language.
  */
  test("a row and a node answer hover and press the same way", async ({ page }) => {
    await page.goto("/compose?scenario=G2-item");
    await settle(page);
    await page.getByRole("button", { name: "Last step" }).first().click();
    await page.waitForTimeout(500);

    const row = page.locator("[data-testid='version-row'][tabindex='0']").first();
    await expect(row).toHaveCount(1);

    const readRow = () =>
      row.evaluate((el) => {
        const s = getComputedStyle(el);
        return { translate: s.translate, background: s.backgroundColor };
      });

    const rest = await readRow();
    await row.hover();
    await page.waitForTimeout(200);
    const hover = await readRow();
    // hover is elevation, upward, and it is the only state that moves the row up
    expect(hover.translate).not.toBe(rest.translate);
    expect(hover.translate).toContain("-1px");

    await page.mouse.down();
    await page.waitForTimeout(150);
    const press = await readRow();
    await page.mouse.up();
    // press collapses the lift and darkens the ground, so it is never just a lighter hover
    expect(press.translate).not.toBe(hover.translate);
    expect(press.background).not.toBe(hover.background);
  });

  test("selection rings inside the box and focus rings outside it", async ({ page }) => {
    await page.goto("/compose?scenario=G2-item");
    await settle(page);
    await page.getByRole("button", { name: "Last step" }).first().click();
    await page.waitForTimeout(500);

    /*
      Selection is something the reader did, so this picks a transaction first. Nothing is
      selected at load by design: the viewer falls back to the first transaction so the
      chain has somebody's eyes to read through, and passing that fallback through as
      selection put a permanent ring on a node nobody had chosen.
    */
    await expect(page.locator("[data-testid='version-row'][data-selected='true']")).toHaveCount(0);
    await page.getByTestId("node-1").click();
    await page.waitForTimeout(300);

    const selected = page.locator("[data-testid='version-row'][data-selected='true']").first();
    await expect(selected).toHaveCount(1);
    const shadow = await selected.evaluate((el) => getComputedStyle(el).boxShadow);
    // inside, so a focus ring sitting outside can be read at the same time
    expect(shadow).toContain("inset");

    // reached with the keyboard, not `.focus()`. an api focus call does not satisfy
    // `:focus-visible` on a pointer-focusable element, so the ring never applies and the
    // app reads as broken when it is the measurement that is wrong
    await selected.evaluate((el: HTMLElement) => el.focus());
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await page.waitForTimeout(200);
    const focused = await selected.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        outline: s.outlineWidth,
        style: s.outlineStyle,
        shadow: s.boxShadow,
        focusVisible: el.matches(":focus-visible"),
      };
    });
    expect(focused.focusVisible).toBe(true);
    expect(focused.style).not.toBe("none");
    // both read together rather than one replacing the other
    expect(focused.shadow).toContain("inset");
  });
});

test.describe("the nav says which page this is", () => {
  for (const route of ["/", "/compose", "/scenarios", "/matrix"]) {
    test(`exactly one link is current on ${route}`, async ({ page }) => {
      await page.goto(route);
      await settle(page);
      const links = page.locator("nav a[aria-current='page']");
      await expect(links).toHaveCount(1);

      // and it has to be visibly different, not only different to a screen reader
      const weights = await page.evaluate(() => {
        const all = [...document.querySelectorAll("nav a")];
        const current = all.find((a) => a.getAttribute("aria-current") === "page");
        const others = all.filter((a) => a !== current && a.textContent?.trim() !== "isolate");
        return {
          current: current ? getComputedStyle(current).fontWeight : null,
          others: [...new Set(others.map((a) => getComputedStyle(a).fontWeight))],
        };
      });
      expect(weights.others).not.toContain(weights.current);
    });
  }
});

test.describe("reduced motion", () => {
  test("the cycle dash still exists but does not animate", async ({ page }) => {
    // emulateMedia rather than the context option: the context option also disables
    // animations at the driver level, which measures playwright rather than the app
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/compose?scenario=G2-item");
    await settle(page);
    await page.getByRole("button", { name: "Last step" }).first().click();
    await page.waitForTimeout(500);

    // reduced motion must reduce, not remove. the dash stays on the edge and stops
    // moving, so the cycle is still encoded by form when the movement is gone
    expect(await page.locator(".cycle-edge").count()).toBeGreaterThan(0);
    const state = await page
      .locator(".cycle-edge")
      .first()
      .evaluate((el) => {
        const s = getComputedStyle(el);
        return { play: s.animationPlayState, name: s.animationName, dash: s.strokeDasharray };
      });
    expect(state.play).toBe("paused");
    expect(state.name).toBe("cycle-dash");
    expect(state.dash).not.toBe("none");
  });
});

test.describe("a panel is sized by what is in it", () => {
  /*
    dagre returns a rank-layout box whether or not anything is ranked, so one node came back
    in 260x108 holding 64x40 of node. Measured on /compose: the graph card was 203px against
    the version card's 201px, at 5,305px per element against 1,751 - the same size for a
    third of the content. That is "everything is out of shape" as a number.
  */
  test("an empty graph fits its node instead of dagre's box", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/compose");
    await settle(page);

    const box = await page.evaluate(() => {
      const graph = document.querySelector("[data-testid='graph']");
      const node = document.querySelector("[data-testid^='node-'] rect");
      if (!graph || !node) return null;
      const g = graph.getBoundingClientRect();
      const n = node.getBoundingClientRect();
      return {
        graphHeight: g.height,
        nodeHeight: n.height,
        slack: g.height - n.height,
        fitsVertically: n.top >= g.top - 1 && n.bottom <= g.bottom + 1,
      };
    });

    expect(box).not.toBeNull();
    expect(box?.fitsVertically).toBe(true);
    // the padding is 10px a side with no edges to leave room for. anything much over that
    // is dagre's empty rank space coming back
    expect(box?.slack ?? 999).toBeLessThanOrEqual(24);
  });

  test("a graph with edges still gets its room and clips nothing", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/compose?scenario=G2-item");
    await settle(page);
    await page.getByRole("button", { name: "Last step" }).first().click();
    await page.waitForTimeout(600);

    const info = await page.evaluate(() => {
      const graph = document.querySelector("[data-testid='graph']");
      const box = graph?.getBoundingClientRect();
      if (!box) return null;
      const clipped = [...document.querySelectorAll("[data-testid^='node-'] rect")].filter((r) => {
        const b = r.getBoundingClientRect();
        return b.top < box.top - 1 || b.bottom > box.bottom + 1 || b.right > box.right + 1;
      }).length;
      return {
        height: box.height,
        edges: document.querySelectorAll("[data-testid^='edge-']").length,
        clipped,
      };
    });

    expect(info?.edges ?? 0).toBeGreaterThan(0);
    expect(info?.clipped).toBe(0);
    // the floor still applies once there are edges and haloes to leave room for
    expect(info?.height ?? 0).toBeGreaterThanOrEqual(110);
  });
});

test.describe("a clipped panel says it is clipped", () => {
  /*
    At 375 the schedule is 336px of content in a 293px box, so the last mark sat 17px past
    the card edge with nothing to say it was there. The fade is conditional, and this check
    exists because the condition broke once already: observing the svg at effect time
    observed nothing, because an empty schedule renders a `p` and the svg is not mounted yet.
  */
  test("the timeline fades its edge only when it really overflows", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/compose");
    await settle(page);
    // the cue is set by a ResizeObserver callback, which lands a frame or two after the
    // schedule renders. waiting for the marker rather than for a fixed delay stops this
    // reading a real cue as a missing one on a slow render
    await page.locator("[data-overflowing]").waitFor({ state: "attached", timeout: 5000 });

    const narrow = await page.evaluate(() => {
      const wrap = document.querySelector("[data-testid='timeline']")?.parentElement;
      if (!wrap) return null;
      return {
        overflows: wrap.scrollWidth > wrap.clientWidth + 1,
        faded: getComputedStyle(wrap).maskImage !== "none",
      };
    });
    expect(narrow?.overflows).toBe(true);
    expect(narrow?.faded).toBe(true);

    // and it is gone once there is room, so a schedule that fits is not faded for nothing
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(400);
    const wide = await page.evaluate(() => {
      const wrap = document.querySelector("[data-testid='timeline']")?.parentElement;
      if (!wrap) return null;
      return {
        overflows: wrap.scrollWidth > wrap.clientWidth + 1,
        faded: getComputedStyle(wrap).maskImage !== "none",
      };
    });
    expect(wide?.overflows).toBe(false);
    expect(wide?.faded).toBe(false);
  });
});

test.describe("a cycle halo is not a focus ring", () => {
  /*
    The halo marks a node as part of a cycle and focus marks where the keyboard is. Both are
    rings drawn around the same node, so they have to be separable by colour. In dark the
    halo was ruby-2 `#fed2e1` at L* 88.4 against the focus token's 94.1, only dE 18.3 apart,
    and the owner read a node in a cycle as having a stuck focus outline.
  */
  for (const theme of ["light", "dark"] as const) {
    test(`halo and focus are far apart in ${theme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.goto("/compose?scenario=G2-item");
      await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
      await settle(page);

      const tokens = await page.evaluate(() => {
        const s = getComputedStyle(document.documentElement);
        return {
          halo: s.getPropertyValue("--color-halo").trim(),
          focus: s.getPropertyValue("--color-focus").trim(),
        };
      });

      // parsed in the browser so the comparison uses the same engine that painted them
      const separation = await page.evaluate(({ halo, focus }) => {
        const toRgb = (value: string) => {
          const probe = document.createElement("span");
          probe.style.color = value;
          document.body.append(probe);
          const rgb = getComputedStyle(probe).color;
          probe.remove();
          return (rgb.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number);
        };
        const [hr, hg, hb] = toRgb(halo);
        const [fr, fg, fb] = toRgb(focus);
        // plain euclidean distance in srgb is enough to catch two near-white rings
        return Math.round(
          Math.hypot((hr ?? 0) - (fr ?? 0), (hg ?? 0) - (fg ?? 0), (hb ?? 0) - (fb ?? 0)),
        );
      }, tokens);

      console.log(`${theme}: halo ${tokens.halo} vs focus ${tokens.focus}, distance ${separation}`);
      expect(separation).toBeGreaterThan(60);
    });
  }
});
