/** Small text utilities shared by both LLM providers and the scene planner. */

const STOPWORDS = new Set(
  `a an the and or but if then than that this these those of in on at to for from with without
   by as is are was were be been being it its it's he she they them his her their you your i we
   our us my me do does did doing have has had having not no nor so too very can will just don't
   should now what which who whom when where why how all any both each few more most other some
   such only own same s t d ll m o re ve y about into over under again further once here there
   because while during before after above below between through up down out off`
    .split(/\s+/)
    .filter(Boolean),
);

/** Sentence splitter that tolerates common abbreviations and decimals. */
export function splitSentences(text: string): string[] {
  const protectedText = text
    .replace(/\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|e\.g|i\.e|No|Inc|Ltd|Co)\./g, "$1<DOT>")
    .replace(/(\d)\.(\d)/g, "$1<DOT>$2");

  return protectedText
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'“‘])|\n+/)
    .map((s) => s.replace(/<DOT>/g, ".").trim())
    .filter((s) => s.length > 0);
}

export const countWords = (text: string): number =>
  text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;

/**
 * Salient phrase extraction for visual prompts.
 *
 * Deliberately simple and deterministic: drop stopwords, keep the longest
 * distinctive terms in their original order. On narration sentences this
 * reliably yields the concrete nouns an image model needs, and it costs
 * nothing per scene.
 */
export function keyPhrases(text: string, limit = 6): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.toLowerCase().match(/[a-z][a-z'’-]{2,}/g) ?? []) {
    const w = raw.replace(/['’]s$/, "");
    if (STOPWORDS.has(w) || seen.has(w) || w.length < 4) continue;
    seen.add(w);
    out.push(w);
  }
  return out.sort((a, b) => b.length - a.length).slice(0, limit);
}

/** A short on-screen title: first few content words, title-cased. */
export function shortLabel(text: string, maxWords = 4): string {
  const words = text
    .replace(/[^\w\s'-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0 && !STOPWORDS.has(w.toLowerCase()));
  return words
    .slice(0, maxWords)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Title-case a topic for use as a video title. */
export function titleCase(text: string): string {
  const small = new Set(["a", "an", "the", "and", "or", "of", "in", "on", "to", "for", "with", "at", "by", "from", "is"]);
  return text
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((w, i) =>
      i > 0 && small.has(w.toLowerCase())
        ? w.toLowerCase()
        : w.charAt(0).toUpperCase() + w.slice(1),
    )
    .join(" ");
}

/** Deterministic 32-bit hash, so "regenerate" is reproducible from a seed. */
export function hash32(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Seeded PRNG — same seed, same script, which makes bugs reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = <T>(rng: () => number, arr: readonly T[]): T =>
  arr[Math.floor(rng() * arr.length) % arr.length]!;
