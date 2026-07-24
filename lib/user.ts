import { prisma } from "./prisma";

/**
 * User lookup helpers.
 *
 * With real authentication (Auth.js), users are created on sign-in. The Gmail
 * webhook has no session, so it resolves the mailbox owner by email to decide
 * which house an incoming order belongs to.
 */

/**
 * Resolve the user + their active house for an inbound Gmail notification.
 * Returns null if the email isn't a registered user or they haven't onboarded
 * into a house yet (in which case we can't attribute the order).
 */
export async function resolveWebhookTarget(email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, activeHouseId: true },
  });
  if (!user || !user.activeHouseId) return null;
  return { userId: user.id, houseId: user.activeHouseId };
}
