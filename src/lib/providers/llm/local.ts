/**
 * Local script engine.
 *
 * This runs when no ANTHROPIC_API_KEY is present. It is a real generator, not
 * a stub: it builds a correct narrative arc (hook, frame, mechanism,
 * escalation, pivot, implication, payoff, call to action), hits the requested
 * word count for the chosen voice's speaking rate, and varies deterministically
 * from a seed so "regenerate" gives a genuinely different draft.
 *
 * It deliberately asserts no facts. Every line is rhetorical connective
 * tissue built around the user's own topic, because a creator may publish
 * whatever comes out of here and inventing statistics or dates for them would
 * be indefensible. With a Claude key present, the Anthropic provider writes
 * the researched version instead; the UI labels which engine produced a draft.
 */
import { styleById } from "@/lib/studio/styles";
import type { SceneDraft, ScriptDraft } from "@/lib/studio/types";
import type { BreakdownRequest, LlmProvider, ScriptRequest } from "./index";
import { secondsForWords, wordsForSeconds } from "./index";
import {
  countWords,
  hash32,
  keyPhrases,
  mulberry32,
  pick,
  shortLabel,
  splitSentences,
  titleCase,
} from "./text";

type Frames = Readonly<Record<string, readonly string[]>>;

/** `{t}` is the topic as a lower-case noun phrase; `{T}` is it capitalised. */
const FRAMES: Frames = {
  hook: [
    "Most people think they understand {t}. Almost nobody can explain how it actually works.",
    "There is a version of {t} you have heard, and a version almost nobody tells. This is the second one.",
    "{T} is the kind of thing that sounds simple right up until you look closely.",
    "Everything you are about to hear about {t} follows from one detail that is easy to miss.",
    "If you only remember one thing about {t}, make it the part most people skip.",
    "The strangest thing about {t} is how ordinary it looks from the outside.",
  ],
  frame: [
    "So start where it makes sense to start, rather than where the story is usually told from.",
    "To see it properly you have to set aside the summary and look at the structure underneath.",
    "Here is the shape of it, laid out in the order it actually happens.",
    "Hold two things in mind at once, and the rest of this will click into place.",
    "Forget the headline for a moment. The mechanism is the interesting part.",
  ],
  mechanism: [
    "The mechanism matters more than the outcome, because the mechanism is what repeats.",
    "What makes this work is not the result. It is the sequence that produces the result.",
    "Each step depends on the one before it, which is exactly why it is so easy to get wrong.",
    "The parts are not complicated. The order they go in is what does the work.",
    "Once you can name the moving pieces, the whole thing stops looking like luck.",
  ],
  escalate: [
    "That alone would be worth knowing. It is not where this stops.",
    "The next part is where it stops being a curiosity and starts being a pattern.",
    "And that is where the second layer opens up.",
    "Push on that a little harder and something less comfortable comes loose.",
    "Which raises a question nobody involved particularly wanted to answer.",
    "The further you follow it, the less accidental it looks.",
    "There is a reason this detail keeps surfacing, and it is not coincidence.",
    "Now hold that in place, because the next piece depends on it entirely.",
    "Follow it one step further and the scale changes completely.",
    "This is the point where most explanations quietly stop.",
  ],
  pivot: [
    "But here is the turn.",
    "And then the whole frame shifts.",
    "This is where the obvious reading breaks down.",
    "Except that is not quite what happens.",
    "Then comes the part that reorders everything above it.",
  ],
  implication: [
    "Which means the thing worth watching is not the outcome at all. It is the condition that made it possible.",
    "So the useful question is not what happened. It is what had to be true first.",
    "That changes what counts as evidence, and it changes what counts as a warning.",
    "Once you see it this way, you start noticing it in places it was never labelled.",
    "The implication is uncomfortable precisely because it generalises.",
  ],
  payoff: [
    "That is the whole of it, and it is simpler than the version you were given.",
    "Nothing here required special access. It only required looking in the right order.",
    "Which is why {t} is worth understanding properly rather than repeating loosely.",
    "And that is the part worth carrying out of this.",
    "Simple, once laid flat. Almost impossible to see from inside.",
  ],
  cta: [
    "If this changed how you see {t}, there is more where this came from.",
    "Follow for the next one, because this is part of a much longer pattern.",
    "Subscribe if you want the rest of this series. It gets stranger.",
    "There is a second half to this story. It is on the channel.",
    "Save this one. You will want it the next time {t} comes up.",
  ],
};

