import { prisma } from "./prisma";

/**
 * Resolve (and lazily create) a user by email.
 *
 * NOTE: This scaffold does not include auth. For a single-tenant dev setup we
 * attribute all data to DEV_DEFAULT_USER_EMAIL. In production, replace calls to
 * `getCurrentUser` with your real session/auth lookup (e.g. NextAuth).
 */
export async function getOrCreateUser(email: string) {
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { email },
  });
}

/** Returns the "current" user for this scaffold (dev default). */
export async function getCurrentUser() {
  const email = process.env.DEV_DEFAULT_USER_EMAIL;
  if (!email) {
    throw new Error(
      "DEV_DEFAULT_USER_EMAIL is not set. In production, wire this to real auth."
    );
  }
  return getOrCreateUser(email);
}
