"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Home,
  Check,
  Copy,
  Crown,
  UserMinus,
  Plus,
  Users,
  RefreshCw,
} from "lucide-react";

interface HouseSummary {
  id: string;
  name: string;
  role: "OWNER" | "MEMBER";
  joinCode: string;
  memberCount: number;
  itemCount: number;
}

interface Member {
  userId: string;
  role: "OWNER" | "MEMBER";
  name: string | null;
  email: string;
  image: string | null;
}

export default function HousePage() {
  const router = useRouter();
  const { data: session, update } = useSession();
  const activeHouseId = session?.user?.activeHouseId ?? null;

  const [houses, setHouses] = useState<HouseSummary[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const active = houses.find((h) => h.id === activeHouseId) ?? null;

  const loadHouses = useCallback(async () => {
    const res = await fetch("/api/house", { cache: "no-store" });
    const data = await res.json();
    setHouses(data.houses ?? []);
    setLoading(false);
  }, []);

  const loadMembers = useCallback(async () => {
    if (!activeHouseId) return;
    const res = await fetch(`/api/house/${activeHouseId}/members`, {
      cache: "no-store",
    });
    if (res.ok) setMembers((await res.json()).members ?? []);
  }, [activeHouseId]);

  useEffect(() => {
    loadHouses();
  }, [loadHouses]);
  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  async function switchHouse(houseId: string) {
    if (houseId === activeHouseId) return;
    setBusy(true);
    await fetch("/api/house/active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ houseId }),
    });
    await update({ activeHouseId: houseId });
    await loadHouses();
    router.refresh();
    setBusy(false);
  }

  async function copyCode(code: string) {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function removeMember(userId: string) {
    if (!active) return;
    if (!confirm("Remove this member from the house?")) return;
    const res = await fetch(`/api/house/${active.id}/members`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (!res.ok) {
      alert((await res.json()).error ?? "Failed to remove member");
      return;
    }
    loadMembers();
    loadHouses();
  }

  if (loading) return <p className="text-neutral-500">Loading…</p>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Households</h1>
        <p className="text-sm text-neutral-500">
          Switch between houses, invite members, and manage who has access.
        </p>
      </div>

      {/* House switcher */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
          Your houses
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {houses.map((h) => (
            <li
              key={h.id}
              className={`rounded-xl border p-4 ${
                h.id === activeHouseId
                  ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30"
                  : "border-neutral-200 dark:border-neutral-800"
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="flex items-center gap-1.5 font-medium">
                    <Home className="h-4 w-4 text-emerald-600" />
                    {h.name}
                    {h.role === "OWNER" && (
                      <Crown className="h-3.5 w-3.5 text-amber-500" />
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {h.memberCount} member{h.memberCount === 1 ? "" : "s"} ·{" "}
                    {h.itemCount} item{h.itemCount === 1 ? "" : "s"}
                  </p>
                </div>
                {h.id === activeHouseId ? (
                  <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200">
                    <Check className="h-3 w-3" /> Active
                  </span>
                ) : (
                  <button
                    onClick={() => switchHouse(h.id)}
                    disabled={busy}
                    className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-medium hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
                  >
                    Switch
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Active house: invite + members */}
      {active && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
            {active.name} — members & invite
          </h2>

          <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
            <p className="mb-2 text-sm font-medium">Invite code</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-md bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-800">
                {active.joinCode}
              </code>
              <button
                onClick={() => copyCode(active.joinCode)}
                className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              Share this code — anyone signed in can join with it from onboarding.
            </p>
          </div>

          <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {members.map((m) => (
              <li key={m.userId} className="flex items-center justify-between gap-3 p-3">
                <div className="flex min-w-0 items-center gap-3">
                  {m.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.image}
                      alt={m.name ?? m.email}
                      width={32}
                      height={32}
                      className="rounded-full"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-200 text-xs dark:bg-neutral-700">
                      {(m.name ?? m.email)[0]?.toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {m.name ?? m.email}
                      {m.userId === session?.user?.id && (
                        <span className="text-neutral-400"> (you)</span>
                      )}
                    </p>
                    <p className="truncate text-xs text-neutral-500">{m.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-xs text-neutral-500">
                    {m.role === "OWNER" && <Crown className="h-3.5 w-3.5 text-amber-500" />}
                    {m.role}
                  </span>
                  {active.role === "OWNER" && m.userId !== session?.user?.id && (
                    <button
                      onClick={() => removeMember(m.userId)}
                      title="Remove member"
                      className="rounded-md p-1.5 text-neutral-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                    >
                      <UserMinus className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Add another house */}
      <AddHouse
        onDone={async (houseId) => {
          await update({ activeHouseId: houseId });
          await loadHouses();
          router.refresh();
        }}
      />
    </div>
  );
}

/** Inline create/join for adding another household without leaving the page. */
function AddHouse({ onDone }: { onDone: (houseId: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(kind: "create" | "join") {
    setBusy(true);
    setError(null);
    try {
      const res =
        kind === "create"
          ? await fetch("/api/house", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name }),
            })
          : await fetch("/api/house/join", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ code }),
            });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setName("");
      setCode("");
      await onDone(data.house.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
        Add another household
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New house name"
            className="w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-neutral-700"
          />
          <button
            onClick={() => run("create")}
            disabled={busy || !name.trim()}
            className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Create
          </button>
        </div>
        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Invite code"
            className="w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-neutral-700"
          />
          <button
            onClick={() => run("join")}
            disabled={busy || !code.trim()}
            className="flex items-center gap-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            <Users className="h-4 w-4" /> Join
          </button>
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  );
}
