import type { ReactNode } from "react";
import { DashboardSidebar } from "@/components/organisms/DashboardSidebar";

interface DashboardLayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({
  children,
}: DashboardLayoutProps): ReactNode {
  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  );
}

