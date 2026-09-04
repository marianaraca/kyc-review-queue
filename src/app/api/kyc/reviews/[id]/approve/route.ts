import { db } from "@/lib/db";
import { fail, ok, withApi } from "@/lib/api";
import { decisionSchema } from "@/lib/schemas";
import { logger } from "@/lib/logger";

export const POST = withApi(
  async ({ req, user, params }) => {
    const body = decisionSchema.parse(await req.json().catch(() => ({})));
    const review = await db.update(
      params.id,
      { status: "approved" },
      user,
      "review.approved",
      body.note
    );
    if (!review) return fail("Review not found", 404);

    // Downstream workflow hook: today a log line, tomorrow an event on your bus.
    logger.info("workflow.kyc_approved", {
      review_id: review.id,
      applicant: review.applicant_name,
      risk_score: review.risk_score,
      approved_by: user.email,
      downstream: ["ledger.account_activate", "notifications.applicant_email", "aml.periodic_rescreen"],
    });

    return ok(review);
  },
  { roles: ["admin", "approver", "reviewer"] }
);
