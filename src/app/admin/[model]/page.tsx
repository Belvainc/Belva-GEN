"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { Text } from "@/components/atoms/Text";
import { Input } from "@/components/atoms/Input/Input";
import { Select } from "@/components/atoms/Select";
import { DataTable, type DataTableColumn } from "@/components/organisms/DataTable";
import Link from "next/link";

interface ColumnDef {
  key: string;
  label: string;
  type: string;
  sortable?: boolean;
  filterable?: boolean;
  enumValues?: string[];
  inList?: boolean;
}

interface ConfigMeta {
  allowCreate: boolean;
  allowEdit: boolean;
  allowDelete: boolean;
  columns: ColumnDef[];
}

interface ListResponse {
  data: Record<string, unknown>[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  config: ConfigMeta;
}

export default function AdminModelListPage(): ReactNode {
  const params = useParams();
  const router = useRouter();
  const model = params.model as string;

  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<string | undefined>();
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Record<string, string>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const searchParams = new URLSearchParams();
      searchParams.set("page", String(page));
      searchParams.set("limit", "25");
      if (sort !== undefined) {
        searchParams.set("sort", sort);
        searchParams.set("direction", direction);
      }
      if (search.length > 0) {
        searchParams.set("search", search);
      }
      for (const [key, value] of Object.entries(filters)) {
        if (value.length > 0) {
          searchParams.set(`filter.${key}`, value);
        }
      }

      const res = await fetch(`/api/admin/${model}?${searchParams.toString()}`);
      const json = (await res.json()) as { success: boolean; data: ListResponse };
      if (json.success) {
        setData(json.data);
      }
    } finally {
      setLoading(false);
    }
  }, [model, page, sort, direction, search, filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Derive columns from config
  const configColumns = data?.config?.columns ?? [];
  const listColumns = configColumns.filter((c) => c.inList === true);
  const columns: DataTableColumn[] = listColumns.map((col) => ({
    key: col.key,
    label: col.label,
    sortable: col.sortable ?? false,
  }));

  // Get filterable columns with enum values
  const filterableColumns = configColumns.filter(
    (c) => c.filterable === true && c.enumValues !== undefined && c.enumValues.length > 0
  );

  function handleSort(field: string): void {
    if (sort === field) {
      setDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(field);
      setDirection("asc");
    }
    setPage(1);
  }

  function handleFilterChange(field: string, value: string): void {
    setFilters((prev) => ({ ...prev, [field]: value }));
    setPage(1);
  }

  const modelName = data?.config
    ? (listColumns.length > 0 ? model : model).replace(/-/g, " ").replace(/^./, (s) => s.toUpperCase())
    : model.replace(/-/g, " ").replace(/^./, (s) => s.toUpperCase());

  const allowCreate = data?.config?.allowCreate ?? false;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <Text variant="h2" as="h2">
          {modelName}
        </Text>
        {allowCreate && (
          <Link
            href={`/admin/${model}/new`}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Create New
          </Link>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <Input
            type="search"
            placeholder={`Search ${modelName.toLowerCase()}...`}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        {filterableColumns.map((col) => (
          <div key={col.key} className="w-44">
            <Select
              options={[
                { value: "", label: `All ${col.label}` },
                ...(col.enumValues ?? []).map((v) => ({ value: v, label: v })),
              ]}
              value={filters[col.key] ?? ""}
              onChange={(e) => handleFilterChange(col.key, e.target.value)}
            />
          </div>
        ))}
      </div>

      {loading && data === null ? (
        <div className="py-8 text-center text-muted-foreground">Loading...</div>
      ) : data !== null ? (
        <DataTable
          columns={columns}
          data={data.data}
          sort={sort}
          direction={direction}
          onSort={handleSort}
          onRowClick={(row) => router.push(`/admin/${model}/${row.id as string}`)}
          page={data.page}
          totalPages={data.totalPages}
          onPageChange={setPage}
          total={data.total}
        />
      ) : null}
    </div>
  );
}
