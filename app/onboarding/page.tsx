"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Home, Users, Plus } from "lucide-react";

type Tab = "create" | "join";

export default function OnboardingPage() {
  const router = useRouter();
  const { update } = useSession();
  const [tab, setTab] = useState<Tab>("create");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res =
        tab === "create"
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
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");

      // Refresh the JWT so middleware sees the new active house, then continue.
      await update({ activeHouseId: data.house.id });
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md py-12">
      <div className="mb-6 text-center">
        <Home className="mx-auto mb-2 h-8 w-8 text-emerald-600" />
        <h1 className="text-2xl font-bold tracking-tight">Set up your household</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Create a new pantry or join an existing one with an invite code.
        </p>
      </div>

      <div className="mb-4 flex gap-1.5">
        <TabButton active={tab === "create"} onClick={() => setTab("create")}>
          <Plus className="h-4 w-4" /> Create
        </TabButton>
        <TabButton active={tab === "join"} onClick={() => setTab("join")}>
          <Users className="h-4 w-4" /> Join
        </TabButton>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
        {tab === "create" ? (
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Household name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. The Sharma Kitchen"
              className="w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-neutral-700"
            />
          </label>
        ) : (
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Invite code</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Paste the code from your housemate"
              className="w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-neutral-700"
            />
          </label>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <button
          onClick={submit}
          disabled={busy || (tab === "create" ? !name.trim() : !code.trim())}
          className="mt-4 w-full rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy ? "Working…" : tab === "create" ? "Create household" : "Join household"}
        </button>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
        active
          ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
          : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300"
      }`}
    >
      {children}
    </button>
  );
}
