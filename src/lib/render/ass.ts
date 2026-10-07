/**
 * ASS (Advanced SubStation Alpha) caption generation.
 *
 * Captions are emitted as ASS and burned in by libass rather than drawn with
 * `drawtext`. That buys real outlines, shadows, per-word colour and scale
 * animation, and correct text shaping — the things that separate captions
 * that look authored from captions that look auto-generated.
 *
 * Rather than ASS karaoke (`\k`) tags, which can only transition secondary ->
 * primary colour and leave every sung word highlighted, this emits one
 * Dialogue event per word-state. That costs more events (libass handles tens
 * of thousands without complaint) and buys exact control: active-word-only
 * styles, scale pops, and per-preset behaviour all become expressible.
 */
import type { CaptionPreset } from "@/lib/studio/captions";
import type { CaptionCue, WordTiming } from "@/lib/studio/types";

export interface TitleCard {
  startMs: number;
  endMs: number;
  text: string;
}

export interface AssOptions {
  preset: CaptionPreset;
  width: number;
  height: number;
  /** Total video duration; the last cue is clamped to it. */
  durationMs: number;
  /**
   * Scene title cards.
   *
   * These go through libass rather than FFmpeg's `drawtext` because drawtext
   * neither measures nor wraps text — a title a few characters too long is
   * silently clipped at both frame edges. libass has the real font metrics.
   */
  titleCards?: TitleCard[];
  /** False renders title cards only, for projects with captions switched off. */
  includeCaptions?: boolean;
}

/** `#RRGGBB` -> ASS `&HAABBGGRR` (alpha 00 is fully opaque). */
export function assColour(hex: string, alpha = 0): string {
  const h = hex.replace("#", "");
  const r = h.slice(0, 2);
  const g = h.slice(2, 4);
  const b = h.slice(4, 6);
  return `&H${alpha.toString(16).padStart(2, "0").toUpperCase()}${b}${g}${r}`.toUpperCase();
}

