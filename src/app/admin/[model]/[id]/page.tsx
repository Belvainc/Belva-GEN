"use client";

import { useState, useEffect, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { Text } from "@/components/atoms/Text";
import { Button } from "@/components/atoms/Button/Button";
import { Input } from "@/components/atoms/Input/Input";
import { Select } from "@/components/atoms/Select";
import { Textarea } from "@/components/atoms/Textarea";

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

interface DetailResponse {
  record: Record<string, unknown>;
  config: ConfigMeta;
}

const HIDDEN_FIELDS = new Set(["passwordHash"]);

export default function AdminModelDetailPage(): ReactNode {
  const params = useParams();
  const router = useRouter();
  const model = params.model as string;
  const id = params.id as string;

  const [record, setRecord] = useState<Record<string, unknown> | null>(null);
  const [config, setConfig] = useState<ConfigMeta | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load(): Promise<void> {
      const res = await fetch(`/api/admin/${model}/${id}`);
      const json = (await res.json()) as { success: boolean; data: DetailResponse };
      if (json.success) {
        setRecord(json.data.record);
        setFormData(json.data.record);
        setConfig(json.data.config);
      }
      setLoading(false);
    }
    load();
  }, [model, id]);

  async function handleSave(): Promise<void> {
    setSaving(true);
    setError(null);

    try {
      const editableData: Record<string, unknown> = {};
      const cols = config?.columns ?? [];
      for (const [key, value] of Object.entries(formData)) {
        const colDef = cols.find((c) => c.key === key);
        if (colDef !== undefined && colDef.readOnly !== true && colDef.inEdit === true && !HIDDEN_FIELDS.has(key)) {
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

  if (record === null || config === null) {
    return <div className="py-8 text-center text-muted-foreground">Record not found</div>;
  }

  const modelName = model.replace(/-/g, " ").replace(/^./, (s) => s.toUpperCase());
  const allowEdit = config.allowEdit;
  const allowDelete = config.allowDelete;

  const visibleColumns = config.columns.filter((c) => !HIDDEN_FIELDS.has(c.key));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <Text variant="h2" as="h2">
          {allowEdit ? "Edit" : "View"} {modelName}
        </Text>
        {allowDelete && (
          <Button variant="danger" onClick={handleDelete}>
            Delete
          </Button>
        )}
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
          {visibleColumns.map((col) => {
            const value = record[col.key];
            const isReadOnly = col.readOnly === true || !allowEdit;
            const isEditable = col.inEdit === true && allowEdit && !col.readOnly;

            return (
              <div key={col.key} className="space-y-1.5">
                <label
                  htmlFor={`field-${col.key}`}
                  className="text-sm font-medium text-foreground"
                >
                  {col.label}
                </label>

                {isReadOnly || !isEditable ? (
                  <div className="rounded-md bg-surface-secondary px-3 py-2 text-sm text-muted-foreground">
                    {col.type === "json" || typeof value === "object"
                      ? JSON.stringify(value, null, 2)
                      : col.type === "boolean"
                        ? (value === true ? "Yes" : "No")
                        : String(value ?? "—")}
                  </div>
                ) : col.type === "enum" && col.enumValues !== undefined ? (
                  <Select
                    id={`field-${col.key}`}
                    options={col.enumValues.map((v) => ({ value: v, label: v }))}
                    value={String(formData[col.key] ?? "")}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, [col.key]: e.target.value }))
                    }
                  />
                ) : col.type === "boolean" ? (
                  <label className="flex items-center gap-2">
                    <input
                      id={`field-${col.key}`}
                      type="checkbox"
                      checked={formData[col.key] === true}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, [col.key]: e.target.checked }))
                      }
                      className="h-4 w-4 rounded border-border"
                    />
                    <span className="text-sm text-muted-foreground">
                      {formData[col.key] === true ? "Enabled" : "Disabled"}
                    </span>
                  </label>
                ) : col.type === "json" || col.type === "text" ? (
                  <Textarea
                    id={`field-${col.key}`}
                    value={
                      col.type === "json"
                        ? JSON.stringify(formData[col.key] ?? value, null, 2)
                        : String(formData[col.key] ?? "")
                    }
                    onChange={(e) => {
                      if (col.type === "json") {
                        try {
                          setFormData((prev) => ({
                            ...prev,
                            [col.key]: JSON.parse(e.target.value) as unknown,
                          }));
                        } catch {
                          // Keep as string while typing
                        }
                      } else {
                        setFormData((prev) => ({ ...prev, [col.key]: e.target.value }));
                      }
                    }}
                  />
                ) : (
                  <Input
                    id={`field-${col.key}`}
                    type={col.type === "email" ? "email" : "text"}
                    value={String(formData[col.key] ?? "")}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, [col.key]: e.target.value }))
                    }
                  />
                )}
              </div>
            );
          })}
        </div>

        {allowEdit && (
          <div className="mt-6 flex gap-3">
            <Button variant="primary" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
            <Button variant="secondary" onClick={() => router.push(`/admin/${model}`)}>
              Cancel
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
