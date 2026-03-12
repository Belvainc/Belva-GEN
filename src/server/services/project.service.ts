import { prisma } from "../db/client";
import { encrypt, decrypt } from "../lib/encryption";
import { NotFoundError } from "@/lib/errors";
import type { CreateProjectInput, UpdateProjectInput, ProjectResponse } from "@/types/project";
import type { Project, Prisma } from "@prisma/client";

// ─── Project Service ───────────────────────────────────────────────────────────
// CRUD for projects with credential encryption.

export interface PaginationParams {
  cursor?: string;
  limit: number;
}

export interface PaginatedResult<T> {
  data: T[];
  nextCursor: string | null;
  total: number;
}

function toProjectResponse(project: Project): ProjectResponse {
  return {
    id: project.id,
    name: project.name,
    slug: project.slug,
    description: project.description,
    jiraBaseUrl: project.jiraBaseUrl,
    jiraUserEmail: project.jiraUserEmail,
    jiraProjectKey: project.jiraProjectKey,
    confluenceSpaceKey: project.confluenceSpaceKey,
    githubRepo: project.githubRepo,
    metadata: project.metadata,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

/**
 * Create a new project. Admin-only.
 */
export async function createProject(
  input: CreateProjectInput
): Promise<ProjectResponse> {
  const project = await prisma.project.create({
    data: {
      name: input.name,
      slug: input.slug,
      description: input.description,
      jiraBaseUrl: input.jiraBaseUrl,
      jiraUserEmail: input.jiraUserEmail,
      jiraProjectKey: input.jiraProjectKey,
      confluenceSpaceKey: input.confluenceSpaceKey,
      githubRepo: input.githubRepo,
      metadata: input.metadata !== undefined ? (input.metadata as Prisma.InputJsonValue) : undefined,
    },
  });

  return toProjectResponse(project);
}

/**
 * Get a project by ID.
 */
export async function getProjectById(
  projectId: string
): Promise<ProjectResponse> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (project === null) {
    throw new NotFoundError("Project not found", "project", projectId);
  }

  return toProjectResponse(project);
}

/**
 * Get a project by slug.
 */
export async function getProjectBySlug(
  slug: string
): Promise<ProjectResponse> {
  const project = await prisma.project.findUnique({
    where: { slug },
  });

  if (project === null) {
    throw new NotFoundError("Project not found", "project", slug);
  }

  return toProjectResponse(project);
}

/**
 * List all projects (admin) or user's assigned projects.
 */
export async function listProjects(
  params: PaginationParams,
  userId?: string
): Promise<PaginatedResult<ProjectResponse>> {
  const where = userId !== undefined
    ? { users: { some: { userId } } }
    : {};

  const [items, total] = await Promise.all([
    prisma.project.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: params.limit + 1,
      cursor: params.cursor !== undefined ? { id: params.cursor } : undefined,
      skip: params.cursor !== undefined ? 1 : 0,
    }),
    prisma.project.count({ where }),
  ]);

  const hasMore = items.length > params.limit;
  const data = hasMore ? items.slice(0, -1) : items;
  const lastItem = data[data.length - 1];
  const nextCursor = hasMore && lastItem !== undefined ? lastItem.id : null;

  return {
    data: data.map(toProjectResponse),
    nextCursor,
    total,
  };
}

/**
 * Update a project. Admin-only.
 */
export async function updateProject(
  projectId: string,
  input: UpdateProjectInput
): Promise<ProjectResponse> {
  const existing = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (existing === null) {
    throw new NotFoundError("Project not found", "project", projectId);
  }

  const updateData: Prisma.ProjectUpdateInput = {};
  if (input.name !== undefined) updateData.name = input.name;
  if (input.description !== undefined) updateData.description = input.description;
  if (input.jiraBaseUrl !== undefined) updateData.jiraBaseUrl = input.jiraBaseUrl;
  if (input.jiraUserEmail !== undefined) updateData.jiraUserEmail = input.jiraUserEmail;
  if (input.jiraProjectKey !== undefined) updateData.jiraProjectKey = input.jiraProjectKey;
  if (input.confluenceSpaceKey !== undefined) updateData.confluenceSpaceKey = input.confluenceSpaceKey;
  if (input.githubRepo !== undefined) updateData.githubRepo = input.githubRepo;
  if (input.metadata !== undefined) updateData.metadata = input.metadata as Prisma.InputJsonValue;

  const project = await prisma.project.update({
    where: { id: projectId },
    data: updateData,
  });

  return toProjectResponse(project);
}

/**
 * Delete a project. Admin-only.
 */
export async function deleteProject(projectId: string): Promise<void> {
  const existing = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (existing === null) {
    throw new NotFoundError("Project not found", "project", projectId);
  }

  await prisma.project.delete({ where: { id: projectId } });
}

// ─── User Assignment ───────────────────────────────────────────────────────────

/**
 * Assign a user to a project.
 */
export async function assignUser(
  projectId: string,
  userId: string
): Promise<void> {
  await prisma.userProject.upsert({
    where: {
      userId_projectId: { userId, projectId },
    },
    update: {},
    create: { userId, projectId },
  });
}

/**
 * Remove a user from a project.
 */
export async function removeUser(
  projectId: string,
  userId: string
): Promise<void> {
  await prisma.userProject.delete({
    where: {
      userId_projectId: { userId, projectId },
    },
  });
}

/**
 * List users assigned to a project.
 */
export async function listProjectUsers(
  projectId: string
): Promise<Array<{ userId: string; email: string; name: string; role: string; assignedAt: string }>> {
  const assignments = await prisma.userProject.findMany({
    where: { projectId },
    include: { user: true },
    orderBy: { assignedAt: "desc" },
  });

  return assignments.map((a) => ({
    userId: a.user.id,
    email: a.user.email,
    name: a.user.name,
    role: a.user.role,
    assignedAt: a.assignedAt.toISOString(),
  }));
}

// ─── Credential Management ─────────────────────────────────────────────────────

/**
 * Store an encrypted credential for a project.
 */
export async function setCredential(
  projectId: string,
  key: string,
  plaintext: string
): Promise<void> {
  const encrypted = encrypt(plaintext);

  await prisma.projectCredential.upsert({
    where: {
      projectId_key: { projectId, key },
    },
    update: {
      encryptedValue: encrypted.encryptedValue,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
    },
    create: {
      projectId,
      key,
      encryptedValue: encrypted.encryptedValue,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
    },
  });
}

/**
 * Retrieve and decrypt a credential for a project.
 */
export async function getCredential(
  projectId: string,
  key: string
): Promise<string | null> {
  const cred = await prisma.projectCredential.findUnique({
    where: {
      projectId_key: { projectId, key },
    },
  });

  if (cred === null) return null;

  return decrypt({
    encryptedValue: cred.encryptedValue,
    iv: cred.iv,
    authTag: cred.authTag,
  });
}
