"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { Text } from "@/components/atoms/Text";
import { Button } from "@/components/atoms/Button/Button";
import { Input } from "@/components/atoms/Input/Input";
import { Select } from "@/components/atoms/Select";
import { TabBar } from "@/components/molecules/TabBar";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ColumnDef {
  key: string;
  label: string;
  type: string;
  enumValues?: string[];
  readOnly?: boolean;
  inEdit?: boolean;
}

interface ConfigMeta {
  allowEdit: boolean;
  allowDelete: boolean;
  columns: ColumnDef[];
}

interface ProjectRecord {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  jiraProjectKey: string | null;
  githubRepo: string | null;
  [key: string]: unknown;
}

interface ProjectUser {
  userId: string;
  email: string;
  name: string;
  role: string;
  assignedAt: string;
}

interface AdminUser {
  id: string;
  email: string;
  name: string;
}

interface Credential {
  id: string;
  key: string;
  createdAt: string;
  updatedAt: string;
}

const TABS = [
  { key: "settings", label: "Settings" },
  { key: "users", label: "Users" },
  { key: "credentials", label: "Credentials" },
] as const;

const CREDENTIAL_KEY_OPTIONS = [
  { value: "jira_api_token", label: "Jira API Token" },
  { value: "github_token", label: "GitHub Token" },
  { value: "slack_webhook_url", label: "Slack Webhook URL" },
  { value: "confluence_api_token", label: "Confluence API Token" },
  { value: "__custom__", label: "Custom..." },
];

