import Link from "next/link";
import { LayoutGrid, ChefHat, Mail } from "lucide-react";

export default function Home() {
  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">
          Never let groceries expire again.
        </h1>
        <p className="max-w-2xl text-neutral-600 dark:text-neutral-400">
          Pantry Tracker auto-syncs your Instamart, Blinkit, and Zepto orders
          straight from Gmail, tracks expiry dates, and turns soon-to-spoil
          ingredients into recipes.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <FeatureCard
          href="/dashboard"
          icon={<LayoutGrid className="h-6 w-6 text-emerald-600" />}
          title="Dashboard"
          body="See everything in your pantry, color-coded by expiry urgency."
        />
        <FeatureCard
          href="/recipes"
          icon={<ChefHat className="h-6 w-6 text-emerald-600" />}
          title="Recipes"
          body="Get 3 AI recipe ideas that prioritize expiring ingredients."
        />
        <FeatureCard
          href="/dashboard"
          icon={<Mail className="h-6 w-6 text-emerald-600" />}
          title="Auto-sync"
          body="Order emails are parsed automatically via Gmail webhooks."
        />
      </section>
    </div>
  );
}

function FeatureCard({
  href,
  icon,
  title,
  body,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-neutral-200 bg-white p-5 transition hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900"
    >
      <div className="mb-3">{icon}</div>
      <h3 className="mb-1 font-semibold">{title}</h3>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">{body}</p>
    </Link>
  );
}
