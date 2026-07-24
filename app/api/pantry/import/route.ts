import { NextRequest, NextResponse } from "next/server";
import { resolveHouseContext } from "@/lib/auth-helpers";
import { extractOrderFromInvoice } from "@/lib/gemini";
import { computeExpiresAt } from "@/lib/categories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Multimodal Gemini calls on an image/PDF can be slow — give it room.
export const maxDuration = 60;

const ACCEPTED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);
// Keep under Vercel's ~4.5MB request body limit (with base64 overhead headroom).
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * POST /api/pantry/import  (multipart/form-data, field: "file")
 *
 * Parses an uploaded invoice/receipt via Gemini and returns the extracted
 * items as a PREVIEW. It does NOT save anything — the client reviews/edits the
 * items and then commits them via POST /api/pantry/bulk.
 */
export async function POST(req: NextRequest) {
  const resolved = await resolveHouseContext();
  if (!resolved.ok) return resolved.response;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }
  if (!ACCEPTED.has(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type: ${file.type || "unknown"}. Upload a JPG, PNG, WEBP, or PDF.` },
      { status: 415 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "File is too large (max 4MB). Try a smaller image or PDF." },
      { status: 413 }
    );
  }

  try {
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const parsed = await extractOrderFromInvoice(base64, file.type);

    const purchasedAt = parseDate(parsed.order_date) ?? new Date();

    // Build editable preview rows with a computed expiry for each item.
    const items = parsed.items.map((item) => {
      const quantity = item.quantity || 1;
      const unit = item.unit || "pcs";
      const category = item.category;
      return {
        rawName: item.name,
        normalizedCategory: category,
        quantity,
        unit,
        purchasedAt: purchasedAt.toISOString(),
        expiresAt: computeExpiresAt(category, purchasedAt).toISOString(),
      };
    });

    return NextResponse.json({
      vendor: parsed.vendor,
      orderType: parsed.order_type,
      purchasedAt: purchasedAt.toISOString(),
      items,
    });
  } catch (err) {
    console.error("[pantry/import] error:", err);
    return NextResponse.json(
      { error: "Could not read that invoice. Try a clearer photo or a PDF." },
      { status: 500 }
    );
  }
}

/** Best-effort date parse; returns null on failure. */
function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}
