import type { ReactNode, ElementType, ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

type TextVariant = "h1" | "h2" | "h3" | "h4" | "body" | "small" | "muted";

type TextProps<T extends ElementType = "p"> = {
  /** HTML element to render */
  as?: T;
  /** Typography variant */
  variant?: TextVariant;
  /** Text content */
  children: ReactNode;
  /** Additional CSS classes */
  className?: string;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "variant" | "children" | "className">;

const variantStyles: Record<TextVariant, string> = {
  h1: "text-4xl font-bold tracking-tight text-text-primary",
  h2: "text-3xl font-semibold tracking-tight text-text-primary",
  h3: "text-2xl font-semibold text-text-primary",
  h4: "text-xl font-semibold text-text-primary",
  body: "text-base text-text-primary",
  small: "text-sm text-text-secondary",
  muted: "text-sm text-text-muted",
} as const;

const defaultElements: Record<TextVariant, ElementType> = {
  h1: "h1",
  h2: "h2",
  h3: "h3",
  h4: "h4",
  body: "p",
  small: "p",
  muted: "p",
} as const;

/**
 * Typography component for consistent text styling.
 */
export function Text<T extends ElementType = "p">({
  as,
  variant = "body",
  children,
  className,
  ...props
}: TextProps<T>): ReactNode {
  const Component = as ?? defaultElements[variant];

  return (
    <Component className={cn(variantStyles[variant], className)} {...props}>
      {children}
    </Component>
  );
}
