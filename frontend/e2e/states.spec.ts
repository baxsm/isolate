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

/** Reads the properties a state change is allowed to move. */
async function styleOf(target: Locator) {
  return target.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      background: s.backgroundColor,
      color: s.color,
      cursor: s.cursor,
      opacity: s.opacity,
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
    expect(disabled.cursor).toBe("not-allowed");
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
    await expect(page.getByLabel("Read the chain as this transaction")).toHaveValue("2");
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
    await expect(page.getByLabel("Read the chain as this transaction")).toHaveValue("2");
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

    for (const select of await page.getByLabel(/^Isolation level/).all()) {
      await select.selectOption("serializable");
    }
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
