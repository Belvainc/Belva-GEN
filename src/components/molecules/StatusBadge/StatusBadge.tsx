import type { ReactNode } from "react";
import { Badge } from "@/components/atoms/Badge";

type Status = "idle" | "busy" | "offline" | "error";

interface StatusBadgeProps {
  /** Agent status value */
  status: Status;
}

const statusConfig: Record<
  Status,
  { variant: "success" | "warning" | "error" | "default"; label: string }
> = {
  idle: { variant: "success", label: "Idle" },
  busy: { variant: "warning", label: "Busy" },
  offline: { variant: "default", label: "Offline" },
  error: { variant: "error", label: "Error" },
} as const;

/**
 * Status badge that maps status values to visual variants.
 */
export function StatusBadge({ status }: StatusBadgeProps): ReactNode {
  const config = statusConfig[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
