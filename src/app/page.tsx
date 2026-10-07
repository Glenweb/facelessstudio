import Link from "next/link";
import { ArrowRight, Captions, Clapperboard, Download, Mic, Sparkles, Youtube } from "lucide-react";
import { CAPTION_PRESETS } from "@/lib/studio/captions";
import { CREDIT_PACKS, SIGNUP_CREDITS, quoteProject } from "@/lib/studio/pricing";
import { STYLE_TEMPLATES } from "@/lib/studio/styles";
import { VOICES } from "@/lib/studio/voices";

export const metadata = {
  title: "Faceless Video Studio — prompt to narrated video",
};

const STEPS = [
  {
    icon: Sparkles,
    title: "Start with a prompt or your script",
    body: "Type a topic and get a structured script with a hook, beats and a call to action. Or paste your own — we never rewrite your words, we just break them into scenes.",
  },
  {
    icon: Clapperboard,
    title: "Pick a niche, get a look",
    body: "Twelve style templates, each a complete preset: colour grade, art direction, caption style, cut rhythm and music bed. Pick one and the video belongs to that niche.",
  },
  {
    icon: Mic,
    title: "Choose a voice, edit the timeline",
    body: "Eight voices with distinct pacing. Every scene is re-timed against the real narration, so a cut always lands on a word — never on an estimate.",
  },
  {
    icon: Download,
    title: "Render long-form and Shorts together",
    body: "One job produces 1920×1080 and 1080×1920 from the same timeline, with captions reflowed for each frame. Download, or publish to YouTube with the disclosure handled.",
  },
];

/** A worked example, priced by the same code that bills a real render. */
const EXAMPLE = quoteProject({ seconds: 60, sceneCount: 10, variants: 2, includeScript: true });

