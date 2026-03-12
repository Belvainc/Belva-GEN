import { render, screen } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { StatCard } from "./StatCard";

expect.extend(toHaveNoViolations);

describe("StatCard", () => {
  it("renders label correctly", () => {
    render(<StatCard label="Active Agents" value={5} />);
    expect(screen.getByText("Active Agents")).toBeInTheDocument();
  });

  it("renders numeric value", () => {
    render(<StatCard label="Count" value={42} />);
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("renders string value", () => {
    render(<StatCard label="Status" value="Active" />);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("shows spinner when loading", () => {
    render(<StatCard label="Loading" value="" loading />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("does not show value when loading", () => {
    render(<StatCard label="Loading" value={42} loading />);
    expect(screen.queryByText("42")).not.toBeInTheDocument();
  });

  it("accepts custom className", () => {
    const { container } = render(
      <StatCard label="Test" value={1} className="custom-class" />
    );
    expect(container.querySelector(".custom-class")).toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<StatCard label="Agents" value={5} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("has no accessibility violations when loading", async () => {
    const { container } = render(<StatCard label="Loading" value="" loading />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
