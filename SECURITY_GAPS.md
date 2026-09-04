# Security & Production-Readiness Gaps

Assessment of this repository as of commit `0aadc8b`, written from the perspective of a
security reviewer signing off on a system that would hold **real KYC data** (names, emails,
phone numbers, identity documents, risk decisions) for real users.

**Verdict: this is a demo-quality prototype. It must not be pointed at real applicant data
in its current form.** The architecture (repository seam, centralised `withApi` wrapper,
row-level visibility, audit entries, zod validation) is a reasonable foundation, but every
control below is either mocked, missing, or unenforced.

Nothing here has been fixed — this is an assessment only. Effort estimates assume one
engineer familiar with the stack and *include* the tests/docs/review needed to actually
call the control done, not just a first commit.

Rough total to a defensible v1: **~8–12 engineer-weeks**, plus vendor procurement lead time
for the IdP, AML provider, and document storage.

---

## 1. Authentication & identity

| # | Gap | Risk | Effort |
|---|-----|------|--------|
| 1.1 | Credentials provider with a hardcoded user list in `src/lib/users.ts`; all four accounts share the plaintext password `password`, committed to git. | Anyone who can reach the app has admin access. There is no user store, no registration, no deprovisioning. | 3–5 days to replace with an enterprise IdP (Okta/WorkOS/Entra) via OIDC; the Credentials provider must be deleted, not left as a fallback. |
| 1.2 | No MFA anywhere. | A single phished/reused password yields full access to every applicant record. Fails most SOC 2 / partner-bank expectations for privileged access to PII. | Comes largely free with the IdP in 1.1; ~1 day to enforce `amr`/ACR claims server-side. |
| 1.3 | Roles are baked into the JWT at login from a static array. There is no group-to-role mapping, no role change without a code deploy, no break-glass/elevation flow. | Access can't be granted or revoked at the speed an incident requires; no least-privilege lifecycle. | 3–4 days for IdP group → role mapping + an admin-managed override table. |
| 1.4 | JWT sessions with no server-side session record: no revocation, no forced logout, no "sign out everywhere", default 30-day lifetime, no idle timeout, no re-auth for sensitive actions (approve/reject). | A stolen session token is valid for weeks and cannot be killed. Terminated employees keep access until token expiry. | 3–4 days (database session strategy or a token denylist + short-lived tokens with refresh). |
| 1.5 | No login rate limiting, no account lockout, no failed-login alerting. | Unlimited online password guessing against a known, enumerable set of accounts. | 1–2 days (see 5.1). |
| 1.6 | No device/IP binding, no impossible-travel or anomaly signals on session use. | Session replay from an attacker's machine is indistinguishable from normal use. | 1 week if built in-house; near-zero if delegated to the IdP's risk engine. |
| 1.7 | Segregation of duties is incomplete: a reviewer can approve a case they themselves edited and scored (`approve` route allows `admin`, `approver`, *and* `reviewer`), and approvers can flip an already-decided case with no second signature. | No maker-checker control on the decision that actually matters. A single insider can onboard a fraudulent applicant end-to-end. | 3–5 days to model a real four-eyes workflow (proposer ≠ approver, enforced server-side, with an escalation path). |

## 2. Secrets, transport & encryption

| # | Gap | Risk | Effort |
|---|-----|------|--------|
| 2.1 | Secrets come from a `.env` file; `.env.example` ships `AUTH_SECRET=replace-me`. No secret manager, no rotation, no per-environment separation. | A weak or shared `AUTH_SECRET` lets an attacker forge session JWTs (including `role: "admin"`). Nothing detects or forces rotation. | 2–3 days to move to AWS Secrets Manager / Vault + rotation runbook; add a boot-time assertion that the secret is present, high-entropy, and not the placeholder. |
| 2.2 | No enforcement of HTTPS/HSTS, no `Secure`/`__Host-` cookie prefixes verified for the deployment target, no CSP, `X-Frame-Options`, `Referrer-Policy`, or `X-Content-Type-Options` (`next.config.mjs` is empty). | Cookie theft over plaintext, clickjacking, and a much larger XSS blast radius. | 1–2 days (headers + CSP with nonces, tested against the app). |
| 2.3 | No encryption at rest for applicant PII — currently in process memory, and the documented Postgres path relies solely on volume-level encryption. No field-level encryption or tokenisation for phone/email/document identifiers. | A database dump or backup leak exposes complete KYC profiles in cleartext. | 1–2 weeks (envelope encryption with KMS, key rotation, searchable-encryption or blind-index design for the search feature). |
| 2.4 | No key management story at all: no KMS, no key rotation, no separation between signing and encryption keys. | Compromise of one key compromises everything, indefinitely. | 3–5 days once 2.1/2.3 land. |
| 2.5 | Mock document upload accepts metadata only — there is no storage, no signed URLs, no access control, no antivirus/content-type verification, no size limits on real bytes. | The entire document-handling path (the highest-value data in a KYC system) is unbuilt and unassessed. | 1.5–2 weeks (signed URLs, private bucket, AV scanning, MIME sniffing, per-object authorization, download audit). |

