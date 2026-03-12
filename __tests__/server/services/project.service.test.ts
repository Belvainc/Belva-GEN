import {
  createProject,
  getProjectById,
  getProjectBySlug,
  listProjects,
  updateProject,
  deleteProject,
  assignUser,
  removeUser,
  listProjectUsers,
  setCredential,
  getCredential,
} from "@/server/services/project.service";
import { NotFoundError } from "@/lib/errors";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockProject = {
  id: "proj-123",
  name: "Test Project",
  slug: "test-project",
  description: "A test project",
  jiraBaseUrl: "https://jira.example.com",
  jiraUserEmail: "bot@belva.dev",
  jiraProjectKey: "TEST",
  confluenceSpaceKey: null,
  githubRepo: "org/repo",
  metadata: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

jest.mock("@/server/db/client", () => ({
  prisma: {
    project: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    userProject: {
      upsert: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
    },
    projectCredential: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
    },
  },
}));

jest.mock("@/server/lib/encryption", () => ({
  encrypt: jest.fn().mockReturnValue({
    encryptedValue: "encrypted",
    iv: "test-iv",
    authTag: "test-tag",
  }),
  decrypt: jest.fn().mockReturnValue("decrypted-secret"),
}));

import { prisma } from "@/server/db/client";

const mockProjectCreate = prisma.project.create as jest.Mock;
const mockProjectFindUnique = prisma.project.findUnique as jest.Mock;
const mockProjectFindMany = prisma.project.findMany as jest.Mock;
const mockProjectCount = prisma.project.count as jest.Mock;
const mockProjectUpdate = prisma.project.update as jest.Mock;
const mockProjectDelete = prisma.project.delete as jest.Mock;

describe("project service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createProject", () => {
    it("creates a project and returns response", async () => {
      mockProjectCreate.mockResolvedValue(mockProject);

      const result = await createProject({
        name: "Test Project",
        slug: "test-project",
        jiraBaseUrl: "https://jira.example.com",
        jiraUserEmail: "bot@belva.dev",
        jiraProjectKey: "TEST",
        githubRepo: "org/repo",
      });

      expect(result.id).toBe("proj-123");
      expect(result.name).toBe("Test Project");
      expect(result.slug).toBe("test-project");
      expect(result.createdAt).toBe("2026-01-01T00:00:00.000Z");
    });
  });

  describe("getProjectById", () => {
    it("returns project for valid ID", async () => {
      mockProjectFindUnique.mockResolvedValue(mockProject);

      const result = await getProjectById("proj-123");
      expect(result.id).toBe("proj-123");
    });

    it("throws NotFoundError for non-existent project", async () => {
      mockProjectFindUnique.mockResolvedValue(null);
      await expect(getProjectById("non-existent")).rejects.toThrow(
        NotFoundError
      );
    });
  });

  describe("getProjectBySlug", () => {
    it("returns project for valid slug", async () => {
      mockProjectFindUnique.mockResolvedValue(mockProject);

      const result = await getProjectBySlug("test-project");
      expect(result.slug).toBe("test-project");
    });

    it("throws NotFoundError for non-existent slug", async () => {
      mockProjectFindUnique.mockResolvedValue(null);
      await expect(getProjectBySlug("nope")).rejects.toThrow(NotFoundError);
    });
  });

  describe("listProjects", () => {
    it("returns paginated projects for admin (no userId filter)", async () => {
      mockProjectFindMany.mockResolvedValue([mockProject]);
      mockProjectCount.mockResolvedValue(1);

      const result = await listProjects({ limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(mockProjectFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} })
      );
    });

    it("filters by user assignment when userId provided", async () => {
      mockProjectFindMany.mockResolvedValue([mockProject]);
      mockProjectCount.mockResolvedValue(1);

      await listProjects({ limit: 10 }, "user-123");

      expect(mockProjectFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { users: { some: { userId: "user-123" } } },
        })
      );
    });
  });

  describe("updateProject", () => {
    it("updates and returns project", async () => {
      mockProjectFindUnique.mockResolvedValue(mockProject);
      mockProjectUpdate.mockResolvedValue({
        ...mockProject,
        name: "Updated",
      });

      const result = await updateProject("proj-123", { name: "Updated" });
      expect(result.name).toBe("Updated");
    });

    it("throws NotFoundError for non-existent project", async () => {
      mockProjectFindUnique.mockResolvedValue(null);

      await expect(
        updateProject("non-existent", { name: "Nope" })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("deleteProject", () => {
    it("deletes existing project", async () => {
      mockProjectFindUnique.mockResolvedValue(mockProject);
      mockProjectDelete.mockResolvedValue(mockProject);

      await deleteProject("proj-123");
      expect(mockProjectDelete).toHaveBeenCalledWith({
        where: { id: "proj-123" },
      });
    });

    it("throws NotFoundError for non-existent project", async () => {
      mockProjectFindUnique.mockResolvedValue(null);
      await expect(deleteProject("non-existent")).rejects.toThrow(
        NotFoundError
      );
    });
  });

  describe("user assignment", () => {
    it("assignUser upserts a user-project record", async () => {
      (prisma.userProject.upsert as jest.Mock).mockResolvedValue({});

      await assignUser("proj-123", "user-456");

      expect(prisma.userProject.upsert).toHaveBeenCalledWith({
        where: {
          userId_projectId: { userId: "user-456", projectId: "proj-123" },
        },
        update: {},
        create: { userId: "user-456", projectId: "proj-123" },
      });
    });

    it("removeUser deletes user-project record", async () => {
      (prisma.userProject.delete as jest.Mock).mockResolvedValue({});

      await removeUser("proj-123", "user-456");

      expect(prisma.userProject.delete).toHaveBeenCalledWith({
        where: {
          userId_projectId: { userId: "user-456", projectId: "proj-123" },
        },
      });
    });

    it("listProjectUsers returns mapped user assignments", async () => {
      (prisma.userProject.findMany as jest.Mock).mockResolvedValue([
        {
          assignedAt: new Date("2026-01-15"),
          user: {
            id: "user-456",
            email: "dev@belva.dev",
            name: "Developer",
            role: "USER",
          },
        },
      ]);

      const result = await listProjectUsers("proj-123");

      expect(result).toHaveLength(1);
      const first = result[0]!;
      expect(first.userId).toBe("user-456");
      expect(first.email).toBe("dev@belva.dev");
      expect(first.assignedAt).toBe("2026-01-15T00:00:00.000Z");
    });
  });

  describe("credential management", () => {
    it("setCredential encrypts and stores credential", async () => {
      (prisma.projectCredential.upsert as jest.Mock).mockResolvedValue({});

      await setCredential("proj-123", "jira_api_token", "secret-token");

      expect(prisma.projectCredential.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            projectId_key: { projectId: "proj-123", key: "jira_api_token" },
          },
          create: expect.objectContaining({
            projectId: "proj-123",
            key: "jira_api_token",
            encryptedValue: "encrypted",
            iv: "test-iv",
            authTag: "test-tag",
          }),
        })
      );
    });

    it("getCredential decrypts stored credential", async () => {
      (prisma.projectCredential.findUnique as jest.Mock).mockResolvedValue({
        encryptedValue: "encrypted",
        iv: "test-iv",
        authTag: "test-tag",
      });

      const result = await getCredential("proj-123", "jira_api_token");
      expect(result).toBe("decrypted-secret");
    });

    it("getCredential returns null for non-existent credential", async () => {
      (prisma.projectCredential.findUnique as jest.Mock).mockResolvedValue(
        null
      );

      const result = await getCredential("proj-123", "nonexistent");
      expect(result).toBeNull();
    });
  });
});
