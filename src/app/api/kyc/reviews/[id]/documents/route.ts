import { db } from "@/lib/db";
import { fail, ok, withApi } from "@/lib/api";
import { uploadDocumentSchema } from "@/lib/schemas";

export const GET = withApi(async ({ user, params }) => {
  const review = await db.get(params.id, user);
  if (!review) return fail("Review not found", 404);
  return ok(review.documents_json);
});

/**
 * Mock upload: accepts metadata only. A real implementation would issue a
 * signed URL (S3 / Supabase Storage) and persist the returned object key.
 */
export const POST = withApi(
  async ({ req, user, params }) => {
    const doc = uploadDocumentSchema.parse(await req.json());
    const review = await db.addDocument(params.id, doc, user);
    if (!review) return fail("Review not found", 404);
    return ok(review.documents_json, 201);
  },
  { roles: ["admin", "reviewer"] }
);
