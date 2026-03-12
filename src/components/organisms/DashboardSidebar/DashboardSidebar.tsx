"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavItem } from "@/components/molecules/NavItem";
import { Text } from "@/components/atoms/Text";

type IconName = "home" | "bot" | "check-circle" | "git-branch";

interface NavItemConfig {
  href: string;
  label: string;
  icon: IconName;
}

const navItems: NavItemConfig[] = [
  { href: "/dashboard", label: "Overview", icon: "home" },
  { href: "/dashboard/agents", label: "Agents", icon: "bot" },
  { href: "/dashboard/approvals", label: "Approvals", icon: "check-circle" },
  { href: "/dashboard/pipeline", label: "Pipeline", icon: "git-branch" },
];

/**
 * Dashboard sidebar navigation.
 */
export function DashboardSidebar(): ReactNode {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r border-border bg-surface p-6">
      <header className="mb-8">
        <Text variant="h4" as="h1">
          Belva-GEN
        </Text>
        <Text variant="muted">Agent Dashboard</Text>
      </header>

      <nav aria-label="Dashboard navigation">
        <ul className="space-y-1" role="list">
          {navItems.map((item) => (
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
      </nav>
    </aside>
  );
}
