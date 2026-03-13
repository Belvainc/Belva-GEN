"use client";

import { useState, type ReactNode, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { Text } from "@/components/atoms/Text";
import { Input } from "@/components/atoms/Input/Input";
import { Select } from "@/components/atoms/Select";
import { Textarea } from "@/components/atoms/Textarea";
import { Button } from "@/components/atoms/Button/Button";

// Field configs by model slug
const MODEL_FIELDS: Record<
  string,
  Array<{
    key: string;
    label: string;
    type: "text" | "email" | "password" | "select" | "textarea";
    options?: Array<{ value: string; label: string }>;
    required?: boolean;
    placeholder?: string;
  }>
> = {
  users: [
    { key: "email", label: "Email", type: "email", required: true },
    { key: "name", label: "Name", type: "text", required: true },
    { key: "password", label: "Password", type: "password", required: true, placeholder: "Minimum 8 characters" },
    {
      key: "role",
      label: "Role",
      type: "select",
      options: [
        { value: "USER", label: "User" },
        { value: "ADMIN", label: "Admin" },
      ],
    },
  ],
  projects: [
    { key: "name", label: "Name", type: "text", required: true },
    { key: "slug", label: "Slug", type: "text", required: true, placeholder: "lowercase-with-hyphens" },
    { key: "description", label: "Description", type: "textarea" },
    { key: "jiraBaseUrl", label: "Jira Base URL", type: "text", placeholder: "https://your-org.atlassian.net" },
    { key: "jiraUserEmail", label: "Jira User Email", type: "email" },
    { key: "jiraProjectKey", label: "Jira Project Key", type: "text", placeholder: "PROJ" },
    { key: "confluenceSpaceKey", label: "Confluence Space Key", type: "text" },
    { key: "githubRepo", label: "GitHub Repo", type: "text", placeholder: "owner/repo" },
  ],
  "system-config": [
    { key: "key", label: "Config Key", type: "text", required: true, placeholder: "e.g. approvalTimeoutMs, enableSlackNotifications, taskTimeoutMs" },
    { key: "value", label: "Value (JSON)", type: "textarea", required: true, placeholder: '{"setting": "value"} or a raw number/string' },
    { key: "updatedBy", label: "Updated By", type: "text", placeholder: "admin@example.com" },
  ],
  knowledge: [
    { key: "title", label: "Title", type: "text", required: true },
    {
      key: "category",
      label: "Category",
      type: "select",
      required: true,
      options: [
        { value: "PATTERN", label: "Pattern" },
        { value: "GOTCHA", label: "Gotcha" },
        { value: "DECISION", label: "Decision" },
        { value: "OPTIMIZATION", label: "Optimization" },
      ],
    },
    { key: "content", label: "Content", type: "textarea", required: true },
    { key: "sourceTicketRef", label: "Source Ticket", type: "text", placeholder: "BELVA-123" },
    { key: "confidence", label: "Confidence", type: "text", placeholder: "0.0 - 1.0" },
  ],
};

export default function AdminModelCreatePage(): ReactNode {
  const params = useParams();
  const router = useRouter();
  const model = params.model as string;

  const [formData, setFormData] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fields = MODEL_FIELDS[model];
  const modelName = model.replace(/-/g, " ").replace(/^./, (s) => s.toUpperCase());

  if (fields === undefined) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        Create form not available for this model.
      </div>
    );
  }

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/${model}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const json = (await res.json()) as {
        success: boolean;
        error?: { message: string };
      };

      if (!json.success) {
        setError(json.error?.message ?? "Failed to create record");
        return;
      }

      router.push(`/admin/${model}`);
    } catch {
      setError("Failed to create record");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <Text variant="h2" as="h2" className="mb-6">
        Create {modelName}
      </Text>

      <div className="max-w-lg rounded-xl border border-border bg-surface p-6">
        {error !== null && (
          <div
            role="alert"
            className="mb-4 rounded-md border border-status-error/20 bg-status-error/10 px-4 py-3 text-sm text-status-error"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {fields.map((field) => (
            <div key={field.key} className="space-y-1.5">
              <label
                htmlFor={`field-${field.key}`}
                className="text-sm font-medium text-foreground"
              >
                {field.label}
                {field.required === true && (
                  <span className="text-status-error"> *</span>
                )}
              </label>

              {field.type === "select" && field.options !== undefined ? (
                <Select
                  id={`field-${field.key}`}
                  options={field.options}
                  value={formData[field.key] ?? field.options[0]?.value ?? ""}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      [field.key]: e.target.value,
                    }))
                  }
                />
              ) : field.type === "textarea" ? (
                <Textarea
                  id={`field-${field.key}`}
                  value={formData[field.key] ?? ""}
                  placeholder={field.placeholder}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      [field.key]: e.target.value,
                    }))
                  }
                />
              ) : (
                <Input
                  id={`field-${field.key}`}
                  type={field.type}
                  value={formData[field.key] ?? ""}
                  placeholder={field.placeholder}
                  required={field.required}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      [field.key]: e.target.value,
                    }))
                  }
                />
              )}
            </div>
          ))}

          <div className="flex gap-3 pt-4">
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? "Creating..." : `Create ${modelName}`}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.push(`/admin/${model}`)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
