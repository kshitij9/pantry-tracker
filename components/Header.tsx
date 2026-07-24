"use client";

import Link from "next/link";
import { useSession, signIn, signOut } from "next-auth/react";
import {
  LayoutGrid,
  ChefHat,
  Refrigerator,
  Home,
  LogOut,
  LogIn,
} from "lucide-react";

/** Top navigation bar. Adapts to the auth state. */
export function Header() {
  const { data: session, status } = useSession();
  const user = session?.user;

  return (
    <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/80 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/80">
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <Refrigerator className="h-5 w-5 text-emerald-600" />
          <span>Pantry Tracker</span>
        </Link>

        <div className="flex items-center gap-1 text-sm">
          {user ? (
            <>
              <NavLink href="/dashboard" icon={<LayoutGrid className="h-4 w-4" />}>
                Dashboard
              </NavLink>
              <NavLink href="/recipes" icon={<ChefHat className="h-4 w-4" />}>
                Recipes
              </NavLink>
              <NavLink href="/house" icon={<Home className="h-4 w-4" />}>
                House
              </NavLink>
              <div className="mx-2 h-5 w-px bg-neutral-200 dark:bg-neutral-800" />
              {user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.image}
                  alt={user.name ?? "You"}
                  width={28}
                  height={28}
                  className="rounded-full"
                  referrerPolicy="no-referrer"
                />
              ) : null}
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                title="Sign out"
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </>
          ) : status === "loading" ? (
            <span className="px-3 py-1.5 text-neutral-400">…</span>
          ) : (
            <button
              onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
              className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 font-medium text-white hover:bg-emerald-700"
            >
              <LogIn className="h-4 w-4" /> Sign in
            </button>
          )}
        </div>
      </nav>
    </header>
  );
}

function NavLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-1.5 rounded-md px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
    >
      {icon} {children}
    </Link>
  );
}
