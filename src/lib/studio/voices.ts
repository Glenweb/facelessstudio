/**
 * Voice catalogue.
 *
 * Each entry carries an ElevenLabs voice id for live mode plus the synthesis
 * parameters the local preview voice uses, so a project sounds broadly
 * consistent whichever mode produced it. `wpm` drives duration estimation
 * before any audio exists, which is what lets the wizard show a runtime
 * before the user spends a credit.
 */

export type VoiceGender = "male" | "female" | "neutral";

export interface VoiceOption {
  id: string;
  name: string;
  /** ElevenLabs voice id used when ELEVENLABS_API_KEY is present. */
  elevenLabsVoiceId: string;
  gender: VoiceGender;
  accent: string;
  description: string;
  /** Style ids this voice was chosen to pair with. */
  pairsWith: string[];
  /** Words per minute, used for runtime estimates and local synthesis pacing. */
  wpm: number;
  /** Base pitch in Hz for the local preview voice. */
  basePitchHz: number;
  /** ElevenLabs stability / similarity settings. */
  stability: number;
  similarityBoost: number;
}

export const VOICES: VoiceOption[] = [
  {
    id: "atlas",
    name: "Atlas",
    elevenLabsVoiceId: "onwK4e9ZLuTAKqWW03F9",
    gender: "male",
    accent: "British",
    description: "Low, unhurried documentary baritone. Authority without pushing.",
    pairsWith: ["dark-documentary", "lost-history", "myth-legend"],
    wpm: 142,
    basePitchHz: 104,
    stability: 0.55,
    similarityBoost: 0.78,
  },
  {
    id: "forge",
    name: "Forge",
    elevenLabsVoiceId: "pNInz6obpgDQGcFmaJgB",
    gender: "male",
    accent: "American",
    description: "Hard-edged motivational delivery. Carries imperative second-person lines.",
    pairsWith: ["stoic-discipline", "money-luxury", "health-protocol"],
    wpm: 158,
    basePitchHz: 118,
    stability: 0.42,
    similarityBoost: 0.8,
  },
  {
    id: "vera",
    name: "Vera",
    elevenLabsVoiceId: "EXAVITQu4vr4xnSDxMaL",
    gender: "female",
    accent: "American",
    description: "Warm, clear and conversational. The default for story and explainer work.",
    pairsWith: ["reddit-story", "mind-psychology", "tech-explainer"],
    wpm: 165,
    basePitchHz: 196,
    stability: 0.5,
    similarityBoost: 0.75,
  },
  {
    id: "orrin",
    name: "Orrin",
    elevenLabsVoiceId: "VR6AewLTigWG4xSOukaG",
    gender: "male",
    accent: "American",
    description: "Bright analytical read with crisp consonants. Built for numbers and mechanisms.",
    pairsWith: ["tech-explainer", "case-study", "cosmic-scale"],
    wpm: 170,
    basePitchHz: 126,
    stability: 0.48,
    similarityBoost: 0.72,
  },
  {
    id: "nyx",
    name: "Nyx",
    elevenLabsVoiceId: "ThT5KcBeYPX3keUQqHPh",
    gender: "female",
    accent: "British",
    description: "Hushed, close-mic and deliberate. Dread without theatrics.",
    pairsWith: ["night-horror", "dark-documentary", "myth-legend"],
    wpm: 136,
    basePitchHz: 182,
    stability: 0.62,
    similarityBoost: 0.82,
  },
  {
    id: "sable",
    name: "Sable",
    elevenLabsVoiceId: "XrExE9yKIg1WjnnlVkGX",
    gender: "female",
    accent: "American",
    description: "Polished editorial voice with a premium finish. Brand-safe for client work.",
    pairsWith: ["case-study", "money-luxury", "mind-psychology"],
    wpm: 155,
    basePitchHz: 204,
    stability: 0.58,
    similarityBoost: 0.76,
  },
  {
    id: "kestrel",
    name: "Kestrel",
    elevenLabsVoiceId: "IKne3meq5aSn9XLyUdCD",
    gender: "male",
    accent: "American",
    description: "Fast, young and casual. The native short-form story read.",
    pairsWith: ["reddit-story", "tech-explainer"],
    wpm: 182,
    basePitchHz: 132,
    stability: 0.38,
    similarityBoost: 0.7,
  },
  {
    id: "wren",
    name: "Wren",
    elevenLabsVoiceId: "Xb7hH8MSUJpSbSDYk0k2",
    gender: "female",
    accent: "British",
    description: "Measured and curious. Pairs with wonder and science material.",
    pairsWith: ["cosmic-scale", "lost-history", "health-protocol"],
    wpm: 148,
    basePitchHz: 190,
    stability: 0.56,
    similarityBoost: 0.74,
  },
];

export const voiceById = (id: string): VoiceOption =>
  VOICES.find((v) => v.id === id) ?? VOICES[0]!;

/** The voice a style template reaches for first. */
export function recommendedVoiceForStyle(styleId: string): VoiceOption {
  return VOICES.find((v) => v.pairsWith.includes(styleId)) ?? VOICES[0]!;
}
