"use client";

import { clsx } from "clsx";
import { Mic, RefreshCw } from "lucide-react";
import { useState } from "react";
import { api, ApiClientError, formatDuration } from "@/lib/client/api";
import { CREDIT_COSTS } from "@/lib/studio/pricing";
import { VOICES } from "@/lib/studio/voices";
import { Alert, Badge, Button } from "./ui";
import type { TabProps } from "./project-workspace";

export function VoicePanel({ data, reload, onError, goNext }: TabProps) {
  const { project, voiceover, scenes, style } = data;
  const [voiceId, setVoiceId] = useState(project.voiceId);
  const [busy, setBusy] = useState(false);

  const narrationWords = scenes
    .map((s) => s.narration)
    .join(" ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  const selected = VOICES.find((v) => v.id === voiceId)!;
  const estimateSeconds = Math.round((narrationWords / selected.wpm) * 60);
  const cost = Math.ceil(estimateSeconds * CREDIT_COSTS.voiceoverPerSecond);

  const generate = async (): Promise<void> => {
    setBusy(true);
    onError(null);
    try {
      await api.post(`/api/projects/${project.id}/voiceover`, { voiceId });
      await reload();
    } catch (err) {
      onError(err instanceof ApiClientError ? err.message : "Could not generate the voiceover.");
    } finally {
      setBusy(false);
    }
  };

  if (scenes.length === 0) {
    return (
      <Alert tone="info" title="Nothing to narrate yet">
        Write the script first.
      </Alert>
    );
  }

  return (
    <div className="space-y-5">
      {voiceover && (
        <div className="panel p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Current voiceover</h2>
              <p className="mt-0.5 text-[12px] text-ink-400">
                {formatDuration(voiceover.durationMs)} · {voiceover.words.length} words timed ·{" "}
                {VOICES.find((v) => v.id === voiceover.voiceId)?.name ?? voiceover.voiceId}
              </p>
            </div>
            <Badge tone={voiceover.mode === "live" ? "good" : "neutral"}>
              {voiceover.mode === "live" ? "ElevenLabs" : "Local preview voice"}
            </Badge>
          </div>

          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio controls src={voiceover.audioUrl} className="w-full" preload="metadata" />

          {voiceover.mode === "local" && (
            <p className="mt-3 text-[12px] leading-relaxed text-ink-500">
              This is the local preview voice — speech-shaped audio generated on this machine so
              timing, captions and ducking are all real. Add an ElevenLabs key for a broadcast
              voice; the word timings and the rest of the pipeline are unchanged.
            </p>
          )}

          <div className="mt-4 border-t border-ink-800 pt-4">
            <p className="mb-2 text-[11px] uppercase tracking-wide text-ink-500">
              Word timings driving the captions
            </p>
            <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
              {voiceover.words.slice(0, 120).map((w, i) => (
                <span
                  key={`${i}-${w.word}`}
                  title={`${(w.startMs / 1000).toFixed(2)}s → ${(w.endMs / 1000).toFixed(2)}s`}
                  className="rounded bg-ink-850 px-1.5 py-0.5 text-[11px] text-ink-300"
                >
                  {w.word}
                </span>
              ))}
              {voiceover.words.length > 120 && (
                <span className="px-1.5 py-0.5 text-[11px] text-ink-600">
                  +{voiceover.words.length - 120} more
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="panel p-5">
        <h2 className="text-sm font-semibold">
          {voiceover ? "Change the voice and re-record" : "Choose a voice"}
        </h2>
        <p className="mt-1 text-[12px] text-ink-400">
          Each voice has its own speaking rate, so the runtime changes with the choice. Scenes are
          re-timed against the finished read.
        </p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {VOICES.map((v) => (
            <button
              key={v.id}
              onClick={() => setVoiceId(v.id)}
              className={clsx(
                "rounded-lg border p-3 text-left transition-colors",
                voiceId === v.id
                  ? "border-brand-500 bg-brand-500/10"
                  : "border-ink-600 bg-ink-850 hover:border-ink-500",
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[13px] font-semibold">{v.name}</p>
                <span className="text-[11px] tabular-nums text-ink-500">
                  ~{Math.round((narrationWords / v.wpm) * 60)}s
                </span>
              </div>
              <p className="mt-0.5 text-[12px] text-ink-400">
                {v.accent} · {v.description}
              </p>
              {v.pairsWith.includes(style.id) && (
                <Badge tone="brand" className="mt-2">
                  Pairs with {style.name}
                </Badge>
              )}
            </button>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-ink-800 pt-4">
          <Button onClick={() => void generate()} loading={busy}>
            {voiceover ? <RefreshCw className="size-4" /> : <Mic className="size-4" />}
            {voiceover ? "Re-record" : "Generate voiceover"} ({cost} cr)
          </Button>
          <p className="text-[12px] text-ink-500">
            {narrationWords} words · about {formatDuration(estimateSeconds * 1000)}
          </p>
          {voiceover && (
            <Button variant="ghost" className="ml-auto" onClick={goNext}>
              Next: render →
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
