"use client";

import { useRef, useState } from "react";
import { X, Upload, FileText, Loader2, Trash2 } from "lucide-react";
import { KNOWN_CATEGORIES } from "@/lib/categories";

interface ReviewItem {
  include: boolean;
  rawName: string;
  normalizedCategory: string;
  quantity: number;
  unit: string;
  purchasedAt: string;
  expiresAt: string;
}

type Stage = "select" | "review";

/** Upload an invoice/receipt, review AI-extracted items, then add them. */
export function UploadInvoiceModal({
  open,
  onClose,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("select");
  const [fileName, setFileName] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [vendor, setVendor] = useState<string | null>(null);

  if (!open) return null;

  function reset() {
    setStage("select");
    setFileName(null);
    setItems([]);
    setVendor(null);
    setError(null);
    setExtracting(false);
    setSaving(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleFile(file: File) {
    setFileName(file.name);
    setError(null);
    setExtracting(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/pantry/import", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to read invoice");

      if (!data.items?.length) {
        throw new Error("No items found in that invoice. Try a clearer image.");
      }
      setVendor(data.vendor ?? null);
      setItems(
        data.items.map((i: Omit<ReviewItem, "include">) => ({ ...i, include: true }))
      );
      setStage("review");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setExtracting(false);
    }
  }

  function updateItem(index: number, patch: Partial<ReviewItem>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  async function saveSelected() {
    const selected = items.filter((i) => i.include);
    if (selected.length === 0) {
      setError("Select at least one item to add.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/pantry/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: selected, source: "invoice" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add items");
      onAdded();
      handleClose();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  const selectedCount = items.filter((i) => i.include).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center justify-between border-b border-neutral-200 p-5 dark:border-neutral-800">
          <h2 className="text-lg font-semibold">
            {stage === "select" ? "Upload an invoice" : "Review extracted items"}
          </h2>
          <button
            onClick={handleClose}
            className="rounded-md p-1 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {stage === "select" ? (
            <div className="space-y-4">
              <button
                onClick={() => fileRef.current?.click()}
                disabled={extracting}
                className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-neutral-300 p-10 text-center hover:border-emerald-500 hover:bg-emerald-50/40 disabled:opacity-60 dark:border-neutral-700 dark:hover:bg-emerald-950/20"
              >
                {extracting ? (
                  <>
                    <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
                    <span className="text-sm font-medium">Reading “{fileName}”…</span>
                    <span className="text-xs text-neutral-500">
                      Extracting items with AI — this can take a few seconds.
                    </span>
                  </>
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-emerald-600" />
                    <span className="text-sm font-medium">Choose an invoice image or PDF</span>
                    <span className="text-xs text-neutral-500">
                      JPG, PNG, WEBP, or PDF · up to 4MB
                    </span>
                  </>
                )}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="flex items-center gap-1.5 text-sm text-neutral-500">
                <FileText className="h-4 w-4" />
                {vendor ? `From ${vendor} · ` : ""}
                {items.length} item{items.length === 1 ? "" : "s"} found. Uncheck any you don’t want.
              </p>

              <ul className="space-y-2">
                {items.map((item, i) => (
                  <li
                    key={i}
                    className={`flex flex-wrap items-center gap-2 rounded-lg border p-2.5 ${
                      item.include
                        ? "border-neutral-200 dark:border-neutral-800"
                        : "border-neutral-200 opacity-50 dark:border-neutral-800"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={item.include}
                      onChange={(e) => updateItem(i, { include: e.target.checked })}
                      className="h-4 w-4 shrink-0 accent-emerald-600"
                    />
                    <input
                      value={item.rawName}
                      onChange={(e) => updateItem(i, { rawName: e.target.value })}
                      className="min-w-[8rem] flex-1 rounded-md border border-neutral-300 bg-transparent px-2 py-1 text-sm dark:border-neutral-700"
                    />
                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      value={item.quantity}
                      onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })}
                      className="w-16 rounded-md border border-neutral-300 bg-transparent px-2 py-1 text-sm dark:border-neutral-700"
                    />
                    <input
                      value={item.unit}
                      onChange={(e) => updateItem(i, { unit: e.target.value })}
                      className="w-16 rounded-md border border-neutral-300 bg-transparent px-2 py-1 text-sm dark:border-neutral-700"
                    />
                    <select
                      value={item.normalizedCategory}
                      onChange={(e) => updateItem(i, { normalizedCategory: e.target.value })}
                      className="rounded-md border border-neutral-300 bg-transparent px-2 py-1 text-sm dark:border-neutral-700"
                    >
                      {!KNOWN_CATEGORIES.includes(item.normalizedCategory) && (
                        <option value={item.normalizedCategory}>{item.normalizedCategory}</option>
                      )}
                      {KNOWN_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
                      title="Remove row"
                      className="rounded-md p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
          )}
        </div>

        {stage === "review" && (
          <div className="flex items-center justify-between gap-3 border-t border-neutral-200 p-4 dark:border-neutral-800">
            <button
              onClick={() => {
                reset();
              }}
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              Upload another
            </button>
            <button
              onClick={saveSelected}
              disabled={saving || selectedCount === 0}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? "Adding…" : `Add ${selectedCount} item${selectedCount === 1 ? "" : "s"}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
