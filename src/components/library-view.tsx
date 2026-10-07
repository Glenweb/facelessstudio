"use client";

import { clsx } from "clsx";
import { Download, Film } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, formatBytes, formatDuration, relativeTime } from "@/lib/client/api";
import { Badge, Button, EmptyState, Spinner } from "./ui";
import { Page, PageHeader } from "./page-header";

interface Item {
  id: string;
  projectId: string;
  projectTitle: string;
  styleId: string;
  status: string;
  aspectRatio: string;
  width: number;
  height: number;
  durationMs: number;
  sizeBytes: number;
  encodeMs: number;
  createdAt: string;
  videoUrl: string | null;
  thumbnailUrl: string | null;
}

export function LibraryView() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [filter, setFilter] = useState<"all" | "16:9" | "9:16">("all");

  useEffect(() => {
    void api.get<{ items: Item[] }>("/api/library").then(({ items }) => setItems(items));
  }, []);

  const visible = (items ?? []).filter((i) => filter === "all" || i.aspectRatio === filter);
  const done = (items ?? []).filter((i) => i.status === "succeeded");
  const totalSeconds = done.reduce((a, i) => a + i.durationMs, 0) / 1000;

  return (
    <Page>
      <PageHeader
        title="Library"
        description="Every render you have made. Download, or open the project to change something and re-render."
      />

      {items === null ? (
        <div className="flex items-center gap-2 py-16 text-sm text-ink-400">
          <Spinner className="size-4" />
          Loading…
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="Nothing rendered yet"
          body="Finished videos land here, in every aspect ratio you rendered them in."
          action={
            <Link href="/projects/new">
              <Button>Start a project</Button>
            </Link>
          }
        />
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <div className="flex gap-1">
              {(["all", "16:9", "9:16"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={clsx(
                    "rounded-lg px-3 py-1.5 text-[13px] transition-colors",
                    filter === f ? "bg-ink-800 font-medium text-ink-100" : "text-ink-400 hover:text-ink-200",
                  )}
                >
                  {f === "all" ? "All" : f}
                </button>
              ))}
            </div>
            <p className="ml-auto text-[12px] text-ink-500">
              {done.length} finished · {Math.round(totalSeconds / 60)} minutes of video
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((item) => (
              <article key={item.id} className="panel overflow-hidden">
                <div
                  className={clsx(
                    "relative bg-ink-850",
                    item.aspectRatio === "9:16" ? "aspect-[9/16]" : "aspect-video",
                  )}
                >
                  {item.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.thumbnailUrl}
                      alt={item.projectTitle}
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="grid size-full place-items-center text-ink-600">
                      <Film className="size-7" />
                    </div>
                  )}
                  <span className="absolute bottom-2 right-2 rounded bg-ink-950/85 px-1.5 py-0.5 text-[11px] tabular-nums backdrop-blur">
                    {formatDuration(item.durationMs)}
                  </span>
                </div>

                <div className="p-4">
                  <div className="mb-1.5 flex items-start justify-between gap-2">
                    <Link
                      href={`/projects/${item.projectId}`}
                      className="line-clamp-2 text-[13px] font-semibold hover:text-brand-300"
                    >
                      {item.projectTitle}
                    </Link>
                    <Badge tone={item.status === "succeeded" ? "good" : "warn"}>
                      {item.aspectRatio}
                    </Badge>
                  </div>
                  <p className="text-[12px] text-ink-500">
                    {item.width}×{item.height} · {formatBytes(item.sizeBytes)} ·{" "}
                    {relativeTime(item.createdAt)}
                  </p>
                  {item.videoUrl && (
                    <a href={item.videoUrl} download className="mt-3 block">
                      <Button size="sm" variant="secondary" className="w-full">
                        <Download className="size-3.5" />
                        Download
                      </Button>
                    </a>
                  )}
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </Page>
  );
}
