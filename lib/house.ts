import { prisma } from "@/lib/prisma";

/**
 * Household domain operations. Kept together so the API routes stay thin and
 * the invariants (creator becomes OWNER, active house is always a house the
 * user belongs to) live in one place.
 */

/** Create a house, make the creator its OWNER, and set it as their active house. */
export async function createHouse(userId: string, name: string) {
  return prisma.$transaction(async (tx) => {
    const house = await tx.house.create({
      data: {
        name: name.trim() || "My Pantry",
        createdById: userId,
        members: { create: { userId, role: "OWNER" } },
      },
    });
    await tx.user.update({
      where: { id: userId },
      data: { activeHouseId: house.id },
    });
    return house;
  });
}

/**
 * Join a house via its invite code. Idempotent: if already a member, just
 * switches the active house. Returns the house, or null if the code is invalid.
 */
export async function joinHouseByCode(userId: string, code: string) {
  const house = await prisma.house.findUnique({ where: { joinCode: code.trim() } });
  if (!house) return null;

  await prisma.$transaction(async (tx) => {
    await tx.houseMember.upsert({
      where: { userId_houseId: { userId, houseId: house.id } },
      update: {},
      create: { userId, houseId: house.id, role: "MEMBER" },
    });
    await tx.user.update({
      where: { id: userId },
      data: { activeHouseId: house.id },
    });
  });

  return house;
}

/** Switch the user's active house, verifying membership first. */
export async function switchActiveHouse(userId: string, houseId: string) {
  const membership = await prisma.houseMember.findUnique({
    where: { userId_houseId: { userId, houseId } },
  });
  if (!membership) return false;

  await prisma.user.update({
    where: { id: userId },
    data: { activeHouseId: houseId },
  });
  return true;
}

/** All houses the user belongs to, with their role and member counts. */
export async function listHousesForUser(userId: string) {
  const memberships = await prisma.houseMember.findMany({
    where: { userId },
    orderBy: { joinedAt: "asc" },
    include: {
      house: {
        include: { _count: { select: { members: true, pantryItems: true } } },
      },
    },
  });
  return memberships.map((m) => ({
    id: m.house.id,
    name: m.house.name,
    role: m.role,
    joinCode: m.house.joinCode,
    memberCount: m.house._count.members,
    itemCount: m.house._count.pantryItems,
  }));
}

/** A house with its members (for the /house management page). */
export async function getHouseWithMembers(houseId: string) {
  return prisma.house.findUnique({
    where: { id: houseId },
    include: {
      members: {
        orderBy: { joinedAt: "asc" },
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
        },
      },
    },
  });
}
