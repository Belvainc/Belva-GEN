import { render, screen } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { StatusBadge } from "./StatusBadge";

expect.extend(toHaveNoViolations);

describe("StatusBadge", () => {
  it("renders idle status with success variant", () => {
    render(<StatusBadge status="idle" />);
    const badge = screen.getByText("Idle");
    expect(badge.className).toContain("text-status-success");
  });

  it("renders busy status with warning variant", () => {
    render(<StatusBadge status="busy" />);
    const badge = screen.getByText("Busy");
    expect(badge.className).toContain("text-status-warning");
  });

  it("renders offline status with default variant", () => {
    render(<StatusBadge status="offline" />);
    const badge = screen.getByText("Offline");
    expect(badge.className).toContain("bg-muted");
  });

  it("renders error status with error variant", () => {
    render(<StatusBadge status="error" />);
    const badge = screen.getByText("Error");
    expect(badge.className).toContain("text-status-error");
  });

  it("has no accessibility violations", async () => {
    const { container } = render(
      <div>
        <StatusBadge status="idle" />
        <StatusBadge status="busy" />
        <StatusBadge status="offline" />
        <StatusBadge status="error" />
      </div>
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