// ─── Helper ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ProjectDetailPage(): ReactNode {
  const params = useParams();
  const router = useRouter();
  const urlId = params.id as string;

  const [activeTab, setActiveTab] = useState("settings");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Project data
  const [record, setRecord] = useState<ProjectRecord | null>(null);
  const [config, setConfig] = useState<ConfigMeta | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);

  // Users tab
  const [users, setUsers] = useState<ProjectUser[]>([]);
  const [allUsers, setAllUsers] = useState<AdminUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [usersLoading, setUsersLoading] = useState(false);

  // Credentials tab
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [credentialsLoading, setCredentialsLoading] = useState(false);
  const [credKeySelect, setCredKeySelect] = useState("jira_api_token");
  const [credCustomKey, setCredCustomKey] = useState("");
  const [credValue, setCredValue] = useState("");
  const [credSaving, setCredSaving] = useState(false);

  // Derived project ID from the fetched record (UUID)
  const projectId = record?.id ?? urlId;

  // ─── Data Loading ──────────────────────────────────────────────────────────

  useEffect(() => {
    async function loadProject(): Promise<void> {
      try {
        const res = await fetch(`/api/admin/projects/${urlId}`);
        const json = (await res.json()) as {
          success: boolean;
          data: { record: ProjectRecord; config: ConfigMeta };
        };
        if (json.success) {
          setRecord(json.data.record);
          setConfig(json.data.config);
          setFormData(json.data.record);
        } else {
          setError("Failed to load project");
        }
      } catch {
        setError("Failed to load project");
      } finally {
        setLoading(false);
      }
    }
    loadProject();
  }, [urlId]);

  const loadUsers = useCallback(async (): Promise<void> => {
    setUsersLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/users`);
      const json = (await res.json()) as { success: boolean; data: ProjectUser[] };
      if (json.success) {
        setUsers(json.data);
      }
    } catch {
      // Silently fail — user can retry via tab switch
    } finally {
      setUsersLoading(false);
    }
  }, [projectId]);

  const loadAllUsers = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch("/api/admin/users?limit=100");
      const json = (await res.json()) as {
        success: boolean;
        data: { data: AdminUser[] };
      };
      if (json.success) {
        setAllUsers(json.data.data);
      }
    } catch {
      // Silently fail
    }
  }, []);

  const loadCredentials = useCallback(async (): Promise<void> => {
    setCredentialsLoading(true);
    try {
      const res = await fetch(`/api/admin/projects/${projectId}/credentials`);
      const json = (await res.json()) as { success: boolean; data: Credential[] };
      if (json.success) {
        setCredentials(json.data);
      }
    } catch {
      // Silently fail
    } finally {
      setCredentialsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (record === null) return;
    if (activeTab === "users") {
      loadUsers();
      loadAllUsers();
    } else if (activeTab === "credentials") {
      loadCredentials();
    }
  }, [activeTab, record, loadUsers, loadAllUsers, loadCredentials]);

  // ─── Settings Handlers ─────────────────────────────────────────────────────

  async function handleSave(): Promise<void> {
    setSaving(true);
    setError(null);

    try {
      const editableData: Record<string, unknown> = {};
      const editableKeys = ["name", "slug", "description", "jiraProjectKey", "githubRepo"];
      for (const key of editableKeys) {
        if (key in formData) {
          editableData[key] = formData[key];
        }
      }

      const res = await fetch(`/api/admin/projects/${urlId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editableData),
      });

      const json = (await res.json()) as { success: boolean; error?: { message: string } };
      if (!json.success) {
        setError(json.error?.message ?? "Failed to save");
        return;
      }

      router.push("/admin/projects");
    } catch {
      setError("Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!confirm("Are you sure you want to delete this project? This action cannot be undone.")) {
      return;
    }

    const res = await fetch(`/api/admin/projects/${urlId}`, { method: "DELETE" });
    const json = (await res.json()) as { success: boolean };
    if (json.success) {
      router.push("/admin/projects");
    }
  }

  // ─── Users Handlers ────────────────────────────────────────────────────────

  async function handleAssignUser(): Promise<void> {
    if (selectedUserId === "") return;

    const res = await fetch(`/api/projects/${projectId}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: selectedUserId }),
    });

    const json = (await res.json()) as { success: boolean };
    if (json.success) {
      setSelectedUserId("");
      await loadUsers();
    }
  }

  async function handleRemoveUser(userId: string): Promise<void> {
    if (!confirm("Remove this user from the project?")) return;

    const res = await fetch(`/api/projects/${projectId}/users?userId=${userId}`, {
      method: "DELETE",
    });

    const json = (await res.json()) as { success: boolean };
    if (json.success) {
      await loadUsers();
    }
  }

  // ─── Credentials Handlers ──────────────────────────────────────────────────

  async function handleAddCredential(): Promise<void> {
    const key = credKeySelect === "__custom__" ? credCustomKey.trim() : credKeySelect;
    if (key === "" || credValue === "") return;

    setCredSaving(true);
    try {
      const res = await fetch(`/api/admin/projects/${projectId}/credentials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value: credValue }),
      });

      const json = (await res.json()) as { success: boolean };
      if (json.success) {
        setCredKeySelect("jira_api_token");
        setCredCustomKey("");
        setCredValue("");
        await loadCredentials();
      }
    } catch {
      // Silently fail
    } finally {
      setCredSaving(false);
    }
  }

  async function handleDeleteCredential(key: string): Promise<void> {
    if (!confirm(`Delete credential "${key}"? This action cannot be undone.`)) return;

    const res = await fetch(
      `/api/admin/projects/${projectId}/credentials?key=${encodeURIComponent(key)}`,
      { method: "DELETE" }
    );

    const json = (await res.json()) as { success: boolean };
    if (json.success) {
      await loadCredentials();
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="py-8 text-center text-muted-foreground">Loading...</div>;
  }

  if (record === null || config === null) {
    return <div className="py-8 text-center text-muted-foreground">Project not found</div>;
  }

  function updateField(key: string, value: string): void {
    setFormData((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <Text variant="h2" as="h2">
          {record.name}
        </Text>
        <Button variant="ghost" onClick={() => router.push("/admin/projects")}>
          Back to Projects
        </Button>
      </div>

      <TabBar
        tabs={[...TABS]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {error !== null && (
        <div
          role="alert"
          className="mt-4 rounded-md border border-status-error/20 bg-status-error/10 px-4 py-3 text-sm text-status-error"
        >
          {error}
        </div>
      )}

      <div className="mt-6">
        {/* ── Settings Tab ──────────────────────────────────────────────── */}
        {activeTab === "settings" && (
          <div className="rounded-xl border border-border bg-surface p-6">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="field-name" className="text-sm font-medium text-foreground">
                  Name
                </label>
                <Input
                  id="field-name"
                  value={String(formData.name ?? "")}
                  onChange={(e) => updateField("name", e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="field-slug" className="text-sm font-medium text-foreground">
                  Slug
                </label>
                <Input
                  id="field-slug"
                  value={String(formData.slug ?? "")}
                  onChange={(e) => updateField("slug", e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="field-description" className="text-sm font-medium text-foreground">
                  Description
                </label>
                <Input
                  id="field-description"
                  value={String(formData.description ?? "")}
                  onChange={(e) => updateField("description", e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="field-jiraProjectKey" className="text-sm font-medium text-foreground">
                  Jira Project Key
                </label>
                <Input
                  id="field-jiraProjectKey"
                  value={String(formData.jiraProjectKey ?? "")}
                  onChange={(e) => updateField("jiraProjectKey", e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="field-githubRepo" className="text-sm font-medium text-foreground">
                  GitHub Repo
                </label>
                <Input
                  id="field-githubRepo"
                  value={String(formData.githubRepo ?? "")}
                  onChange={(e) => updateField("githubRepo", e.target.value)}
                />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <Button variant="primary" onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save Changes"}
              </Button>
              <Button variant="secondary" onClick={() => router.push("/admin/projects")}>
                Cancel
              </Button>
              {config.allowDelete && (
                <Button variant="danger" onClick={handleDelete} className="ml-auto">
                  Delete Project
                </Button>
              )}
            </div>
          </div>
        )}

        {/* ── Users Tab ─────────────────────────────────────────────────── */}
        {activeTab === "users" && (
          <div className="space-y-6">
            {/* Add User Section */}
            <div className="rounded-xl border border-border bg-surface p-6">
              <Text variant="h4" as="h3" className="mb-4">
                Add User
              </Text>
              <div className="flex items-end gap-3">
                <div className="flex-1 space-y-1.5">
                  <label htmlFor="assign-user" className="text-sm font-medium text-foreground">
                    Select User
                  </label>
                  <Select
                    id="assign-user"
                    options={[
                      { value: "", label: "Select a user..." },
                      ...allUsers
                        .filter((u) => !users.some((pu) => pu.userId === u.id))
                        .map((u) => ({ value: u.id, label: `${u.name} (${u.email})` })),
                    ]}
                    value={selectedUserId}
                    onChange={(e) => setSelectedUserId(e.target.value)}
                  />
                </div>
                <Button
                  variant="primary"
                  onClick={handleAssignUser}
                  disabled={selectedUserId === ""}
                >
                  Assign
                </Button>
              </div>
            </div>

            {/* Users Table */}
            <div className="rounded-xl border border-border bg-surface">
              {usersLoading ? (
                <div className="py-8 text-center text-muted-foreground">Loading users...</div>
              ) : users.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  No users assigned to this project
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="px-4 py-3 font-medium text-muted-foreground">Name</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Email</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Role</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Assigned</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.userId} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 text-foreground">{user.name}</td>
                        <td className="px-4 py-3 text-muted-foreground">{user.email}</td>
                        <td className="px-4 py-3 text-muted-foreground">{user.role}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatDate(user.assignedAt)}
                        </td>
                        <td className="px-4 py-3">
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleRemoveUser(user.userId)}
                          >
                            Remove
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ── Credentials Tab ───────────────────────────────────────────── */}
        {activeTab === "credentials" && (
          <div className="space-y-6">
            {/* Add Credential Section */}
            <div className="rounded-xl border border-border bg-surface p-6">
              <Text variant="h4" as="h3" className="mb-4">
                Add Credential
              </Text>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="cred-key" className="text-sm font-medium text-foreground">
                    Key
                  </label>
                  <Select
                    id="cred-key"
                    options={CREDENTIAL_KEY_OPTIONS}
                    value={credKeySelect}
                    onChange={(e) => setCredKeySelect(e.target.value)}
                  />
                </div>

                {credKeySelect === "__custom__" && (
                  <div className="space-y-1.5">
                    <label htmlFor="cred-custom-key" className="text-sm font-medium text-foreground">
                      Custom Key
                    </label>
                    <Input
                      id="cred-custom-key"
                      placeholder="e.g. my_custom_token"
                      value={credCustomKey}
                      onChange={(e) => setCredCustomKey(e.target.value)}
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <label htmlFor="cred-value" className="text-sm font-medium text-foreground">
                    Value
                  </label>
                  <Input
                    id="cred-value"
                    type="password"
                    placeholder="Credential value (encrypted at rest)"
                    value={credValue}
                    onChange={(e) => setCredValue(e.target.value)}
                  />
                </div>

                <Button
                  variant="primary"
                  onClick={handleAddCredential}
                  disabled={credSaving || credValue === ""}
                >
                  {credSaving ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>

            {/* Credentials Table */}
            <div className="rounded-xl border border-border bg-surface">
              {credentialsLoading ? (
                <div className="py-8 text-center text-muted-foreground">
                  Loading credentials...
                </div>
              ) : credentials.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  No credentials configured
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="px-4 py-3 font-medium text-muted-foreground">Key</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Last Updated</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {credentials.map((cred) => (
                      <tr key={cred.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 font-mono text-foreground">{cred.key}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatDate(cred.updatedAt)}
                        </td>
                        <td className="px-4 py-3">
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleDeleteCredential(cred.key)}
                          >
                            Delete
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
