/**
 * Licensed music library.
 *
 * Beds are synthesised on the render node from the parameters below rather
 * than shipped as audio files. That keeps the repository light and, more
 * importantly, means every bed is original output owned by GMK Media Ltd —
 * there is no third-party sync licence to track per customer render, which
 * is the usual legal snag with faceless-video tooling.
 *
 * `license` records the terms we pass through to the customer.
 */

export interface MusicBed {
  id: string;
  name: string;
  mood: string;
  description: string;
  /** Root note in Hz for the generated pad. */
  rootHz: number;
  /** Semitone offsets forming the chord voicing. */
  chord: number[];
  /** Beats per minute of the pulse layer; 0 disables the pulse. */
  bpm: number;
  /** Low-pass cutoff applied to the pad, in Hz. */
  cutoffHz: number;
  /** Default mix level in dB relative to narration. */
  gainDb: number;
  license: string;
}

export const MUSIC_BEDS: MusicBed[] = [
  {
    id: "tension-drone",
    name: "Tension Drone",
    mood: "Unsettled, patient",
    description: "A minor-second drone with a slow swell. Sits under narration without competing.",
    rootHz: 55,
    chord: [0, 1, 7, 12],
    bpm: 0,
    cutoffHz: 1800,
    gainDb: -24,
    license: "GMK Media Ltd — original synthesis, royalty-free for customer renders",
  },
  {
    id: "epic-swell",
    name: "Epic Swell",
    mood: "Monumental, rising",
    description: "Open-fifth pad that builds across the piece. For stoicism, history and myth.",
    rootHz: 65.4,
    chord: [0, 7, 12, 19],
    bpm: 0,
    cutoffHz: 2600,
    gainDb: -22,
    license: "GMK Media Ltd — original synthesis, royalty-free for customer renders",
  },
  {
    id: "ambient-wonder",
    name: "Ambient Wonder",
    mood: "Weightless, curious",
    description: "Major-ninth shimmer with long decay. Space, science and psychology content.",
    rootHz: 98,
    chord: [0, 4, 7, 14],
    bpm: 0,
    cutoffHz: 3400,
    gainDb: -23,
    license: "GMK Media Ltd — original synthesis, royalty-free for customer renders",
  },
  {
    id: "lo-fi-flex",
    name: "Lo-Fi Flex",
    mood: "Relaxed, confident",
    description: "Warm seventh chord with a soft 78 BPM pulse. Story time and lifestyle.",
    rootHz: 73.4,
    chord: [0, 3, 7, 10],
    bpm: 78,
    cutoffHz: 2200,
    gainDb: -21,
    license: "GMK Media Ltd — original synthesis, royalty-free for customer renders",
  },
  {
    id: "pulse-tech",
    name: "Pulse Tech",
    mood: "Driving, precise",
    description: "Suspended-fourth pad over a 110 BPM pulse. Tech, business and protocol content.",
    rootHz: 87.3,
    chord: [0, 5, 7, 12],
    bpm: 110,
    cutoffHz: 3000,
    gainDb: -22,
    license: "GMK Media Ltd — original synthesis, royalty-free for customer renders",
  },
  {
    id: "none",
    name: "No Music",
    mood: "Narration only",
    description: "Voice and ambience only. Best for dense factual material.",
    rootHz: 0,
    chord: [],
    bpm: 0,
    cutoffHz: 0,
    gainDb: -120,
    license: "n/a",
  },
];

export const musicBedById = (id: string | null | undefined): MusicBed =>
  MUSIC_BEDS.find((m) => m.id === id) ?? MUSIC_BEDS[MUSIC_BEDS.length - 1]!;
