import type { ReactNode } from "react";
import Link from "next/link";

interface DashboardLayoutProps {
  children: ReactNode;
}

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/agents", label: "Agents" },
  { href: "/dashboard/pipeline", label: "Pipeline" },
  { href: "/dashboard/approvals", label: "Approvals" },
] as const;

export default function DashboardLayout({
  children,
}: DashboardLayoutProps): ReactNode {
  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Sidebar Navigation */}
      <aside className="w-64 border-r border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-8">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            Belva-GEN
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Agent Dashboard
          </p>
        </div>
        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100"
              aria-label={`Navigate to ${item.label}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
