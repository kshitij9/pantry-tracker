import type { Metadata } from "next";
import Link from "next/link";
import { LayoutGrid, ChefHat, Refrigerator } from "lucide-react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pantry Tracker",
  description: "Auto-synced pantry & expiry tracking with AI recipe suggestions.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header className="border-b border-neutral-200 bg-white/80 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/80 sticky top-0 z-10">
          <nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <Refrigerator className="h-5 w-5 text-emerald-600" />
              <span>Pantry Tracker</span>
            </Link>
            <div className="flex items-center gap-1 text-sm">
              <Link
                href="/dashboard"
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <LayoutGrid className="h-4 w-4" /> Dashboard
              </Link>
              <Link
                href="/recipes"
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <ChefHat className="h-4 w-4" /> Recipes
              </Link>
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
