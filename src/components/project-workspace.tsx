"use client";

import { clsx } from "clsx";
import { AlertTriangle, FileText, Film, Images, Mic } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiClientError } from "@/lib/client/api";
import type { ProjectPayload } from "@/lib/client/types";
import { Alert, Badge, Button, Spinner } from "./ui";
import { Page } from "./page-header";
import { ScriptEditor } from "./script-editor";
import { SceneTimeline } from "./scene-timeline";
import { VoicePanel } from "./voice-panel";
import { RenderPanel } from "./render-panel";

export type TabId = "script" | "scenes" | "voice" | "render";

const TABS: { id: TabId; label: string; icon: typeof FileText }[] = [
  { id: "script", label: "Script", icon: FileText },
  { id: "scenes", label: "Scenes", icon: Images },
  { id: "voice", label: "Voice", icon: Mic },
  { id: "render", label: "Render", icon: Film },
];

export function ProjectWorkspace({ projectId }: { projectId: string }) {
  const params = useSearchParams();
  const [data, setData] = useState<ProjectPayload | null>(null);
  const [tab, setTab] = useState<TabId>("script");
  const [error, setError] = useState<string | null>(null);
  const autoStarted = useRef(false);

  const reload = useCallback(async (): Promise<ProjectPayload> => {
    const payload = await api.get<ProjectPayload>(`/api/projects/${projectId}`);
    setData(payload);
    return payload;
  }, [projectId]);

  useEffect(() => {
    void reload().catch((err) =>
      setError(err instanceof ApiClientError ? err.message : "Could not load this project."),
    );
  }, [reload]);

  // Arriving straight from the wizard, write the first draft immediately —
  // the user already asked for a script by creating the project.
  useEffect(() => {
    if (!data || autoStarted.current) return;
    if (params.get("start") !== "1" || data.script) return;
    autoStarted.current = true;
    void (async () => {
      try {
        await api.post(`/api/projects/${projectId}/script`);
        await reload();
      } catch (err) {
        setError(err instanceof ApiClientError ? err.message : "Could not write the script.");
      }
    })();
  }, [data, params, projectId, reload]);

  // Keep the render tab live while anything is still encoding.
  useEffect(() => {
    const active = data?.renders.some((r) => ["queued", "claimed", "running"].includes(r.status));
    if (!active) return;
    const id = setInterval(() => void reload().catch(() => undefined), 2500);
    return () => clearInterval(id);
  }, [data, reload]);

  if (error && !data) {
    return (
      <Page>
        <Alert tone="bad" title="Could not open this project">
          {error}
          <div className="mt-3">
            <Link href="/dashboard">
              <Button variant="secondary" size="sm">
                Back to projects
              </Button>
            </Link>
          </div>
        </Alert>
      </Page>
    );
  }

  if (!data) {
    return (
      <Page>
        <div className="flex items-center gap-2 py-16 text-sm text-ink-400">
          <Spinner className="size-4" />
          Loading project…
        </div>
      </Page>
    );
  }

  const { project, script, scenes, voiceover, renders, style, voice } = data;
  const sceneArtReady = scenes.length > 0 && scenes.every((s) => s.imageStatus === "ready");

  /** Each tab shows whether its step is done, so the next action is obvious. */
  const tabState: Record<TabId, "done" | "ready" | "blocked"> = {
    script: script ? "done" : "ready",
    scenes: sceneArtReady ? "done" : scenes.length > 0 ? "ready" : "blocked",
    voice: voiceover ? "done" : sceneArtReady ? "ready" : "blocked",
    render: renders.some((r) => r.status === "succeeded")
      ? "done"
      : voiceover
        ? "ready"
        : "blocked",
  };

  return (
    <Page>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href="/dashboard" className="text-[12px] text-ink-500 hover:text-ink-300">
            ← Projects
          </Link>
          <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight">{project.title}</h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] text-ink-400">
            <span>{style.name}</span>
            <span className="text-ink-700">·</span>
            <span>{voice.name}</span>
            <span className="text-ink-700">·</span>
            <span>{project.aspectRatio}</span>
            {project.alsoRenderShorts && <Badge tone="brand">+ companion ratio</Badge>}
          </p>
        </div>
        <div
          className="hidden h-14 w-32 shrink-0 rounded-lg sm:block"
          style={{ background: `linear-gradient(130deg, ${style.palette.join(", ")})` }}
          aria-hidden
        />
      </div>

      {error && (
        <div className="mb-5">
          <Alert tone="bad">{error}</Alert>
        </div>
      )}

      <div role="tablist" className="mb-6 flex gap-1 overflow-x-auto border-b border-ink-800 scrollbar-none">
        {TABS.map(({ id, label, icon: Icon }) => {
          const state = tabState[id];
          return (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={clsx(
                "flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm transition-colors",
                tab === id
                  ? "border-brand-500 font-medium text-ink-100"
                  : "border-transparent text-ink-400 hover:text-ink-200",
              )}
            >
              <Icon className="size-4" />
              {label}
              {state === "done" && <span className="size-1.5 rounded-full bg-good-400" aria-label="complete" />}
              {state === "blocked" && (
                <AlertTriangle className="size-3.5 text-ink-600" aria-label="not ready yet" />
              )}
            </button>
          );
        })}
      </div>

      <div className="animate-rise">
        {tab === "script" && (
          <ScriptEditor data={data} reload={reload} onError={setError} goNext={() => setTab("scenes")} />
        )}
        {tab === "scenes" && (
          <SceneTimeline data={data} reload={reload} onError={setError} goNext={() => setTab("voice")} />
        )}
        {tab === "voice" && (
          <VoicePanel data={data} reload={reload} onError={setError} goNext={() => setTab("render")} />
        )}
        {tab === "render" && <RenderPanel data={data} reload={reload} onError={setError} />}
      </div>
    </Page>
  );
}

export interface TabProps {
  data: ProjectPayload;
  reload: () => Promise<ProjectPayload>;
  onError: (message: string | null) => void;
  goNext?: () => void;
}
