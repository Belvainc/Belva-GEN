"use client";

import type { ReactNode } from "react";
import { Text } from "@/components/atoms/Text";

export default function SettingsError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}): ReactNode {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16" role="alert">
      <Text variant="h3" as="h2">
        Failed to load settings
      </Text>
      <Text variant="muted">
        {error.message || "An unexpected error occurred."}
      </Text>
      <button
        type="button"
        onClick={reset}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent/90"
      >
        Try again
      </button>
    </div>
  );
}
