import type { ReactNode } from "react";
import { Text } from "@/components/atoms/Text";
import { Spinner } from "@/components/atoms/Spinner";
import { cn } from "@/lib/utils";

interface StatCardProps {
  /** Metric label */
  label: string;
  /** Metric value */
  value: string | number;
  /** Show loading state */
  loading?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Metric card displaying a label and value.
 */
export function StatCard({
  label,
  value,
  loading = false,
  className,
}: StatCardProps): ReactNode {
  return (
    <article
      className={cn(
        "rounded-lg border border-border bg-surface-elevated p-6",
        className
      )}
    >
      <Text variant="small" className="text-text-muted">
        {label}
      </Text>
      <div className="mt-2 flex items-baseline gap-2">
        {loading ? (
          <Spinner size="md" />
        ) : (
          <Text variant="h2" as="p" className="text-3xl">
            {value}
          </Text>
        )}
      </div>
    </article>
  );
}
