import type { ReactNode } from "react";
import { AdminSidebar } from "@/components/organisms/AdminSidebar";
import { AuthRefreshProvider } from "@/components/providers/AuthRefreshProvider";

export default function AdminLayout({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  return (
    <div className="flex min-h-screen bg-background">
      <AdminSidebar />
      <main className="flex-1 overflow-auto p-8">
        <AuthRefreshProvider>{children}</AuthRefreshProvider>
      </main>
    </div>
  );
}
