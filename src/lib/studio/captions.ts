/**
 * Caption presets.
 *
 * Caption quality is one of the three axes this product is built to beat
 * vid.ai on. Every preset is rendered as ASS (Advanced SubStation) and burned
 * in by libass, which gives us per-word karaoke highlighting, real outlines
 * and shadows, and precise positioning — rather than the single-style,
 * sentence-level burn-in most faceless tools ship.
 */

export type CaptionAnimation =
  /** Each word lights up as it is spoken, previous words stay visible. */
  | "karaoke-highlight"
  /** Only the active word is on screen, centred — the TikTok "one word" look. */
  | "word-by-word"
  /** The active word scales up briefly as it lands. */
  | "pop"
  /** Whole line fades in, no per-word emphasis — documentary lower third. */
  | "line-fade";

export type CaptionPosition = "bottom" | "center" | "lower-third" | "top";

export interface CaptionPreset {
  id: string;
  name: string;
  description: string;
  /** Font family name as installed on the render node. */
  font: string;
  /** Font size at 1080p; scaled proportionally for other resolutions. */
  fontSizeAt1080: number;
  bold: boolean;
  uppercase: boolean;
  /** Primary text colour, #RRGGBB. */
  color: string;
  /** Colour of the word currently being spoken. */
  activeColor: string;
  outlineColor: string;
  outlineWidth: number;
  shadowDepth: number;
  /** Optional opaque box behind the text; null for none. */
  boxColor: string | null;
  position: CaptionPosition;
  /** Vertical margin from the anchored edge, at 1080p. */
  marginVAt1080: number;
  animation: CaptionAnimation;
  /** Max words per on-screen line group. Smaller = snappier, more "viral" feel. */
  maxWordsPerCue: number;
  /** Letter spacing in pixels. */
  spacing: number;
}

export const CAPTION_PRESETS: CaptionPreset[] = [
  {
    id: "viral-bold",
    name: "Viral Bold",
    description:
      "Huge uppercase block caps with a yellow active word and a heavy black outline. The highest-retention caption style on short-form.",
    font: "DejaVu Sans",
    fontSizeAt1080: 82,
    bold: true,
    uppercase: true,
    color: "#FFFFFF",
    activeColor: "#FFE11A",
    outlineColor: "#000000",
    outlineWidth: 7,
    shadowDepth: 3,
    boxColor: null,
    position: "center",
    marginVAt1080: 420,
    animation: "karaoke-highlight",
    maxWordsPerCue: 4,
    spacing: 1,
  },
  {
    id: "one-word-punch",
    name: "One-Word Punch",
    description:
      "A single word at a time, dead centre, scaling on the beat. Maximum attention density for TikTok and Reels.",
    font: "DejaVu Sans",
    fontSizeAt1080: 104,
    bold: true,
    uppercase: true,
    color: "#FFFFFF",
    activeColor: "#FFFFFF",
    outlineColor: "#000000",
    outlineWidth: 8,
    shadowDepth: 4,
    boxColor: null,
    position: "center",
    marginVAt1080: 460,
    animation: "word-by-word",
    maxWordsPerCue: 1,
    spacing: 2,
  },
  {
    id: "documentary-third",
    name: "Documentary Lower Third",
    description:
      "Restrained sentence-level captions in a lower third, fading per line. Reads as authored rather than auto-generated.",
    font: "DejaVu Serif",
    fontSizeAt1080: 46,
    bold: false,
    uppercase: false,
    color: "#F2EFE6",
    activeColor: "#F2EFE6",
    outlineColor: "#0A0A0A",
    outlineWidth: 3,
    shadowDepth: 2,
    boxColor: null,
    position: "lower-third",
    marginVAt1080: 110,
    animation: "line-fade",
    maxWordsPerCue: 12,
    spacing: 0,
  },
  {
    id: "clean-minimal",
    name: "Clean Minimal",
    description:
      "Mid-weight sans, soft shadow, no outline shout. Suits explainers and brand-safe business content.",
    font: "Liberation Sans",
    fontSizeAt1080: 54,
    bold: true,
    uppercase: false,
    color: "#FFFFFF",
    activeColor: "#7DD3FC",
    outlineColor: "#111111",
    outlineWidth: 2,
    shadowDepth: 3,
    boxColor: null,
    position: "bottom",
    marginVAt1080: 150,
    animation: "karaoke-highlight",
    maxWordsPerCue: 7,
    spacing: 0,
  },
  {
    id: "neon-pop",
    name: "Neon Pop",
    description:
      "Electric active word with a scale pop and a tight dark box. Built for tech, gaming and crypto niches.",
    font: "DejaVu Sans",
    fontSizeAt1080: 72,
    bold: true,
    uppercase: true,
    color: "#E8E8F0",
    activeColor: "#39FF88",
    outlineColor: "#07060E",
    outlineWidth: 5,
    shadowDepth: 0,
    boxColor: "#0B0A14",
    position: "center",
    marginVAt1080: 400,
    animation: "pop",
    maxWordsPerCue: 3,
    spacing: 1,
  },
  {
    id: "story-caption",
    name: "Story Caption",
    description:
      "Warm readable caps sized for Reddit-style narration, grouped tight so the eye never stalls.",
    font: "DejaVu Sans",
    fontSizeAt1080: 64,
    bold: true,
    uppercase: false,
    color: "#FFFFFF",
    activeColor: "#FFC46B",
    outlineColor: "#1A1208",
    outlineWidth: 6,
    shadowDepth: 2,
    boxColor: null,
    position: "center",
    marginVAt1080: 380,
    animation: "karaoke-highlight",
    maxWordsPerCue: 5,
    spacing: 0,
  },
];

export const captionPresetById = (id: string): CaptionPreset =>
  CAPTION_PRESETS.find((p) => p.id === id) ?? CAPTION_PRESETS[0]!;
