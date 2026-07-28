import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Edge-safe Auth.js configuration.
 *
 * This file must NOT import Prisma or any Node-only module, because it is
 * loaded by `middleware.ts` which runs on the Edge runtime. The Prisma adapter
 * and DB-touching logic live in `auth.ts` instead.
 *
 * The callbacks here (jwt/session) only read from the `user`/`token`/`session`
 * arguments Auth.js already provides — no database access.
 */
export const authConfig = {
  providers: [
    Google({
      // Reuses the existing Google OAuth client (same as Gmail). Ensure the
      // NextAuth callback URLs are added to that client's redirect URIs.
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: {
        params: {
          // Request read access to the mailbox for order auto-sync, alongside
          // the usual identity scopes.
          scope:
            "openid email profile https://www.googleapis.com/auth/gmail.readonly",
          // `offline` + `consent` guarantee Google returns a refresh_token
          // (not just an access token) every time — we need it to read mail
          // in the background. Without `prompt=consent`, Google omits the
          // refresh_token on repeat sign-ins.
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
    // Email (magic-link) provider is intentionally disabled until a mail
    // service is configured. To enable: add a provider in auth.ts (needs the
    // adapter + VerificationToken table) and set the mail env vars.
  ],
  pages: {
    signIn: "/signin",
  },
  callbacks: {
    /**
     * Persist the user id + active house on the JWT.
     * On sign-in `user` is present (from the adapter). On an `update` trigger
     * (e.g. after the user switches active house) we merge the new value.
     */
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id as string;
        token.activeHouseId = (user.activeHouseId ?? null) as string | null;
      }
      if (trigger === "update" && session?.activeHouseId !== undefined) {
        token.activeHouseId = session.activeHouseId;
      }
      return token;
    },
    /** Expose id + activeHouseId on the session for client/server reads. */
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.activeHouseId = (token.activeHouseId ?? null) as string | null;
      }
      return session;
    },
    /**
     * Route guard used by middleware. Protects app routes; new users without
     * an active house are funnelled to /onboarding.
     */
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isLoggedIn = !!auth?.user;
      const activeHouseId = auth?.user?.activeHouseId ?? null;

      const protectedPrefixes = ["/dashboard", "/recipes", "/house", "/meals"];
      const isProtected = protectedPrefixes.some((p) => pathname.startsWith(p));
      const isOnboarding = pathname.startsWith("/onboarding");

      if (isProtected) {
        if (!isLoggedIn) return false; // redirect to signIn page
        if (!activeHouseId) {
          // Logged in but no house yet → onboarding.
          return Response.redirect(new URL("/onboarding", request.nextUrl));
        }
        return true;
      }

      if (isOnboarding) {
        if (!isLoggedIn) return false;
        if (activeHouseId) {
          // Already has a house → skip onboarding.
          return Response.redirect(new URL("/dashboard", request.nextUrl));
        }
        return true;
      }

      return true;
    },
  },
} satisfies NextAuthConfig;
