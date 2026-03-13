"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavItem } from "@/components/molecules/NavItem";
import { Text } from "@/components/atoms/Text";

type IconName = "home" | "bot" | "check-circle" | "git-branch" | "shield" | "folder" | "book-open" | "database" | "activity" | "settings";

interface AdminNavItem {
  href: string;
  label: string;
  icon: IconName;
}

const dataNavItems: AdminNavItem[] = [
  { href: "/admin", label: "Overview", icon: "home" },
  { href: "/admin/users", label: "Users", icon: "shield" },
  { href: "/admin/projects", label: "Projects", icon: "folder" },
  { href: "/admin/agents", label: "Agents", icon: "bot" },
  { href: "/admin/pipelines", label: "Pipelines", icon: "git-branch" },
  { href: "/admin/approvals", label: "Approvals", icon: "check-circle" },
  { href: "/admin/knowledge", label: "Knowledge", icon: "book-open" },
  { href: "/admin/system-config", label: "System Config", icon: "database" },
];

const opsNavItems: AdminNavItem[] = [
  { href: "/admin/system-health", label: "System Health", icon: "activity" },
  { href: "/admin/queues", label: "Queues", icon: "settings" },
  { href: "/admin/audit-logs", label: "Audit Logs", icon: "shield" },
];

function isActive(href: string, pathname: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname.startsWith(href);
}

function renderNavGroup(items: AdminNavItem[], pathname: string): ReactNode {
  return (
    <ul className="space-y-1" role="list">
      {items.map((item) => (
        <li key={item.href}>
          <Link href={item.href} className="block">
            <NavItem
              label={item.label}
              icon={item.icon}
              isActive={isActive(item.href, pathname)}
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function AdminSidebar(): ReactNode {
  const pathname = usePathname();

  return (
    <aside className="flex w-64 flex-col border-r border-border bg-surface p-6">
      <header className="mb-8">
        <Text variant="h4" as="h1">
          Admin Portal
        </Text>
        <Text variant="muted">Belva-GEN</Text>
      </header>

      <nav aria-label="Admin navigation" className="flex-1">
        {renderNavGroup(dataNavItems, pathname)}

        <div className="my-4 border-t border-border" />
        <Text variant="muted" className="mb-2 px-3 text-xs uppercase tracking-wider">
          Operations
        </Text>
        {renderNavGroup(opsNavItems, pathname)}
      </nav>

      <div className="mt-auto border-t border-border pt-4">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-surface-secondary hover:text-foreground"
        >
          &larr; Back to User Dashboard
        </Link>
      </div>
    </aside>
  );
}
