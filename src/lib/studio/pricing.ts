/**
 * Credit metering and unit economics.
 *
 * One credit is the atomic billing unit. Credits are metered per *operation*
 * rather than per video, so a user who re-rolls three scene images pays for
 * three images and nothing else. Every charge is written to the
 * `credit_ledger` table with the operation that caused it, which is what lets
 * us answer "where did my credits go" without guessing.
 *
 * The COST_MODEL figures below are our own measured/estimated vendor costs in
 * GBP. They exist so margin is computable in code rather than in a spreadsheet
 * nobody updates. See docs/05-benchmark-vid-ai.md for how these roll up into
 * the cost-per-minute target.
 */

export type CreditOperation =
  | "script.generate"
  | "scene.breakdown"
  | "scene.image"
  | "voiceover.generate"
  | "render.encode"
  | "youtube.upload";

/** Credits charged per operation. */
export const CREDIT_COSTS = {
  /** Flat charge for a prompt-to-script generation. */
  scriptGenerate: 15,
  /** Scene breakdown is bundled into the script charge. */
  sceneBreakdown: 0,
  /** Per scene still/clip generated or regenerated. */
  sceneImage: 6,
  /** Per second of narration synthesised. */
  voiceoverPerSecond: 0.4,
  /** Per second of finished video, per aspect-ratio variant. */
  renderPerSecondPerVariant: 0.25,
  /** Publishing is free; we only pay egress. */
  youtubeUpload: 0,
} as const;

/** Our estimated vendor cost in GBP, used for margin reporting. */
export const COST_MODEL = {
  /** Claude script + breakdown for a one-minute piece. */
  scriptGbp: 0.03,
  /** One Gemini image generation. */
  imageGbp: 0.028,
  /** ElevenLabs per second of speech. */
  voiceoverPerSecondGbp: 0.002,
  /**
   * FFmpeg render on Railway per second of output, CPU only.
   * This is the line vid.ai cannot match with a GPU-backed pipeline.
   */
  renderPerSecondGbp: 0.00004,
  /** R2 storage + egress amortised per second of stored output. */
  storagePerSecondGbp: 0.000015,
} as const;

export interface CreditPack {
  id: "starter" | "creator" | "studio";
  name: string;
  credits: number;
  priceGbp: number;
  /** Approximate minutes of finished 1080p video at default settings. */
  approxMinutes: number;
  blurb: string;
  features: string[];
  highlight: boolean;
}

/** Credits granted to a new account so the first real video costs nothing. */
export const SIGNUP_CREDITS = 300;

export const CREDIT_PACKS: CreditPack[] = [
  {
    id: "starter",
    name: "Starter",
    credits: 1_500,
    priceGbp: 15,
    approxMinutes: 13,
    blurb: "Prove the format works on your channel.",
    features: [
      "13 minutes of finished video",
      "All 12 niche style templates",
      "All 6 caption presets",
      "16:9 and 9:16 from one render",
      "1080p downloads",
    ],
    highlight: false,
  },
  {
    id: "creator",
    name: "Creator",
    credits: 6_000,
    priceGbp: 49,
    approxMinutes: 52,
    blurb: "A daily short plus a weekly long-form, comfortably.",
    features: [
      "52 minutes of finished video",
      "Everything in Starter",
      "Direct YouTube publishing",
      "No watermark",
      "Priority render queue",
    ],
    highlight: true,
  },
  {
    id: "studio",
    name: "Studio",
    credits: 25_000,
    priceGbp: 169,
    approxMinutes: 219,
    blurb: "Agency and multi-channel volume.",
    features: [
      "219 minutes of finished video",
      "Everything in Creator",
      "Best per-minute rate",
      "Bulk scene regeneration",
      "Render history retained 12 months",
    ],
    highlight: false,
  },
];

export const creditPackById = (id: string): CreditPack | undefined =>
  CREDIT_PACKS.find((p) => p.id === id);

export interface QuoteLine {
  operation: CreditOperation;
  label: string;
  credits: number;
  costGbp: number;
}

export interface Quote {
  lines: QuoteLine[];
  totalCredits: number;
  /** Our vendor cost for the whole job, GBP. */
  totalCostGbp: number;
  seconds: number;
  variants: number;
}

/**
 * Price a complete video up front. The wizard shows this before the user
 * commits, which is the single biggest trust win over tools that only reveal
 * consumption after the render.
 */
export function quoteProject(input: {
  seconds: number;
  sceneCount: number;
  variants: number;
  includeScript: boolean;
}): Quote {
  const { seconds, sceneCount, variants, includeScript } = input;
  const lines: QuoteLine[] = [];

  if (includeScript) {
    lines.push({
      operation: "script.generate",
      label: "Script + scene breakdown",
      credits: CREDIT_COSTS.scriptGenerate,
      costGbp: COST_MODEL.scriptGbp,
    });
  }

  lines.push({
    operation: "scene.image",
    label: `${sceneCount} scene visual${sceneCount === 1 ? "" : "s"}`,
    credits: sceneCount * CREDIT_COSTS.sceneImage,
    costGbp: sceneCount * COST_MODEL.imageGbp,
  });

  lines.push({
    operation: "voiceover.generate",
    label: `Voiceover (${Math.round(seconds)}s)`,
    credits: round2(seconds * CREDIT_COSTS.voiceoverPerSecond),
    costGbp: seconds * COST_MODEL.voiceoverPerSecondGbp,
  });

  lines.push({
    operation: "render.encode",
    label: `Render ${variants} variant${variants === 1 ? "" : "s"}`,
    credits: round2(seconds * CREDIT_COSTS.renderPerSecondPerVariant * variants),
    costGbp:
      seconds * variants * (COST_MODEL.renderPerSecondGbp + COST_MODEL.storagePerSecondGbp),
  });

  const totalCredits = Math.ceil(lines.reduce((a, l) => a + l.credits, 0));
  const totalCostGbp = round4(lines.reduce((a, l) => a + l.costGbp, 0));
  return { lines, totalCredits, totalCostGbp, seconds, variants };
}

/** Blended GBP a credit is sold for, weighted across packs. */
export function blendedCreditPriceGbp(): number {
  const credits = CREDIT_PACKS.reduce((a, p) => a + p.credits, 0);
  const revenue = CREDIT_PACKS.reduce((a, p) => a + p.priceGbp, 0);
  return revenue / credits;
}

/** Margin on a given quote at the blended credit price. */
export function marginForQuote(q: Quote): { revenueGbp: number; costGbp: number; marginPct: number } {
  const revenueGbp = round4(q.totalCredits * blendedCreditPriceGbp());
  const marginPct = revenueGbp > 0 ? round2(((revenueGbp - q.totalCostGbp) / revenueGbp) * 100) : 0;
  return { revenueGbp, costGbp: q.totalCostGbp, marginPct };
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const round4 = (n: number): number => Math.round(n * 10_000) / 10_000;
