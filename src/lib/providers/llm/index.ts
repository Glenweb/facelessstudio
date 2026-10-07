/**
 * Scripting and scene breakdown.
 *
 * `live` routes to Anthropic Claude with a forced tool call, so the response
 * is schema-valid JSON rather than prose we have to parse hopefully.
 * `local` runs a deterministic beat-structure writer — not a mock that
 * returns lorem ipsum, but a real generator that produces an editable script
 * with the correct arc, pacing and word count for the chosen style.
 */
import { modes } from "@/lib/env";
import type { SceneDraft, ScriptDraft } from "@/lib/studio/types";

export interface ScriptRequest {
  /** Topic prompt, or the user's pasted script when `sourceType` is "script". */
  input: string;
  sourceType: "prompt" | "script";
  styleId: string;
  targetSeconds: number;
  /** Words per minute of the chosen voice, used to hit the duration target. */
  wpm: number;
  audience?: string;
}

export interface BreakdownRequest {
  script: ScriptDraft;
  styleId: string;
  /** Target narration seconds per scene, from the style template. */
  secondsPerScene: number;
  wpm: number;
}

export interface LlmProvider {
  readonly kind: "anthropic" | "local";
  generateScript(req: ScriptRequest): Promise<ScriptDraft>;
  breakdownScenes(req: BreakdownRequest): Promise<SceneDraft[]>;
}

let cached: LlmProvider | undefined;

export async function llm(): Promise<LlmProvider> {
  if (cached) return cached;
  cached =
    modes.llm === "live"
      ? (await import("./anthropic")).createAnthropicProvider()
      : (await import("./local")).createLocalProvider();
  return cached;
}

/** Words needed to fill a duration at a given speaking rate. */
export const wordsForSeconds = (seconds: number, wpm: number): number =>
  Math.max(12, Math.round((seconds * wpm) / 60));

/** Inverse of the above — used everywhere we show an estimated runtime. */
export const secondsForWords = (words: number, wpm: number): number =>
  Math.round((words / wpm) * 60);
