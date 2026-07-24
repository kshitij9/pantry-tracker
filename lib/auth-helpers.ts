import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";

/**
 * Server-side authorization helpers for API routes.
 *
 * `resolveHouseContext` is the single source of truth for "which house is this
 * request allowed to act on". It reads the active house *fresh from the DB*
 * (not just from the JWT) and verifies membership, so a stale token can never
 * grant access to a house the user isn't a member of.
 */

export interface HouseContext {
  userId: string;
  houseId: string;
  role: Role;
}

type Resolved =
  | { ok: true; ctx: HouseContext }
  | { ok: false; response: NextResponse };

/** Resolve the caller's user + active house, or return an error response. */
export async function resolveHouseContext(): Promise<Resolved> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { activeHouseId: true },
  });

  if (!user?.activeHouseId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "No active house. Complete onboarding first." },
        { status: 409 }
      ),
    };
  }

  // Verify the user actually belongs to their active house.
  const membership = await prisma.houseMember.findUnique({
    where: {
      userId_houseId: { userId: session.user.id, houseId: user.activeHouseId },
    },
    select: { role: true },
  });

  if (!membership) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "You are not a member of the active house." },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true,
    ctx: {
      userId: session.user.id,
      houseId: user.activeHouseId,
      role: membership.role,
    },
  };
}

/** Assert the caller is a member of a specific house; returns their role. */
export async function requireMembership(
  userId: string,
  houseId: string
): Promise<Role | null> {
  const membership = await prisma.houseMember.findUnique({
    where: { userId_houseId: { userId, houseId } },
    select: { role: true },
  });
  return membership?.role ?? null;
}
