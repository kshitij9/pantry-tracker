import {
  GoogleGenerativeAI,
  SchemaType,
  type Schema,
} from "@google/generative-ai";
import { KNOWN_CATEGORIES } from "./categories";

/**
 * Gemini SDK client + the two structured-output schemas used by the app:
 *   1. Order-email extraction  -> `extractOrderFromEmail`
 *   2. Recipe generation       -> `generateRecipes`
 *
 * Both use Gemini's `responseSchema` feature so the model returns strict JSON
 * that we can parse without brittle regex/string surgery.
 */

// Overridable via env so a model rename/gating never requires a code change.
// `gemini-flash-latest` tracks Google's current flash model.
const MODEL_ID = process.env.GEMINI_MODEL || "gemini-flash-latest";

function getClient(): GoogleGenerativeAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set. See .env.example.");
  }
  return new GoogleGenerativeAI(apiKey);
}

// ---------------------------------------------------------------------------
// 1. Order email -> structured items
// ---------------------------------------------------------------------------

export interface ParsedOrderItem {
  name: string;
  quantity: number;
  unit: string;
  category: string;
  /** True when the weight was inferred from price rather than read explicitly. */
  weight_inferred?: boolean;
}

export type OrderType = "grocery" | "prepared_food" | "other";

export interface ParsedOrder {
  vendor: string;
  order_date: string; // ISO-8601 date string, best-effort
  order_type: OrderType; // grocery vs. restaurant/prepared-food vs. other
  items: ParsedOrderItem[];
}

const ORDER_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    vendor: {
      type: SchemaType.STRING,
      description: "The store the order came from, e.g. Instamart, Blinkit, Zepto.",
    },
    order_date: {
      type: SchemaType.STRING,
      description: "The order/delivery date in ISO-8601 (YYYY-MM-DD). Best-effort.",
    },
    order_type: {
      type: SchemaType.STRING,
      format: "enum",
      enum: ["grocery", "prepared_food", "other"],
      description:
        "Classify the order: 'grocery' for raw groceries/supermarket items " +
        "(Instamart/Blinkit/Zepto); 'prepared_food' for cooked meals from a " +
        "restaurant (Swiggy Food, Zomato); 'other' for anything else.",
    },
    items: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          name: {
            type: SchemaType.STRING,
            description: "Product name as printed on the receipt.",
          },
          quantity: {
            type: SchemaType.NUMBER,
            description:
              "Amount in the chosen unit. For weight/volume items prefer the " +
              "net weight (e.g. 1 for '1 kg', 500 for '500 g'). Default 1 if unclear.",
          },
          unit: {
            type: SchemaType.STRING,
            description:
              "Unit of the quantity: prefer weight/volume (g, kg, ml, l) for " +
              "produce/staples; use pcs/pack only for genuinely countable items.",
          },
          category: {
            type: SchemaType.STRING,
            description: `Best-fit category. Must be one of: ${KNOWN_CATEGORIES.join(", ")}.`,
          },
          weight_inferred: {
            type: SchemaType.BOOLEAN,
            description:
              "True if you estimated the weight from the price (item was listed " +
              "as NOS/units without an explicit weight); false if read directly.",
          },
        },
        required: ["name", "quantity", "unit", "category"],
      },
    },
  },
  required: ["vendor", "order_date", "order_type", "items"],
};

/**
 * Shared parsing expertise injected into both the email and invoice prompts.
 * Teaches the model to infer a real weight from the price when an item is
 * listed as "NOS"/units without an explicit weight — common on Indian
 * quick-commerce invoices where produce is billed per piece.
 */
const WEIGHT_INFERENCE_RULES = [
  "You are an expert Indian quick-commerce grocery invoice parser.",
  "When an item's quantity is given in 'NOS' or bare units WITHOUT an explicit",
  "weight, infer the standard package weight from the item name and the net",
  "price paid, then set quantity+unit to that inferred weight (in g/kg/ml/l) and",
  "set weight_inferred=true. If a weight is printed explicitly, use it and set",
  "weight_inferred=false. For a line with N units, multiply the per-pack weight",
  "by N (e.g. 2 trays of 200 g -> quantity 400, unit 'g').",
  "",
  "Reference unit-price baselines (approximate, INR):",
  "- Onion: ~₹20/500g | ~₹35-40/1kg | ~₹75/2kg",
  "- Potato/Tomato: ~₹25-30/500g | ~₹45-55/1kg",
  "- Ginger: ~₹20-25/100g | ~₹45-50/250g | ~₹90/500g",
  "- Garlic (peeled): ~₹50-60/100g pack",
  "- Button Mushroom: ~₹55-65 per 200g tray",
  "- Leafy greens (spinach/coriander): ~₹15-25 per 100-250g bunch",
  "- Banana: ~₹40-60 per dozen (~6-12 pcs) — keep countable produce in pcs",
  "Adjust for premium/organic labels and metro-city pricing. If the price is",
  "missing or the item is genuinely countable (eggs, bread, packaged goods),",
  "keep the natural unit (pcs/pack) and set weight_inferred=false.",
].join("\n");

