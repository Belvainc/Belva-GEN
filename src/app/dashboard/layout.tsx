import type { ReactNode } from "react";
import { headers } from "next/headers";
import { DashboardSidebar } from "@/components/organisms/DashboardSidebar";
import { prisma } from "@/server/db/client";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}): Promise<ReactNode> {
  const headersList = await headers();
  const userId = headersList.get("x-user-id");
  const userRole = headersList.get("x-user-role") ?? undefined;

  let userName: string | undefined;
  if (userId !== null) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    userName = user?.name;
  }

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar userName={userName} userRole={userRole} />
      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  );
}
