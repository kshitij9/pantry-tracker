"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Check, Trash2, RefreshCw, Upload } from "lucide-react";
import { ExpiryBadge } from "@/components/ExpiryBadge";
import { AddItemModal } from "@/components/AddItemModal";
import { UploadInvoiceModal } from "@/components/UploadInvoiceModal";
import { NotificationsToggle } from "@/components/NotificationsToggle";
import { QuickLog } from "@/components/meals/QuickLog";
import { groupForCategory } from "@/lib/categories";

interface PantryItem {
  id: string;
  rawName: string;
  normalizedCategory: string;
  quantity: number;
  unit: string;
  expiresAt: string;
  source: string;
  isConsumed: boolean;
  purchasedBy: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  } | null;
}

const TABS = ["All", "Produce", "Dairy", "Staples", "Snacks"] as const;

export default function DashboardPage() {
  const [items, setItems] = useState<PantryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<(typeof TABS)[number]>("All");
  const [modalOpen, setModalOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/pantry", { cache: "no-store" });
      const data = await res.json();
      setItems(data.items ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (tab === "All") return items;
    return items.filter((i) => groupForCategory(i.normalizedCategory) === tab);
  }, [items, tab]);

  async function markConsumed(id: string) {
    await fetch(`/api/pantry/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isConsumed: true }),
    });
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  async function removeItem(id: string) {
    await fetch(`/api/pantry/${id}`, { method: "DELETE" });
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Your Pantry</h1>
          <p className="text-sm text-neutral-500">
            {items.length} active item{items.length === 1 ? "" : "s"}, sorted by expiry.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <NotificationsToggle />
          <button
            onClick={load}
            className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-100 dark:border-neutral-800 dark:hover:bg-neutral-800"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          <button
            onClick={() => setUploadOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-100 dark:border-neutral-800 dark:hover:bg-neutral-800"
          >
            <Upload className="h-4 w-4" /> Upload invoice
          </button>
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" /> Add item
          </button>
        </div>
      </div>

      <QuickLog onLogged={load} />

      {/* Category filter tabs */}
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
              tab === t
                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-neutral-500">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 p-10 text-center text-neutral-500 dark:border-neutral-700">
          Nothing here yet. Add an item or wait for your next order to sync.
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {filtered.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{item.rawName}</p>
                <p className="text-xs text-neutral-500">
                  {item.quantity} {item.unit} · {item.normalizedCategory} · {item.source}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <ExpiryBadge expiresAt={item.expiresAt} />
                  {item.purchasedBy && (
                    <span
                      className="flex items-center gap-1 text-xs text-neutral-400"
                      title={`Added by ${item.purchasedBy.name ?? item.purchasedBy.email}`}
                    >
                      {item.purchasedBy.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.purchasedBy.image}
                          alt=""
                          width={16}
                          height={16}
                          className="rounded-full"
                          referrerPolicy="no-referrer"
                        />
                      ) : null}
                      {(item.purchasedBy.name ?? item.purchasedBy.email).split(" ")[0]}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 flex-col gap-1.5">
                <button
                  onClick={() => markConsumed(item.id)}
                  title="Mark consumed"
                  className="rounded-md border border-neutral-200 p-1.5 hover:bg-emerald-50 hover:text-emerald-600 dark:border-neutral-700"
                >
                  <Check className="h-4 w-4" />
                </button>
                <button
                  onClick={() => removeItem(item.id)}
                  title="Delete"
                  className="rounded-md border border-neutral-200 p-1.5 hover:bg-red-50 hover:text-red-600 dark:border-neutral-700"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AddItemModal open={modalOpen} onClose={() => setModalOpen(false)} onAdded={load} />
      <UploadInvoiceModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onAdded={load}
      />
    </div>
  );
}
