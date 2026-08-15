import { describe, expect, it } from "vitest";
import {
  FOCUS,
  NAV_LINK,
  NAV_LINK_ACTIVE,
  NAV_LINK_IDLE,
  PRESSABLE_ROW,
  PROSE_LINK,
  ROW_LINK,
} from "@/lib/interaction";

/**
 * These check the vocabulary is consistent and that each kind of control is distinguishable
 * from the others. The defects behind them: nav links had no hover at all, the active marker
 * was a rounded 2px border that read as a stray bar, and the global focus rule beat every
 * component's own focus style.
 */
describe("focus", () => {
  it("is the same ring everywhere it is used", () => {
    for (const vocabulary of [PROSE_LINK, NAV_LINK, PRESSABLE_ROW]) {
      expect(vocabulary).toContain("focus-visible:outline-2");
      expect(vocabulary).toContain("var(--color-focus)");
    }
  });

  it("never rings in a transaction hue, which would vanish into the thing it rings", () => {
    // the ring only. a prose link's *text* is deliberately iris, and asserting against the
    // whole class string failed on that rather than on a focus defect
    for (const vocabulary of [FOCUS, PROSE_LINK, NAV_LINK, PRESSABLE_ROW]) {
      const rings = vocabulary.match(/focus-visible:outline-\[[^\]]+\]/g) ?? [];
      for (const ring of rings) expect(ring).not.toMatch(/--color-t[123]/);
    }
  });

  it("suppresses the browser default so only one ring is ever drawn", () => {
    expect(FOCUS).toContain("outline-none");
  });
});

describe("nav links", () => {
  it("carry a rule drawn as a pseudo element, not a border on a rounded box", () => {
    // `border-b-2` on a `rounded-sm` box paints a stubby bar with rounded ends floating
    // under the word, which is what the owner reported as a weird bottom border
    expect(NAV_LINK).toContain("after:");
    expect(NAV_LINK).not.toContain("border-b-2");
  });

  it("give an inactive item a hover, which it did not have at all", () => {
    expect(NAV_LINK_IDLE).toContain("hover:");
  });

  it("preview the active marker on hover rather than inventing a second idea", () => {
    // both states move the same channel: the rule under the label
    expect(NAV_LINK_IDLE).toContain("hover:after:bg-");
    expect(NAV_LINK_ACTIVE).toContain("after:bg-");
  });

  it("distinguish active from idle by more than the rule alone", () => {
    expect(NAV_LINK_ACTIVE).toContain("font-medium");
    expect(NAV_LINK_IDLE).not.toContain("font-medium");
  });
});

describe("prose links", () => {
  it("underline with a real text underline that tracks the baseline", () => {
    expect(PROSE_LINK).toContain("underline");
    expect(PROSE_LINK).not.toContain("border-b");
  });

  it("strengthen the underline on hover rather than only changing colour", () => {
    expect(PROSE_LINK).toContain("hover:decoration-");
  });
});

describe("rows", () => {
  it("a navigating row fills its ground rather than lifting into its neighbours", () => {
    expect(ROW_LINK).toContain("hover:bg-");
    expect(ROW_LINK).not.toContain("-translate-y");
  });

  it("a pressable row lifts, because it is not in a divided list", () => {
    expect(PRESSABLE_ROW).toContain("hover:-translate-y-px");
    expect(PRESSABLE_ROW).toContain("active:translate-y-0");
  });

  it("both answer a press, so neither is a picture of a control", () => {
    expect(ROW_LINK).toContain("active:");
    expect(PRESSABLE_ROW).toContain("active:");
  });

  it("a navigating row rings inside its own box", () => {
    // an outward ring on the matrix's last column measured 4px past the scroll container
    // and was clipped on exactly the cells at the edge
    expect(ROW_LINK).toContain("focus-inset");
  });
});
