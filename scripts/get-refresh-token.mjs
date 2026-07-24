/**
 * One-time helper to obtain a Gmail OAuth refresh token.
 *
 * Prerequisites (Phase 1-2):
 *   - GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET set in .env
 *   - In your OAuth client's "Authorized redirect URIs", add:
 *       http://localhost:5555/oauth2callback
 *
 * Run:  npm run gmail:token
 *
 * It opens (or prints) a Google consent URL. After you approve, Google
 * redirects back here with a code, which we exchange for a refresh token.
 * The token is printed so you can paste it into .env as GMAIL_REFRESH_TOKEN.
 */
import http from "node:http";
import { URL } from "node:url";
import { OAuth2Client } from "google-auth-library";
import { readFileSync } from "node:fs";

// Minimal .env loader so we don't depend on Next's runtime here.
loadEnv();

const clientId = process.env.GMAIL_CLIENT_ID;
const clientSecret = process.env.GMAIL_CLIENT_SECRET;
const PORT = 5555;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;
const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

if (!clientId || !clientSecret || clientId.startsWith("your-")) {
  console.error(
    "\n❌ GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET are not set in .env.\n" +
      "   Complete Phase 1-2 (create an OAuth client) first.\n"
  );
  process.exit(1);
}

const oauth2Client = new OAuth2Client(clientId, clientSecret, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline", // required to receive a refresh token
  prompt: "consent", // force a refresh token even on repeat runs
  scope: SCOPES,
});

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (url.pathname !== "/oauth2callback") {
      res.writeHead(404).end("Not found");
      return;
    }

    const code = url.searchParams.get("code");
    if (!code) {
      res.writeHead(400).end("Missing ?code");
      return;
    }

    const { tokens } = await oauth2Client.getToken(code);
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(
      "<h2>✅ Success!</h2><p>You can close this tab and return to the terminal.</p>"
    );

    if (tokens.refresh_token) {
      console.log("\n============================================================");
      console.log("✅ Refresh token obtained. Add this line to your .env:\n");
      console.log(`GMAIL_REFRESH_TOKEN="${tokens.refresh_token}"`);
      console.log("============================================================\n");
    } else {
      console.log(
        "\n⚠️  No refresh token returned. This usually means you've already " +
          "granted access. Revoke it at https://myaccount.google.com/permissions " +
          "and run again (the script forces prompt=consent).\n"
      );
    }

    server.close();
    process.exit(0);
  } catch (err) {
    console.error("Error exchanging code:", err.message);
    res.writeHead(500).end("Error — check the terminal.");
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log(`\n🔑 Gmail OAuth helper listening on ${REDIRECT_URI}`);
  console.log("\nOpen this URL in your browser to authorize:\n");
  console.log(authUrl + "\n");
});

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
    /* no .env — env may be provided by the shell */
  }
}
