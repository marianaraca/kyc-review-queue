import { db } from "@/lib/db";
import { ok, withApi } from "@/lib/api";
import { createReviewSchema, listReviewsQuerySchema } from "@/lib/schemas";

export const GET = withApi(async ({ req, user }) => {
  const url = new URL(req.url);
  const query = listReviewsQuerySchema.parse(Object.fromEntries(url.searchParams));
  const page = await db.list(query, user);
  return ok(page);
});

export const POST = withApi(
  async ({ req, user }) => {
    const body = createReviewSchema.parse(await req.json());
    const review = await db.create(body, user);
    return ok(review, 201);
  },
  { roles: ["admin"] }
);
