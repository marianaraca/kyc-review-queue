import { memoryRepository } from "@/lib/db/memory";
import type { ReviewsRepository } from "@/lib/db/types";

/**
 * Datastore entrypoint. Every route imports `db` and nothing else, so pointing
 * the app at Supabase/Postgres means implementing `ReviewsRepository` once and
 * swapping the export below.
 */
export const db: ReviewsRepository = memoryRepository;

export type { ReviewsRepository };
