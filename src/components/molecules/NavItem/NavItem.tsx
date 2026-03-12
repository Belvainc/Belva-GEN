"use client";

import type { ReactNode } from "react";
import {
  Shield,
  Folder,
  Home,
  Bot,
  CheckCircle,
  GitBranch,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/atoms/Badge";

type IconName = "home" | "bot" | "check-circle" | "git-branch" | "shield" | "folder";

interface NavItemProps {
  /** Navigation label */
  label: string;
  /** Icon identifier */
  icon: IconName;
  /** Whether this item is currently active */
  isActive?: boolean;
  /** Optional badge count */
  badgeCount?: number;
  /** Additional CSS classes */
  className?: string;
}

const iconMap: Record<IconName, LucideIcon> = {
  home: Home,
  bot: Bot,
  "check-circle": CheckCircle,
  "git-branch": GitBranch,
  shield: Shield,
  folder: Folder,
} as const;

/**
 * Navigation item with icon, label, and optional badge.
 */
export function NavItem({
  label,
  icon,
  isActive = false,
  badgeCount,
  className,
}: NavItemProps): ReactNode {
  const Icon = iconMap[icon];

  return (
    <span
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        isActive
          ? "bg-accent text-accent-foreground"
          : "text-text-secondary hover:bg-muted hover:text-text-primary",
        className
      )}
      aria-current={isActive ? "page" : undefined}
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span className="flex-1">{label}</span>
      {badgeCount !== undefined && badgeCount > 0 && (
        <Badge variant="default">{badgeCount}</Badge>
      )}
    </span>
  );
}
