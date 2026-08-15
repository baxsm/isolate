import { describe, expect, it } from "vitest";
import {
  ROW_STATES,
  rowSelectStyle,
  SELECT_RING_OPACITY,
  SELECT_RING_WIDTH,
} from "@/lib/state-tokens";

/**
 * The point of this module is that one state means one thing on every surface. These check
 * the states are distinguishable from each other, not that a particular string was typed.
 */
describe("rowSelectStyle", () => {
  it("rings selection inside the box, so a focus ring outside it still reads", () => {
    const row = String(rowSelectStyle("var(--color-t1)").boxShadow);
    expect(row).toContain("inset");
    expect(row).toContain(`${SELECT_RING_WIDTH}px`);
    expect(row).toContain(`${Math.round(SELECT_RING_OPACITY * 100)}%`);
  });

  it("carries the hue it is given", () => {
    expect(String(rowSelectStyle("var(--color-t2)").boxShadow)).toContain("--color-t2");
  });
});

describe("ROW_STATES", () => {
  it("covers hover, press and focus, which is the defect it was added for", () => {
    expect(ROW_STATES).toContain("hover:");
    expect(ROW_STATES).toContain("active:");
    expect(ROW_STATES).toContain("focus-visible:");
  });

  it("lifts on hover and collapses on press", () => {
    expect(ROW_STATES).toContain("hover:-translate-y-px");
    expect(ROW_STATES).toContain("active:translate-y-0");
  });

  it("rings focus outside the box, never inside where selection lives", () => {
    expect(ROW_STATES).toContain("focus-visible:outline-offset-2");
    expect(ROW_STATES).toContain("var(--color-focus)");
  });
});
