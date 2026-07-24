import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { authConfig } from "./auth.config";

/**
 * Full Auth.js instance (Node runtime).
 *
 * Combines the edge-safe `authConfig` (providers + callbacks) with the Prisma
 * adapter, which persists users/accounts/sessions/verification tokens. We use
 * JWT sessions so `middleware.ts` can read the session on the Edge without a
 * database round-trip.
 *
 * Exports:
 *   - handlers : GET/POST route handlers for /api/auth/[...nextauth]
 *   - auth     : server-side session accessor (use in Server Components/routes)
 *   - signIn / signOut : server actions
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  ...authConfig,
});
