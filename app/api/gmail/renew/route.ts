import { NextRequest, NextResponse } from "next/server";
import { gmail as gmailApi } from "@googleapis/gmail";
import { OAuth2Client } from "google-auth-library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET|POST /api/gmail/renew
 *
 * Renews the Gmail push notification watch. Gmail watches expire after ~7 days,
 * so this endpoint is called by a weekly Vercel Cron to keep auto-sync alive.
 *
 * Auth: same CRON_SECRET as the notifications cron (Bearer header or ?token=).
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
    const auth = req.headers.get("authorization");
    const token = req.nextUrl.searchParams.get("token");
    if (auth !== `Bearer ${secret}` && token !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  const projectId = process.env.GCP_PROJECT_ID;
  const topicName = process.env.PUBSUB_TOPIC ?? "gmail-orders";

  if (!clientId || !clientSecret || !refreshToken || !projectId) {
    return NextResponse.json(
      { error: "Missing Gmail/GCP env vars." },
      { status: 500 }
    );
  }

  const oauth2 = new OAuth2Client(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });
  const gmail = gmailApi({ version: "v1", auth: oauth2 });

  try {
    const res = await gmail.users.watch({
      userId: process.env.GMAIL_USER_ID ?? "me",
      requestBody: {
        topicName: `projects/${projectId}/topics/${topicName}`,
        labelIds: ["INBOX"],
        labelFilterBehavior: "INCLUDE",
      },
    });

    const expiresAt = res.data.expiration
      ? new Date(Number(res.data.expiration)).toISOString()
      : null;

    console.log("[gmail/renew] watch renewed, expires:", expiresAt);
    return NextResponse.json({ ok: true, historyId: res.data.historyId, expiresAt });
  } catch (err) {
    console.error("[gmail/renew] failed:", (err as Error).message);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
