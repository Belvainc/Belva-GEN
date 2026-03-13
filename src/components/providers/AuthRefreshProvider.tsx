"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Refresh interval: 50 minutes (JWT lifetime is 60 min). */
const REFRESH_INTERVAL_MS = 50 * 60 * 1000;

/**
 * Periodically refreshes the auth JWT before it expires.
 * On session expiry (401), redirects to login.
 */
export function AuthRefreshProvider({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    async function refresh(): Promise<void> {
      try {
        const res = await fetch("/api/auth/refresh", { method: "POST" });
        if (res.status === 401) {
          window.location.href = `/login?returnTo=${encodeURIComponent(window.location.pathname)}`;
        }
      } catch {
        // Network error — will retry on next interval
      }
    }

    timerRef.current = setInterval(refresh, REFRESH_INTERVAL_MS);

    return () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  return <>{children}</>;
}
