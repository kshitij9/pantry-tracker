/**
 * Register (or renew) a Gmail push notification "watch" on the mailbox.
 *
 * Gmail watches expire after ~7 days, so this should be re-run periodically
 * (e.g. via a daily cron / scheduled job).
 *
 * Prerequisites:
 *   - GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN in .env
 *   - A Pub/Sub topic created (Phase 4), with the Gmail service account
 *     (gmail-api-push@system.gserviceaccount.com) granted "Pub/Sub Publisher".
 *   - GCP_PROJECT_ID and PUBSUB_TOPIC set in .env (see below).
 *
 * Run:  npm run gmail:watch
 */
import { gmail as gmailApi } from "@googleapis/gmail";
import { OAuth2Client } from "google-auth-library";
import { readFileSync } from "node:fs";

loadEnv();

const {
  GMAIL_CLIENT_ID,
  GMAIL_CLIENT_SECRET,
  GMAIL_REFRESH_TOKEN,
  GMAIL_USER_ID = "me",
  GCP_PROJECT_ID,
  PUBSUB_TOPIC = "gmail-orders",
} = process.env;

if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
  console.error("❌ Missing Gmail OAuth env vars. Complete Phase 3 first.");
  process.exit(1);
}
if (!GCP_PROJECT_ID) {
  console.error(
    "❌ GCP_PROJECT_ID is not set in .env. Add it (your Google Cloud project id)."
  );
  process.exit(1);
}

const auth = new OAuth2Client(GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET);
auth.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });

const gmail = gmailApi({ version: "v1", auth });
const topicName = `projects/${GCP_PROJECT_ID}/topics/${PUBSUB_TOPIC}`;

try {
  const res = await gmail.users.watch({
    userId: GMAIL_USER_ID,
    requestBody: {
      topicName,
      labelIds: ["INBOX"],
      labelFilterBehavior: "INCLUDE",
    },
  });
  console.log("✅ Watch registered on", topicName);
  console.log("   historyId:", res.data.historyId);
  console.log(
    "   expires:",
    res.data.expiration
      ? new Date(Number(res.data.expiration)).toISOString()
      : "(unknown)"
  );
  console.log("\n⏰ Re-run this before it expires (~7 days) to keep syncing.");
} catch (err) {
  console.error("❌ watch failed:", err.message);
  console.error(
    "   Common causes: topic doesn't exist, or the Gmail service account\n" +
      "   lacks Pub/Sub Publisher on the topic (Phase 4)."
  );
  process.exit(1);
}

/** Tiny .env parser (KEY="value" / KEY=value), no external deps. */
function loadEnv() {
  try {
    const raw = readFileSync(new URL("../.env", import.meta.url), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let [, key, val] = m;
      val = val.replace(/^["']|["']$/g, "");
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    /* ignore */
  }
}
