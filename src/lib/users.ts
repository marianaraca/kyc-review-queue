import type { Role } from "@/lib/types";

export type MockUser = { email: string; name: string; role: Role; password: string };

/** Mock directory. In production this comes from your IdP (Okta/WorkOS/Google). */
export const MOCK_USERS: MockUser[] = [
  { email: "admin@fintech.example", name: "Ada Admin", role: "admin", password: "password" },
  { email: "reviewer@fintech.example", name: "Rey Reviewer", role: "reviewer", password: "password" },
  { email: "reviewer2@fintech.example", name: "Robin Reviewer", role: "reviewer", password: "password" },
  { email: "approver@fintech.example", name: "Avery Approver", role: "approver", password: "password" },
];

export const REVIEWERS = MOCK_USERS.filter((u) => u.role === "reviewer").map((u) => u.email);

export function findUser(email: string, password: string): MockUser | undefined {
  return MOCK_USERS.find(
    (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password
  );
}

export function displayName(email: string | null): string {
  if (!email) return "Unassigned";
  return MOCK_USERS.find((u) => u.email === email)?.name ?? email;
}
