/**
 * Sanity-check the Gmail OAuth credentials.
 * Calls users.getProfile (proves the refresh token works) and lists recent
 * order emails from known grocery vendors (proves we can read the mailbox).
 *
 * Run:  npm run gmail:test
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
} = process.env;

if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
  console.error("❌ Missing Gmail OAuth env vars.");
  process.exit(1);
}

const auth = new OAuth2Client(GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET);
auth.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });
const gmail = gmailApi({ version: "v1", auth });

try {
  const profile = await gmail.users.getProfile({ userId: GMAIL_USER_ID });
  console.log("✅ Authenticated as:", profile.data.emailAddress);
  console.log("   Total messages in mailbox:", profile.data.messagesTotal);

  const vendors = ["instamart.in", "blinkit.com", "zepto.co", "zeptonow.com"];
  const q = `(${vendors.map((d) => `from:${d}`).join(" OR ")}) newer_than:60d`;
  const list = await gmail.users.messages.list({
    userId: GMAIL_USER_ID,
    q,
    maxResults: 5,
  });

  const count = list.data.messages?.length ?? 0;
  console.log(`\n🔎 Found ${count} recent order email(s) (last 60 days).`);
  console.log("✅ Gmail read access confirmed — Phase 3 complete.");
} catch (err) {
  console.error("❌ Gmail API call failed:", err.message);
  console.error(
    "   If this is 'invalid_grant', the refresh token is wrong/expired — re-run npm run gmail:token."
  );
  process.exit(1);
}

/** Tiny .env parser. */
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
