import { logger } from "@/lib/logger";
import type { ReviewsRepository } from "@/lib/db/types";

export type Datastore = "memory" | "postgres";

/**
 * Datastore selection. Every route imports `db` and nothing else, so pointing
 * the app at Supabase/Postgres means implementing `ReviewsRepository` once and
 * teaching `loadRepository` about it.
 *
 * The mock repository is opt-in and never a fallback: an unset or misconfigured
 * `KYC_DATASTORE` in production aborts startup instead of silently serving (and
 * accepting writes into) synthetic data.
 */
export function resolveDatastore(env: NodeJS.ProcessEnv = process.env): Datastore {
  const production = env.NODE_ENV === "production";
  const configured = env.KYC_DATASTORE?.trim();

  if (configured && configured !== "memory" && configured !== "postgres") {
    throw new Error(
      `Invalid KYC_DATASTORE="${configured}". Expected "memory" (prototype only) or "postgres".`
    );
  }

  const datastore: Datastore = configured ? (configured as Datastore) : production ? "postgres" : "memory";

  if (production && datastore === "memory") {
    throw new Error(
      "Refusing to start: KYC_DATASTORE=memory is a synthetic-data mock and must never run in production. " +
        "Set KYC_DATASTORE=postgres and DATABASE_URL."
    );
  }
  if (datastore === "postgres" && !env.DATABASE_URL) {
    throw new Error("Refusing to start: KYC_DATASTORE=postgres requires DATABASE_URL.");
  }

  return datastore;
}

async function loadRepository(): Promise<ReviewsRepository> {
  const datastore = resolveDatastore();
  logger.info("db.datastore_selected", { datastore, env: process.env.NODE_ENV });

  if (datastore === "memory") {
    const { memoryRepository } = await import("@/lib/db/memory");
    return memoryRepository;
  }
  throw new Error(
    "KYC_DATASTORE=postgres is not implemented yet - implement ReviewsRepository against Postgres/Supabase."
  );
}

let repository: Promise<ReviewsRepository> | null = null;

/**
 * Resolved on first use rather than at import time: the guards above must run
 * against the runtime environment, not against `next build`.
 */
function repo(): Promise<ReviewsRepository> {
  if (!repository) repository = loadRepository();
  return repository;
}

export const db: ReviewsRepository = {
  async list(query, viewer) {
    return (await repo()).list(query, viewer);
  },
  async get(id, viewer) {
    return (await repo()).get(id, viewer);
  },
  async create(input, actor) {
    return (await repo()).create(input, actor);
  },
  async update(id, patch, actor, action, note) {
    return (await repo()).update(id, patch, actor, action, note);
  },
  async addDocument(id, doc, actor) {
    return (await repo()).addDocument(id, doc, actor);
  },
  async appendAudit(id, entry) {
    return (await repo()).appendAudit(id, entry);
  },
};

export type { ReviewsRepository };
