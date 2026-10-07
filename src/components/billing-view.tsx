"use client";

import { useEffect, useState } from "react";
import { api, ApiClientError, formatCredits, relativeTime } from "@/lib/client/api";
import type { CreditPack } from "@/lib/studio/pricing";
import { Alert, Badge, Button, Spinner } from "./ui";
import { Page, PageHeader } from "./page-header";

interface LedgerRow {
  id: string;
  delta: number;
  balanceAfter: number;
  operation: string;
  note: string;
  createdAt: string;
}

interface Payload {
  balance: number;
  plan: string;
  packs: CreditPack[];
  billingMode: "live" | "local";
  ledger: LedgerRow[];
}

export function BillingView() {
  const [data, setData] = useState<Payload | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async (): Promise<void> => {
    setData(await api.get<Payload>("/api/billing/credits"));
  };

  useEffect(() => {
    void load();
  }, []);

  const buy = async (packId: string): Promise<void> => {
    setBusy(packId);
    setError(null);
    setNotice(null);
    try {
      const result = await api.post<{ mode: string; url: string | null; creditsGranted: number }>(
        "/api/billing/checkout",
        { packId },
      );
      if (result.url) {
        window.location.href = result.url;
        return;
      }
      setNotice(
        `${formatCredits(result.creditsGranted)} credits added in sandbox mode — no payment was taken. Set STRIPE_SECRET_KEY to take real payments.`,
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not start checkout.");
    } finally {
      setBusy(null);
    }
  };

  if (!data) {
    return (
      <Page>
        <div className="flex items-center gap-2 py-16 text-sm text-ink-400">
          <Spinner className="size-4" />
          Loading…
        </div>
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        title="Credits"
        description="Credits are metered per operation. Anything that fails is refunded automatically."
      />

      <div className="panel mb-6 flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-ink-500">Balance</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{formatCredits(data.balance)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="brand">{data.plan}</Badge>
          <Badge tone={data.billingMode === "live" ? "good" : "warn"}>
            {data.billingMode === "live" ? "Stripe live" : "Sandbox billing"}
          </Badge>
        </div>
      </div>

      {notice && (
        <div className="mb-5">
          <Alert tone="good">{notice}</Alert>
        </div>
      )}
      {error && (
        <div className="mb-5">
          <Alert tone="bad">{error}</Alert>
        </div>
      )}

      <div className="mb-8 grid gap-4 lg:grid-cols-3">
        {data.packs.map((pack) => (
          <div
            key={pack.id}
            className={pack.highlight ? "panel-raised relative p-5 ring-1 ring-brand-500/40" : "panel p-5"}
          >
            {pack.highlight && (
              <span className="absolute -top-2.5 left-5 rounded-full bg-brand-500 px-2.5 py-0.5 text-[11px] font-medium text-white">
                Most popular
              </span>
            )}
            <h2 className="text-sm font-semibold">{pack.name}</h2>
            <p className="mt-0.5 text-[12px] text-ink-400">{pack.blurb}</p>
            <p className="mt-4 text-3xl font-semibold tabular-nums">£{pack.priceGbp}</p>
            <p className="mt-1 text-[12px] text-ink-400">
              {pack.credits.toLocaleString()} credits · ~{pack.approxMinutes} min
            </p>
            <Button
              className="mt-4 w-full"
              variant={pack.highlight ? "primary" : "secondary"}
              onClick={() => void buy(pack.id)}
              loading={busy === pack.id}
            >
              {data.billingMode === "live" ? "Buy credits" : "Add in sandbox"}
            </Button>
          </div>
        ))}
      </div>

      <h2 className="mb-3 text-sm font-semibold">Usage history</h2>
      <div className="panel overflow-hidden">
        {data.ledger.length === 0 ? (
          <p className="p-5 text-[13px] text-ink-400">Nothing yet.</p>
        ) : (
          <table className="w-full text-[13px]">
            <thead className="border-b border-ink-800 text-left text-[11px] uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">When</th>
                <th className="px-4 py-2.5 font-medium">Operation</th>
                <th className="px-4 py-2.5 text-right font-medium">Change</th>
                <th className="hidden px-4 py-2.5 text-right font-medium sm:table-cell">Balance</th>
              </tr>
            </thead>
            <tbody>
              {data.ledger.map((row) => (
                <tr key={row.id} className="border-b border-ink-850 last:border-0">
                  <td className="whitespace-nowrap px-4 py-2.5 text-ink-500">
                    {relativeTime(row.createdAt)}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-ink-200">{row.note || row.operation}</span>
                    <span className="ml-2 font-mono text-[11px] text-ink-600">{row.operation}</span>
                  </td>
                  <td
                    className={
                      row.delta >= 0
                        ? "px-4 py-2.5 text-right tabular-nums text-good-400"
                        : "px-4 py-2.5 text-right tabular-nums text-ink-300"
                    }
                  >
                    {row.delta >= 0 ? "+" : ""}
                    {formatCredits(row.delta)}
                  </td>
                  <td className="hidden px-4 py-2.5 text-right tabular-nums text-ink-500 sm:table-cell">
                    {formatCredits(row.balanceAfter)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Page>
  );
}
