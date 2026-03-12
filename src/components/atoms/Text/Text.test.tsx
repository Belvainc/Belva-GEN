import { render, screen } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { Text } from "./Text";

expect.extend(toHaveNoViolations);

describe("Text", () => {
  it("renders children correctly", () => {
    render(<Text>Hello World</Text>);
    expect(screen.getByText("Hello World")).toBeInTheDocument();
  });

  it("renders as paragraph by default", () => {
    render(<Text>Paragraph</Text>);
    const element = screen.getByText("Paragraph");
    expect(element.tagName).toBe("P");
  });

  it("renders as specified element", () => {
    render(<Text as="span">Span</Text>);
    const element = screen.getByText("Span");
    expect(element.tagName).toBe("SPAN");
  });

  it("renders h1 variant as h1", () => {
    render(<Text variant="h1">Heading 1</Text>);
    const element = screen.getByText("Heading 1");
    expect(element.tagName).toBe("H1");
  });

  it("renders h2 variant as h2", () => {
    render(<Text variant="h2">Heading 2</Text>);
    const element = screen.getByText("Heading 2");
    expect(element.tagName).toBe("H2");
  });

  it("applies variant styles", () => {
    render(<Text variant="muted">Muted text</Text>);
    const element = screen.getByText("Muted text");
    expect(element.className).toContain("text-text-muted");
  });

  it("accepts custom className", () => {
    render(<Text className="custom-class">Custom</Text>);
    const element = screen.getByText("Custom");
    expect(element.className).toContain("custom-class");
  });

  it("allows overriding default element for variant", () => {
    render(
      <Text variant="h1" as="div">
        H1 styled div
      </Text>
    );
    const element = screen.getByText("H1 styled div");
    expect(element.tagName).toBe("DIV");
    expect(element.className).toContain("text-4xl");
  });

  it("has no accessibility violations", async () => {
    const { container } = render(
      <div>
        <Text variant="h1">Heading</Text>
        <Text variant="body">Body text</Text>
        <Text variant="muted">Muted text</Text>
      </div>
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
