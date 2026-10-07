"use client";

import { RefreshCw, Save, Wand2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api, ApiClientError } from "@/lib/client/api";
import { Alert, Badge, Button, Field, Input, Textarea } from "./ui";
import type { TabProps } from "./project-workspace";

export function ScriptEditor({ data, reload, onError, goNext }: TabProps) {
  const { script, voice, style } = data;

  const [title, setTitle] = useState(script?.title ?? "");
  const [hook, setHook] = useState(script?.hook ?? "");
  const [body, setBody] = useState(script?.body ?? "");
  const [cta, setCta] = useState(script?.callToAction ?? "");
  const [seoTitle, setSeoTitle] = useState(script?.seoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(script?.seoDescription ?? "");
  const [tags, setTags] = useState((script?.tags ?? []).join(", "));
  const [busy, setBusy] = useState<"generate" | "save" | null>(null);
  const [saved, setSaved] = useState(false);

  // Adopt a newly generated draft without clobbering unsaved edits.
  useEffect(() => {
    if (!script) return;
    setTitle(script.title);
    setHook(script.hook);
    setBody(script.body);
    setCta(script.callToAction);
    setSeoTitle(script.seoTitle);
    setSeoDescription(script.seoDescription);
    setTags(script.tags.join(", "));
  }, [script?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const words = `${body} ${cta}`.trim().split(/\s+/).filter(Boolean).length;
  const estimatedSeconds = Math.round((words / voice.wpm) * 60);

  const generate = async (): Promise<void> => {
    setBusy("generate");
    onError(null);
    try {
      await api.post(`/api/projects/${data.project.id}/script`);
      await reload();
    } catch (err) {
      onError(err instanceof ApiClientError ? err.message : "Could not write the script.");
    } finally {
      setBusy(null);
    }
  };

  const save = async (): Promise<void> => {
    setBusy("save");
    onError(null);
    try {
      const result = await api.put<{ narrationChanged: boolean }>(
        `/api/projects/${data.project.id}/script`,
        {
          title,
          hook,
          body,
          callToAction: cta,
          seoTitle,
          seoDescription,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        },
      );
      await reload();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      if (result.narrationChanged) {
        onError(
          "Narration changed, so the scenes were re-planned. Generate the visuals and voiceover again before rendering.",
        );
      }
    } catch (err) {
      onError(err instanceof ApiClientError ? err.message : "Could not save.");
    } finally {
      setBusy(null);
    }
  };

  if (!script) {
    return (
      <div className="panel p-8 text-center">
        <h2 className="text-base font-semibold">No script yet</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-400">
          Write the first draft from your prompt. You can edit every word afterwards — the scene
          list rebuilds itself from whatever you end up with.
        </p>
        <Button className="mt-5" size="lg" onClick={() => void generate()} loading={busy === "generate"}>
          <Wand2 className="size-4" />
          Write the script
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
      <div className="panel space-y-5 p-5">
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>

        <Field label="Hook" hint="The first line spoken. It has about three seconds to earn the next thirty.">
          <Textarea value={hook} onChange={(e) => setHook(e.target.value)} rows={2} />
        </Field>

        <Field
          label="Narration"
          hint="One beat per line. Each line becomes a scene, so a line break is an edit point."
        >
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={16}
            className="font-mono text-[13px] leading-relaxed"
          />
        </Field>

        <Field label="Call to action">
          <Textarea value={cta} onChange={(e) => setCta(e.target.value)} rows={2} />
        </Field>

        <details className="group rounded-lg border border-ink-700 bg-ink-850 p-4">
          <summary className="cursor-pointer list-none text-[13px] font-medium text-ink-200">
            YouTube metadata
            <span className="ml-2 text-[12px] font-normal text-ink-500 group-open:hidden">
              title, description, tags
            </span>
          </summary>
          <div className="mt-4 space-y-4">
            <Field label="SEO title" hint={`${seoTitle.length}/100 characters`}>
              <Input value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} maxLength={100} />
            </Field>
            <Field label="Description">
              <Textarea
                value={seoDescription}
                onChange={(e) => setSeoDescription(e.target.value)}
                rows={5}
              />
            </Field>
            <Field label="Tags" hint="Comma separated.">
              <Input value={tags} onChange={(e) => setTags(e.target.value)} />
            </Field>
          </div>
        </details>

        <div className="flex flex-wrap items-center gap-3 border-t border-ink-800 pt-4">
          <Button onClick={() => void save()} loading={busy === "save"}>
            <Save className="size-4" />
            Save changes
          </Button>
          <Button variant="secondary" onClick={() => void generate()} loading={busy === "generate"}>
            <RefreshCw className="size-4" />
            Rewrite from scratch
          </Button>
          {saved && <span className="text-[13px] text-good-400">Saved</span>}
          <Button variant="ghost" className="ml-auto" onClick={goNext}>
            Next: scenes →
          </Button>
        </div>
      </div>

      <aside className="panel h-fit space-y-4 p-5 lg:sticky lg:top-6">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-ink-500">Runtime</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {Math.floor(estimatedSeconds / 60)}:{String(estimatedSeconds % 60).padStart(2, "0")}
          </p>
          <p className="mt-0.5 text-[12px] text-ink-400">
            {words} words at {voice.name}&rsquo;s {voice.wpm} wpm
          </p>
        </div>

        <div className="border-t border-ink-800 pt-4">
          <p className="text-[11px] uppercase tracking-wide text-ink-500">Scenes planned</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{data.scenes.length}</p>
          <p className="mt-0.5 text-[12px] text-ink-400">
            ~{style.secondsPerScene}s each for {style.name}
          </p>
        </div>

        <div className="border-t border-ink-800 pt-4">
          <p className="mb-1.5 text-[11px] uppercase tracking-wide text-ink-500">Written by</p>
          <Badge tone={script.generator === "anthropic" ? "good" : "neutral"}>
            {script.generator === "anthropic" ? "Claude" : "Local engine"}
          </Badge>
          {script.generator !== "anthropic" && (
            <p className="mt-2.5 text-[12px] leading-relaxed text-ink-500">
              The local engine builds a correct arc and hits the word count, but states no facts —
              it will not invent a statistic for you. Add an Anthropic key for a researched draft.
            </p>
          )}
        </div>

        <div className="border-t border-ink-800 pt-4">
          <p className="mb-1.5 text-[11px] uppercase tracking-wide text-ink-500">Voice direction</p>
          <p className="text-[12px] leading-relaxed text-ink-400">{style.narrationDirection}</p>
        </div>
      </aside>
    </div>
  );
}
