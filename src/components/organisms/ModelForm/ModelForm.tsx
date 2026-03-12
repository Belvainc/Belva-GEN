"use client";

import { useState, type ReactNode, type FormEvent } from "react";
import { Input } from "@/components/atoms/Input/Input";
import { Select } from "@/components/atoms/Select";
import { Textarea } from "@/components/atoms/Textarea";
import { Button } from "@/components/atoms/Button/Button";
import type { ColumnDef } from "@/server/admin/types";

interface ModelFormProps {
  columns: ColumnDef[];
  initialData?: Record<string, unknown>;
  mode: "create" | "edit";
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  loading?: boolean;
  error?: string | null;
}

export function ModelForm({
  columns,
  initialData,
  mode,
  onSubmit,
  loading = false,
  error = null,
}: ModelFormProps): ReactNode {
  const [formData, setFormData] = useState<Record<string, unknown>>(() => {
    const data: Record<string, unknown> = {};
    for (const col of columns) {
      const show =
        mode === "create" ? col.inCreate === true : col.inEdit === true;
      if (show) {
        data[col.key] = initialData?.[col.key] ?? "";
      }
    }
    return data;
  });

  const visibleColumns = columns.filter((col) => {
    if (col.readOnly === true) return false;
    return mode === "create" ? col.inCreate === true : col.inEdit === true;
  });

  function handleChange(key: string, value: unknown): void {
    setFormData((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    await onSubmit(formData);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error !== null && (
        <div
          role="alert"
          className="rounded-md border border-status-error/20 bg-status-error/10 px-4 py-3 text-sm text-status-error"
        >
          {error}
        </div>
      )}

      {visibleColumns.map((col) => (
        <div key={col.key} className="space-y-1.5">
          <label
            htmlFor={`field-${col.key}`}
            className="text-sm font-medium text-foreground"
          >
            {col.label}
          </label>

          {col.type === "enum" && col.enumValues !== undefined ? (
            <Select
              id={`field-${col.key}`}
              options={col.enumValues.map((v) => ({ value: v, label: v }))}
              value={String(formData[col.key] ?? "")}
              onChange={(e) => handleChange(col.key, e.target.value)}
            />
          ) : col.type === "text" || col.type === "json" ? (
            <Textarea
              id={`field-${col.key}`}
              value={String(formData[col.key] ?? "")}
              onChange={(e) => handleChange(col.key, e.target.value)}
            />
          ) : col.type === "number" ? (
            <Input
              id={`field-${col.key}`}
              type="number"
              value={String(formData[col.key] ?? "")}
              onChange={(e) => handleChange(col.key, parseInt(e.target.value, 10))}
            />
          ) : col.type === "boolean" ? (
            <div className="flex items-center gap-2">
              <input
                id={`field-${col.key}`}
                type="checkbox"
                checked={Boolean(formData[col.key])}
                onChange={(e) => handleChange(col.key, e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
            </div>
          ) : (
            <Input
              id={`field-${col.key}`}
              type={col.type === "email" ? "email" : "text"}
              value={String(formData[col.key] ?? "")}
              onChange={(e) => handleChange(col.key, e.target.value)}
            />
          )}
        </div>
      ))}

      {/* Special: password field for user creation */}
      {mode === "create" &&
        visibleColumns.some((c) => c.key === "email") && (
          <div className="space-y-1.5">
            <label
              htmlFor="field-password"
              className="text-sm font-medium text-foreground"
            >
              Password
            </label>
            <Input
              id="field-password"
              type="password"
              value={String(formData.password ?? "")}
              onChange={(e) => handleChange("password", e.target.value)}
              placeholder="Minimum 8 characters"
            />
          </div>
        )}

      <div className="pt-4">
        <Button type="submit" variant="primary" disabled={loading}>
          {loading
            ? "Saving..."
            : mode === "create"
              ? "Create"
              : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}
