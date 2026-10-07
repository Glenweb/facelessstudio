"use client";

import { clsx } from "clsx";
import { ArrowLeft, ArrowRight, Check, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { api, ApiClientError } from "@/lib/client/api";
import { CAPTION_PRESETS } from "@/lib/studio/captions";
import { MUSIC_BEDS } from "@/lib/studio/music";
import { quoteProject } from "@/lib/studio/pricing";
import { STYLE_TEMPLATES } from "@/lib/studio/styles";
import type { AspectRatio } from "@/lib/studio/types";
import { VOICES, recommendedVoiceForStyle } from "@/lib/studio/voices";
import { Alert, Badge, Button, Field, Input, Textarea } from "./ui";
import { Page } from "./page-header";

const STEPS = ["Source", "Style", "Voice", "Format", "Review"] as const;

const LENGTH_PRESETS: { seconds: number; label: string; note: string }[] = [
  { seconds: 30, label: "30s", note: "Short / Reel" },
  { seconds: 60, label: "60s", note: "Short, max length" },
  { seconds: 180, label: "3 min", note: "Mid-form" },
  { seconds: 480, label: "8 min", note: "Long-form, ad-eligible" },
];

export function NewProjectWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sourceType, setSourceType] = useState<"prompt" | "script">("prompt");
  const [sourceText, setSourceText] = useState("");
  const [targetSeconds, setTargetSeconds] = useState(60);
  const [styleId, setStyleId] = useState(STYLE_TEMPLATES[0]!.id);
  const [voiceId, setVoiceId] = useState(recommendedVoiceForStyle(STYLE_TEMPLATES[0]!.id).id);
  const [captionPresetId, setCaptionPresetId] = useState(STYLE_TEMPLATES[0]!.captionPresetId);
  const [musicBedId, setMusicBedId] = useState<string | null>(STYLE_TEMPLATES[0]!.musicBedId);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("16:9");
  const [alsoRenderShorts, setAlsoRenderShorts] = useState(true);
  const [burnCaptions, setBurnCaptions] = useState(true);

  const style = STYLE_TEMPLATES.find((s) => s.id === styleId)!;
  const voice = VOICES.find((v) => v.id === voiceId)!;

  /** Selecting a style adopts its pairings, unless the user already chose. */
  const [touched, setTouched] = useState({ voice: false, caption: false, music: false });
  const chooseStyle = (id: string): void => {
    setStyleId(id);
    const next = STYLE_TEMPLATES.find((s) => s.id === id)!;
    if (!touched.voice) setVoiceId(recommendedVoiceForStyle(id).id);
    if (!touched.caption) setCaptionPresetId(next.captionPresetId);
    if (!touched.music) setMusicBedId(next.musicBedId);
    if (next.bestFor[0]) setAspectRatio(next.bestFor[0]);
  };

  // Scene count follows the style's cut rhythm, so the quote tracks the
  // actual pipeline rather than a flat per-minute guess.
  const quote = useMemo(() => {
    const sceneCount = Math.max(2, Math.round(targetSeconds / style.secondsPerScene));
    return quoteProject({
      seconds: targetSeconds,
      sceneCount,
      variants: alsoRenderShorts ? 2 : 1,
      includeScript: true,
    });
  }, [targetSeconds, style.secondsPerScene, alsoRenderShorts]);

  const wordsNeeded = Math.round((targetSeconds * voice.wpm) / 60);
  const pastedWords = sourceText.trim().split(/\s+/).filter(Boolean).length;

  const canAdvance =
    step !== 0 || (sourceType === "prompt" ? sourceText.trim().length >= 8 : pastedWords >= 20);

  const create = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const { project } = await api.post<{ project: { id: string } }>("/api/projects", {
        sourceType,
        sourceText: sourceText.trim(),
        styleId,
        voiceId,
        captionPresetId,
        musicBedId,
        aspectRatio,
        alsoRenderShorts,
        targetSeconds,
        burnCaptions,
      });
      router.push(`/projects/${project.id}?start=1`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not create the project.");
      setBusy(false);
    }
  };

  return (
    <Page>
      <div className="mb-7">
        <h1 className="text-2xl font-semibold tracking-tight">New project</h1>
        <p className="mt-1.5 text-sm text-ink-400">
          Five quick choices. You can change any of them before you render.
        </p>
      </div>

      <ol className="mb-8 flex flex-wrap items-center gap-1.5">
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-1.5">
            <button
              onClick={() => i < step && setStep(i)}
              disabled={i > step}
              className={clsx(
                "flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] transition-colors",
                i === step && "bg-brand-500/15 font-medium text-brand-300",
                i < step && "text-ink-300 hover:bg-ink-800",
                i > step && "cursor-default text-ink-600",
              )}
            >
              <span
                className={clsx(
                  "grid size-5 place-items-center rounded-full text-[11px] tabular-nums",
                  i < step ? "bg-good-500 text-white" : i === step ? "bg-brand-500 text-white" : "bg-ink-800",
                )}
              >
                {i < step ? <Check className="size-3" /> : i + 1}
              </span>
              {label}
            </button>
            {i < STEPS.length - 1 && <span className="text-ink-700">·</span>}
          </li>
        ))}
      </ol>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="panel animate-rise p-6">
          {step === 0 && (
            <div className="space-y-5">
              <div className="flex gap-2">
                {(
                  [
                    ["prompt", "Start from a prompt", "We write the script"],
                    ["script", "Paste my script", "We keep your words"],
                  ] as const
                ).map(([value, label, note]) => (
                  <button
                    key={value}
                    onClick={() => setSourceType(value)}
                    className={clsx(
                      "flex-1 rounded-lg border p-3.5 text-left transition-colors",
                      sourceType === value
                        ? "border-brand-500 bg-brand-500/10"
                        : "border-ink-600 bg-ink-850 hover:border-ink-500",
                    )}
                  >
                    <p className="text-[13px] font-medium">{label}</p>
                    <p className="mt-0.5 text-[12px] text-ink-400">{note}</p>
                  </button>
                ))}
              </div>

              <Field
                label={sourceType === "prompt" ? "What is the video about?" : "Your script"}
                hint={
                  sourceType === "prompt"
                    ? "A topic and an angle works best. “Why the Roman grain fleet collapsed” beats “Rome”."
                    : `${pastedWords} words · about ${Math.round((pastedWords / voice.wpm) * 60)}s at ${voice.name}'s pace`
                }
              >
                <Textarea
                  value={sourceText}
                  onChange={(e) => setSourceText(e.target.value)}
                  rows={sourceType === "prompt" ? 4 : 12}
                  placeholder={
                    sourceType === "prompt"
                      ? "Why the Roman grain fleet collapsed, and what it predicted about every supply chain since"
                      : "Paste your finished narration here. One idea per line — each line becomes a scene."
                  }
                />
              </Field>

              {sourceType === "prompt" && (
                <Field
                  label="Target length"
                  hint={`About ${wordsNeeded} words at ${voice.name}'s ${voice.wpm} wpm.`}
                >
                  <div className="flex flex-wrap gap-2">
                    {LENGTH_PRESETS.map((p) => (
                      <button
                        key={p.seconds}
                        onClick={() => setTargetSeconds(p.seconds)}
                        className={clsx(
                          "rounded-lg border px-3.5 py-2 text-left transition-colors",
                          targetSeconds === p.seconds
                            ? "border-brand-500 bg-brand-500/10"
                            : "border-ink-600 bg-ink-850 hover:border-ink-500",
                        )}
                      >
                        <span className="block text-[13px] font-medium">{p.label}</span>
                        <span className="block text-[11px] text-ink-400">{p.note}</span>
                      </button>
                    ))}
                  </div>
                </Field>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {STYLE_TEMPLATES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => chooseStyle(s.id)}
                  className={clsx(
                    "overflow-hidden rounded-lg border text-left transition-colors",
                    styleId === s.id
                      ? "border-brand-500 ring-1 ring-brand-500/40"
                      : "border-ink-600 hover:border-ink-500",
                  )}
                >
                  <div
                    className="h-12"
                    style={{ background: `linear-gradient(110deg, ${s.palette.join(", ")})` }}
                    aria-hidden
                  />
                  <div className="p-3.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-[13px] font-semibold">{s.name}</p>
                      <span className="shrink-0 text-[11px] text-ink-500">{s.niche}</span>
                    </div>
                    <p className="mt-1 text-[12px] leading-relaxed text-ink-400">{s.tagline}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <Field label="Narration voice">
                <div className="grid gap-2 sm:grid-cols-2">
                  {VOICES.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => {
                        setVoiceId(v.id);
                        setTouched((t) => ({ ...t, voice: true }));
                      }}
                      className={clsx(
                        "rounded-lg border p-3 text-left transition-colors",
                        voiceId === v.id
                          ? "border-brand-500 bg-brand-500/10"
                          : "border-ink-600 bg-ink-850 hover:border-ink-500",
                      )}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-[13px] font-semibold">{v.name}</p>
                        <span className="text-[11px] tabular-nums text-ink-500">{v.wpm} wpm</span>
                      </div>
                      <p className="mt-0.5 text-[12px] text-ink-400">
                        {v.accent} · {v.description}
                      </p>
                      {v.pairsWith.includes(styleId) && (
                        <Badge tone="brand" className="mt-2">
                          Pairs with {style.name}
                        </Badge>
                      )}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Caption style">
                <div className="grid gap-2 sm:grid-cols-2">
                  {CAPTION_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setCaptionPresetId(p.id);
                        setTouched((t) => ({ ...t, caption: true }));
                      }}
                      className={clsx(
                        "rounded-lg border p-3 text-left transition-colors",
                        captionPresetId === p.id
                          ? "border-brand-500 bg-brand-500/10"
                          : "border-ink-600 bg-ink-850 hover:border-ink-500",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="size-2.5 rounded-full"
                          style={{ background: p.activeColor }}
                          aria-hidden
                        />
                        <p className="text-[13px] font-semibold">{p.name}</p>
                      </div>
                      <p className="mt-1 text-[12px] leading-relaxed text-ink-400">
                        {p.description}
                      </p>
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Music bed">
                <div className="grid gap-2 sm:grid-cols-3">
                  {MUSIC_BEDS.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        setMusicBedId(m.id === "none" ? null : m.id);
                        setTouched((t) => ({ ...t, music: true }));
                      }}
                      className={clsx(
                        "rounded-lg border p-3 text-left transition-colors",
                        (musicBedId ?? "none") === m.id
                          ? "border-brand-500 bg-brand-500/10"
                          : "border-ink-600 bg-ink-850 hover:border-ink-500",
                      )}
                    >
                      <p className="text-[13px] font-semibold">{m.name}</p>
                      <p className="mt-0.5 text-[11px] text-ink-400">{m.mood}</p>
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <Field label="Primary aspect ratio">
                <div className="flex flex-wrap gap-2">
                  {(["16:9", "9:16", "1:1"] as AspectRatio[]).map((r) => (
                    <button
                      key={r}
                      onClick={() => setAspectRatio(r)}
                      className={clsx(
                        "flex items-center gap-2.5 rounded-lg border px-4 py-3 transition-colors",
                        aspectRatio === r
                          ? "border-brand-500 bg-brand-500/10"
                          : "border-ink-600 bg-ink-850 hover:border-ink-500",
                      )}
                    >
                      <span
                        className="rounded border border-ink-400 bg-ink-700"
                        style={{
                          width: r === "16:9" ? 32 : r === "9:16" ? 14 : 22,
                          height: r === "16:9" ? 18 : r === "9:16" ? 25 : 22,
                        }}
                        aria-hidden
                      />
                      <span className="text-left">
                        <span className="block text-[13px] font-medium">{r}</span>
                        <span className="block text-[11px] text-ink-400">
                          {r === "16:9" ? "YouTube" : r === "9:16" ? "Shorts / TikTok" : "Feed"}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </Field>

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-ink-600 bg-ink-850 p-3.5">
                <input
                  type="checkbox"
                  checked={alsoRenderShorts}
                  onChange={(e) => setAlsoRenderShorts(e.target.checked)}
                  className="mt-0.5 size-4 accent-[var(--color-brand-500)]"
                />
                <span>
                  <span className="block text-[13px] font-medium">
                    Also render the other aspect ratio
                  </span>
                  <span className="block text-[12px] text-ink-400">
                    One timeline, two exports — {aspectRatio === "9:16" ? "16:9 as well" : "9:16 as well"}.
                    Captions are re-laid out for each frame rather than scaled.
                  </span>
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-ink-600 bg-ink-850 p-3.5">
                <input
                  type="checkbox"
                  checked={burnCaptions}
                  onChange={(e) => setBurnCaptions(e.target.checked)}
                  className="mt-0.5 size-4 accent-[var(--color-brand-500)]"
                />
                <span>
                  <span className="block text-[13px] font-medium">Burn in captions</span>
                  <span className="block text-[12px] text-ink-400">
                    Strongly recommended for Shorts and TikTok, where most viewing is muted.
                  </span>
                </span>
              </label>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5">
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {[
                  ["Source", sourceType === "prompt" ? "Prompt" : "Pasted script"],
                  ["Style", `${style.name} · ${style.niche}`],
                  ["Voice", `${voice.name} · ${voice.accent}`],
                  ["Captions", burnCaptions ? CAPTION_PRESETS.find((p) => p.id === captionPresetId)!.name : "Off"],
                  ["Music", MUSIC_BEDS.find((m) => m.id === (musicBedId ?? "none"))!.name],
                  ["Format", alsoRenderShorts ? `${aspectRatio} + companion` : aspectRatio],
                  [
                    "Target length",
                    sourceType === "prompt"
                      ? `${targetSeconds}s`
                      : `~${Math.round((pastedWords / voice.wpm) * 60)}s`,
                  ],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-[11px] uppercase tracking-wide text-ink-500">{k}</dt>
                    <dd className="mt-0.5 text-[13px]">{v}</dd>
                  </div>
                ))}
              </dl>

              <div className="rounded-lg border border-ink-700 bg-ink-850 p-4">
                <p className="mb-2.5 text-[13px] font-medium">Estimated cost</p>
                <ul className="space-y-1.5">
                  {quote.lines.map((line) => (
                    <li key={line.operation + line.label} className="flex justify-between text-[13px]">
                      <span className="text-ink-400">{line.label}</span>
                      <span className="tabular-nums">{line.credits} cr</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex justify-between border-t border-ink-700 pt-3 text-sm font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums">{quote.totalCredits} credits</span>
                </div>
                <p className="mt-2 text-[12px] text-ink-500">
                  Charged step by step as you go, not up front. Anything that fails is refunded.
                </p>
              </div>

              {error && <Alert tone="bad">{error}</Alert>}
            </div>
          )}

          <div className="mt-7 flex items-center justify-between gap-3 border-t border-ink-800 pt-5">
            <Button
              variant="ghost"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
            >
              <ArrowLeft className="size-4" />
              Back
            </Button>

            {step < STEPS.length - 1 ? (
              <Button onClick={() => setStep((s) => s + 1)} disabled={!canAdvance}>
                Continue
                <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button onClick={() => void create()} loading={busy} size="lg">
                <Sparkles className="size-4" />
                Create and write the script
              </Button>
            )}
          </div>
        </div>

        <aside className="panel h-fit p-5 lg:sticky lg:top-6">
          <div
            className="mb-4 h-24 rounded-lg"
            style={{ background: `linear-gradient(130deg, ${style.palette.join(", ")})` }}
            aria-hidden
          />
          <h2 className="text-sm font-semibold">{style.name}</h2>
          <p className="mt-1 text-[12px] text-ink-400">{style.tagline}</p>

          <dl className="mt-4 space-y-2.5 border-t border-ink-800 pt-4 text-[12px]">
            {[
              ["Voice", `${voice.name} · ${voice.wpm} wpm`],
              ["Cut rhythm", `~${style.secondsPerScene}s per scene`],
              ["Transition", style.transition],
              ["Estimated credits", `${quote.totalCredits}`],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-ink-500">{k}</dt>
                <dd className="text-right text-ink-200">{v}</dd>
              </div>
            ))}
          </dl>

          <p className="mt-4 border-t border-ink-800 pt-4 text-[12px] leading-relaxed text-ink-500">
            {style.narrationDirection}
          </p>
        </aside>
      </div>
    </Page>
  );
}
