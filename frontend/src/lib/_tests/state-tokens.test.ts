import { describe, expect, it } from "vitest";
import {
  echartsItemStyle,
  FOCUS_RING_OFFSET,
  FOCUS_RING_WIDTH,
  flowNodeStyle,
  HOVER_LIFT,
  markClass,
  ROW_STATES,
  rowSelectStyle,
  SELECT_RING_OPACITY,
  SELECT_RING_WIDTH,
} from "@/lib/state-tokens";

/**
 * The point of this module is that one state means one thing on every surface. These check
 * the states are distinguishable from each other, not that a particular string was typed.
 */
describe("markClass", () => {
  it("lifts on hover and collapses on press", () => {
    expect(markClass({ hover: true })).toContain("-translate-y-px");
    expect(markClass({ press: true })).toContain("translate-y-0");
  });

  it("press beats hover when both are set, so a held control is not also lifted", () => {
    const held = markClass({ hover: true, press: true });
    expect(held).toContain("translate-y-0");
    expect(held).not.toContain("-translate-y-px");
  });

  it("rings focus outside the box", () => {
    expect(markClass({ focus: true })).toContain("outline-offset-2");
  });

  it("disabled drops pointer events and overrides everything else", () => {
    const off = markClass({ disabled: true, hover: true, focus: true });
    expect(off).toContain("pointer-events-none");
    expect(off).not.toContain("outline-offset-2");
  });

  it("every state is distinguishable from rest", () => {
    const rest = markClass({});
    for (const state of [{ hover: true }, { press: true }, { focus: true }, { disabled: true }]) {
      expect(markClass(state)).not.toBe(rest);
    }
  });
});

describe("flowNodeStyle", () => {
  it("hover lifts by exactly the shared constant", () => {
    expect(flowNodeStyle("red", { hover: true }).transform).toBe(`translateY(-${HOVER_LIFT}px)`);
  });

  it("selection rings inside the box in the transaction's own hue", () => {
    const shadow = String(flowNodeStyle("red", { selected: true }).boxShadow);
    expect(shadow).toContain("inset");
    expect(shadow).toContain("red");
    expect(shadow).toContain(`${SELECT_RING_WIDTH}px`);
  });

  it("focus rings outside the box, and never in a transaction hue", () => {
    const shadow = String(flowNodeStyle("red", { focus: true }).boxShadow);
    expect(shadow).toContain("var(--color-focus)");
    expect(shadow).not.toContain("inset");
    expect(shadow).toContain(`${FOCUS_RING_OFFSET + FOCUS_RING_WIDTH}px`);
  });

  it("focus and selected read together rather than replacing each other", () => {
    const shadow = String(flowNodeStyle("red", { focus: true, selected: true }).boxShadow);
    expect(shadow).toContain("inset");
    expect(shadow).toContain("var(--color-focus)");
  });

  it("disabled turns pointer events off", () => {
    const style = flowNodeStyle("red", { disabled: true });
    expect(style.pointerEvents).toBe("none");
    expect(style.opacity).toBe(0.5);
  });
});

describe("rowSelectStyle", () => {
  it("uses the same inside ring as a graph node, so a row and a node agree", () => {
    const row = String(rowSelectStyle("var(--color-t1)").boxShadow);
    const node = String(flowNodeStyle("var(--color-t1)", { selected: true }).boxShadow);
    expect(row).toContain("inset");
    expect(row).toContain(`${SELECT_RING_WIDTH}px`);
    expect(row).toContain(`${Math.round(SELECT_RING_OPACITY * 100)}%`);
    expect(node).toContain("inset");
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

  it("lifts on hover and collapses on press, matching the graph node", () => {
    expect(ROW_STATES).toContain("hover:-translate-y-px");
    expect(ROW_STATES).toContain("active:translate-y-0");
  });
});

describe("echartsItemStyle", () => {
  it("fills with the hue only when current", () => {
    expect(echartsItemStyle("red", { current: true }).itemStyle.color).toBe("red");
    expect(echartsItemStyle("red", {}).itemStyle.color).toBe("var(--color-card)");
  });

  it("maps hover onto emphasis and selected onto select", () => {
    const style = echartsItemStyle("red");
    expect(style.emphasis.itemStyle.shadowOffsetY).toBe(1);
    expect(style.select.itemStyle.borderWidth).toBe(SELECT_RING_WIDTH);
  });
});
