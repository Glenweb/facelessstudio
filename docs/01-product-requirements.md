# Faceless Video Studio — product requirements

**Owner:** GMK Media Ltd
**Status:** v1 built and running

## The problem

A faceless-video creator publishing on a schedule runs the same loop every
time: find an angle, write a script, source visuals, record narration, cut it
to the read, burn captions, export for two platforms, upload with the right
metadata. Each step is a different tool and the handoffs are where the time
goes. Most tooling in this category automates one step and leaves the seams.

## Who it is for

| Segment | What they need | What they will not tolerate |
| --- | --- | --- |
| YouTube long-form creators | 8–20 minute videos with a consistent channel look, SEO metadata, chaptered pacing | A tool that makes every video look like every other tool's output |
| Shorts / TikTok creators | Daily output, 9:16, captions that hold attention when muted | Captions timed by dividing the runtime; dead air; slow turnaround |
| Marketers and agencies | Brand-safe polish, repeatable templates, client-ready exports | Unclear licensing on music; surprise bills; no audit trail on spend |

## What v1 does

1. **Prompt or script in.** A topic produces a structured script with a hook,
   beats, a call to action and YouTube metadata. A pasted script is never
   rewritten — only broken into scenes and given metadata.
2. **Niche style templates.** Twelve presets, each setting colour grade, art
   direction, caption preset, Ken Burns amount, transition, cut rhythm and
   music bed together.
3. **Scene timeline.** Narration is grouped into scenes on sentence
   boundaries at the style's cut rhythm. Every scene is editable and its
   visual individually re-rollable.
4. **Voiceover with word timings.** Eight voices with distinct speaking
   rates. Scenes are re-timed against the finished audio, so a cut always
   lands on a word.
5. **Captions.** Six presets rendered as ASS and burned in by libass, with
   per-word karaoke highlighting keyed to those timings.
6. **Render.** One job, both aspect ratios, captions re-laid out per frame
   rather than scaled. Music sidechain-ducked under the narration and the mix
   normalised to −14 LUFS.
7. **Publish.** Download, or upload to YouTube with the synthetic-content
   disclosure set automatically.
8. **Credits.** Metered per operation, quoted before you commit, refunded on
   failure, itemised in a ledger.

## Explicitly out of scope for v1

- Multi-speaker dialogue and interview formats.
- Stock-footage libraries and b-roll search.
- Team accounts, seats and shared workspaces.
- Scheduled publishing and a content calendar.
- Auto-translation and multi-language dubs.

Each is a reasonable v2 candidate; none is needed for the core loop to pay.

## Success criteria

| Criterion | Target | Status |
| --- | --- | --- |
| Prompt to downloadable MP4 without leaving the app | Works end to end | Met — `npm run smoke` asserts it |
| Audio/video sync | Under 1 frame of drift | Met — 7 ms measured on a 41.6 s render |
| Delivery loudness | −14 LUFS, −1.5 dBTP | Met — measured −14.1 / −1.5 |
| Caption timing | Word-level, not sentence-level | Met — per-word ASS events |
| Both aspect ratios from one timeline | 1920×1080 and 1080×1920 | Met |
| Runs with no vendor keys | Full pipeline offline | Met — Local Studio mode |
| YouTube disclosure | Always set, not user-toggleable | Met |

## Operating principle: every key is optional

The product resolves each capability independently to a real vendor or a
local implementation. With an empty `.env` the whole pipeline still runs:
embedded Postgres, a local script engine, procedural scene art, an in-process
preview voice, and real FFmpeg encoding.

This is a product decision, not a development convenience. It means a new
engineer is productive in one command, the pipeline can be demonstrated with
no spend, and each vendor can be switched on independently when it earns its
cost. `npm run doctor` prints exactly which mode each capability is in, and
the UI says so too rather than quietly producing something worse.

## Risks

| Risk | Mitigation |
| --- | --- |
| A customer publishes AI content without disclosure and is penalised | `containsSyntheticMedia` is set on every upload and cannot be switched off |
| Music licensing claims against customer uploads | Beds are synthesised from parameters we own; no third-party sync licence exists to breach |
| The local script engine invents facts a customer publishes | It asserts none — every line is rhetorical scaffolding around the user's own topic, and the UI labels which engine wrote a draft |
| Image generation cost dominates unit economics | Scene count follows the style's cut rhythm; per-scene re-rolls are charged individually rather than regenerating a whole project |
| A render fails after the user was charged | Charges are refunded automatically by the worker and the refund appears in the ledger |