## 3. Audit log integrity & tamper-evidence

| # | Gap | Risk | Effort |
|---|-----|------|--------|
| 3.1 | The audit log is a mutable JSON array on the same mutable record it describes (`audit_log_json`), written by the same code path that mutates the data, with no append-only enforcement. | Anyone with write access to the store can rewrite history. The log is not evidence — it cannot survive a regulator's or a fraud investigation's scrutiny. | 1–1.5 weeks (separate append-only table, `INSERT`-only grants, DB triggers blocking `UPDATE`/`DELETE`). |
| 3.2 | No tamper-evidence: no hash chaining, no signatures, no sequence numbers, no external anchoring. | Silent modification or deletion of entries is undetectable after the fact. | 3–5 days (per-entry hash chain + periodic anchoring to WORM storage). |
| 3.3 | Audit entries are lost when the process restarts (in-memory store), and application logs go to stdout with no shipping, retention, or integrity guarantees. | No forensic trail after an incident; nothing to reconstruct who saw or changed what. | 3–4 days to ship to a WORM/immutable log sink (CloudWatch with retention lock, S3 Object Lock, or the SIEM). |
| 3.4 | Read access is not audited at all — only mutations create entries. | Bulk exfiltration by an authorised insider browsing the queue leaves no record. | 2–3 days (log every record read with actor, filter and result count). |
| 3.5 | Logs contain PII: `workflow.kyc_approved` logs `applicant_name`, AML results log per-applicant hits, validation errors echo submitted values. | PII sprawls into logging infrastructure with different (weaker) access controls and retention than the primary store. | 2–3 days (redaction layer, ID-only logging, PII linter in CI). |
| 3.6 | No clock/actor trust: timestamps are `new Date()` in app code; actor identity comes from an unrevocable JWT. | Timeline evidence is only as trustworthy as the app server. | 1–2 days (DB-generated timestamps, `NOT NULL` actor FK). |

## 4. Data retention, deletion & privacy

| # | Gap | Risk | Effort |
|---|-----|------|--------|
| 4.1 | No retention policy or lifecycle: records live forever, with no distinction between the KYC-record retention obligation (typically 5 years post-relationship under BSA/AMLD) and data that should be purged sooner. | Simultaneously over-retains (GDPR/CCPA minimisation violation) and has no defensible schedule to point at during an audit. | 1–1.5 weeks (retention schedule per field class, automated purge jobs, legal sign-off). |
| 4.2 | No deletion or rectification path — no DSAR handling, no hard-delete, no crypto-shredding, and deleting a record would also destroy its audit trail. | Cannot satisfy a GDPR Art. 17 request without breaking the audit requirement; the two need separate designs. | 1–2 weeks (soft-delete + PII crypto-shredding while preserving audit metadata). |
| 4.3 | No data classification, no field-level access control: every reviewer who can see a record sees full phone/email/document data. | No minimisation within the app; a reviewer only triaging status still gets the full PII payload. | 1 week (classification + masked projections + reveal-on-purpose with audit). |
| 4.4 | No backup, restore, or backup-encryption story; the current store loses everything on restart. | No durability, no tested recovery, no RPO/RTO. | 3–5 days once on a real database (PITR, restore drill). |
| 4.5 | No residency/subprocessor controls, no DPA-driven boundaries for where KYC data lives or which vendors touch it. | Cross-border transfer exposure and vendor risk are unmanaged. | 3–5 days of design + procurement/legal time. |
| 4.6 | Seed data is synthetic (good) but there is no guard preventing the mock repository or the seeder from being enabled in a production build. | A misconfigured deploy silently serves or overwrites real data with mock behaviour. | 0.5–1 day (fail-fast on `NODE_ENV=production` without a real `DATABASE_URL`). |

## 5. Rate limiting & abuse protection

| # | Gap | Risk | Effort |
|---|-----|------|--------|
| 5.1 | No rate limiting on any route — login, list, mutations, or the AML integration. | Credential stuffing, scripted enumeration of the full applicant table, and trivially cheap DoS. | 2–4 days (edge/gateway limits + per-actor application limits with sensible 429s). |
| 5.2 | Search and list endpoints allow `page_size` up to 100 with unbounded paging and no export throttle. | An authenticated insider or stolen session can page through and exfiltrate the entire KYC dataset in minutes, with no alert. | 3–5 days (volume anomaly detection, export approval flow, per-actor daily caps). |
| 5.3 | No bot/automation defences on login (no CAPTCHA, no device fingerprint). | Automated attacks are indistinguishable from users. | 1–2 days, mostly IdP configuration. |
| 5.4 | No request size limits, timeouts, or circuit breakers around the (future) AML provider call. | A slow or hostile upstream stalls the app; large payloads exhaust memory. | 2–3 days. |
| 5.5 | No CSRF review of the mutation routes beyond NextAuth's built-in protection; all state changes are JSON `POST`/`PATCH` from the client with no explicit origin checks. | Cross-origin state change if a future route relaxes content-type handling. | 1–2 days (explicit origin/`Sec-Fetch-Site` checks in `withApi`). |
| 5.6 | No WAF, no DDoS protection, no IP allowlisting for an internal-only tool. | An internal admin tool is exposed to the whole internet. | 1–3 days (VPN/Cloudflare Access/private ingress). |

