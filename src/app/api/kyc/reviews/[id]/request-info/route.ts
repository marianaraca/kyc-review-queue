import { db } from "@/lib/db";
import { fail, ok, withApi } from "@/lib/api";
import { decisionSchema } from "@/lib/schemas";

export const POST = withApi(
  async ({ req, user, params }) => {
    const body = decisionSchema.parse(await req.json().catch(() => ({})));
    const review = await db.update(
      params.id,
      { status: "info_requested" },
      user,
      "review.info_requested",
      body.note
    );
    if (!review) return fail("Review not found", 404);
    return ok(review);
  },
  { roles: ["admin", "reviewer"] }
);
