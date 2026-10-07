"use client";

import { clsx } from "clsx";
import { Download, Film, Upload } from "lucide-react";
import { useState } from "react";
import { api, ApiClientError, formatBytes, formatDuration } from "@/lib/client/api";
import { CREDIT_COSTS } from "@/lib/studio/pricing";
import type { AspectRatio } from "@/lib/studio/types";
import type { RenderWithUrls } from "@/lib/client/types";
import { Alert, Badge, Button, Progress } from "./ui";
import type { TabProps } from "./project-workspace";

const COMPANION: Record<AspectRatio, AspectRatio> = {
  "16:9": "9:16",
  "9:16": "16:9",
  "1:1": "9:16",
};

const STATUS_TONE = {
  queued: "neutral",
  claimed: "warn",
  running: "warn",
  succeeded: "good",
  failed: "bad",
  cancelled: "neutral",
} as const;

export function RenderPanel({ data, reload, onError }: TabProps) {
  const { project, voiceover, scenes, renders } = data;
  const [busy, setBusy] = useState(false);
  const [ratios, setRatios] = useState<AspectRatio[]>(
    project.alsoRenderShorts
      ? [project.aspectRatio, COMPANION[project.aspectRatio]]
      : [project.aspectRatio],
  );

  const missingArt = scenes.filter((s) => s.imageStatus !== "ready");
  const blocked = !voiceover || missingArt.length > 0 || scenes.length === 0;
  const seconds = (voiceover?.durationMs ?? 0) / 1000;
  const cost = Math.ceil(seconds * CREDIT_COSTS.renderPerSecondPerVariant) * ratios.length;

  const toggleRatio = (r: AspectRatio): void =>
    setRatios((current) =>
      current.includes(r) ? current.filter((x) => x !== r) : [...current, r],
    );

  const start = async (): Promise<void> => {
    setBusy(true);
    onError(null);
    try {
      await api.post(`/api/projects/${project.id}/renders`, { ratios });
      await reload();
    } catch (err) {
      onError(err instanceof ApiClientError ? err.message : "Could not queue the render.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="panel p-5">
        <h2 className="text-sm font-semibold">Render</h2>

        {blocked ? (
          <div className="mt-3">
            <Alert tone="warn" title="Not ready to render yet">
              <ul className="list-inside list-disc space-y-0.5">
                {scenes.length === 0 && <li>Write the script to create the scene list.</li>}
                {missingArt.length > 0 && (
                  <li>
                    {missingArt.length} scene{missingArt.length === 1 ? "" : "s"} still need a
                    visual.
                  </li>
                )}
                {!voiceover && <li>Generate the voiceover — it sets the timeline.</li>}
              </ul>
            </Alert>
          </div>
        ) : (
          <>
            <p className="mt-1 text-[12px] text-ink-400">
              {scenes.length} scenes · {formatDuration(voiceover!.durationMs)} · captions{" "}
              {project.burnCaptions ? "burned in" : "off"}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {(["16:9", "9:16", "1:1"] as AspectRatio[]).map((r) => (
                <button
                  key={r}
                  onClick={() => toggleRatio(r)}
                  className={clsx(
                    "rounded-lg border px-3.5 py-2 text-[13px] transition-colors",
                    ratios.includes(r)
                      ? "border-brand-500 bg-brand-500/10 font-medium"
                      : "border-ink-600 bg-ink-850 text-ink-400 hover:border-ink-500",
                  )}
                >
                  {r}
                  <span className="ml-1.5 text-[11px] text-ink-500">
                    {r === "16:9" ? "1920×1080" : r === "9:16" ? "1080×1920" : "1080×1080"}
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-ink-800 pt-4">
              <Button onClick={() => void start()} loading={busy} disabled={ratios.length === 0}>
                <Film className="size-4" />
                Render {ratios.length} variant{ratios.length === 1 ? "" : "s"} ({cost} cr)
              </Button>
              <p className="text-[12px] text-ink-500">
                Each variant re-lays out the captions for its own frame rather than scaling them.
              </p>
            </div>
          </>
        )}
      </div>

      {renders.length > 0 && (
        <div className="space-y-3">
          {renders.map((render) => (
            <RenderCard key={render.id} render={render} onError={onError} />
          ))}
        </div>
      )}
    </div>
  );
}

function RenderCard({
  render,
  onError,
}: {
  render: RenderWithUrls;
  onError: (m: string | null) => void;
}) {
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState<{ dryRun: boolean; url: string | null } | null>(null);

  const active = ["queued", "claimed", "running"].includes(render.status);

  const publish = async (): Promise<void> => {
    setPublishing(true);
    onError(null);
    try {
      const result = await api.post<{
        publication: { dryRun: boolean; url: string | null; payload: Record<string, unknown> };
      }>("/api/youtube/publish", { renderId: render.id, privacy: "private" });
      setPublished(result.publication);
    } catch (err) {
      onError(err instanceof ApiClientError ? err.message : "Could not publish.");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <article className="panel overflow-hidden">
      <div className="flex flex-col gap-4 p-4 lg:flex-row">
        <div
          className={clsx(
            "w-full shrink-0 overflow-hidden rounded-lg bg-ink-850",
            render.aspectRatio === "9:16" ? "lg:w-52" : "lg:w-80",
          )}
        >
          {render.status === "succeeded" && render.videoUrl ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video
              src={render.videoUrl}
              poster={render.thumbnailUrl ?? undefined}
              controls
              preload="metadata"
              className="w-full"
            />
          ) : (
            <div
              className={clsx(
                "grid w-full place-items-center text-ink-600",
                render.aspectRatio === "9:16" ? "aspect-[9/16]" : "aspect-video",
              )}
            >
              <Film className={clsx("size-7", active && "animate-pulse-soft")} />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[render.status]}>{render.status}</Badge>
            <span className="text-[13px] font-medium">{render.aspectRatio}</span>
            <span className="text-[12px] text-ink-500">
              {render.width}×{render.height}
            </span>
          </div>

          {active && (
            <div className="mt-3">
              <Progress value={render.progress} />
              <p className="mt-1.5 text-[12px] text-ink-400">
                {render.stage} · {render.progress}%
              </p>
            </div>
          )}

          {render.status === "failed" && render.error && (
            <div className="mt-3">
              <Alert tone="bad" title="Render failed">
                <span className="font-mono text-[11px]">{render.error.slice(0, 400)}</span>
                <p className="mt-1.5">Your credits for this render were refunded.</p>
              </Alert>
            </div>
          )}

          {render.status === "succeeded" && (
            <>
              <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-[12px]">
                {[
                  ["Duration", formatDuration(render.durationMs)],
                  ["Size", formatBytes(render.sizeBytes)],
                  ["Encode time", `${(render.encodeMs / 1000).toFixed(1)}s`],
                  [
                    "Speed",
                    render.encodeMs > 0
                      ? `${(render.durationMs / render.encodeMs).toFixed(2)}× realtime`
                      : "—",
                  ],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-ink-500">{k}</dt>
                    <dd className="tabular-nums text-ink-200">{v}</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-4 flex flex-wrap gap-2">
                <a href={render.videoUrl ?? "#"} download>
                  <Button size="sm" variant="secondary">
                    <Download className="size-3.5" />
                    Download MP4
                  </Button>
                </a>
                <Button size="sm" variant="ghost" onClick={() => void publish()} loading={publishing}>
                  <Upload className="size-3.5" />
                  Publish to YouTube
                </Button>
              </div>

              {published && (
                <div className="mt-3">
                  <Alert tone={published.dryRun ? "info" : "good"}>
                    {published.dryRun ? (
                      <>
                        Dry run complete. No YouTube credentials are configured, so nothing was
                        uploaded — but the request body was built and stored, including the
                        synthetic-content disclosure. Connect a channel in Settings to publish for
                        real.
                      </>
                    ) : (
                      <>
                        Uploaded as private.{" "}
                        {published.url && (
                          <a className="text-brand-300 underline" href={published.url} target="_blank" rel="noreferrer">
                            Open on YouTube
                          </a>
                        )}
                      </>
                    )}
                  </Alert>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </article>
  );
}
