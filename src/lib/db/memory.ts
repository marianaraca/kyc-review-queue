import { randomUUID } from "crypto";
import type { ListReviewsQuery } from "@/lib/schemas";
import type { AuditEntry, Paginated, Review, ReviewDocument } from "@/lib/types";
import { seedReviews } from "@/lib/db/seed";
import type { NewReview, ReviewPatch, ReviewsRepository, Visibility } from "@/lib/db/types";
import { computeRiskScore } from "@/lib/risk";

const SEED_COUNT = Number(process.env.SEED_COUNT ?? 120);

// Survives Next.js dev HMR so edits do not wipe the queue mid-demo.
const store = globalThis as unknown as { __kycReviews?: Review[] };
if (!store.__kycReviews) store.__kycReviews = seedReviews(SEED_COUNT);
const rows = (): Review[] => store.__kycReviews as Review[];

/**
 * Row-level visibility. Mirrors the WHERE clause a Postgres RLS policy would
 * enforce, so moving to Supabase is a translation, not a redesign.
 */
export function visibleTo(review: Review, viewer: Visibility): boolean {
  switch (viewer.role) {
    case "admin":
      return true;
    case "reviewer":
      return review.assigned_reviewer === viewer.email || review.assigned_reviewer === null;
    case "approver":
      return review.status === "approved" || review.status === "rejected";
    default:
      return false;
  }
}

function compare(a: Review, b: Review, key: ListReviewsQuery["sort"]): number {
  const av = a[key] ?? "";
  const bv = b[key] ?? "";
  if (typeof av === "number" && typeof bv === "number") return av - bv;
  return String(av).localeCompare(String(bv));
}

export const memoryRepository: ReviewsRepository = {
  async list(query, viewer): Promise<Paginated<Review>> {
    const search = query.search?.trim().toLowerCase();
    const from = query.from ? new Date(query.from).getTime() : null;
    const to = query.to ? new Date(query.to).getTime() + 86_399_999 : null;

    const filtered = rows()
      .filter((r) => visibleTo(r, viewer))
      .filter((r) => (query.status ? r.status === query.status : true))
      .filter((r) =>
        query.reviewer
          ? query.reviewer === "unassigned"
            ? r.assigned_reviewer === null
            : r.assigned_reviewer === query.reviewer
          : true
      )
      .filter((r) =>
        search
          ? r.applicant_name.toLowerCase().includes(search) || r.email.toLowerCase().includes(search)
          : true
      )
      .filter((r) => {
        const t = new Date(r.created_at).getTime();
        return (from === null || t >= from) && (to === null || t <= to);
      })
      .sort((a, b) => (query.dir === "asc" ? compare(a, b, query.sort) : compare(b, a, query.sort)));

    const total = filtered.length;
    const start = (query.page - 1) * query.page_size;
    return {
      items: filtered.slice(start, start + query.page_size),
      page: query.page,
      page_size: query.page_size,
      total,
      total_pages: Math.max(1, Math.ceil(total / query.page_size)),
    };
  },

  async get(id, viewer) {
    const review = rows().find((r) => r.id === id);
    if (!review || !visibleTo(review, viewer)) return null;
    return review;
  },

  async create(input: NewReview, actor) {
    const now = new Date().toISOString();
    const base = {
      id: `kyc_${randomUUID().slice(0, 8)}`,
      applicant_name: input.applicant_name,
      email: input.email,
      phone: input.phone,
      company: input.company,
      status: "pending" as const,
      risk_score_manual: false,
      identity_verified: false,
      address_verified: false,
      assigned_reviewer: input.assigned_reviewer ?? null,
      notes: input.notes ?? "",
      documents_json: [] as ReviewDocument[],
      created_at: now,
      updated_at: now,
    };
    const review: Review = {
      ...base,
      risk_score: computeRiskScore(base),
      audit_log_json: [
        {
          id: randomUUID(),
          actor_email: actor.email,
          actor_role: actor.role,
          action: "review.created",
          changes: {},
          created_at: now,
        },
      ],
    };
    rows().unshift(review);
    return review;
  },

  async update(id, patch: ReviewPatch, actor, action = "review.updated", note) {
    const review = rows().find((r) => r.id === id);
    if (!review || !visibleTo(review, actor)) return null;

    const changes: AuditEntry["changes"] = {};
    for (const [key, value] of Object.entries(patch) as [keyof ReviewPatch, unknown][]) {
      if (value === undefined) continue;
      if (review[key] !== value) changes[key] = { from: review[key], to: value };
    }
    Object.assign(review, patch);
    if (patch.risk_score !== undefined) review.risk_score_manual = true;

    // Risk score is auto-calculated from the verification signals, but a manual
    // override sticks until someone clears it.
    if (patch.risk_score === undefined && !review.risk_score_manual) {
      const recomputed = computeRiskScore(review);
      if (recomputed !== review.risk_score) {
        changes.risk_score = { from: review.risk_score, to: recomputed };
        review.risk_score = recomputed;
      }
    }

    review.updated_at = new Date().toISOString();
    review.audit_log_json.push({
      id: randomUUID(),
      actor_email: actor.email,
      actor_role: actor.role,
      action,
      changes,
      note,
      created_at: review.updated_at,
    });
    return review;
  },

  async addDocument(id, doc, actor) {
    const review = rows().find((r) => r.id === id);
    if (!review || !visibleTo(review, actor)) return null;
    const now = new Date().toISOString();
    review.documents_json.push({ ...doc, id: randomUUID(), uploaded_at: now });
    if (!review.risk_score_manual) review.risk_score = computeRiskScore(review);
    review.updated_at = now;
    review.audit_log_json.push({
      id: randomUUID(),
      actor_email: actor.email,
      actor_role: actor.role,
      action: "document.uploaded",
      changes: {},
      note: doc.file_name,
      created_at: now,
    });
    return review;
  },

  async appendAudit(id, entry) {
    const review = rows().find((r) => r.id === id);
    if (!review) return null;
    review.audit_log_json.push({ ...entry, id: randomUUID(), created_at: new Date().toISOString() });
    return review;
  },
};
