import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface BadgeProps {
  /** Visual variant */
  variant?: "default" | "success" | "warning" | "error" | "info";
  /** Badge content */
  children: ReactNode;
  /** Additional CSS classes */
  className?: string;
}

const variants = {
  default: "bg-muted text-muted-foreground",
  success: "bg-status-success/10 text-status-success",
  warning: "bg-status-warning/10 text-status-warning",
  error: "bg-status-error/10 text-status-error",
  info: "bg-status-info/10 text-status-info",
} as const;

/**
 * Badge component for status indicators and labels.
 */
export function Badge({
  variant = "default",
  children,
  className,
}: BadgeProps): ReactNode {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
