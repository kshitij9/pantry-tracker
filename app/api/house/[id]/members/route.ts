import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requireMembership } from "@/lib/auth-helpers";
import { getHouseWithMembers } from "@/lib/house";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/house/[id]/members — list members (any member of the house). */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = await requireMembership(session.user.id, params.id);
  if (!role) {
    return NextResponse.json({ error: "Not a member." }, { status: 403 });
  }

  const house = await getHouseWithMembers(params.id);
  if (!house) {
    return NextResponse.json({ error: "House not found." }, { status: 404 });
  }

  return NextResponse.json({
    house: { id: house.id, name: house.name, joinCode: house.joinCode },
    members: house.members.map((m) => ({
      userId: m.userId,
      role: m.role,
      joinedAt: m.joinedAt,
      name: m.user.name,
      email: m.user.email,
      image: m.user.image,
    })),
  });
}

/**
 * DELETE /api/house/[id]/members — remove a member. Body: { userId }.
 * OWNER only. Cannot remove the last remaining OWNER.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = await requireMembership(session.user.id, params.id);
  if (role !== "OWNER") {
    return NextResponse.json(
      { error: "Only an owner can remove members." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const targetUserId = String(body?.userId ?? "").trim();
  if (!targetUserId) {
    return NextResponse.json({ error: "userId is required." }, { status: 400 });
  }

  // Prevent removing the last owner (which would orphan the house).
  if (targetUserId === session.user.id) {
    const owners = await prisma.houseMember.count({
      where: { houseId: params.id, role: "OWNER" },
    });
    if (owners <= 1) {
      return NextResponse.json(
        { error: "You are the only owner. Transfer ownership before leaving." },
        { status: 400 }
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.houseMember.delete({
      where: { userId_houseId: { userId: targetUserId, houseId: params.id } },
    });
    // If the removed user had this house active, clear it so they re-onboard.
    await tx.user.updateMany({
      where: { id: targetUserId, activeHouseId: params.id },
      data: { activeHouseId: null },
    });
  });

  return NextResponse.json({ ok: true });
}
