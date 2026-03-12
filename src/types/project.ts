import { z } from "zod";

// ─── Project Types & Zod Schemas ───────────────────────────────────────────────

export const CreateProjectSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  slug: z
    .string()
    .min(1)
    .max(50)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Slug must be lowercase alphanumeric with hyphens"
    ),
  description: z.string().optional(),
  jiraBaseUrl: z.string().url().optional(),
  jiraUserEmail: z.string().email().optional(),
  jiraProjectKey: z.string().optional(),
  confluenceSpaceKey: z.string().optional(),
  githubRepo: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;

export const UpdateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  jiraBaseUrl: z.string().url().optional(),
  jiraUserEmail: z.string().email().optional(),
  jiraProjectKey: z.string().optional(),
  confluenceSpaceKey: z.string().optional(),
  githubRepo: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>;

export const ProjectResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  jiraBaseUrl: z.string().nullable(),
  jiraUserEmail: z.string().nullable(),
  jiraProjectKey: z.string().nullable(),
  confluenceSpaceKey: z.string().nullable(),
  githubRepo: z.string().nullable(),
  metadata: z.unknown().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ProjectResponse = z.infer<typeof ProjectResponseSchema>;

export const AssignUserSchema = z.object({
  userId: z.string().uuid("Invalid user ID"),
});
export type AssignUserInput = z.infer<typeof AssignUserSchema>;
