"use client";

import { useSession } from "next-auth/react";
import type { Role } from "@/lib/types";

const SCOPE: Record<Role, string> = {
  admin: "Admin view: every application in the pipeline.",
  reviewer: "Reviewer view: applications assigned to you, plus the unassigned pool.",
  approver: "Approver view: decided applications awaiting final sign-off.",
};

export function RoleScopeNote() {
  const { data: session } = useSession();
  if (!session?.user) return null;
  return <p className="text-sm text-muted-foreground">{SCOPE[session.user.role]}</p>;
}
