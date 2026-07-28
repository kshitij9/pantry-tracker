import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { gmailClientFor, registerWatch } from "@/lib/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET|POST /api/gmail/renew
 *
 * Renews every connected user's Gmail push watch. Gmail watches expire after
 * ~7 days, so a weekly Vercel Cron calls this to keep auto-sync alive for all
 * mailboxes.
 *
 * Auth: CRON_SECRET (Bearer header or ?token=).
 */
export async function GET(req: NextRequest) {
  return run(req);
}
export async function POST(req: NextRequest) {
  return run(req);
}

async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = req.headers.get("authorization");
    const token = req.nextUrl.searchParams.get("token");
    if (authHeader !== `Bearer ${secret}` && token !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const connections = await prisma.gmailConnection.findMany({
    select: { userId: true, email: true, refreshTokenEnc: true },
  });

  const results: Array<{ email: string; status: string; expiresAt?: string | null }> = [];

  for (const conn of connections) {
    try {
      const client = gmailClientFor(decrypt(conn.refreshTokenEnc));
      const { historyId, expiration } = await registerWatch(client);
      await prisma.gmailConnection.update({
        where: { userId: conn.userId },
        data: { historyId, watchExpiresAt: expiration },
      });
      results.push({ email: conn.email, status: "renewed", expiresAt: expiration?.toISOString() ?? null });
    } catch (err) {
      console.error(`[gmail/renew] failed for ${conn.email}:`, (err as Error).message);
      results.push({ email: conn.email, status: `error:${(err as Error).message}` });
    }
  }

  const renewed = results.filter((r) => r.status === "renewed").length;
  return NextResponse.json({ ok: true, total: connections.length, renewed, results });
}
