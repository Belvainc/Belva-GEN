"use client";

import { useState, useEffect, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { Text } from "@/components/atoms/Text";
import { Button } from "@/components/atoms/Button/Button";
import { Input } from "@/components/atoms/Input/Input";
import { Select } from "@/components/atoms/Select";
import { Textarea } from "@/components/atoms/Textarea";

// Known enum values by field name
const ENUM_VALUES: Record<string, string[]> = {
  role: ["USER", "ADMIN"],
  status: ["ACTIVE", "DEACTIVATED", "PENDING", "APPROVED", "REJECTED", "EXPIRED", "IDLE", "BUSY", "ERROR", "OFFLINE", "FUNNEL", "REFINEMENT", "APPROVED", "IN_PROGRESS", "REVIEW", "DONE"],
  type: ["CODE_REVIEW", "DEPLOY", "RISK", "PLAN"],
};

const READ_ONLY_FIELDS = new Set(["id", "createdAt", "updatedAt", "passwordHash"]);
const HIDDEN_FIELDS = new Set(["passwordHash", "capabilities", "taskGraph", "payload"]);

export default function AdminModelDetailPage(): ReactNode {
  const params = useParams();
  const router = useRouter();
  const model = params.model as string;
  const id = params.id as string;

  const [record, setRecord] = useState<Record<string, unknown> | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load(): Promise<void> {
      const res = await fetch(`/api/admin/${model}/${id}`);
      const json = (await res.json()) as { success: boolean; data: Record<string, unknown> };
      if (json.success) {
        setRecord(json.data);
        setFormData(json.data);
      }
      setLoading(false);
    }
    load();
  }, [model, id]);

  async function handleSave(): Promise<void> {
    setSaving(true);
    setError(null);

    try {
      // Only send editable fields
      const editableData: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(formData)) {
        if (!READ_ONLY_FIELDS.has(key) && !HIDDEN_FIELDS.has(key)) {
          editableData[key] = value;
        }
      }

      const res = await fetch(`/api/admin/${model}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editableData),
      });

      const json = (await res.json()) as { success: boolean; error?: { message: string } };
      if (!json.success) {
        setError(json.error?.message ?? "Failed to save");
        return;
      }

      router.push(`/admin/${model}`);
    } catch {
      setError("Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!confirm("Are you sure you want to delete this record?")) return;

    const res = await fetch(`/api/admin/${model}/${id}`, {
      method: "DELETE",
    });

    const json = (await res.json()) as { success: boolean };
    if (json.success) {
      router.push(`/admin/${model}`);
    }
  }

  if (loading) {
    return <div className="py-8 text-center text-muted-foreground">Loading...</div>;
  }

  if (record === null) {
    return <div className="py-8 text-center text-muted-foreground">Record not found</div>;
  }

  const modelName = model.replace(/-/g, " ").replace(/^./, (s) => s.toUpperCase());

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <Text variant="h2" as="h2">
          Edit {modelName}
        </Text>
        <Button variant="danger" onClick={handleDelete}>
          Delete
        </Button>
      </div>

      {error !== null && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-status-error/20 bg-status-error/10 px-4 py-3 text-sm text-status-error"
        >
          {error}
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface p-6">
        <div className="space-y-4">
          {Object.entries(record)
            .filter(([key]) => !HIDDEN_FIELDS.has(key))
            .map(([key, value]) => {
              const isReadOnly = READ_ONLY_FIELDS.has(key);
              const enumValues = ENUM_VALUES[key];

              return (
                <div key={key} className="space-y-1.5">
                  <label
                    htmlFor={`field-${key}`}
                    className="text-sm font-medium text-foreground"
                  >
                    {key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())}
                  </label>

                  {isReadOnly ? (
                    <div className="rounded-md bg-surface-secondary px-3 py-2 text-sm text-muted-foreground">
                      {typeof value === "object" ? JSON.stringify(value) : String(value ?? "—")}
                    </div>
                  ) : enumValues !== undefined ? (
                    <Select
                      id={`field-${key}`}
                      options={enumValues.map((v) => ({ value: v, label: v }))}
                      value={String(formData[key] ?? "")}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                    />
                  ) : typeof value === "object" ? (
                    <Textarea
                      id={`field-${key}`}
                      value={JSON.stringify(formData[key] ?? value, null, 2)}
                      onChange={(e) => {
                        try {
                          setFormData((prev) => ({
                            ...prev,
                            [key]: JSON.parse(e.target.value) as unknown,
                          }));
                        } catch {
                          // Keep as string while typing
                        }
                      }}
                    />
                  ) : (
                    <Input
                      id={`field-${key}`}
                      type="text"
                      value={String(formData[key] ?? "")}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                    />
                  )}
                </div>
              );
            })}
        </div>

        <div className="mt-6 flex gap-3">
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
          <Button variant="secondary" onClick={() => router.push(`/admin/${model}`)}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
