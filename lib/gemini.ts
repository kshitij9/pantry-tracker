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

const MODEL_ID = "gemini-2.5-flash";

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
}

export interface ParsedOrder {
  vendor: string;
  order_date: string; // ISO-8601 date string, best-effort
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
            description: "Numeric quantity ordered. Default 1 if unclear.",
          },
          unit: {
            type: SchemaType.STRING,
            description: "Unit of the quantity, e.g. pcs, g, kg, ml, l, pack.",
          },
          category: {
            type: SchemaType.STRING,
            description: `Best-fit category. Must be one of: ${KNOWN_CATEGORIES.join(", ")}.`,
          },
        },
        required: ["name", "quantity", "unit", "category"],
      },
    },
  },
  required: ["vendor", "order_date", "items"],
};

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
    "You are a receipt-parsing engine for an Indian quick-commerce grocery app.",
    "Extract every grocery product from the order email below.",
    "Ignore delivery fees, taxes, discounts, tips, and non-grocery lines.",
    `For each item, classify it into exactly one of these categories: ${KNOWN_CATEGORIES.join(", ")}.`,
    "If a value is ambiguous, make a sensible default (quantity 1, unit 'pcs').",
    "",
    "EMAIL BODY:",
    emailBody.slice(0, 30_000), // guard against oversized emails
  ].join("\n");

  const result = await model.generateContent(prompt);
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