/** Style-flavoured opening lines, used in place of the generic hook. */
const STYLE_HOOKS: Record<string, readonly string[]> = {
  "dark-documentary": [
    "The file was closed. That is not the same as the question being answered.",
    "On paper, {t} is settled. The paperwork is the only part that is.",
  ],
  "stoic-discipline": [
    "You already know what to do about {t}. The problem has never been knowledge.",
    "Nobody is coming to make {t} easier. That is the good news.",
  ],
  "money-luxury": [
    "{T} is not complicated. It is just priced so that most people never look.",
    "The money in {t} is not where the attention is. It never is.",
  ],
  "cosmic-scale": [
    "Start with something you can hold. {T} will not stay that size for long.",
    "Scale is the only hard part of understanding {t}.",
  ],
  "lost-history": [
    "The record is thinner than it should be, and the gaps are where {t} lives.",
    "Someone wrote this down once. What survived is the argument, not the answer.",
  ],
  "tech-explainer": [
    "{T} gets described in metaphors. Here is the actual machinery.",
    "Strip the branding off {t} and what is left is a surprisingly small idea.",
  ],
  "night-horror": [
    "I have told this part before. I have never told what came after.",
    "It is easier to describe {t} in daylight. So I will start there.",
  ],
  "reddit-story": [
    "So this happened last week and I still cannot decide if I was the problem.",
    "I need to know whether I overreacted about {t}, because everyone I know is split.",
  ],
  "mind-psychology": [
    "You have done this. You almost certainly did it today.",
    "{T} has a name, and knowing the name does not make you immune.",
  ],
  "myth-legend": [
    "They told this story to explain something they could not otherwise name.",
    "Every version of {t} agrees on one detail. That detail is the story.",
  ],
  "health-protocol": [
    "{T} is well studied. It is also badly summarised almost everywhere.",
    "There is a mechanism here, a dose, and a caveat. In that order.",
  ],
  "case-study": [
    "The result is public. The decision that produced it is not.",
    "{T} looks like a growth story. It is a sequencing story.",
  ],
};

