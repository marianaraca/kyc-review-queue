"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { RoleScopeNote } from "@/components/role-scope-note";
import { apiFetch } from "@/lib/client";
import { formatDate, STATUS_LABELS } from "@/lib/format";
import { displayName, MOCK_USERS } from "@/lib/users";
import { REVIEW_STATUSES, type Paginated, type Review } from "@/lib/types";

type SortKey = "applicant_name" | "email" | "status" | "created_at" | "assigned_reviewer" | "risk_score";

const COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: "applicant_name", label: "Applicant" },
  { key: "email", label: "Email" },
  { key: "status", label: "Status" },
  { key: "risk_score", label: "Risk" },
  { key: "created_at", label: "Submitted" },
  { key: "assigned_reviewer", label: "Assigned Reviewer" },
];

const ALL = "__all__";
const PAGE_SIZE = 10;

export function ReviewQueue() {
  const { data: session } = useSession();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState<string>(ALL);
  const [reviewer, setReviewer] = useState<string>(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<SortKey>("created_at");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paginated<Review> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 200);
    return () => clearTimeout(t);
  }, [search]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(PAGE_SIZE),
      sort,
      dir,
    });
    if (debounced) params.set("search", debounced);
    if (status !== ALL) params.set("status", status);
    if (reviewer !== ALL) params.set("reviewer", reviewer);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return params.toString();
  }, [page, sort, dir, debounced, status, reviewer, from, to]);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const result = await apiFetch<Paginated<Review>>(`/api/kyc/reviews?${queryString}`);
      if (id === requestId.current) {
        setData(result);
        setError(null);
      }
    } catch (err) {
      if (id === requestId.current) setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    void load();
  }, [load]);

  // Refresh when returning from a detail page so decided reviews leave the queue.
  useEffect(() => {
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [debounced, status, reviewer, from, to, sort, dir]);

  function toggleSort(key: SortKey) {
    if (sort === key) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setSort(key);
      setDir("asc");
    }
  }

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.total_pages ?? 1;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Review Queue</h1>
        <RoleScopeNote />
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-5">
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="search">Search</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="search"
                className="pl-8"
                placeholder="Applicant name or email"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                {REVIEW_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Reviewer</Label>
            <Select value={reviewer} onValueChange={setReviewer}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All reviewers</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {MOCK_USERS.filter((u) => u.role === "reviewer").map((u) => (
                  <SelectItem key={u.email} value={u.email}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="from">From</Label>
              <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="to">To</Label>
              <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                {COLUMNS.map((col) => (
                  <TableHead key={col.key}>
                    <button
                      className="flex items-center gap-1 hover:text-foreground"
                      onClick={() => toggleSort(col.key)}
                    >
                      {col.label}
                      {sort === col.key ? (
                        dir === "asc" ? (
                          <ArrowUp className="h-3 w-3" />
                        ) : (
                          <ArrowDown className="h-3 w-3" />
                        )
                      ) : (
                        <ChevronsUpDown className="h-3 w-3 opacity-40" />
                      )}
                    </button>
                  </TableHead>
                ))}
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((review) => (
                <TableRow key={review.id}>
                  <TableCell className="font-medium">{review.applicant_name}</TableCell>
                  <TableCell className="text-muted-foreground">{review.email}</TableCell>
                  <TableCell>
                    <StatusBadge status={review.status} />
                  </TableCell>
                  <TableCell>{review.risk_score}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(review.created_at)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {displayName(review.assigned_reviewer)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/reviews/${review.id}`}>Open</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="p-8 text-center text-muted-foreground">
                    {error ?? "No reviews match these filters."}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {total} review{total === 1 ? "" : "s"}
          {session?.user ? ` visible to ${session.user.role}` : ""}
          {loading ? " - loading..." : ""}
        </span>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span>
            Page {page} of {totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
