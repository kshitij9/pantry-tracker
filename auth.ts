import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { authConfig } from "./auth.config";
import { upsertConnectionAndWatch } from "@/lib/gmail-connection";

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
  events: {
    /**
     * On Google sign-in, capture the mailbox refresh token (granted via the
     * gmail.readonly scope), store it encrypted, and register a push watch on
     * the user's inbox. Wrapped so a Gmail failure never blocks login.
     */
    async signIn({ user, account }) {
      if (
        account?.provider === "google" &&
        account.refresh_token &&
        user.id &&
        user.email
      ) {
        try {
          await upsertConnectionAndWatch(user.id, user.email, account.refresh_token);
        } catch (err) {
          console.error("[auth] Gmail connection setup failed:", (err as Error).message);
        }
      }
    },
  },
});