/** Reduce a prompt to a clean lower-case noun phrase. */
function topicPhrase(input: string): string {
  const first = splitSentences(input)[0] ?? input;
  let t = first
    .replace(/^\s*(make|create|write|do|give me|i want|build|produce)\s+(me\s+)?(a|an|the)?\s*/i, "")
    .replace(/\b(video|script|short|youtube short|tiktok|reel|voiceover)\b/gi, "")
    .replace(/^\s*(about|on|regarding|covering)\s+/i, "")
    .replace(/[.?!]+\s*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (t.length === 0) t = input.trim().slice(0, 80);
  // Keep it short enough to sit inside a sentence without reading as a run-on.
  const words = t.split(/\s+/);
  if (words.length > 12) t = words.slice(0, 12).join(" ");
  return t.charAt(0).toLowerCase() + t.slice(1);
}

const fill = (frame: string, topic: string): string =>
  frame
    .replace(/\{t\}/g, topic)
    .replace(/\{T\}/g, topic.charAt(0).toUpperCase() + topic.slice(1));

export function createLocalProvider(): LlmProvider {
  return {
    kind: "local",

    async generateScript(req: ScriptRequest): Promise<ScriptDraft> {
      const style = styleById(req.styleId);

      // A pasted script is the user's own copy. Never rewrite it — only
      // derive the metadata the pipeline needs.
      if (req.sourceType === "script") {
        const body = req.input.trim();
        const sentences = splitSentences(body);
        const words = countWords(body);
        const topic = topicPhrase(sentences[0] ?? body);
        return {
          title: titleCase(shortLabel(sentences[0] ?? body, 8) || topic),
          hook: sentences[0] ?? "",
          body,
          callToAction: "",
          seoTitle: titleCase(shortLabel(sentences[0] ?? body, 9) || topic),
          seoDescription: sentences.slice(0, 3).join(" ").slice(0, 300),
          tags: keyPhrases(body, 10),
          wordCount: words,
          estimatedSeconds: secondsForWords(words, req.wpm),
        };
      }

      const topic = topicPhrase(req.input);
      const seed = hash32(`${req.input}|${req.styleId}|${req.targetSeconds}|${Date.now() >> 14}`);
      const rng = mulberry32(seed);
      const targetWords = wordsForSeconds(req.targetSeconds, req.wpm);

      const styleHooks = STYLE_HOOKS[style.id];
      const hook = fill(
        styleHooks && rng() > 0.35 ? pick(rng, styleHooks) : pick(rng, FRAMES.hook!),
        topic,
      );

      const beats: string[] = [hook];
      const used = new Set<string>([hook]);

      const addBeat = (role: keyof typeof FRAMES): void => {
        const pool = FRAMES[role]!;
        for (let attempt = 0; attempt < 12; attempt++) {
          const line = fill(pick(rng, pool), topic);
          if (!used.has(line)) {
            used.add(line);
            beats.push(line);
            return;
          }
        }
        // The pool is exhausted. Forget this role's history and keep writing
        // rather than silently stalling — which is what capped long-form
        // scripts at roughly two minutes regardless of the target.
        for (const line of pool) used.delete(fill(line, topic));
        const line = fill(pick(rng, pool), topic);
        used.add(line);
        beats.push(line);
      };

      // The closing beats are the ones that cannot be cut without the script
      // stopping mid-thought, so they are reserved first and the arc is
      // trimmed from the middle outwards. Without this a 20-second target
      // still produced a 40-second script, because the full arc has a floor.
      const closing: ("pivot" | "implication" | "payoff")[] =
        targetWords < 70 ? ["payoff"] : targetWords < 110 ? ["pivot", "payoff"] : ["pivot", "implication", "payoff"];
      const reserve = closing.length * 18 + 16;

      if (targetWords >= 60) addBeat("frame");
      if (targetWords >= 90) addBeat("mechanism");

      // Fill the middle with escalation until the word budget is nearly spent.
      let guard = 0;
      while (countWords(beats.join(" ")) < targetWords - reserve && guard++ < 240) {
        addBeat("escalate");
        if (guard % 3 === 0) addBeat("mechanism");
      }

      for (const beat of closing) addBeat(beat);

      const cta = fill(pick(rng, FRAMES.cta!), topic);
      const body = beats.join("\n");
      const full = `${body}\n${cta}`;
      const words = countWords(full);
      const title = titleCase(topic);

      return {
        title: title.length > 70 ? `${title.slice(0, 67)}…` : title,
        hook,
        body,
        callToAction: cta,
        seoTitle: `${title} — ${style.name}`.slice(0, 95),
        seoDescription:
          `${hook} ${beats[1] ?? ""}`.trim().slice(0, 300) +
          `\n\nStyle: ${style.name} (${style.niche}). Made with Faceless Video Studio.`,
        tags: Array.from(new Set([...keyPhrases(`${topic} ${body}`, 8), style.id, style.niche])),
        wordCount: words,
        estimatedSeconds: secondsForWords(words, req.wpm),
      };
    },

    async breakdownScenes(req: BreakdownRequest): Promise<SceneDraft[]> {
      return planScenes(req);
    },
  };
}

/**
 * Scene planner.
 *
 * Shared by both providers: even when Claude writes the script, this is what
 * groups narration into scenes, because grouping must respect the *voice's*
 * speaking rate and the *style's* cut rhythm — facts the model does not have
 * and should not be asked to guess.
 */
export function planScenes(req: BreakdownRequest): SceneDraft[] {
  const style = styleById(req.styleId);
  const narration = [req.script.body, req.script.callToAction]
    .filter((s) => s && s.trim().length > 0)
    .join("\n");

  const sentences = splitSentences(narration);
  if (sentences.length === 0) return [];

  const wordsPerScene = Math.max(8, wordsForSeconds(req.secondsPerScene, req.wpm));
  const groups: string[][] = [];
  let current: string[] = [];
  let currentWords = 0;

  for (const sentence of sentences) {
    const w = countWords(sentence);
    // Start a new scene when adding this sentence would overshoot the target
    // by more than half a sentence — keeps cut rhythm even, never mid-sentence.
    if (current.length > 0 && currentWords + w > wordsPerScene * 1.35) {
      groups.push(current);
      current = [sentence];
      currentWords = w;
    } else {
      current.push(sentence);
      currentWords += w;
    }
  }
  if (current.length > 0) groups.push(current);

  const motions: ReadonlyArray<NonNullable<SceneDraft["motion"]>> = [
    "in",
    "out",
    "left",
    "in",
    "right",
    "out",
  ];

  return groups.map((group, i) => {
    const narrationText = group.join(" ");
    const phrases = keyPhrases(narrationText, 5);
    const subject = phrases.length > 0 ? phrases.join(", ") : keyPhrases(req.script.title, 4).join(", ");

    return {
      index: i,
      narration: narrationText,
      // Only the opening scene carries a title card by default; a caption
      // track plus a title card on every scene is visual noise.
      onScreenText: i === 0 ? shortLabel(req.script.title, 4).slice(0, 34) : undefined,
      visualPrompt: `${subject || req.script.title}. ${style.artDirection}`,
      shot: `Scene ${i + 1} of ${groups.length} — ${style.name}`,
      motion: motions[i % motions.length],
    };
  });
}
