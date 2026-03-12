import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db/client";

interface ProjectLayoutProps {
  children: ReactNode;
  params: Promise<{ projectSlug: string }>;
}

/**
 * Layout for project-scoped dashboard pages.
 * Validates the project slug exists before rendering children.
 */
export default async function ProjectLayout({
  children,
  params,
}: ProjectLayoutProps): Promise<ReactNode> {
  const { projectSlug } = await params;

  const project = await prisma.project.findUnique({
    where: { slug: projectSlug },
    select: { id: true, name: true, slug: true },
  });

  if (project === null) {
    notFound();
  }

  return <>{children}</>;
}
