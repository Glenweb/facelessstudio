/**
 * Scene timing.
 *
 * Scene boundaries are derived from the narration's actual word timings, not
 * from an even division of the runtime. Each scene starts on the first word of
 * its own narration and ends where the next scene's first word begins, so a
 * cut always lands on a word boundary and the visuals stay locked to the read
 * even when a voice runs long on one sentence.
 */
import type { Scene } from "@/lib/db";
import type { WordTiming } from "@/lib/studio/types";

export interface SceneTiming {
  id: string;
  idx: number;
  startMs: number;
  endMs: number;
}

const normalise = (word: string): string => word.toLowerCase().replace(/[^a-z0-9']/g, "");

/**
 * Walk the global word list in order, consuming as many words as each scene's
 * narration contains.
 *
 * Matching is positional with a light token check rather than a full
 * alignment: the word list was synthesised *from* this narration, so the
 * sequences agree. The token check exists to detect drift (a provider that
 * expands "Dr." or splits a hyphenate) and resynchronise instead of silently
 * shifting every later scene.
 */
export function retimeScenes(
  scenes: Pick<Scene, "id" | "idx" | "narration">[],
  words: WordTiming[],
  totalDurationMs: number,
): SceneTiming[] {
  const ordered = [...scenes].sort((a, b) => a.idx - b.idx);
  const timings: SceneTiming[] = [];
  let cursor = 0;

  for (const scene of ordered) {
    const tokens = scene.narration.trim().split(/\s+/).filter(Boolean);
    const startIndex = Math.min(cursor, Math.max(0, words.length - 1));
    const start = words[startIndex]?.startMs ?? totalDurationMs;

    let consumed = tokens.length;
    // If the provider tokenised differently, resynchronise on the last word of
    // this scene rather than letting the offset accumulate down the timeline.
    const expectedLast = tokens.length > 0 ? normalise(tokens[tokens.length - 1]!) : "";
    if (expectedLast) {
      const probe = cursor + tokens.length - 1;
      if (normalise(words[probe]?.word ?? "") !== expectedLast) {
        for (let delta = 1; delta <= 4; delta++) {
          if (normalise(words[probe + delta]?.word ?? "") === expectedLast) {
            consumed = tokens.length + delta;
            break;
          }
          if (probe - delta >= cursor && normalise(words[probe - delta]?.word ?? "") === expectedLast) {
            consumed = tokens.length - delta;
            break;
          }
        }
      }
    }

    cursor = Math.min(cursor + Math.max(1, consumed), words.length);
    timings.push({ id: scene.id, idx: scene.idx, startMs: start, endMs: 0 });
  }

  // Each scene runs until the next one begins; the last runs to the end.
  for (let i = 0; i < timings.length; i++) {
    const next = timings[i + 1];
    timings[i]!.endMs = next ? next.startMs : totalDurationMs;
    // Guard against a zero- or negative-length slot, which would make FFmpeg
    // emit a scene with no frames and desynchronise everything after it.
    if (timings[i]!.endMs <= timings[i]!.startMs) {
      timings[i]!.endMs = timings[i]!.startMs + 400;
    }
  }

  return timings;
}
