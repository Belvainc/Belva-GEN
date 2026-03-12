"use client";

import type { ReactNode } from "react";
import { Text } from "@/components/atoms/Text";
import { Button } from "@/components/atoms/Button";

interface DashboardErrorProps {
  error: Error;
  reset: () => void;
}

export default function DashboardError({
  error,
  reset,
}: DashboardErrorProps): ReactNode {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <Text variant="h3" className="mb-2 text-status-error">
        Something went wrong
      </Text>
      <Text variant="muted" className="mb-6">
        {error.message}
      </Text>
      <Button onClick={reset} variant="secondary">
        Try again
      </Button>
    </div>
  );
}
