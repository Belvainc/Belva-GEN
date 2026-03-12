"use client";

import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { Spinner } from "../Spinner";
import { cn } from "@/lib/utils";

interface ButtonProps extends ComponentPropsWithoutRef<"button"> {
  /** Visual variant */
  variant?: "primary" | "secondary" | "danger" | "ghost";
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Show loading spinner and disable interaction */
  loading?: boolean;
}

const baseStyles =
  "inline-flex items-center justify-center font-medium rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none";

const variants = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  danger: "bg-status-error text-white hover:bg-status-error/90",
  ghost: "hover:bg-accent hover:text-accent-foreground",
} as const;

const sizes = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4",
  lg: "h-12 px-6 text-lg",
} as const;

/**
 * Button component with multiple variants and loading state.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "primary",
      size = "md",
      loading = false,
      disabled,
      className,
      children,
      ...props
    },
    ref
  ): ReactNode {
    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        disabled={disabled || loading}
        aria-busy={loading}
        {...props}
      >
        {loading && <Spinner size="sm" className="mr-2" />}
        {children}
      </button>
    );
  }
);
