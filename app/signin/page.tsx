"use client";

import { Suspense } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Refrigerator, LogIn } from "lucide-react";

function SignInInner() {
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") ?? "/dashboard";

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-6 py-16 text-center">
      <div className="flex flex-col items-center gap-3">
        <Refrigerator className="h-10 w-10 text-emerald-600" />
        <h1 className="text-2xl font-bold tracking-tight">Welcome to Pantry Tracker</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Sign in to manage your household pantry, track expiries, and get AI
          recipe ideas.
        </p>
      </div>

      <button
        onClick={() => signIn("google", { callbackUrl })}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 font-medium text-neutral-800 shadow-sm transition hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
      >
        <LogIn className="h-4 w-4" />
        Continue with Google
      </button>

      <p className="text-xs text-neutral-400">
        Email sign-in is coming soon.
      </p>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInInner />
    </Suspense>
  );
}
