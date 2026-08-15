import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Field from "@/components/field";

describe("Field", () => {
  it("labels its control", () => {
    render(
      <Field label="engine">
        <input aria-label="Engine profile" />
      </Field>,
    );
    expect(screen.getByText("engine")).toBeInTheDocument();
  });

  it("carries a transaction hue as the label's own ink", () => {
    /*
      Not a chip beside the control, which competed with the value it was labelling, and not
      a rule down the left edge, which is a border: the surfaces budget in ui.md allows a
      border on a figure card and nowhere else.
    */
    render(
      <Field label="T1 level" accent="var(--color-t1-text)">
        <input aria-label="Isolation level for transaction 1" />
      </Field>,
    );
    const label = screen.getByText("T1 level");
    const style = label.getAttribute("style") ?? "";
    expect(style).toContain("--color-t1-text");
    expect(style).not.toContain("border");
    expect(style).not.toContain("background");
  });

  it("falls back to the faint ink when it belongs to no transaction", () => {
    render(
      <Field label="engine">
        <input aria-label="Engine profile" />
      </Field>,
    );
    const style = screen.getByText("engine").getAttribute("style") ?? "";
    expect(style).toContain("--color-ink-faint");
    expect(style).not.toContain("border");
  });

  it("marks a disabled field without dimming its label", () => {
    // --color-ink-faint measures 5.04:1 at full strength, so any opacity on a 10px label
    // puts it under AA. axe flagged exactly that. the control carries the state instead
    const { container } = render(
      <Field label="value" disabled>
        <input aria-label="Value" disabled />
      </Field>,
    );
    expect(container.firstChild).toHaveAttribute("data-disabled", "true");
    expect(screen.getByText("value").className).not.toContain("opacity");
  });
});
