"use client";

import type { ReactNode } from "react";
import { Text } from "@/components/atoms/Text";
import { Button } from "@/components/atoms/Button";

interface AgentsErrorProps {
  error: Error;
  reset: () => void;
}

export default function AgentsError({
  error,
  reset,
}: AgentsErrorProps): ReactNode {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <Text variant="h3" className="mb-2 text-status-error">
        Failed to load agents
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
