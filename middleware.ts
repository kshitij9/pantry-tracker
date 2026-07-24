import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

/**
 * Edge middleware that guards app routes.
 *
 * We build a lightweight Auth.js instance from the edge-safe `authConfig`
 * (no Prisma adapter) so it can run on the Edge runtime. The actual guard
 * logic lives in `authConfig.callbacks.authorized`.
 */
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // Run on everything except Next internals, the auth API, and static assets.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};
