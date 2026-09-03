import { db } from "@/lib/db";
import { fail, ok, withApi } from "@/lib/api";
import { updateReviewSchema } from "@/lib/schemas";

export const GET = withApi(async ({ user, params }) => {
  const review = await db.get(params.id, user);
  if (!review) return fail("Review not found", 404);
  return ok(review);
});

export const PATCH = withApi(
  async ({ req, user, params }) => {
    const patch = updateReviewSchema.parse(await req.json());
    if ((patch.status === "approved" || patch.status === "rejected") && user.role === "reviewer") {
      return fail("Reviewers must use the approve/reject endpoints", 403);
    }
    const review = await db.update(params.id, patch, user);
    if (!review) return fail("Review not found", 404);
    return ok(review);
  },
  { roles: ["admin", "reviewer", "approver"] }
);