## 6. Dependency & vulnerability management

| # | Gap | Risk | Effort |
|---|-----|------|--------|
| 6.1 | `npm audit` currently reports **7 vulnerabilities (2 critical, 5 high)**, including critical advisories in `@auth/core` (the auth library itself) and multiple high-severity `next` advisories. | Known-exploitable issues in the authentication and framework layers of an app holding PII. | 2–4 days to upgrade and regression-test (the `next` fix is a major-version bump). |
| 6.2 | Auth depends on a **beta** release (`next-auth@5.0.0-beta.25`) with no support guarantees. | Betas ship breaking changes and receive patches unpredictably; this is the single most security-critical dependency. | 2–5 days to pin to a stable release (or vendor-supported alternative) once one is available. |
| 6.3 | No automated dependency scanning, no Dependabot/Renovate, no lockfile-integrity or supply-chain policy (`.github/` does not exist). | Newly disclosed CVEs go unnoticed indefinitely; a malicious transitive package lands unreviewed. | 1–2 days (Dependabot + `npm audit` gate + minimum-release-age policy). |
| 6.4 | No CI at all: no SAST, no secret scanning, no license check, no SBOM, no container/image scanning, no branch protection or required review. | Nothing prevents an insecure or credential-leaking change from reaching production. | 3–5 days for a baseline pipeline. |
| 6.5 | No automated tests of any kind — in particular no tests asserting the authorization rules in `visibleTo()` and the per-route role lists. | The control most likely to break silently during a refactor is the one with zero coverage. | 3–5 days for a meaningful authz/regression suite. |

## 7. Other findings

| # | Gap | Risk | Effort |
|---|-----|------|--------|
| 7.1 | Authorization is enforced per-handler by convention (`opts.roles`) and per-row by `visibleTo()`; a new route that forgets `roles` silently defaults to "any authenticated user". | Fail-open authorization design. One omission exposes admin functionality to every reviewer. | 3–5 days (default-deny: require an explicit policy argument, plus DB-level RLS as defence in depth). |
| 7.2 | Reviewers can see **all unassigned** reviews, which in practice is most of the queue. | The role boundary is far wider than "their queue"; effectively everyone sees everything. | 2–3 days to redesign around explicit assignment/claiming. |
| 7.3 | Validation errors return raw zod `issues` to the client and unhandled errors are logged with full messages. | Minor information disclosure about internal schema/structure. | 0.5 day. |
| 7.4 | The AML integration is a deterministic hash of the applicant name; there is no provider, no retry/idempotency semantics, no evidence retention of the screening result, and no periodic re-screening. | The core compliance control the queue exists to support does not exist. | 2–4 weeks including provider selection, contract, and evidence retention design. |
| 7.5 | The risk score is a hand-rolled heuristic with no model governance, no documentation of factors for regulators, and a manual-override flag with no reason code or dual approval. | Unexplainable decisioning on a regulated process; overrides are unaccountable. | 1–2 weeks (documented scoring policy, reason codes on override, periodic back-testing). |
| 7.6 | No observability: no error tracking, no metrics, no alerting on 401/403 spikes or unusual approval volume. | Incidents are discovered by users, not by the team. | 3–5 days. |
| 7.7 | No environment separation, deployment pipeline, infrastructure-as-code, or documented production topology. | No change control; production drift and manual deploys are unauditable. | 1–2 weeks. |
| 7.8 | No incident response plan, breach-notification runbook, or on-call ownership for this service. | Regulatory notification clocks (72h under GDPR) start whether or not anyone is ready. | 3–5 days of documentation + tabletop. |
| 7.9 | No accessibility, browser-support, or session-timeout UX review for an app used all day by an operations team. | Not a security gap, but a real blocker to production rollout. | 1 week. |

---

## What is *not* a gap

Worth stating plainly, since the point of the prototype was the architecture:

- The datastore seam (`ReviewsRepository`) means row-level visibility, audit writes, and
  validation do not have to be redesigned to move to Postgres/Supabase — `visibleTo()`
  maps directly onto RLS policies.
- All mutations flow through one wrapper (`withApi`) with consistent auth checks, structured
  logging, and a uniform response envelope, so the controls above have a single place to land.
- Input validation with zod is present on every route that accepts a body or query.
- TypeScript strict mode is on and the build, lint, and typecheck pass cleanly.
