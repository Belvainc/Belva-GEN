import type { z } from "zod";

// ─── Admin Model Registry Types ────────────────────────────────────────────────
// Configuration for the generic admin CRUD system.

export type FieldType =
  | "string"
  | "email"
  | "text"
  | "number"
  | "boolean"
  | "enum"
  | "json"
  | "datetime"
  | "uuid"
  | "relation";

export interface ColumnDef {
  key: string;
  label: string;
  type: FieldType;
  sortable?: boolean;
  searchable?: boolean;
  filterable?: boolean;
  /** For enum fields: the list of allowed values */
  enumValues?: string[];
  /** Whether this field appears in the list view */
  inList?: boolean;
  /** Whether this field appears in the create form */
  inCreate?: boolean;
  /** Whether this field appears in the edit form */
  inEdit?: boolean;
  /** Whether this field is read-only */
  readOnly?: boolean;
}

export interface ModelConfig {
  name: string;
  pluralName: string;
  slug: string;
  /** Columns/fields for this model */
  columns: ColumnDef[];
  /** Default sort field and direction */
  defaultSort: { field: string; direction: "asc" | "desc" };
  /** Fields to search in when using the search bar */
  searchableFields: string[];
  /** Whether admins can create new records */
  allowCreate?: boolean;
  /** Whether admins can edit existing records */
  allowEdit?: boolean;
  /** Whether admins can delete records */
  allowDelete?: boolean;
  /** Optional Zod schema for create validation */
  createSchema?: z.ZodType;
  /** Optional Zod schema for edit validation */
  editSchema?: z.ZodType;
}

export interface ListParams {
  page: number;
  limit: number;
  sort?: string;
  direction?: "asc" | "desc";
  search?: string;
  filters?: Record<string, string>;
}

export interface ListResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
