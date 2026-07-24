/**
 * Sanity-check the Gemini API key + structured JSON output.
 * Feeds a tiny fake order email through the same schema shape the app uses
 * and prints the parsed items, so we know parsing works end to end.
 *
 * Run:  npm run gemini:test
 */
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { readFileSync } from "node:fs";

loadEnv();

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey || apiKey.startsWith("your-")) {
  console.error("❌ GEMINI_API_KEY is not set in .env.");
  process.exit(1);
}

const SAMPLE_EMAIL = `
Swiggy Instamart — Order Delivered
Order #INS12345, placed 24 Jul 2026

Items:
- Amul Taaza Toned Milk 500ml  x2
- Fresh Spinach (Palak) 250g   x1
- Onions 1kg                   x1
- Aashirvaad Atta 5kg          x1
- Lay's Classic Salted 52g     x3

Item total: 742.00  Delivery: 25.00  Grand total: 767.00
`;

const ORDER_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    vendor: { type: SchemaType.STRING },
    order_date: { type: SchemaType.STRING },
    items: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          name: { type: SchemaType.STRING },
          quantity: { type: SchemaType.NUMBER },
          unit: { type: SchemaType.STRING },
          category: { type: SchemaType.STRING },
        },
        required: ["name", "quantity", "unit", "category"],
      },
    },
  },
  required: ["vendor", "order_date", "items"],
};

const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({
  model: process.env.GEMINI_MODEL || "gemini-flash-latest",
  generationConfig: {
    responseMimeType: "application/json",
    responseSchema: ORDER_SCHEMA,
    temperature: 0.1,
  },
});

try {
  const t0 = Date.now();
  const result = await model.generateContent(
    "Extract grocery items from this order email. Ignore fees/totals.\n\n" +
      SAMPLE_EMAIL
  );
  const parsed = JSON.parse(result.response.text());
  const ms = Date.now() - t0;

  console.log(`✅ Gemini responded in ${ms}ms.`);
  console.log(`   Vendor: ${parsed.vendor} | Date: ${parsed.order_date}`);
  console.log(`   Parsed ${parsed.items.length} item(s):`);
  for (const it of parsed.items) {
    console.log(`     • ${it.name} — ${it.quantity} ${it.unit} [${it.category}]`);
  }
  console.log("\n✅ Structured extraction works — Gemini is ready.");
} catch (err) {
  console.error("❌ Gemini call failed:", err.message);
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
