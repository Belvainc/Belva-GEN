"use client";

import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface InputProps extends ComponentPropsWithoutRef<"input"> {
  /** Show error styling */
  error?: boolean;
}

/**
 * Text input component with error state.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  function Input({ error = false, className, ...props }, ref): ReactNode {
    return (
      <input
        ref={ref}
        className={cn(
          "flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:border-transparent",
          "disabled:cursor-not-allowed disabled:opacity-50",
          error
            ? "border-status-error focus:ring-status-error"
            : "border-border",
          className
        )}
        aria-invalid={error}
        {...props}
      />
    );
  }
);