/**
 * Extract a structured order from the plaintext/HTML body of an order email.
 */
export async function extractOrderFromEmail(
  emailBody: string
): Promise<ParsedOrder> {
  const model = getClient().getGenerativeModel({
    model: MODEL_ID,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: ORDER_SCHEMA,
      temperature: 0.1,
    },
  });

  const prompt = [
    WEIGHT_INFERENCE_RULES,
    "",
    "First decide order_type: 'grocery' (raw supermarket items from Instamart/",
    "Blinkit/Zepto), 'prepared_food' (cooked restaurant meals, e.g. Swiggy Food/",
    "Zomato), or 'other'. Then extract every product from the order email below.",
    "Ignore delivery fees, taxes, discounts, tips, and non-grocery lines.",
    `For each item, classify it into exactly one of these categories: ${KNOWN_CATEGORIES.join(", ")}.`,
    "",
    "EMAIL BODY:",
    emailBody.slice(0, 30_000), // guard against oversized emails
  ].join("\n");

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  return JSON.parse(text) as ParsedOrder;
}

/**
 * Extract a structured order from an uploaded invoice/receipt file
 * (image or PDF). Uses Gemini's multimodal input — the file bytes are sent
 * inline as base64. Same schema as email extraction so downstream code is
 * identical.
 */
export async function extractOrderFromInvoice(
  base64Data: string,
  mimeType: string
): Promise<ParsedOrder> {
  const model = getClient().getGenerativeModel({
    model: MODEL_ID,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: ORDER_SCHEMA,
      temperature: 0.1,
    },
  });

  const prompt = [
    WEIGHT_INFERENCE_RULES,
    "",
    "Read the attached invoice (an image or PDF) and extract every purchased",
    "product. Ignore delivery fees, taxes, discounts, tips, and totals.",
    "Set order_type: 'grocery' for supermarket/grocery invoices, 'prepared_food'",
    "for restaurant bills, or 'other'.",
    `Classify each item into exactly one of these categories: ${KNOWN_CATEGORIES.join(", ")}.`,
    "Use the per-line net price to infer weights as instructed above.",
    "If no order date is visible, leave order_date empty.",
  ].join("\n");

  const result = await model.generateContent([
    { text: prompt },
    { inlineData: { data: base64Data, mimeType } },
  ]);
  const text = result.response.text();
  return JSON.parse(text) as ParsedOrder;
}

// ---------------------------------------------------------------------------
// 2. Pantry inventory -> recipe suggestions
// ---------------------------------------------------------------------------

export interface RecipeSuggestion {
  title: string;
  prep_time_minutes: number;
  description: string;
  matching_items: string[]; // pantry items used
  missing_essentials: string[]; // things the user likely needs to buy
  steps: string[];
}

export interface RecipeResponse {
  recipes: RecipeSuggestion[];
}

const RECIPE_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    recipes: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          title: { type: SchemaType.STRING },
          prep_time_minutes: { type: SchemaType.NUMBER },
          description: {
            type: SchemaType.STRING,
            description: "One-sentence summary of the dish.",
          },
          matching_items: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
            description: "Names of provided pantry items used by this recipe.",
          },
          missing_essentials: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
            description: "Common ingredients needed but not in the pantry list.",
          },
          steps: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
            description: "Ordered cooking steps.",
          },
        },
        required: [
          "title",
          "prep_time_minutes",
          "description",
          "matching_items",
          "missing_essentials",
          "steps",
        ],
      },
    },
  },
  required: ["recipes"],
};

export interface InventoryLine {
  name: string;
  quantity: number;
  unit: string;
  category: string;
  expiresInDays: number;
}

/**
 * Ask Gemini for 3 distinct recipes that prioritize soon-to-expire ingredients.
 */
export async function generateRecipes(
  inventory: InventoryLine[]
): Promise<RecipeResponse> {
  const model = getClient().getGenerativeModel({
    model: MODEL_ID,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RECIPE_SCHEMA,
      temperature: 0.7,
    },
  });

  const inventoryText = inventory
    .map(
      (i) =>
        `- ${i.name} (${i.quantity} ${i.unit}, ${i.category}, expires in ${i.expiresInDays} day(s))`
    )
    .join("\n");

  const prompt = [
    "You are a home-cooking assistant. Suggest exactly 3 distinct recipes",
    "that make the best use of the pantry below. Strongly prioritize using",
    "ingredients that expire soonest to reduce food waste.",
    "Each recipe should mainly rely on the provided items, listing only truly",
    "common extra essentials (salt, oil, spices) under missing_essentials.",
    "",
    "PANTRY INVENTORY (sorted by soonest expiry):",
    inventoryText,
  ].join("\n");

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  return JSON.parse(text) as RecipeResponse;
}
