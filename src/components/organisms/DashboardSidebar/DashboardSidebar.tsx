"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { NavItem } from "@/components/molecules/NavItem";
import { Text } from "@/components/atoms/Text";

type IconName = "home" | "bot" | "check-circle" | "git-branch" | "shield" | "folder" | "book-open";

interface NavItemConfig {
  href: string;
  label: string;
  icon: IconName;
}

/**
 * Extract the project slug from the current path.
 * Pattern: /dashboard/[projectSlug]/...
 */
function extractProjectSlug(pathname: string): string | null {
  const match = pathname.match(/^\/dashboard\/([^/]+)/);
  if (match === null || match[1] === undefined) return null;
  return match[1];
}

/**
 * Dashboard sidebar navigation.
 * Adapts links based on whether we're in a project context or not.
 */
export function DashboardSidebar({
  userName,
  userRole,
}: {
  userName?: string;
  userRole?: string;
}): ReactNode {
  const pathname = usePathname();
  const router = useRouter();
  const projectSlug = extractProjectSlug(pathname);

  const projectNavItems: NavItemConfig[] =
    projectSlug !== null
      ? [
          { href: `/dashboard/${projectSlug}`, label: "Overview", icon: "home" },
          { href: `/dashboard/${projectSlug}/agents`, label: "Agents", icon: "bot" },
          { href: `/dashboard/${projectSlug}/approvals`, label: "Approvals", icon: "check-circle" },
          { href: `/dashboard/${projectSlug}/pipeline`, label: "Pipeline", icon: "git-branch" },
          { href: `/dashboard/${projectSlug}/knowledge`, label: "Knowledge", icon: "book-open" },
        ]
      : [{ href: "/dashboard", label: "Projects", icon: "folder" }];

  async function handleLogout(): Promise<void> {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <aside className="flex w-64 flex-col border-r border-border bg-surface p-6">
      <header className="mb-8">
        <Text variant="h4" as="h1">
          Belva-GEN
        </Text>
        <Text variant="muted">
          {projectSlug !== null ? projectSlug : "Agent Dashboard"}
        </Text>
      </header>

      <nav aria-label="Dashboard navigation" className="flex-1">
        {projectSlug !== null && (
          <div className="mb-4">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              &larr; All Projects
            </Link>
          </div>
        )}

        <ul className="space-y-1" role="list">
          {projectNavItems.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="block">
                <NavItem
                  label={item.label}
                  icon={item.icon}
                  isActive={pathname === item.href}
                />
              </Link>
            </li>
          ))}
        </ul>

        {userRole === "ADMIN" && (
          <div className="mt-8 border-t border-border pt-4">
            <Text variant="muted" className="mb-2 text-xs uppercase tracking-wider">
              Admin
            </Text>
            <ul className="space-y-1" role="list">
              <li>
                <Link href="/admin" className="block">
                  <NavItem
                    label="Admin Portal"
                    icon="shield"
                    isActive={pathname.startsWith("/admin")}
                  />
                </Link>
              </li>
            </ul>
          </div>
        )}
      </nav>

      {/* User menu */}
      <div className="mt-auto border-t border-border pt-4">
        {userName !== undefined && (
          <Text variant="small" className="mb-2 truncate">
            {userName}
          </Text>
        )}
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-surface-secondary hover:text-foreground"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
