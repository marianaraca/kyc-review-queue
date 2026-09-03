import type { ListReviewsQuery } from "@/lib/schemas";
import type { AuditEntry, Paginated, Review, ReviewDocument, Role } from "@/lib/types";

export type Visibility = { role: Role; email: string };

export type NewReview = {
  applicant_name: string;
  email: string;
  phone: string;
  company: string;
  assigned_reviewer?: string | null;
  notes?: string;
};

export type ReviewPatch = Partial<
  Pick<
    Review,
    | "status"
    | "notes"
    | "identity_verified"
    | "address_verified"
    | "risk_score"
    | "assigned_reviewer"
  >
>;

/**
 * The single seam between the app and its datastore. `memory.ts` implements it
 * today; a Supabase/Postgres implementation only needs these six methods
 * (see README - "Swapping the mock DB for Supabase").
 */
export interface ReviewsRepository {
  list(query: ListReviewsQuery, viewer: Visibility): Promise<Paginated<Review>>;
  get(id: string, viewer: Visibility): Promise<Review | null>;
  create(input: NewReview, actor: Visibility): Promise<Review>;
  update(
    id: string,
    patch: ReviewPatch,
    actor: Visibility,
    action?: string,
    note?: string
  ): Promise<Review | null>;
  addDocument(
    id: string,
    doc: Omit<ReviewDocument, "id" | "uploaded_at">,
    actor: Visibility
  ): Promise<Review | null>;
  appendAudit(id: string, entry: Omit<AuditEntry, "id" | "created_at">): Promise<Review | null>;
}
