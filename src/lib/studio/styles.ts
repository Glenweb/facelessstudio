/**
 * Niche style templates.
 *
 * A style template is a complete creative preset: colour grade, procedural
 * art palette, image-model art direction, caption preset, Ken Burns motion,
 * music bed and narration pacing. Picking one should make a video look like
 * it belongs to an established channel in that niche — not like generic
 * stock footage with subtitles stapled on.
 */
import type { AspectRatio } from "./types";

export type TransitionKind = "fade" | "dissolve" | "slideleft" | "wipeup" | "cut";

export interface StyleTemplate {
  id: string;
  name: string;
  niche: string;
  tagline: string;
  /** Narration voice direction fed to the script writer. */
  narrationDirection: string;
  /** Art direction appended to every scene's image prompt. */
  artDirection: string;
  /** Negative art direction, used by image models that accept it. */
  artAvoid: string;
  /** 3–5 hex colours driving the procedural art and UI swatch. */
  palette: string[];
  captionPresetId: string;
  musicBedId: string;
  transition: TransitionKind;
  /** Ken Burns zoom amount per scene, 0 = static. 0.06 is a gentle drift. */
  kenBurns: number;
  grade: {
    /** FFmpeg eq contrast, 1 = untouched. */
    contrast: number;
    saturation: number;
    brightness: number;
    /** 0–1 vignette strength. */
    vignette: number;
    /** Film grain strength, 0 = clean. */
    grain: number;
  };
  /** Target seconds of narration per scene — controls cut rhythm. */
  secondsPerScene: number;
  /** Which aspect ratios this style is tuned for; first is the default. */
  bestFor: AspectRatio[];
}

