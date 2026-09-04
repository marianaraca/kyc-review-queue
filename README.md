# KYC Review Queue

Internal compliance tool for a fintech back office: a paginated KYC review queue,
a review detail workspace with an audit trail, and role-scoped APIs. Built with
Next.js 14 (App Router), TypeScript strict mode, Tailwind + shadcn/ui components,
NextAuth v5, and zod-validated API routes.

It is a prototype: the datastore is an in-memory repository seeded with 120
applications. Everything else - auth, RBAC, validation, logging, audit trail -
is the shape you would ship.

## Setup

```bash
npm install
cp .env.example .env.local
# set AUTH_SECRET / NEXTAUTH_SECRET to any random string: openssl rand -base64 32
npm run dev                  # http://localhost:3000
```

### Demo accounts (password: `password`)

| Email | Role | Sees |
| --- | --- | --- |
| `admin@fintech.example` | admin | every application |
| `reviewer@fintech.example` | reviewer | assigned to them + the unassigned pool |
| `reviewer2@fintech.example` | reviewer | assigned to them + the unassigned pool |
| `approver@fintech.example` | approver | approved / rejected, for final sign-off |

## Features

- **Queue** (`/`): server-side search (name/email), status + reviewer + date-range
  filters, sort on any column, 10 per page. Filtering/sorting/pagination all run
  in the repository layer, so the 120-record seed and a 1M-row table behave the same.
- **Detail** (`/reviews/[id]`): applicant profile, mock documents, identity/address
  verification toggles, auto-calculated risk score (1-10; a manual override sets
  `risk_score_manual` and stops recomputation), notes,
  Approve / Reject / Request info / Assign, mock AML check, and a full audit log.
- **RBAC**: enforced in the repository (`visibleTo`) and at the route level
  (`withApi({ roles })`), plus `middleware.ts` redirecting anonymous users to `/login`.
- **Observability**: every API call emits one structured JSON log line
  (`api.request` / `api.validation_error` / `api.unhandled_error`).

## API

All responses use `{ success: boolean, data?: T, error?: string }`. All routes
require a session; role restrictions are noted.

| Method | Route | Notes |
| --- | --- | --- |
| GET | `/api/kyc/reviews` | paginated list. Query: `page`, `page_size`, `status`, `reviewer` (email or `unassigned`), `search`, `from`, `to`, `sort`, `dir` |
| POST | `/api/kyc/reviews` | create application (admin) |
| GET | `/api/kyc/reviews/[id]` | single review |
| PATCH | `/api/kyc/reviews/[id]` | update status/notes/verification flags/risk score/assignee (admin, reviewer) |
| POST | `/api/kyc/reviews/[id]/approve` | approve + emit downstream workflow event |
| POST | `/api/kyc/reviews/[id]/reject` | reject + emit downstream workflow event |
| POST | `/api/kyc/reviews/[id]/request-info` | move to `info_requested` |
| POST | `/api/kyc/reviews/[id]/assign` | assign to a colleague |
| GET/POST | `/api/kyc/reviews/[id]/documents` | list / mock-upload documents |
| POST | `/api/integrations/aml-check` | scaffolded AML screening call |
| GET | `/api/auth/session` | NextAuth session state |

Example:

```bash
curl -s 'http://localhost:3000/api/kyc/reviews?status=pending&sort=created_at&dir=desc' \
  -H "Cookie: $SESSION_COOKIE" | jq
```

## Data model

The in-memory rows are shaped exactly like the target Postgres table:

```sql
create table reviews (
  id                text primary key,
  applicant_name    text not null,
  email             text not null,
  phone             text not null,
  company           text not null,
  status            text not null check (status in ('pending','in_review','info_requested','approved','rejected')),
  risk_score        int  not null check (risk_score between 1 and 10),
  risk_score_manual boolean not null default false,
  identity_verified boolean not null default false,
  address_verified  boolean not null default false,
  assigned_reviewer text,
  notes             text not null default '',
  documents_json    jsonb not null default '[]',
  audit_log_json    jsonb not null default '[]',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index on reviews (status, assigned_reviewer, created_at desc);
```

## Swapping the mock DB for Supabase

The app touches the datastore through exactly one interface,
`ReviewsRepository` (`src/lib/db/types.ts`): `list`, `get`, `create`, `update`,
`addDocument`, `appendAudit`. No route or component imports the in-memory store
directly - they import `db` from `src/lib/db/index.ts`.

To go live:

1. Create the `reviews` table above in Supabase.
2. Add `src/lib/db/supabase.ts` implementing `ReviewsRepository` with
   `@supabase/supabase-js` (or `@neondatabase/serverless` / `pg` for raw SQL).
   The filter logic in `memory.ts` maps 1:1 onto SQL: `ilike` for search,
   `eq` for status/reviewer, `gte/lte` for the date range, `order` + `range`
   for sort and pagination.
3. Return it from the `postgres` branch of `loadRepository()` in
   `src/lib/db/index.ts`, and set `KYC_DATASTORE=postgres` + `DATABASE_URL`.
4. Optionally push `visibleTo()` down into Postgres RLS policies - the role rules
   are already written as row predicates.

### Datastore guard

The mock is opt-in, never a fallback. `resolveDatastore()` refuses to start when:

- `KYC_DATASTORE=memory` is selected while `NODE_ENV=production` (a real deploy
  would otherwise silently serve, and accept writes into, synthetic applicants),
- `KYC_DATASTORE=postgres` is selected without a `DATABASE_URL`,
- `KYC_DATASTORE` is set to anything else.

`seedReviews()` throws in production for the same reason. Selection happens on
first datastore use rather than at import time, so `next build` does not need
production credentials.

Nothing else changes: the API contract, zod schemas, audit log, and UI are
storage-agnostic.

## Future integration points

- **AML / sanctions screening**: `src/app/api/integrations/aml-check/route.ts`
  wraps `mockAmlCall`. Replace it with an authenticated fetch to
  ComplyAdvantage / Sardine / Refinitiv; the result already lands in the audit log.
- **Downstream approval workflow**: the approve/reject routes log
  `workflow.kyc_approved` / `workflow.kyc_rejected` with the intended consumers
  (ledger activation, applicant email, periodic rescreen). Swap the log for a
  queue publish (SQS / Temporal / Inngest).
- **Document storage**: `POST /documents` stores metadata only. Move to signed
  uploads (S3 or Supabase Storage) and persist the object key on the same row.
- **Identity provider**: `src/lib/users.ts` is a mock directory. Replace the
  Credentials provider in `src/auth.ts` with Okta/WorkOS/Google; `role` is the
  only claim the app depends on.

## Adding the next internal tool

The pattern is deliberately repetitive: a typed row + zod schemas, one
repository interface, `withApi()` for auth/RBAC/logging/error mapping, a
client-fetched table page, and a detail page. A second tool (vendor onboarding,
dispute review, access requests) is the same five files with different fields -
no per-user licensing, no record ceilings, no vendor runtime.
