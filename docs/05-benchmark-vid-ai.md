# Competitive benchmark

The brief names **vid.ai** as the benchmark to beat on three axes: render
cost per minute, caption quality, and niche style templates. This document
records where we actually stand, measured rather than asserted.

## A note on competitor figures

**We could not verify vid.ai's current pricing, caption implementation or
template catalogue.** Nothing here should be repeated as a claim about vid.ai
specifically until someone has checked their live pricing page and signed up
for a trial.

What follows is therefore: our own measured position, and the observable
pricing pattern of named comparable tools in the category, cited. Use the
second as a sanity check on the first, not as a stand-in for the competitor
we were actually asked about.

Comparable tools, from their own published pricing:

| Tool | Published pricing shape |
| --- | --- |
| Syllaby | 13 credits per 1-minute faceless video, billed in whole minutes — a 5:13 video bills as 6 minutes |
| GoFaceless | AI videos 200 credits each; Starter 200 credits/month, Pro 1,000, Business 3,000 |
| Videnly | Starter $29/month for 3,000 credits, quoted as 30–60 videos |
| VidRush | Starter $99/month for 2,000 credits, up to Studio at $4,990/month |

Two patterns are worth noting. Several price per *whole minute*, so a
13-second overrun bills as a full extra minute. And several price per
*video* regardless of what the video needed, so a re-roll of one bad image
costs the same as generating everything.

## Axis 1 — render cost per minute

### What we measure

All figures from this repository on a 4-core container, 1080p output,
`libx264 -preset veryfast -crf 20`:

| Measurement | Value |
| --- | --- |
| Full render graph (Ken Burns, transitions, ASS captions, ducking, loudnorm) | **1.15× realtime wall clock** |
| H.264 encode alone, same source | 0.28× realtime |
| Peak resident memory | 400 MB |
| CPU saturation during encode | ~3 cores |

Filtering, not encoding, dominates: the 2× supersample that keeps Ken Burns
free of integer stepping costs roughly 4× the plain encode. That is a known
lever if throughput ever matters more than motion smoothness.

### Compute cost

At Railway's on-demand rates ($0.000463/vCPU-minute, $0.000231/GB-minute) on
a 2 vCPU / 2 GB container:

> **£0.0013 per finished minute of video.**

This is the number the brief asks about, and it is close to a rounding error.
It is low for a structural reason, not a clever one: the pipeline is CPU-only
FFmpeg in a single pass with no intermediate files. Any competitor running
diffusion-based video generation on GPUs is paying two to three orders of
magnitude more for the same minute, and no amount of optimisation closes that
gap in our favour or theirs — it is a different product decision.

### Total cost per minute

Render compute is not the interesting line. Here is a full one-minute video
with ten scenes, exported in both aspect ratios, priced by the same code that
bills a real render (`src/lib/studio/pricing.ts`):

| Line | Credits | Our vendor cost |
| --- | --- | --- |
| Script + scene breakdown (Claude) | 15 | £0.030 |
| 10 scene visuals (Gemini) | 60 | £0.280 |
| Voiceover, 60 s (ElevenLabs) | 24 | £0.120 |
| Render, 2 variants (FFmpeg + R2) | 30 | £0.007 |
| **Total** | **129** | **£0.437** |

At the blended credit price across our three packs (£0.00717/credit) that
minute sells for **£0.93**, a **53% gross margin**.

**Image generation is 64% of cost. Render is 1.5%.** Any serious work on
unit economics belongs in scene count and image reuse, not in the encoder.
The levers that exist today:

- Scene count follows the style's cut rhythm rather than a fixed cadence, so
  a documentary style at 7.5 s per scene costs 40% fewer images per minute
  than a story style at 4 s.
- Re-rolls are charged per scene. Fixing one bad frame costs 6 credits, not a
  regeneration of the project.
- Both aspect ratios come from one timeline and one set of images. The second
  export costs render compute only — about £0.003.

### Where we beat the pattern

