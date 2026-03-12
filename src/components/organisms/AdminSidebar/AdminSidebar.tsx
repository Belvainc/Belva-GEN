"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavItem } from "@/components/molecules/NavItem";
import { Text } from "@/components/atoms/Text";

type IconName = "home" | "bot" | "check-circle" | "git-branch" | "shield" | "folder";

interface AdminNavItem {
  href: string;
  label: string;
  icon: IconName;
}

const adminNavItems: AdminNavItem[] = [
  { href: "/admin", label: "Dashboard", icon: "home" },
  { href: "/admin/users", label: "Users", icon: "shield" },
  { href: "/admin/projects", label: "Projects", icon: "folder" },
  { href: "/admin/agents", label: "Agents", icon: "bot" },
  { href: "/admin/pipelines", label: "Pipelines", icon: "git-branch" },
  { href: "/admin/approvals", label: "Approvals", icon: "check-circle" },
  { href: "/admin/audit-logs", label: "Audit Logs", icon: "shield" },
];

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
        <ul className="space-y-1" role="list">
          {adminNavItems.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="block">
                <NavItem
                  label={item.label}
                  icon={item.icon}
                  isActive={
                    item.href === "/admin"
                      ? pathname === "/admin"
                      : pathname.startsWith(item.href)
                  }
                />
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-auto border-t border-border pt-4">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-surface-secondary hover:text-foreground"
        >
          &larr; Back to Dashboard
        </Link>
      </div>
    </aside>
  );
}
