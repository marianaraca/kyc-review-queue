import { db } from "@/lib/db";
import { fail, ok, withApi } from "@/lib/api";
import { amlCheckSchema } from "@/lib/schemas";
import { logger } from "@/lib/logger";

type AmlResult = {
  provider: string;
  review_id: string;
  match_count: number;
  sanctions_hit: boolean;
  pep_hit: boolean;
  adverse_media_hit: boolean;
  checked_at: string;
};

/**
 * Scaffold for the real AML/sanctions provider (ComplyAdvantage, Sardine, ...).
 * Swap `mockAmlCall` for an authenticated fetch; the response shape and the
 * audit-log write below stay the same.
 */
async function mockAmlCall(reviewId: string, name: string): Promise<AmlResult> {
  const seed = reviewId + name;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash += seed.charCodeAt(i);
  return {
    provider: "mock-aml",
    review_id: reviewId,
    match_count: hash % 3,
    sanctions_hit: hash % 17 === 0,
    pep_hit: hash % 11 === 0,
    adverse_media_hit: hash % 7 === 0,
    checked_at: new Date().toISOString(),
  };
}

export const POST = withApi(async ({ req, user }) => {
  const { review_id } = amlCheckSchema.parse(await req.json());
  const review = await db.get(review_id, user);
  if (!review) return fail("Review not found", 404);

  const result = await mockAmlCall(review.id, review.applicant_name);
  logger.info("integration.aml_check", { actor: user.email, ...result });

  await db.appendAudit(review.id, {
    actor_email: user.email,
    actor_role: user.role,
    action: "integration.aml_check",
    changes: {},
    note: `AML screening: ${result.match_count} match(es)${result.sanctions_hit ? ", SANCTIONS HIT" : ""}`,
  });

  return ok(result);
});