export default function LandingPage() {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-ink-800/80 bg-ink-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-brand-500">
              <Sparkles className="size-4 text-white" />
            </span>
            <span className="font-semibold tracking-tight">Faceless Video Studio</span>
          </div>
          <nav className="flex items-center gap-1.5">
            <Link
              href="/login"
              className="rounded-lg px-3.5 py-2 text-sm text-ink-300 transition-colors hover:text-ink-100"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-400"
            >
              Start free
            </Link>
          </nav>
        </div>
      </header>

      <section className="aurora border-b border-ink-800">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:py-28">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-brand-500/35 bg-brand-500/10 px-3 py-1 text-[12px] font-medium text-brand-300">
            <Sparkles className="size-3.5" />
            {SIGNUP_CREDITS} free credits — enough for your first real video
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight sm:text-6xl">
            A prompt in.
            <br />
            A narrated faceless video out.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-300">
            Script, scenes, voiceover, captions, music and render — one pipeline, built for
            YouTubers, TikTok creators and marketers who publish on a schedule.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link
              href="/signup"
              className="inline-flex h-12 items-center gap-2 rounded-lg bg-brand-500 px-6 font-medium text-white transition-colors hover:bg-brand-400"
            >
              Make your first video
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/login"
              className="inline-flex h-12 items-center rounded-lg border border-ink-600 bg-ink-850 px-6 font-medium transition-colors hover:bg-ink-800"
            >
              I already have an account
            </Link>
          </div>

          <dl className="mt-14 grid max-w-3xl grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4">
            {[
              ["12", "niche style templates"],
              ["8", "narration voices"],
              ["6", "caption presets"],
              ["2", "aspect ratios per render"],
            ].map(([value, label]) => (
              <div key={label}>
                <dt className="text-3xl font-semibold tabular-nums">{value}</dt>
                <dd className="mt-1 text-[13px] text-ink-400">{label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="border-b border-ink-800">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">How it works</h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {STEPS.map(({ icon: Icon, title, body }, i) => (
              <div key={title} className="panel p-6">
                <div className="mb-4 flex items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-lg bg-brand-500/15 text-brand-300">
                    <Icon className="size-4.5" />
                  </span>
                  <span className="text-[12px] font-medium tabular-nums text-ink-500">
                    Step {i + 1}
                  </span>
                </div>
                <h3 className="text-base font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-400">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-ink-800 bg-ink-900/40">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Style templates, not filters
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-400">
            Each template sets the colour grade, art direction, caption preset, cut rhythm and
            music bed together. That is why the output looks like it belongs to a channel rather
            than to a tool.
          </p>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {STYLE_TEMPLATES.map((style) => (
              <article key={style.id} className="panel overflow-hidden">
                <div
                  className="h-20"
                  style={{
                    background: `linear-gradient(110deg, ${style.palette.join(", ")})`,
                  }}
                  aria-hidden
                />
                <div className="p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold">{style.name}</h3>
                    <span className="shrink-0 text-[11px] text-ink-500">{style.niche}</span>
                  </div>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-ink-400">{style.tagline}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-ink-800">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 lg:grid-cols-2">
          <div>
            <h2 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
              <Captions className="size-6 text-brand-300" />
              Captions that were designed, not generated
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-ink-400">
              Captions are rendered as ASS and burned in with libass, keyed to word-level timings
              from the voiceover. That means real outlines, per-word colour, and a highlight that
              lands on the syllable — not a sentence dumped on screen for four seconds.
            </p>
            <ul className="mt-6 space-y-2.5">
              {CAPTION_PRESETS.map((preset) => (
                <li key={preset.id} className="flex gap-3">
                  <span
                    className="mt-1.5 size-2 shrink-0 rounded-full"
                    style={{ background: preset.activeColor }}
                    aria-hidden
                  />
                  <div>
                    <p className="text-[13px] font-medium">{preset.name}</p>
                    <p className="text-[12px] leading-relaxed text-ink-500">{preset.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
              <Mic className="size-6 text-brand-300" />
              Voices with their own pacing
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-ink-400">
              Every voice has a real speaking rate, so the runtime you are quoted before you spend
              a credit is the runtime you get. Scenes are re-cut against the finished read.
            </p>
            <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
              {VOICES.map((voice) => (
                <div key={voice.id} className="panel p-3.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[13px] font-semibold">{voice.name}</p>
                    <span className="text-[11px] tabular-nums text-ink-500">{voice.wpm} wpm</span>
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-ink-500">
                    {voice.accent} · {voice.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-ink-800 bg-ink-900/40">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Pay for what you generate
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-400">
            Credits are metered per operation, so re-rolling three scene images costs three
            images and nothing else. A one-minute video with ten scenes, rendered in both aspect
            ratios, is about{" "}
            <strong className="font-semibold text-ink-200">
              {EXAMPLE.totalCredits} credits
            </strong>
            . You see the quote before you commit.
          </p>

          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {CREDIT_PACKS.map((pack) => (
              <div
                key={pack.id}
                className={
                  pack.highlight
                    ? "panel-raised relative p-6 ring-1 ring-brand-500/40"
                    : "panel p-6"
                }
              >
                {pack.highlight && (
                  <span className="absolute -top-2.5 left-6 rounded-full bg-brand-500 px-2.5 py-0.5 text-[11px] font-medium text-white">
                    Most popular
                  </span>
                )}
                <h3 className="text-sm font-semibold">{pack.name}</h3>
                <p className="mt-1 text-[13px] text-ink-400">{pack.blurb}</p>
                <p className="mt-5 text-3xl font-semibold tabular-nums">£{pack.priceGbp}</p>
                <p className="mt-1 text-[13px] text-ink-400">
                  {pack.credits.toLocaleString()} credits · ~{pack.approxMinutes} min of video
                </p>
                <ul className="mt-5 space-y-1.5 text-[13px] text-ink-300">
                  {pack.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <span className="text-good-400" aria-hidden>
                        ✓
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-6xl px-5 py-20 text-center">
          <h2 className="text-3xl font-semibold tracking-tight">
            Your first video costs nothing
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-ink-400">
            {SIGNUP_CREDITS} credits on signup. No card. Make something, download it, decide
            afterwards.
          </p>
          <Link
            href="/signup"
            className="mt-8 inline-flex h-12 items-center gap-2 rounded-lg bg-brand-500 px-7 font-medium text-white transition-colors hover:bg-brand-400"
          >
            Create your account
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-ink-800">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-7 text-[13px] text-ink-500">
          <p>© {new Date().getFullYear()} GMK Media Ltd</p>
          <p className="flex items-center gap-1.5">
            <Youtube className="size-4" />
            AI-generated uploads carry YouTube&rsquo;s synthetic-content disclosure automatically
          </p>
        </div>
      </footer>
    </div>
  );
}
