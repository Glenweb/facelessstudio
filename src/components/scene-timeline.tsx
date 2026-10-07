"use client";

import { clsx } from "clsx";
import { Images, RefreshCw, Sparkles } from "lucide-react";
import { useState } from "react";
import { api, ApiClientError, formatDuration } from "@/lib/client/api";
import { CREDIT_COSTS } from "@/lib/studio/pricing";
import type { SceneWithUrl } from "@/lib/client/types";
import { Alert, Badge, Button, Field, Textarea } from "./ui";
import type { TabProps } from "./project-workspace";

export function SceneTimeline({ data, reload, onError, goNext }: TabProps) {
  const { scenes, project, voiceover } = data;
  const [busyAll, setBusyAll] = useState(false);
  const [busyScene, setBusyScene] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ narration: string; visualPrompt: string; onScreenText: string }>({
    narration: "",
    visualPrompt: "",
    onScreenText: "",
  });

  const pending = scenes.filter((s) => s.imageStatus !== "ready");
  const ready = scenes.length - pending.length;

  const generateAll = async (): Promise<void> => {
    setBusyAll(true);
    onError(null);
    try {
      const result = await api.post<{ failures: { idx: number; error: string }[] }>(
        `/api/projects/${project.id}/scenes`,
      );
      await reload();
      if (result.failures.length > 0) {
        onError(
          `${result.failures.length} scene${result.failures.length === 1 ? "" : "s"} failed: ${result.failures
            .map((f) => `#${f.idx + 1} ${f.error}`)
            .join("; ")
            .slice(0, 300)}`,
        );
      }
    } catch (err) {
      onError(err instanceof ApiClientError ? err.message : "Could not generate the visuals.");
    } finally {
      setBusyAll(false);
    }
  };

  const regenerate = async (scene: SceneWithUrl): Promise<void> => {
    setBusyScene(scene.id);
    onError(null);
    try {
      await api.post(`/api/projects/${project.id}/scenes/${scene.id}`);
      await reload();
    } catch (err) {
      onError(err instanceof ApiClientError ? err.message : "Could not regenerate that scene.");
    } finally {
      setBusyScene(null);
    }
  };

  const startEdit = (scene: SceneWithUrl): void => {
    setOpen(scene.id);
    setDraft({
      narration: scene.narration,
      visualPrompt: scene.visualPrompt,
      onScreenText: scene.onScreenText ?? "",
    });
  };

  const saveEdit = async (scene: SceneWithUrl): Promise<void> => {
    setBusyScene(scene.id);
    onError(null);
    try {
      await api.patch(`/api/projects/${project.id}/scenes/${scene.id}`, {
        narration: draft.narration,
        visualPrompt: draft.visualPrompt,
        onScreenText: draft.onScreenText.trim() === "" ? null : draft.onScreenText,
      });
      await reload();
      setOpen(null);
      if (voiceover && draft.narration !== scene.narration) {
        onError("Narration changed — regenerate the voiceover so the timeline stays in sync.");
      }
    } catch (err) {
      onError(err instanceof ApiClientError ? err.message : "Could not save that scene.");
    } finally {
      setBusyScene(null);
    }
  };

  if (scenes.length === 0) {
    return (
      <Alert tone="info" title="No scenes yet">
        Write the script first — the scene list is built from it.
      </Alert>
    );
  }

  return (
    <div className="space-y-5">
      <div className="panel flex flex-wrap items-center justify-between gap-4 p-4">
        <div>
          <p className="text-sm font-medium">
            {ready} of {scenes.length} scenes have a visual
          </p>
          <p className="mt-0.5 text-[12px] text-ink-400">
            {pending.length > 0
              ? `${pending.length} to generate · ${pending.length * CREDIT_COSTS.sceneImage} credits`
              : "All scenes ready."}
          </p>
        </div>
        <div className="flex gap-2">
          {pending.length > 0 && (
            <Button onClick={() => void generateAll()} loading={busyAll}>
              <Sparkles className="size-4" />
              Generate {pending.length} visual{pending.length === 1 ? "" : "s"}
            </Button>
          )}
          {ready === scenes.length && (
            <Button variant="secondary" onClick={goNext}>
              Next: voice →
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {scenes.map((scene) => {
          const editing = open === scene.id;
          const busy = busyScene === scene.id;
          return (
            <article key={scene.id} className="panel overflow-hidden">
              <div className="flex flex-col gap-4 p-4 sm:flex-row">
                <div
                  className={clsx(
                    "relative aspect-video w-full shrink-0 overflow-hidden rounded-lg bg-ink-850 sm:w-56",
                    project.aspectRatio === "9:16" && "sm:aspect-[9/16] sm:w-28",
                  )}
                >
                  {scene.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={scene.imageUrl}
                      alt={`Scene ${scene.idx + 1}`}
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="grid size-full place-items-center text-ink-600">
                      <Images className="size-6" />
                    </div>
                  )}
                  <span className="absolute left-2 top-2 rounded bg-ink-950/80 px-1.5 py-0.5 text-[11px] font-medium tabular-nums backdrop-blur">
                    {scene.idx + 1}
                  </span>
                  {busy && (
                    <div className="absolute inset-0 grid place-items-center bg-ink-950/70 text-[12px] text-ink-200">
                      Working…
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge
                      tone={
                        scene.imageStatus === "ready"
                          ? "good"
                          : scene.imageStatus === "failed"
                            ? "bad"
                            : "neutral"
                      }
                    >
                      {scene.imageStatus}
                    </Badge>
                    {scene.endMs > scene.startMs && (
                      <span className="text-[12px] tabular-nums text-ink-500">
                        {formatDuration(scene.startMs)} – {formatDuration(scene.endMs)} (
                        {((scene.endMs - scene.startMs) / 1000).toFixed(1)}s)
                      </span>
                    )}
                    <span className="text-[12px] text-ink-600">motion: {scene.motion}</span>
                  </div>

                  {editing ? (
                    <div className="space-y-3">
                      <Field label="Narration">
                        <Textarea
                          value={draft.narration}
                          onChange={(e) => setDraft((d) => ({ ...d, narration: e.target.value }))}
                          rows={3}
                        />
                      </Field>
                      <Field
                        label="Visual prompt"
                        hint="Changing this marks the current frame stale; regenerate to see the new one."
                      >
                        <Textarea
                          value={draft.visualPrompt}
                          onChange={(e) => setDraft((d) => ({ ...d, visualPrompt: e.target.value }))}
                          rows={3}
                        />
                      </Field>
                      <Field label="On-screen title" hint="Leave empty for none.">
                        <Textarea
                          value={draft.onScreenText}
                          onChange={(e) => setDraft((d) => ({ ...d, onScreenText: e.target.value }))}
                          rows={1}
                        />
                      </Field>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => void saveEdit(scene)} loading={busy}>
                          Save scene
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setOpen(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-[13px] leading-relaxed text-ink-200">{scene.narration}</p>
                      <p className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-ink-500">
                        {scene.visualPrompt}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="sm" variant="secondary" onClick={() => startEdit(scene)}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void regenerate(scene)}
                          loading={busy}
                        >
                          <RefreshCw className="size-3.5" />
                          Regenerate ({CREDIT_COSTS.sceneImage} cr)
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
