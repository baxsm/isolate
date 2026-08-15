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

  it("carries a transaction hue as a rule, not as a filled chip", () => {
    // a chip beside the control competed with the value it was labelling, and made two
    // controls doing the same job look like different kinds of thing
    render(
      <Field label="T1 level" accent="var(--color-t1)">
        <input aria-label="Isolation level for transaction 1" />
      </Field>,
    );
    const label = screen.getByText("T1 level");
    expect(label.getAttribute("style")).toContain("border-left");
    expect(label.getAttribute("style")).toContain("--color-t1");
    expect(label).not.toHaveStyle({ backgroundColor: "var(--color-t1)" });
  });

  it("has no accent styling when it belongs to no transaction", () => {
    render(
      <Field label="engine">
        <input aria-label="Engine profile" />
      </Field>,
    );
    expect(screen.getByText("engine").getAttribute("style")).toBeNull();
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
