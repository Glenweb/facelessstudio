"use client";

import { CheckCircle2, Circle, Youtube } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import type { CapabilityReport } from "@/lib/env";
import { Alert, Badge, Button, Spinner } from "./ui";
import { Page, PageHeader } from "./page-header";

interface Health {
  localStudioMode: boolean;
  capabilities: CapabilityReport[];
}

interface YtStatus {
  mode: "live" | "local";
  connected: boolean;
  channel: { channelId: string | null; channelTitle: string | null } | null;
}

/** What a key unlocks, so the report is actionable rather than diagnostic. */
const UPGRADE_HINT: Record<string, string> = {
  database: "DATABASE_URL — a Neon Postgres connection string",
  llm: "ANTHROPIC_API_KEY — Claude writes researched scripts and art direction",
  image: "GOOGLE_AI_STUDIO_API_KEY — Gemini generates photoreal scene frames",
  tts: "ELEVENLABS_API_KEY — broadcast voices with measured word timings",
  render: "RENDER_NODE_URL — offload encoding to the Railway FFmpeg node",
  storage: "R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY — Cloudflare R2",
  youtube: "YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET — publish for real",
  billing: "STRIPE_SECRET_KEY — take real payments for credit packs",
};

export function SettingsView() {
  const params = useSearchParams();
  const [health, setHealth] = useState<Health | null>(null);
  const [yt, setYt] = useState<YtStatus | null>(null);

  useEffect(() => {
    void Promise.all([
      api.get<Health>("/api/health").then(setHealth),
      api.get<YtStatus>("/api/youtube/status").then(setYt),
    ]);
  }, []);

  const ytParam = params.get("youtube");

  return (
    <Page>
      <PageHeader
        title="Settings"
        description="Which services this studio is wired to, and what each key would unlock."
      />

      {ytParam === "connected" && (
        <div className="mb-5">
          <Alert tone="good">YouTube channel connected.</Alert>
        </div>
      )}
      {ytParam && ytParam !== "connected" && (
        <div className="mb-5">
          <Alert tone="bad">YouTube connection failed: {ytParam}</Alert>
        </div>
      )}

      <section className="panel mb-6 p-5">
        <div className="mb-4 flex items-center gap-2.5">
          <Youtube className="size-5 text-bad-400" />
          <h2 className="text-sm font-semibold">YouTube publishing</h2>
        </div>

        {yt === null ? (
          <Spinner className="size-4 text-ink-400" />
        ) : yt.mode === "local" ? (
          <Alert tone="info" title="Dry-run mode">
            No OAuth client is configured, so publishing builds and stores the exact request body
            — including the synthetic-content disclosure — without uploading. Set
            YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET to connect a real channel.
          </Alert>
        ) : yt.connected ? (
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[13px] font-medium">{yt.channel?.channelTitle ?? "Connected"}</p>
              <p className="text-[12px] text-ink-500">{yt.channel?.channelId}</p>
            </div>
            <Badge tone="good">Connected</Badge>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-[13px] text-ink-400">No channel connected yet.</p>
            <a href="/api/youtube/connect">
              <Button size="sm">Connect a channel</Button>
            </a>
          </div>
        )}

        <p className="mt-4 border-t border-ink-800 pt-4 text-[12px] leading-relaxed text-ink-500">
          Every upload sets <code className="text-ink-300">status.containsSyntheticMedia</code> to
          true. YouTube requires creators to disclose realistic AI-generated or altered media, and
          this is not a toggle — getting it wrong puts the channel at risk, so the product makes
          the call.
        </p>
      </section>

      <section className="panel p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Service wiring</h2>
          {health?.localStudioMode && <Badge tone="warn">Local Studio mode</Badge>}
        </div>

        {health === null ? (
          <Spinner className="size-4 text-ink-400" />
        ) : (
          <ul className="divide-y divide-ink-850">
            {health.capabilities.map((cap) => (
              <li key={cap.capability} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                {cap.mode === "live" ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-good-400" />
                ) : (
                  <Circle className="mt-0.5 size-4 shrink-0 text-ink-600" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <p className="text-[13px] font-medium capitalize">{cap.capability}</p>
                    <span className="text-[12px] text-ink-400">{cap.vendor}</span>
                  </div>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-ink-500">{cap.detail}</p>
                  {cap.mode === "local" && UPGRADE_HINT[cap.capability] && (
                    <p className="mt-1 font-mono text-[11px] text-ink-600">
                      {UPGRADE_HINT[cap.capability]}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-4 border-t border-ink-800 pt-4 text-[12px] leading-relaxed text-ink-500">
          Each capability resolves independently. Adding one key upgrades that provider and leaves
          everything else alone, so you can go live one piece at a time.
        </p>
      </section>
    </Page>
  );
}