/** Centisecond timestamps, `H:MM:SS.CC`, as the ASS spec requires. */
export function assTime(ms: number): string {
  const clamped = Math.max(0, ms);
  const cs = Math.round(clamped / 10);
  const h = Math.floor(cs / 360_000);
  const m = Math.floor((cs % 360_000) / 6_000);
  const s = Math.floor((cs % 6_000) / 100);
  const c = cs % 100;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(c).padStart(2, "0")}`;
}

/** Braces and backslashes are ASS override syntax and must not leak from text. */
export function escapeAssText(text: string): string {
  return text
    .replace(/\\/g, "\\​")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\r?\n/g, "\\N");
}

/**
 * Scale rules.
 *
 * Font size keys off width, against a 1920 reference in landscape and 1080 in
 * portrait, so 82px caps read the same on a Short as on a 16:9 upload. Vertical
 * margin keys off height, so a "centre" preset sits at a comparable fraction of
 * the frame in both orientations.
 */
function scales(width: number, height: number): { font: number; margin: number } {
  const portrait = height > width;
  return {
    font: width / (portrait ? 1080 : 1920),
    margin: height / 1080,
  };
}

/** ASS numpad alignment codes. */
const ALIGNMENT: Record<CaptionPreset["position"], number> = {
  bottom: 2,
  center: 2,
  "lower-third": 2,
  top: 8,
};

/**
 * Group word timings into on-screen cues.
 *
 * Breaks on sentence boundaries first and on the preset's word limit second,
 * so a cue never straddles a full stop — reading two half-sentences at once is
 * the most common reason auto-captions feel hard to follow.
 */
export function groupIntoCues(words: WordTiming[], maxWords: number): CaptionCue[] {
  const cues: CaptionCue[] = [];
  let current: WordTiming[] = [];

  const flush = (): void => {
    if (current.length === 0) return;
    cues.push({
      startMs: current[0]!.startMs,
      endMs: current[current.length - 1]!.endMs,
      text: current.map((w) => w.word).join(" "),
      words: [...current],
    });
    current = [];
  };

  for (const word of words) {
    current.push(word);
    const endsSentence = /[.!?]["')\]]?$/.test(word.word);
    if (endsSentence || current.length >= maxWords) flush();
  }
  flush();
  return cues;
}

function styleBlock(opts: AssOptions): string {
  const { preset, width, height } = opts;
  const s = scales(width, height);
  const fontSize = Math.round(preset.fontSizeAt1080 * s.font);
  const outline = Math.max(0, preset.outlineWidth * s.font).toFixed(1);
  const shadow = Math.max(0, preset.shadowDepth * s.font).toFixed(1);
  const marginV = Math.round(preset.marginVAt1080 * s.margin);
  const sideMargin = Math.round(width * 0.07);

  // BorderStyle 3 draws an opaque box behind the text; 1 is outline + shadow.
  const borderStyle = preset.boxColor ? 3 : 1;
  const backColour = preset.boxColor ? assColour(preset.boxColor, 0x30) : assColour("#000000", 0x80);

  // Title cards sit at the top, wrap inside the same side margins, and are
  // sized off the frame's short edge so they read the same in both ratios.
  const titleSize = Math.round((height > width ? width : height) * 0.058);
  const titleStyle = [
    "Style: Title",
    "DejaVu Sans",
    String(titleSize),
    assColour("#FFFFFF"),
    assColour("#FFFFFF"),
    assColour("#000000"),
    assColour("#000000", 0x80),
    "-1",
    "0,0,0,100,100,0,0,1",
    Math.max(2, titleSize / 14).toFixed(1),
    Math.max(1, titleSize / 26).toFixed(1),
    // 8 = top centre.
    "8",
    String(sideMargin),
    String(sideMargin),
    String(Math.round(height * 0.07)),
    "1",
  ].join(",");

  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "YCbCr Matrix: TV.709",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    titleStyle,
    [
      "Style: Caption",
      preset.font,
      String(fontSize),
      assColour(preset.color),
      assColour(preset.activeColor),
      assColour(preset.outlineColor),
      backColour,
      preset.bold ? "-1" : "0",
      "0",
      "0",
      "0",
      "100",
      "100",
      String(preset.spacing),
      "0",
      String(borderStyle),
      outline,
      shadow,
      String(ALIGNMENT[preset.position]),
      String(sideMargin),
      String(sideMargin),
      String(marginV),
      "1",
    ].join(","),
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ].join("\n");
}

const dialogue = (startMs: number, endMs: number, text: string, style = "Caption"): string =>
  `Dialogue: 0,${assTime(startMs)},${assTime(endMs)},${style},,0,0,0,,${text}`;

/**
 * Render cues to a complete ASS file.
 *
 * Each cue is expanded according to the preset's animation. Word-state events
 * are chained end-to-start so there is never a one-frame gap where the caption
 * disappears between words.
 */
export function buildAss(cues: CaptionCue[], opts: AssOptions): string {
  const { preset, durationMs } = opts;
  const lines: string[] = [styleBlock(opts)];
  const activeColour = assColour(preset.activeColor);
  const baseColour = assColour(preset.color);

  for (const card of opts.titleCards ?? []) {
    if (!card.text.trim()) continue;
    // Capped at 3.2s so a title card never competes with the captions.
    const end = Math.min(card.endMs, card.startMs + 3_200, durationMs);
    if (end <= card.startMs) continue;
    lines.push(
      dialogue(card.startMs, end, `{\\fad(380,380)}${escapeAssText(card.text)}`, "Title"),
    );
  }

  if (opts.includeCaptions === false) return `${lines.join("\n")}\n`;

  const render = (word: string): string =>
    escapeAssText(preset.uppercase ? word.toUpperCase() : word);

  for (const [cueIndex, cue] of cues.entries()) {
    const nextCueStart = cues[cueIndex + 1]?.startMs ?? durationMs;
    // Hold the cue until the next one starts (capped), so captions do not
    // flicker off during the pause between sentences.
    const cueEnd = Math.min(nextCueStart, cue.endMs + 420, durationMs);

    if (preset.animation === "line-fade") {
      lines.push(
        dialogue(cue.startMs, cueEnd, `{\\fad(140,140)}${render(cue.text)}`),
      );
      continue;
    }

    for (const [i, word] of cue.words.entries()) {
      const isLast = i === cue.words.length - 1;
      const start = word.startMs;
      const end = isLast ? cueEnd : cue.words[i + 1]!.startMs;
      if (end <= start) continue;

      if (preset.animation === "word-by-word") {
        lines.push(dialogue(start, end, `{\\c${activeColour}}${render(word.word)}`));
        continue;
      }

      const parts = cue.words.map((w, j) => {
        const text = render(w.word);
        if (j !== i) return `{\\c${baseColour}}${text}`;
        if (preset.animation === "pop") {
          // Scale up over 90ms and settle back — a beat, not a bounce.
          return `{\\c${activeColour}\\fscx118\\fscy118\\t(0,90,\\fscx100\\fscy100)}${text}`;
        }
        return `{\\c${activeColour}}${text}`;
      });

      lines.push(dialogue(start, end, parts.join(" ")));
    }
  }

  return `${lines.join("\n")}\n`;
}
