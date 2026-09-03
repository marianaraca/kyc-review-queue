"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowLeft, FileText, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/status-badge";
import { apiFetch } from "@/lib/client";
import { formatBytes, formatDateTime } from "@/lib/format";
import { displayName, MOCK_USERS } from "@/lib/users";
import type { Review } from "@/lib/types";

type AmlResult = {
  match_count: number;
  sanctions_hit: boolean;
  pep_hit: boolean;
  adverse_media_hit: boolean;
};

export function ReviewDetail({ id }: { id: string }) {
  const router = useRouter();
  const { data: session } = useSession();
  const [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState("");
  const [riskScore, setRiskScore] = useState("");
  const [aml, setAml] = useState<AmlResult | null>(null);

  const hydrate = useCallback((next: Review) => {
    setReview(next);
    setNotes(next.notes);
    setRiskScore(String(next.risk_score));
  }, []);

  const load = useCallback(async () => {
    try {
      hydrate(await apiFetch<Review>(`/api/kyc/reviews/${id}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load review");
    }
  }, [id, hydrate]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run<T extends Review>(fn: () => Promise<T>) {
    setBusy(true);
    setError(null);
    try {
      hydrate(await fn());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  const patch = (body: Record<string, unknown>) =>
    run(() =>
      apiFetch<Review>(`/api/kyc/reviews/${id}`, { method: "PATCH", body: JSON.stringify(body) })
    );

  const act = (path: string, body: Record<string, unknown> = {}) =>
    run(() =>
      apiFetch<Review>(`/api/kyc/reviews/${id}/${path}`, {
        method: "POST",
        body: JSON.stringify(body),
      })
    );

  async function runAmlCheck() {
    setBusy(true);
    try {
      setAml(
        await apiFetch<AmlResult>("/api/integrations/aml-check", {
          method: "POST",
          body: JSON.stringify({ review_id: id }),
        })
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "AML check failed");
    } finally {
      setBusy(false);
    }
  }

  if (error && !review) {
    return (
      <div className="space-y-4">
        <Button asChild variant="outline" size="sm">
          <Link href="/">
            <ArrowLeft className="h-4 w-4" /> Back to queue
          </Link>
        </Button>
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">{error}</CardContent>
        </Card>
      </div>
    );
  }

  if (!review) {
    return (
      <div className="flex items-center gap-2 p-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading review...
      </div>
    );
  }

  const decided = review.status === "approved" || review.status === "rejected";
  const canDecide = session?.user.role !== undefined && !decided;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button asChild variant="outline" size="sm">
          <Link href="/">
            <ArrowLeft className="h-4 w-4" /> Queue
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">{review.applicant_name}</h1>
        <StatusBadge status={review.status} />
        {busy ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Applicant</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 text-sm">
              <Field label="Name" value={review.applicant_name} />
              <Field label="Email" value={review.email} />
              <Field label="Phone" value={review.phone} />
              <Field label="Company" value={review.company} />
              <Field label="Submitted" value={formatDateTime(review.created_at)} />
              <Field label="Assigned reviewer" value={displayName(review.assigned_reviewer)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Documents</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {review.documents_json.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-3 rounded-md border p-2 text-sm"
                >
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{doc.file_name}</span>
                  <span className="ml-auto text-muted-foreground">
                    {formatBytes(doc.size_bytes)}
                  </span>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await apiFetch(`/api/kyc/reviews/${id}/documents`, {
                      method: "POST",
                      body: JSON.stringify({
                        file_name: `additional_doc_${review.documents_json.length + 1}.pdf`,
                        mime_type: "application/pdf",
                        size_bytes: 320_000,
                      }),
                    });
                    return apiFetch<Review>(`/api/kyc/reviews/${id}`);
                  })
                }
              >
                Upload mock document
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Review</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <BoolSelect
                  label="Identity verified"
                  value={review.identity_verified}
                  disabled={busy}
                  onChange={(v) => patch({ identity_verified: v })}
                />
                <BoolSelect
                  label="Address verified"
                  value={review.address_verified}
                  disabled={busy}
                  onChange={(v) => patch({ address_verified: v })}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="risk">Risk score (1-10, auto-calculated, override allowed)</Label>
                <div className="flex gap-2">
                  <Input
                    id="risk"
                    type="number"
                    min={1}
                    max={10}
                    className="w-24"
                    value={riskScore}
                    onChange={(e) => setRiskScore(e.target.value)}
                  />
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => patch({ risk_score: Number(riskScore) })}
                  >
                    Save score
                  </Button>
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Findings, follow-ups, escalation context..."
                />
                <Button variant="outline" disabled={busy} onClick={() => patch({ notes })}>
                  Save notes
                </Button>
              </div>

              <div className="space-y-1">
                <Label>Assign to colleague</Label>
                <Select
                  value={review.assigned_reviewer ?? "unassigned"}
                  onValueChange={(v) =>
                    act("assign", { assigned_reviewer: v === "unassigned" ? null : v })
                  }
                >
                  <SelectTrigger className="w-72">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {MOCK_USERS.filter((u) => u.role !== "approver").map((u) => (
                      <SelectItem key={u.email} value={u.email}>
                        {u.name} ({u.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-wrap gap-2 border-t pt-4">
                <Button disabled={busy || !canDecide} onClick={() => act("approve")}>
                  Approve
                </Button>
                <Button
                  variant="destructive"
                  disabled={busy || !canDecide}
                  onClick={() => act("reject")}
                >
                  Reject
                </Button>
                <Button
                  variant="outline"
                  disabled={busy || decided}
                  onClick={() => act("request-info", { note: "Requested additional documents." })}
                >
                  Request additional info
                </Button>
                <Button variant="secondary" disabled={busy} onClick={runAmlCheck}>
                  <ShieldAlert className="h-4 w-4" /> Run AML check
                </Button>
              </div>

              {aml ? (
                <p className="text-sm text-muted-foreground">
                  AML: {aml.match_count} match(es)
                  {aml.sanctions_hit ? " - sanctions hit" : ""}
                  {aml.pep_hit ? " - PEP" : ""}
                  {aml.adverse_media_hit ? " - adverse media" : ""}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Audit log</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {[...review.audit_log_json].reverse().map((entry) => (
              <div key={entry.id} className="border-l-2 pl-3">
                <p className="font-medium">{entry.action}</p>
                <p className="text-muted-foreground">
                  {entry.actor_email} - {formatDateTime(entry.created_at)}
                </p>
                {Object.entries(entry.changes).map(([field, change]) => (
                  <p key={field} className="text-xs text-muted-foreground">
                    {field}: {String(change.from)} to {String(change.to)}
                  </p>
                ))}
                {entry.note ? <p className="text-xs">{entry.note}</p> : null}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <p>{value}</p>
    </div>
  );
}

function BoolSelect({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Select
        value={value ? "yes" : "no"}
        disabled={disabled}
        onValueChange={(v) => onChange(v === "yes")}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="yes">Yes</SelectItem>
          <SelectItem value="no">No</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
