import { db } from "@/lib/db";
import { fail, ok, withApi } from "@/lib/api";
import { decisionSchema } from "@/lib/schemas";
import { logger } from "@/lib/logger";

export const POST = withApi(
  async ({ req, user, params }) => {
    const body = decisionSchema.parse(await req.json().catch(() => ({})));
    const review = await db.update(
      params.id,
      { status: "rejected" },
      user,
      "review.rejected",
      body.note
    );
    if (!review) return fail("Review not found", 404);
    logger.info("workflow.kyc_rejected", {
      review_id: review.id,
      rejected_by: user.email,
      downstream: ["notifications.applicant_email", "compliance.case_file"],
    });
    return ok(review);
  },
  { roles: ["admin", "approver", "reviewer"] }
);
