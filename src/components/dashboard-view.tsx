"use client";

import { clsx } from "clsx";
import { Film, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, relativeTime } from "@/lib/client/api";
import { STYLE_TEMPLATES } from "@/lib/studio/styles";
import type { Project } from "@/lib/db/schema";
import { Badge, Button, EmptyState, Spinner } from "./ui";
import { Page, PageHeader } from "./page-header";

interface Row {
  project: Project;
  sceneCount: number;
  renderCount: number;
}

const STATUS_TONE: Record<string, "neutral" | "good" | "warn" | "bad" | "brand"> = {
  draft: "neutral",
  scripted: "brand",
  storyboarded: "brand",
  voiced: "brand",
  rendering: "warn",
  ready: "good",
  failed: "bad",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  scripted: "Script ready",
  storyboarded: "Scenes ready",
  voiced: "Voiced",
  rendering: "Rendering",
  ready: "Ready",
  failed: "Failed",
};

export function DashboardView() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { projects } = await api.get<{ projects: Row[] }>("/api/projects");
    setRows(projects);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Projects mid-render change state without any user action, so poll while
  // any of them is in flight and stop as soon as the queue drains.
  useEffect(() => {
    if (!rows?.some((r) => r.project.status === "rendering")) return;
    const id = setInterval(() => void load(), 4000);
    return () => clearInterval(id);
  }, [rows, load]);

  const remove = async (id: string, title: string): Promise<void> => {
    if (!window.confirm(`Delete “${title}” and everything in it? This cannot be undone.`)) return;
    setDeleting(id);
    try {
      await api.del(`/api/projects/${id}`);
      await load();
    } finally {
      setDeleting(null);
    }
  };

  return (
    <Page>
      <PageHeader
        title="Projects"
        description="Every video you are working on. Pick one up where you left it."
        action={
          <Link href="/projects/new">
            <Button>
              <Plus className="size-4" />
              New project
            </Button>
          </Link>
        }
      />

      {rows === null ? (
        <div className="flex items-center gap-2 py-16 text-sm text-ink-400">
          <Spinner className="size-4" />
          Loading projects…
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No projects yet"
          body="Start with a topic prompt or paste a script you have already written. Your first video is covered by your free credits."
          action={
            <Link href="/projects/new">
              <Button size="lg">
                <Plus className="size-4" />
                Create your first video
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(({ project, sceneCount, renderCount }) => {
            const style = STYLE_TEMPLATES.find((s) => s.id === project.styleId);
            return (
              <article key={project.id} className="panel group relative overflow-hidden">
                <Link href={`/projects/${project.id}`} className="block">
                  <div
                    className="h-16"
                    style={{
                      background: style
                        ? `linear-gradient(110deg, ${style.palette.join(", ")})`
                        : undefined,
                    }}
                    aria-hidden
                  />
                  <div className="p-4">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <h2 className="line-clamp-2 text-sm font-semibold leading-snug">
                        {project.title}
                      </h2>
                      <Badge tone={STATUS_TONE[project.status] ?? "neutral"}>
                        {STATUS_LABEL[project.status] ?? project.status}
                      </Badge>
                    </div>
                    <p className="text-[12px] text-ink-500">
                      {style?.name ?? project.styleId} · {project.aspectRatio}
                    </p>
                    <div className="mt-3 flex items-center gap-3 text-[12px] text-ink-400">
                      <span>{sceneCount} scenes</span>
                      {renderCount > 0 && (
                        <span className="flex items-center gap-1 text-good-400">
                          <Film className="size-3.5" />
                          {renderCount} rendered
                        </span>
                      )}
                      <span className="ml-auto">{relativeTime(project.updatedAt)}</span>
                    </div>
                  </div>
                </Link>

                <button
                  onClick={() => void remove(project.id, project.title)}
                  disabled={deleting === project.id}
                  aria-label={`Delete ${project.title}`}
                  className={clsx(
                    "absolute right-2.5 top-2.5 rounded-md bg-ink-950/70 p-1.5 text-ink-300 backdrop-blur transition",
                    "opacity-0 hover:bg-bad-500 hover:text-white focus-visible:opacity-100 group-hover:opacity-100",
                  )}
                >
                  {deleting === project.id ? (
                    <Spinner className="size-3.5" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                </button>
              </article>
            );
          })}
        </div>
      )}
    </Page>
  );
}
