import { computeRiskScore } from "@/lib/risk";
import type { Review, ReviewDocument, ReviewStatus } from "@/lib/types";
import { REVIEWERS } from "@/lib/users";

const FIRST = [
  "Amara", "Liam", "Sofia", "Noah", "Priya", "Mateo", "Yuki", "Elena", "Omar", "Hannah",
  "Diego", "Aisha", "Lucas", "Nina", "Tomas", "Zoe", "Ravi", "Clara", "Kofi", "Mira",
  "Jonas", "Leila", "Andre", "Sana", "Felix", "Ines", "Hugo", "Maya", "Pablo", "Freya",
];
const LAST = [
  "Okafor", "Nguyen", "Rossi", "Kim", "Patel", "Alvarez", "Tanaka", "Novak", "Haddad", "Berg",
  "Silva", "Rahman", "Muller", "Costa", "Petrov", "Dubois", "Iyer", "Lindqvist", "Mensah", "Fischer",
];
const COMPANIES = [
  "Northwind Capital", "Lumen Labs", "Riverstone Holdings", "Cobalt Freight", "Vela Ventures",
  "Harbor Point LLC", "Solace Health", "Trellis Foods", "Atlas Robotics", "Beacon Payments",
  "Quarry Analytics", "Sable Logistics", "Mercury Retail", "Pine & Co", "Orbit Studios",
];
const DOMAINS = ["gmail.com", "outlook.com", "protonmail.com", "acmecorp.com", "northwind.io", "vela.vc"];
const STATUS_MIX: ReviewStatus[] = [
  "pending", "pending", "pending", "pending", "pending",
  "in_review", "in_review", "in_review",
  "info_requested",
  "approved", "approved",
  "rejected",
];

/** Deterministic PRNG so the seeded queue is identical on every boot (demo-stable). */
function lcg(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const DOC_POOL: Array<[string, string]> = [
  ["passport_scan.pdf", "application/pdf"],
  ["selfie.jpg", "image/jpeg"],
  ["business_license.pdf", "application/pdf"],
  ["utility_bill.pdf", "application/pdf"],
  ["bank_statement.pdf", "application/pdf"],
];

export function seedReviews(count = 120): Review[] {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed synthetic KYC applicants: the seeder must never run in production.");
  }
  const rand = lcg(20240517);
  const now = Date.now();
  const reviews: Review[] = [];

  for (let i = 0; i < count; i++) {
    const first = FIRST[Math.floor(rand() * FIRST.length)];
    const last = LAST[Math.floor(rand() * LAST.length)];
    const company = COMPANIES[Math.floor(rand() * COMPANIES.length)];
    const domain = DOMAINS[Math.floor(rand() * DOMAINS.length)];
    const status = STATUS_MIX[Math.floor(rand() * STATUS_MIX.length)];
    const createdAt = new Date(now - Math.floor(rand() * 75) * 86_400_000 - Math.floor(rand() * 86_400_000));

    const docCount = 2 + Math.floor(rand() * 3);
    const documents_json: ReviewDocument[] = DOC_POOL.slice(0, docCount).map(([file_name, mime_type], d) => ({
      id: `doc_${i + 1}_${d + 1}`,
      file_name,
      mime_type,
      size_bytes: 80_000 + Math.floor(rand() * 3_000_000),
      uploaded_at: createdAt.toISOString(),
    }));

    const unassigned = status === "pending" && rand() < 0.45;
    const assigned_reviewer = unassigned ? null : REVIEWERS[Math.floor(rand() * REVIEWERS.length)];

    const identity_verified = status === "approved" ? true : rand() < 0.55;
    const address_verified = status === "approved" ? true : rand() < 0.45;

    const base = {
      id: `kyc_${String(i + 1).padStart(4, "0")}`,
      applicant_name: `${first} ${last}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}${i}@${domain}`,
      phone: `+1 (415) ${String(200 + Math.floor(rand() * 799))}-${String(1000 + Math.floor(rand() * 8999))}`,
      company,
      status,
      identity_verified,
      address_verified,
      assigned_reviewer,
      notes: status === "info_requested" ? "Awaiting a clearer copy of the address document." : "",
      documents_json,
      created_at: createdAt.toISOString(),
      updated_at: createdAt.toISOString(),
    };

    reviews.push({
      ...base,
      risk_score: computeRiskScore(base),
      risk_score_manual: false,
      audit_log_json: [
        {
          id: `audit_${i + 1}_1`,
          actor_email: "system@fintech.example",
          actor_role: "admin" as const,
          action: "application.submitted",
          changes: {},
          note: "Application received from onboarding flow.",
          created_at: createdAt.toISOString(),
        },
      ],
    });
  }

  return reviews;
}
