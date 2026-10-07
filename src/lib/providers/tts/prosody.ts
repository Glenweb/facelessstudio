/**
 * Prosody model.
 *
 * Shared by the local synthesiser and by the duration estimates shown in the
 * UI before any audio exists. It converts text into a timed sequence of words
 * using syllable count and punctuation, which tracks real narration pacing far
 * more closely than dividing total duration by word count.
 */

export interface TimedWord {
  word: string;
  /** Word text with punctuation stripped, for display. */
  clean: string;
  syllables: number;
  startMs: number;
  endMs: number;
  /** Silence following this word, in ms. */
  gapMs: number;
  /** True at the end of a sentence — drives pitch reset and caption breaks. */
  endsSentence: boolean;
  isQuestion: boolean;
}

/**
 * English syllable estimate. Vowel-group counting with the usual corrections:
 * silent terminal 'e', '-le' endings, and consecutive vowels as one nucleus.
 */
export function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length === 0) return 0;
  if (w.length <= 3) return 1;

  // "table", "little" — a consonant before a final -le gets its own syllable.
  // This has to be decided before the silent 'e' is stripped, and the 'e' has
  // to be stripped either way, or "people" counts its final 'e' as a nucleus
  // *and* takes the -le bonus, landing on three syllables instead of two.
  const consonantLe = /[^aeiouy]le$/.test(w);
  const trimmed = w.replace(/e$/, "").replace(/^y/, "") || w;

  // Up to three contiguous vowels form one nucleus: "beautiful" is beau-ti-ful,
  // not be-au-ti-ful. Syllabic consonants ("rhythm") still under-count by one,
  // which is a sub-300ms timing error on a rare word and not worth a lexicon.
  const groups = trimmed.match(/[aeiouy]{1,3}/g);
  let count = groups ? groups.length : 0;
  if (consonantLe) count += 1;
  return Math.max(1, count);
}

/** Tuned so a typical paragraph lands within a few percent of the voice's wpm. */
const SYLLABLE_RATE_FACTOR = 1.7;

const GAP_WORD_MS = 38;
const GAP_COMMA_MS = 170;
const GAP_SENTENCE_MS = 360;
const GAP_PARAGRAPH_MS = 520;

/**
 * Lay narration out on a timeline.
 *
 * `wpm` is the voice's natural rate; `speed` scales it. The syllable budget is
 * derived from the rate so a 150 wpm voice and a 180 wpm voice produce
 * genuinely different runtimes for the same script.
 */
export function layoutProsody(text: string, wpm: number, speed = 1): TimedWord[] {
  const effectiveWpm = Math.max(60, wpm * speed);
  // English averages ~1.4 syllables per word. The 1.7 divisor rather than 1.4
  // is deliberate: inter-word and punctuation gaps are added on top of the
  // syllable budget, so pricing syllables at the nominal rate would land the
  // finished read well under the voice's stated words per minute.
  const msPerSyllable = 60_000 / (effectiveWpm * SYLLABLE_RATE_FACTOR);

  const out: TimedWord[] = [];
  let cursor = 0;

  const paragraphs = text.split(/\n+/).filter((p) => p.trim().length > 0);

  paragraphs.forEach((paragraph, pIdx) => {
    const tokens = paragraph.trim().split(/\s+/).filter(Boolean);

    tokens.forEach((token, tIdx) => {
      const clean = token.replace(/[^\w''-]/g, "");
      if (clean.length === 0) return;

      const syllables = countSyllables(clean);
      const durationMs = Math.max(90, Math.round(syllables * msPerSyllable));

      const endsSentence = /[.!?]["')\]]?$/.test(token);
      const endsClause = /[,;:—–]["')\]]?$/.test(token);
      const isQuestion = /\?["')\]]?$/.test(token);
      const isLastInParagraph = tIdx === tokens.length - 1;
      const isLastOverall = isLastInParagraph && pIdx === paragraphs.length - 1;

      let gapMs = GAP_WORD_MS;
      if (endsSentence) gapMs = GAP_SENTENCE_MS;
      else if (endsClause) gapMs = GAP_COMMA_MS;
      if (isLastInParagraph) gapMs = Math.max(gapMs, GAP_PARAGRAPH_MS);
      // No trailing silence on the very last word; the render adds its own tail.
      if (isLastOverall) gapMs = 0;

      out.push({
        word: token,
        clean,
        syllables,
        startMs: cursor,
        endMs: cursor + durationMs,
        gapMs,
        endsSentence,
        isQuestion,
      });

      cursor += durationMs + gapMs;
    });
  });

  return out;
}

export const totalDurationMs = (words: TimedWord[]): number =>
  words.length === 0 ? 0 : words[words.length - 1]!.endMs;

/**
 * The runtime the UI shows.
 *
 * This is the same layout the synthesiser uses, so the estimate shown in the
 * wizard matches the finished video rather than approximating it.
 */
export const estimateDurationMs = (text: string, wpm: number, speed = 1): number =>
  totalDurationMs(layoutProsody(text, wpm, speed));
