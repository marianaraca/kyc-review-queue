import { z } from "zod";
import { db } from "@/lib/db";
import { fail, ok, withApi } from "@/lib/api";

const assignSchema = z.object({ assigned_reviewer: z.string().email().nullable() });

export const POST = withApi(
  async ({ req, user, params }) => {
    const { assigned_reviewer } = assignSchema.parse(await req.json());
    const review = await db.update(
      params.id,
      { assigned_reviewer, status: "in_review" },
      user,
      "review.assigned",
      assigned_reviewer ?? "unassigned"
    );
    if (!review) return fail("Review not found", 404);
    return ok(review);
  },
  { roles: ["admin", "reviewer"] }
);
