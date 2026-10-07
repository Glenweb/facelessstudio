"use client";

import { clsx } from "clsx";
import {
  CreditCard,
  Film,
  LayoutGrid,
  LogOut,
  Plus,
  Settings,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, formatCredits } from "@/lib/client/api";
import { Badge, Button } from "./ui";

interface Me {
  id: string;
  name: string;
  email: string;
  plan: string;
  creditsBalance: number;
}

const NAV = [
  { href: "/dashboard", label: "Projects", icon: LayoutGrid },
  { href: "/library", label: "Library", icon: Film },
  { href: "/billing", label: "Credits", icon: CreditCard },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { user } = await api.get<{ user: Me | null }>("/api/auth/me");
        if (cancelled) return;
        setMe(user);
        if (!user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      } finally {
        if (!cancelled) setChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Re-reads the balance whenever the route changes, which is the cheapest
    // way to keep the credit counter honest after a generate or a render.
  }, [pathname, router]);

  const signOut = async (): Promise<void> => {
    await api.post("/api/auth/logout");
    router.push("/");
  };

  if (!checked) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-ink-400">
        Loading your studio…
      </div>
    );
  }
  if (!me) return null;

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-ink-800 bg-ink-900 p-4 lg:flex">
        <Link href="/dashboard" className="mb-6 flex items-center gap-2 px-2">
          <span className="grid size-8 place-items-center rounded-lg bg-brand-500">
            <Sparkles className="size-4 text-white" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">Faceless Studio</span>
        </Link>

        <Link href="/projects/new" className="mb-5">
          <Button className="w-full" size="md">
            <Plus className="size-4" />
            New project
          </Button>
        </Link>

        <nav className="flex flex-1 flex-col gap-0.5">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-ink-800 font-medium text-ink-100"
                    : "text-ink-400 hover:bg-ink-850 hover:text-ink-200",
                )}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="panel-raised mt-4 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wide text-ink-400">Credits</span>
            <Badge tone={me.creditsBalance > 100 ? "brand" : "warn"}>{me.plan}</Badge>
          </div>
          <p className="text-xl font-semibold tabular-nums">{formatCredits(me.creditsBalance)}</p>
          <Link href="/billing" className="mt-2 block text-[12px] text-brand-300 hover:text-brand-400">
            Top up →
          </Link>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2 border-t border-ink-800 pt-3">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium">{me.name}</p>
            <p className="truncate text-[11px] text-ink-500">{me.email}</p>
          </div>
          <button
            onClick={signOut}
            aria-label="Sign out"
            className="rounded-md p-1.5 text-ink-400 transition-colors hover:bg-ink-800 hover:text-ink-200"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </aside>

      {/* Mobile top bar — the sidebar collapses rather than becoming a drawer,
          because every page here is usable without persistent navigation. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-ink-800 bg-ink-900/90 px-4 py-2.5 backdrop-blur lg:hidden">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-md bg-brand-500">
              <Sparkles className="size-3.5 text-white" />
            </span>
            <span className="text-sm font-semibold">Faceless Studio</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/billing" className="text-[13px] tabular-nums text-ink-300">
              {formatCredits(me.creditsBalance)} cr
            </Link>
            <Link href="/projects/new">
              <Button size="sm">
                <Plus className="size-3.5" />
                New
              </Button>
            </Link>
          </div>
        </header>

        <nav className="flex gap-1 overflow-x-auto border-b border-ink-800 bg-ink-900 px-3 py-1.5 scrollbar-none lg:hidden">
          {NAV.map(({ href, label }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={clsx(
                  "shrink-0 rounded-md px-3 py-1.5 text-[13px]",
                  active ? "bg-ink-800 font-medium text-ink-100" : "text-ink-400",
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
