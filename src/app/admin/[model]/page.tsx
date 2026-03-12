"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { Text } from "@/components/atoms/Text";
import { Input } from "@/components/atoms/Input/Input";
import { DataTable, type DataTableColumn } from "@/components/organisms/DataTable";
import Link from "next/link";

interface ListResponse {
  data: Record<string, unknown>[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
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

      const res = await fetch(`/api/admin/${model}?${searchParams.toString()}`);
      const json = (await res.json()) as { success: boolean; data: ListResponse };
      if (json.success) {
        setData(json.data);
      }
    } finally {
      setLoading(false);
    }
  }, [model, page, sort, direction, search]);

  // Fetch model config (from the API response columns)
  useEffect(() => {
    // We'll derive config from the first API call metadata
    // For now, hardcode a fetch to get the data
    fetchData();
  }, [fetchData]);

  // Derive columns from the first data response
  const columns: DataTableColumn[] =
    data !== null && data.data.length > 0
      ? Object.keys(data.data[0] ?? {})
          .filter((k) => !["passwordHash", "capabilities", "taskGraph", "payload", "metadata"].includes(k))
          .slice(0, 7) // Show max 7 columns in list
          .map((key) => ({
            key,
            label: key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()),
            sortable: ["createdAt", "updatedAt", "name", "email", "status", "role", "action"].includes(key),
          }))
      : [];

  function handleSort(field: string): void {
    if (sort === field) {
      setDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(field);
      setDirection("asc");
    }
    setPage(1);
  }

  const modelName = model.replace(/-/g, " ").replace(/^./, (s) => s.toUpperCase());

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <Text variant="h2" as="h2">
          {modelName}
        </Text>
        {!["audit-logs", "approvals"].includes(model) && (
          <Link
            href={`/admin/${model}/new`}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Create New
          </Link>
        )}
      </div>

      <div className="mb-4">
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
