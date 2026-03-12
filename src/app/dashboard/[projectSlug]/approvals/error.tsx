"use client";

import { useEffect, type ReactNode } from "react";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ApprovalsError({ error, reset }: ErrorProps): ReactNode {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error("Approvals page error:", error);
  }, [error]);

  return (
    <main className="container mx-auto max-w-4xl py-8">
      <div
        role="alert"
        className="rounded-lg border border-risk-high/20 bg-risk-high/10 p-8 text-center"
      >
        <h2 className="text-xl font-semibold text-risk-high">
          Failed to Load Approvals
        </h2>
        <p className="mt-2 text-text-secondary">
          {error.message || "An unexpected error occurred while loading pending approvals."}
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-sm text-text-muted">
            Error ID: {error.digest}
          </p>
        )}
        <button
          type="button"
          onClick={reset}
          className="mt-6 inline-flex items-center gap-2 rounded-md bg-text-primary px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-text-primary/90 focus:outline-none focus:ring-2 focus:ring-text-primary focus:ring-offset-2"
        >
          Try Again
        </button>
      </div>
    </main>
  );
}
