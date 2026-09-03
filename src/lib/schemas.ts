import { z } from "zod";
import { REVIEW_STATUSES } from "@/lib/types";

export const listReviewsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(10),
  status: z.enum(REVIEW_STATUSES).optional(),
  reviewer: z.string().optional(),
  search: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  sort: z
    .enum(["applicant_name", "email", "status", "created_at", "assigned_reviewer", "risk_score"])
    .default("created_at"),
  dir: z.enum(["asc", "desc"]).default("desc"),
});
export type ListReviewsQuery = z.infer<typeof listReviewsQuerySchema>;

export const createReviewSchema = z.object({
  applicant_name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(7),
  company: z.string().min(1),
  assigned_reviewer: z.string().email().nullable().optional(),
  notes: z.string().max(5000).optional(),
});

export const updateReviewSchema = z
  .object({
    status: z.enum(REVIEW_STATUSES).optional(),
    notes: z.string().max(5000).optional(),
    identity_verified: z.boolean().optional(),
    address_verified: z.boolean().optional(),
    risk_score: z.number().int().min(1).max(10).optional(),
    assigned_reviewer: z.string().email().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });

export const decisionSchema = z.object({ note: z.string().max(1000).optional() });

export const uploadDocumentSchema = z.object({
  file_name: z.string().min(3),
  mime_type: z.string().default("application/pdf"),
  size_bytes: z.number().int().positive().default(204800),
});

export const amlCheckSchema = z.object({
  review_id: z.string().min(1),
});
