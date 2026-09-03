"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function AppHeader() {
  const { data: session } = useSession();
  const user = session?.user;
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="h-5 w-5" />
          KYC Review Queue
        </Link>
        <div className="ml-auto flex items-center gap-3 text-sm">
          {user ? (
            <>
              <span className="text-muted-foreground">{user.name}</span>
              <Badge variant="secondary">{user.role}</Badge>
              <Button variant="outline" size="sm" onClick={() => signOut({ callbackUrl: "/login" })}>
                Sign out
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
