import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { findUser } from "@/lib/users";
import type { Role } from "@/lib/types";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      name: "Mock SSO",
      credentials: { email: {}, password: {} },
      authorize: async (credentials) => {
        const email = String(credentials?.email ?? "");
        const password = String(credentials?.password ?? "");
        const user = findUser(email, password);
        if (!user) return null;
        return { id: user.email, email: user.email, name: user.name, role: user.role };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.role = (user as { role: Role }).role;
      return token;
    },
    session({ session, token }) {
      if (session.user) session.user.role = token.role as Role;
      return session;
    },
  },
});