export const STYLE_TEMPLATES: StyleTemplate[] = [
  {
    id: "dark-documentary",
    name: "Dark Documentary",
    niche: "True crime / unsolved",
    tagline: "Cold, archival and deliberate. The look that holds a 20-minute watch time.",
    narrationDirection:
      "Measured, factual and restrained. Short declarative sentences. Never sensationalise; let the detail carry the dread. Open on an unanswered question.",
    artDirection:
      "desaturated cinematic still, archival documentary photography, cold blue-grey light, heavy shadow, 35mm film grain, shallow depth of field, no people facing camera",
    artAvoid: "bright colours, cartoon, text, watermark, smiling faces",
    palette: ["#0B1016", "#1C2A36", "#36566B", "#8FA6B5", "#D7DEE3"],
    captionPresetId: "documentary-third",
    musicBedId: "tension-drone",
    transition: "dissolve",
    kenBurns: 0.05,
    grade: { contrast: 1.12, saturation: 0.72, brightness: -0.03, vignette: 0.45, grain: 8 },
    secondsPerScene: 7.5,
    bestFor: ["16:9", "9:16"],
  },
  {
    id: "stoic-discipline",
    name: "Stoic Discipline",
    niche: "Stoicism / self-mastery",
    tagline: "Marble, dusk and consequence. Built for the discipline and mindset shelf.",
    narrationDirection:
      "Second person, imperative, unsentimental. One idea per beat. Address the viewer directly as though they already know you are right.",
    artDirection:
      "classical marble statue, chiaroscuro lighting, dust in a shaft of light, muted bronze and stone tones, monumental scale, painterly cinematic still",
    artAvoid: "modern clothing, logos, text, neon",
    palette: ["#0E0C0A", "#2B241C", "#6B5744", "#B9A087", "#EDE4D7"],
    captionPresetId: "viral-bold",
    musicBedId: "epic-swell",
    transition: "fade",
    kenBurns: 0.07,
    grade: { contrast: 1.18, saturation: 0.85, brightness: -0.02, vignette: 0.5, grain: 5 },
    secondsPerScene: 5.5,
    bestFor: ["9:16", "16:9"],
  },
  {
    id: "money-luxury",
    name: "Money & Luxury",
    niche: "Wealth / business lifestyle",
    tagline: "Black glass, gold light, slow money. The aspirational finance aesthetic.",
    narrationDirection:
      "Confident and concrete. Use real numbers and mechanisms, never vague hype. Earn the aspiration with specifics.",
    artDirection:
      "luxury editorial photography, black and gold palette, glass skyscraper at golden hour, shallow depth of field, premium product lighting, cinematic anamorphic still",
    artAvoid: "clutter, cheap stock look, text, cartoon",
    palette: ["#07070A", "#16161F", "#3A2E12", "#C8A028", "#F3E6C0"],
    captionPresetId: "viral-bold",
    musicBedId: "lo-fi-flex",
    transition: "slideleft",
    kenBurns: 0.08,
    grade: { contrast: 1.15, saturation: 1.08, brightness: 0.0, vignette: 0.38, grain: 3 },
    secondsPerScene: 5.0,
    bestFor: ["9:16", "16:9"],
  },
  {
    id: "cosmic-scale",
    name: "Cosmic Scale",
    niche: "Space / science facts",
    tagline: "Deep field blues and impossible distances. Evergreen, highly shareable.",
    narrationDirection:
      "Awe through precision. Anchor every number to something the viewer can feel. Build scale step by step, each beat larger than the last.",
    artDirection:
      "astrophotography, deep space nebula, planetary surface at terminator line, volumetric starlight, ultra wide cinematic composition, scientific visualisation",
    artAvoid: "spaceships, people, text, cartoon, lens flare overload",
    palette: ["#03040C", "#0B1540", "#2447A8", "#5FA8F5", "#CFE4FF"],
    captionPresetId: "clean-minimal",
    musicBedId: "ambient-wonder",
    transition: "dissolve",
    kenBurns: 0.06,
    grade: { contrast: 1.1, saturation: 1.15, brightness: 0.01, vignette: 0.4, grain: 4 },
    secondsPerScene: 7.0,
    bestFor: ["16:9", "9:16"],
  },
  {
    id: "lost-history",
    name: "Lost History",
    niche: "History / ancient mysteries",
    tagline: "Sepia maps and eroded stone. The long-form history channel look.",
    narrationDirection:
      "Narrate as a historian with a thesis. Name places, dates and sources. Let one unresolved detail run through the whole piece.",
    artDirection:
      "aged parchment texture, ancient stone ruin at dawn, sepia and ochre palette, archaeological photography, soft directional sunlight, weathered detail",
    artAvoid: "modern objects, bright saturation, text, cartoon",
    palette: ["#140F08", "#3A2A16", "#7A5B2E", "#C2A169", "#F0E3C8"],
    captionPresetId: "documentary-third",
    musicBedId: "epic-swell",
    transition: "fade",
    kenBurns: 0.055,
    grade: { contrast: 1.08, saturation: 0.82, brightness: -0.01, vignette: 0.42, grain: 10 },
    secondsPerScene: 8.0,
    bestFor: ["16:9"],
  },
  {
    id: "tech-explainer",
    name: "Tech Explainer",
    niche: "Technology / AI",
    tagline: "Dark UI, neon accents, schematic clarity. For teaching how a thing works.",
    narrationDirection:
      "Explain the mechanism, not the vibe. One concept per scene, each building on the last. Use a concrete analogy exactly once.",
    artDirection:
      "dark technical illustration, isometric schematic, neon cyan and green accents on near-black, circuit and data-flow motifs, clean studio product render",
    artAvoid: "stock photo people, handshakes, text, clutter",
    palette: ["#05060A", "#0C1222", "#123C4A", "#20E6A0", "#9BF7DC"],
    captionPresetId: "neon-pop",
    musicBedId: "pulse-tech",
    transition: "wipeup",
    kenBurns: 0.04,
    grade: { contrast: 1.14, saturation: 1.12, brightness: 0.0, vignette: 0.3, grain: 2 },
    secondsPerScene: 6.0,
    bestFor: ["16:9", "9:16"],
  },
  {
    id: "night-horror",
    name: "Night Horror",
    niche: "Horror / creepypasta",
    tagline: "Fog, sodium light and negative space. Retention through dread.",
    narrationDirection:
      "First person, present tense, plain language. Withhold. Describe only what the narrator can actually see or hear.",
    artDirection:
      "nighttime horror photography, dense fog, single sodium streetlight, deep blacks, empty suburban street, unsettling negative space, grainy 35mm",
    artAvoid: "gore, monsters in frame, bright light, text, cartoon",
    palette: ["#05060A", "#121524", "#2A2140", "#6B4E2E", "#C9B48E"],
    captionPresetId: "story-caption",
    musicBedId: "tension-drone",
    transition: "dissolve",
    kenBurns: 0.065,
    grade: { contrast: 1.22, saturation: 0.68, brightness: -0.06, vignette: 0.6, grain: 14 },
    secondsPerScene: 6.5,
    bestFor: ["9:16", "16:9"],
  },
  {
    id: "reddit-story",
    name: "Reddit Story",
    niche: "Story time / AITA",
    tagline: "Fast cuts, warm captions, zero dead air. Pure short-form completion rate.",
    narrationDirection:
      "Conversational first person. Start mid-conflict with no preamble. Short sentences, concrete stakes, a turn every few beats.",
    artDirection:
      "warm candid lifestyle photograph, soft window light, domestic interior, shallow depth of field, natural colour, no faces visible",
    artAvoid: "studio look, text, logos, cartoon",
    palette: ["#15100C", "#3A2A1E", "#7E5A3C", "#D79A5B", "#FBE7CB"],
    captionPresetId: "story-caption",
    musicBedId: "lo-fi-flex",
    transition: "cut",
    kenBurns: 0.09,
    grade: { contrast: 1.06, saturation: 1.06, brightness: 0.02, vignette: 0.25, grain: 3 },
    secondsPerScene: 4.0,
    bestFor: ["9:16"],
  },
  {
    id: "mind-psychology",
    name: "Mind & Psychology",
    niche: "Psychology / human behaviour",
    tagline: "Soft gradients and quiet symbolism. High save-rate explainer look.",
    narrationDirection:
      "Name the effect, then show it with one everyday example the viewer will recognise in themselves. Finish on the implication, not a summary.",
    artDirection:
      "minimal conceptual photography, soft gradient backdrop, single symbolic object, muted violet and sand palette, gentle studio light, abundant negative space",
    artAvoid: "busy composition, faces, text, neon",
    palette: ["#0C0A12", "#211A2E", "#4C3F63", "#9C8FB5", "#E6DFEC"],
    captionPresetId: "clean-minimal",
    musicBedId: "ambient-wonder",
    transition: "fade",
    kenBurns: 0.05,
    grade: { contrast: 1.06, saturation: 0.95, brightness: 0.01, vignette: 0.3, grain: 3 },
    secondsPerScene: 6.5,
    bestFor: ["9:16", "16:9"],
  },
  {
    id: "myth-legend",
    name: "Myth & Legend",
    niche: "Mythology / folklore",
    tagline: "Painted light and ritual colour. Episodic, bingeable mythology.",
    narrationDirection:
      "Narrate like an oral storyteller. Rhythm and repetition are allowed. Keep proper nouns few and repeat them so they land.",
    artDirection:
      "oil painting style, dramatic baroque lighting, mythological landscape, deep crimson and gold, painterly brushwork, museum reproduction quality",
    artAvoid: "photographic realism, modern items, text, cartoon",
    palette: ["#120609", "#38101A", "#7A2232", "#C98B3E", "#F2DCB0"],
    captionPresetId: "viral-bold",
    musicBedId: "epic-swell",
    transition: "dissolve",
    kenBurns: 0.07,
    grade: { contrast: 1.16, saturation: 1.1, brightness: -0.01, vignette: 0.48, grain: 7 },
    secondsPerScene: 7.0,
    bestFor: ["16:9", "9:16"],
  },
  {
    id: "health-protocol",
    name: "Health Protocol",
    niche: "Health / fitness",
    tagline: "Clinical calm with a hard edge. Protocol-style authority content.",
    narrationDirection:
      "Evidence-first and specific. Give the mechanism, the dose and the caveat. No hedging, no miracle framing.",
    artDirection:
      "clean clinical photography, cool white and teal palette, anatomical detail, crisp studio lighting, scientific equipment macro, minimal composition",
    artAvoid: "before-after bodies, text, cartoon, dark mood",
    palette: ["#071012", "#0F2A2E", "#176B6E", "#5FC9C2", "#DFF5F2"],
    captionPresetId: "clean-minimal",
    musicBedId: "pulse-tech",
    transition: "wipeup",
    kenBurns: 0.045,
    grade: { contrast: 1.1, saturation: 1.05, brightness: 0.03, vignette: 0.22, grain: 2 },
    secondsPerScene: 6.0,
    bestFor: ["16:9", "9:16"],
  },
  {
    id: "case-study",
    name: "Business Case Study",
    niche: "Marketing / business breakdowns",
    tagline: "Editorial charts and brand-safe polish. The look clients will pay for.",
    narrationDirection:
      "Lead with the outcome, then reverse-engineer it. Quantify every claim. Close with the transferable principle.",
    artDirection:
      "modern editorial business photography, clean geometric composition, navy and warm white palette, architectural interior, soft daylight, premium magazine quality",
    artAvoid: "stock handshakes, cheesy smiles, text, clutter",
    palette: ["#080B14", "#132038", "#2B4C7E", "#7FA3D4", "#EEF3FA"],
    captionPresetId: "clean-minimal",
    musicBedId: "pulse-tech",
    transition: "slideleft",
    kenBurns: 0.05,
    grade: { contrast: 1.08, saturation: 1.02, brightness: 0.02, vignette: 0.26, grain: 2 },
    secondsPerScene: 6.5,
    bestFor: ["16:9"],
  },
];

export const styleById = (id: string): StyleTemplate =>
  STYLE_TEMPLATES.find((s) => s.id === id) ?? STYLE_TEMPLATES[0]!;

export const STYLE_NICHES = Array.from(new Set(STYLE_TEMPLATES.map((s) => s.niche)));
