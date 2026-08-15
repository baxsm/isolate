import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import VersionPanel from "@/components/version-panel";
import type { Step, Version } from "@/lib/types";

// built from the real `Version` and `Step`, with no `as` cast. a fixture that is allowed to
// drift from the type is a fixture that cannot express the bug
const version = (over: Partial<Version> = {}): Version => ({
  key: "1",
  value: 10,
  xmin: 1,
  xmax: null,
  created_at_step: 0,
  expired_at_step: null,
  ...over,
});

function makeStep(over: Partial<Step> = {}): Step {
  return {
    index: 0,
    op: { txn: 1, kind: "read", key: "1", value: null, predicate: null },
    outcome: "ok",
    error: null,
    versions: { "1": [version()] },
    visible: { 1: { "1": 10 } },
    txns: {
      1: {
        xid: 1,
        state: "active",
        isolation: "repeatable_read",
        began_at_step: 0,
        ended_at_step: null,
        in_conflict: false,
        out_conflict: false,
        snapshot_xmin: 1,
        snapshot_xmax: 2,
        snapshot_xip: [],
      },
    },
    edges: [],
    cycles: [],
    anomalies: [],
    ...over,
  };
}

describe("VersionPanel", () => {
  it("renders a row per version in the chain", () => {
    render(
      <VersionPanel
        step={makeStep({
          versions: { "1": [version({ xmax: 2 }), version({ value: 11, xmin: 2 })] },
        })}
        viewer={1}
      />,
    );
    expect(screen.getAllByTestId("version-row")).toHaveLength(2);
  });

  it("marks a dead version rather than hiding it", () => {
    render(
      <VersionPanel step={makeStep({ versions: { "1": [version({ xmax: 2 })] } })} viewer={1} />,
    );
    expect(screen.getByTestId("version-row")).toHaveAttribute("data-dead", "true");
  });

  it("says live rather than visible when nobody is watching", () => {
    // a committed transaction has no live view. reporting "not visible" then describes nobody
    render(<VersionPanel step={makeStep({ visible: {} })} viewer={null} />);
    expect(screen.getByText("live")).toBeInTheDocument();
  });

  it("hatches a version the viewer cannot see", () => {
    const step = makeStep({
      versions: { "1": [version({ value: 99, xmin: 2 })] },
      visible: { 1: { "1": 10 } },
    });
    render(<VersionPanel step={step} viewer={1} />);
    expect(screen.getByTestId("version-row")).toHaveAttribute("data-visible", "false");
  });

  it("selecting a transaction rings the rows it wrote", () => {
    render(<VersionPanel step={makeStep()} viewer={1} selected={1} onSelectTxn={() => {}} />);
    const row = screen.getByTestId("version-row");
    expect(row).toHaveAttribute("data-selected", "true");
    expect(row.getAttribute("style")).toContain("inset");
  });

  it("does not ring rows written by another transaction", () => {
    render(<VersionPanel step={makeStep()} viewer={1} selected={2} onSelectTxn={() => {}} />);
    expect(screen.getByTestId("version-row")).toHaveAttribute("data-selected", "false");
  });

  it("clicking an owned row selects its transaction", async () => {
    const onSelect = vi.fn();
    render(<VersionPanel step={makeStep()} viewer={1} onSelectTxn={onSelect} />);
    await userEvent.click(screen.getByTestId("version-row"));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("an owned row is reachable and operable from the keyboard", async () => {
    const onSelect = vi.fn();
    render(<VersionPanel step={makeStep()} viewer={1} onSelectTxn={onSelect} />);
    const row = screen.getByTestId("version-row");
    expect(row).toHaveAttribute("tabindex", "0");
    row.focus();
    await userEvent.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("initial data belongs to no transaction, so it is not selectable", () => {
    // xmin 0 is the seed row. making it clickable would claim a transaction wrote it
    const step = makeStep({ versions: { "1": [version({ xmin: 0 })] } });
    render(<VersionPanel step={step} viewer={1} onSelectTxn={() => {}} />);
    expect(screen.getByTestId("version-row")).not.toHaveAttribute("tabindex");
  });

  it("says nothing to show rather than rendering an empty table", () => {
    render(<VersionPanel step={null} viewer={null} />);
    expect(screen.getByText(/nothing to show/i)).toBeInTheDocument();
    expect(screen.queryByTestId("version-table")).not.toBeInTheDocument();
  });
});