| | Category pattern | Faceless Video Studio |
| --- | --- | --- |
| Billing granularity | Per whole minute, or per video | Per operation, per second |
| A 5:13 video | Bills as 6:00 | Bills as 5:13 |
| Re-rolling one image | Often a full regeneration | 6 credits |
| Failed generation | Usually consumed | Refunded automatically, visible in the ledger |
| Cost visibility | After the fact | Quoted in the wizard before you commit |

## Axis 2 — caption quality

Most tools in this category burn one caption style with sentence-level
timing. Ours:

| | Typical | Ours |
| --- | --- | --- |
| Timing source | Runtime divided by word count | Word-level timings from the voiceover itself — measured character alignment from ElevenLabs, exact by construction locally |
| Renderer | FFmpeg `drawtext` | ASS through libass |
| Highlighting | None, or whole-line | Per-word, with four animation modes |
| Line breaking | Fixed word count | Sentence boundaries first, word limit second — a cue never straddles a full stop |
| Vertical vs horizontal | Scaled | Re-laid out: font size keys off frame width, margins off height |
| Presets | One | Six, each paired to styles |

The implementation choice that buys this: rather than ASS karaoke (`\k`)
tags, which can only move secondary colour to primary and leave every sung
word highlighted, the generator emits **one Dialogue event per word-state**.
That costs more events — libass handles tens of thousands without complaint —
and buys exact control, including active-word-only styles and scale pops.

Measured sync on a 41.6-second render: **7 ms drift**, under a quarter of a
frame at 30 fps.

## Axis 3 — niche style templates

Twelve templates, each a *complete* preset rather than a colour filter:
colour grade, art direction and negative direction, palette, caption preset,
Ken Burns amount, transition, music bed, and seconds per scene.

| Niche | Template |
| --- | --- |
| True crime / unsolved | Dark Documentary |
| Stoicism / self-mastery | Stoic Discipline |
| Wealth / business lifestyle | Money & Luxury |
| Space / science | Cosmic Scale |
| History / ancient mysteries | Lost History |
| Technology / AI | Tech Explainer |
| Horror / creepypasta | Night Horror |
| Story time / AITA | Reddit Story |
| Psychology | Mind & Psychology |
| Mythology / folklore | Myth & Legend |
| Health / fitness | Health Protocol |
| Marketing / business breakdowns | Business Case Study |

The differentiating detail is that a template also sets **narration
direction** and **cut rhythm**. Picking Dark Documentary does not just grade
the picture blue; it tells the script writer to be measured and factual, cuts
at 7.5 seconds instead of 4, and pairs a documentary lower-third caption with
a tension drone. That is why output reads as belonging to a channel rather
than to a tool.

## Honest weaknesses

| Weakness | Reality |
| --- | --- |
| Local scene art is abstract | The procedural generator makes style-matched colour fields, not photographic scenes. It is genuinely good as a backdrop under captions and genuinely not a substitute for Gemini. Add the key for real visuals. |
| Local voice is a preview | It is speech-shaped and the timings are exact, but nobody will publish with it. It exists so the pipeline is fully testable with no vendor account. |
| No stock footage or b-roll | Every visual is a generated still with Ken Burns motion. Tools with footage libraries will win on certain formats. |
| Long-form on the local script engine repeats | Past roughly three minutes the beat pool cycles. With a Claude key this does not arise. |
| No team accounts | Single-user only in v1. |

## What to verify before any public claim

1. vid.ai's live pricing, per-minute and per-credit.
2. Whether vid.ai's captions are word-timed, and how many presets they ship.
3. Their template count and whether templates set narration direction or only visuals.
4. Their render turnaround for a 10-minute video, measured end to end.

Sources for the comparable-tool figures:
[Syllaby credit charging](https://syllaby.featurebase.app/help/articles/1073755-how-are-credits-charged),
[GoFaceless pricing](https://www.gofaceless.ai/da/pricing),
[Videnly](https://www.mybesh.com/tool/videnly),
[VidRush pricing](https://dev.docs.vidrush.ai/docs/pricing-overview).
