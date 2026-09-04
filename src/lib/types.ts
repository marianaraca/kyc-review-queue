export const REVIEW_STATUSES = [
  "pending",
  "in_review",
  "info_requested",
  "approved",
  "rejected",
] as const;

export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const ROLES = ["admin", "reviewer", "approver"] as const;
export type Role = (typeof ROLES)[number];

export type ReviewDocument = {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at: string;
};

export type AuditEntry = {
  id: string;
  actor_email: string;
  actor_role: Role;
  action: string;
  changes: Record<string, { from: unknown; to: unknown }>;
  note?: string;
  created_at: string;
};

/**
 * Mirrors the `reviews` table one-to-one (snake_case columns, JSON blobs for
 * documents / audit log) so a Postgres-backed adapter can return rows as-is.
 */
export type Review = {
  id: string;
  applicant_name: string;
  email: string;
  phone: string;
  company: string;
  status: ReviewStatus;
  risk_score: number;
  /** True once a human overrides the auto-calculated score; stops recomputation. */
  risk_score_manual: boolean;
  identity_verified: boolean;
  address_verified: boolean;
  assigned_reviewer: string | null;
  notes: string;
  documents_json: ReviewDocument[];
  audit_log_json: AuditEntry[];
  created_at: string;
  updated_at: string;
};

export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: unknown };

export type Paginated<T> = {
  items: T[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
};
