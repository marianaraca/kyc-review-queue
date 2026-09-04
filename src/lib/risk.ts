import type { Review } from "@/lib/types";

/**
 * Deterministic risk score (1-10). Higher is riskier.
 * Real deployments would call the AML/sanctions providers scaffolded in
 * /api/integrations/aml-check and blend those signals in here.
 */
export function computeRiskScore(
  review: Pick<
    Review,
    "identity_verified" | "address_verified" | "documents_json" | "company" | "email"
  >
): number {
  let score = 5;
  if (review.identity_verified) score -= 2;
  else score += 1;
  if (review.address_verified) score -= 1;
  else score += 1;

  const docs = review.documents_json.length;
  if (docs >= 3) score -= 1;
  if (docs === 0) score += 2;

  const freeEmail = /@(gmail|yahoo|outlook|proton)\./i.test(review.email);
  if (freeEmail) score += 1;
  if (/holdings|ventures|capital/i.test(review.company)) score += 1;

  return Math.min(10, Math.max(1, score));
}
