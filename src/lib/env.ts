/**
 * Environment + provider-mode resolution.
 *
 * Faceless Studio is designed so that an empty .env still produces a fully
 * working product. Each capability resolves independently to either `live`
 * (real vendor, key present) or `local` (deterministic in-process
 * implementation). Nothing throws at import time; nothing silently degrades
 * without being reported by `/api/health` and `npm run doctor`.
 */
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type ProviderMode = "live" | "local";

const str = (v: string | undefined): string | undefined => {
  const t = (v ?? "").trim();
  return t.length > 0 ? t : undefined;
};

export const DATA_DIR = join(process.cwd(), ".data");

function ensureDataDir(): string {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  return DATA_DIR;
}

/**
 * A stable dev secret so sessions survive a server restart without forcing
 * the operator to invent one. Production must set AUTH_SECRET explicitly.
 */
function resolveAuthSecret(): string {
  const fromEnv = str(process.env.AUTH_SECRET);
  if (fromEnv) return fromEnv;
  const file = join(ensureDataDir(), "auth-secret");
  if (existsSync(file)) return readFileSync(file, "utf8").trim();
  const generated = randomBytes(48).toString("base64url");
  writeFileSync(file, generated, { mode: 0o600 });
  return generated;
}

let cachedSecret: string | undefined;

export const env = {
  appUrl: str(process.env.APP_URL) ?? "http://localhost:3000",
  nodeEnv: process.env.NODE_ENV ?? "development",

  get authSecret(): string {
    cachedSecret ??= resolveAuthSecret();
    return cachedSecret;
  },

  databaseUrl: str(process.env.DATABASE_URL),

  anthropicKey: str(process.env.ANTHROPIC_API_KEY),
  anthropicModel: str(process.env.ANTHROPIC_MODEL) ?? "claude-sonnet-5-5",

  googleAiKey: str(process.env.GOOGLE_AI_STUDIO_API_KEY) ?? str(process.env.GEMINI_API_KEY),
  geminiImageModel: str(process.env.GEMINI_IMAGE_MODEL) ?? "gemini-2.5-flash-image",

  elevenLabsKey: str(process.env.ELEVENLABS_API_KEY),
  elevenLabsModel: str(process.env.ELEVENLABS_MODEL) ?? "eleven_multilingual_v2",

  renderNodeUrl: str(process.env.RENDER_NODE_URL),
  renderNodeToken: str(process.env.RENDER_NODE_TOKEN),

  r2AccountId: str(process.env.R2_ACCOUNT_ID),
  r2AccessKeyId: str(process.env.R2_ACCESS_KEY_ID),
  r2SecretAccessKey: str(process.env.R2_SECRET_ACCESS_KEY),
  r2Bucket: str(process.env.R2_BUCKET) ?? "faceless-studio",
  r2PublicBaseUrl: str(process.env.R2_PUBLIC_BASE_URL),

  youtubeClientId: str(process.env.YOUTUBE_CLIENT_ID),
  youtubeClientSecret: str(process.env.YOUTUBE_CLIENT_SECRET),
  youtubeRedirectUri:
    str(process.env.YOUTUBE_REDIRECT_URI) ?? "http://localhost:3000/api/youtube/callback",

  stripeSecretKey: str(process.env.STRIPE_SECRET_KEY),
  stripeWebhookSecret: str(process.env.STRIPE_WEBHOOK_SECRET),
  stripePrices: {
    starter: str(process.env.STRIPE_PRICE_STARTER),
    creator: str(process.env.STRIPE_PRICE_CREATOR),
    studio: str(process.env.STRIPE_PRICE_STUDIO),
  },
} as const;

export const modes = {
  get database(): ProviderMode {
    return env.databaseUrl ? "live" : "local";
  },
  get llm(): ProviderMode {
    return env.anthropicKey ? "live" : "local";
  },
  get image(): ProviderMode {
    return env.googleAiKey ? "live" : "local";
  },
  get tts(): ProviderMode {
    return env.elevenLabsKey ? "live" : "local";
  },
  get render(): ProviderMode {
    return env.renderNodeUrl ? "live" : "local";
  },
  get storage(): ProviderMode {
    return env.r2AccountId && env.r2AccessKeyId && env.r2SecretAccessKey ? "live" : "local";
  },
  get youtube(): ProviderMode {
    return env.youtubeClientId && env.youtubeClientSecret ? "live" : "local";
  },
  get billing(): ProviderMode {
    return env.stripeSecretKey ? "live" : "local";
  },
} as const;

export type CapabilityName = keyof typeof modes;

export interface CapabilityReport {
  capability: CapabilityName;
  mode: ProviderMode;
  vendor: string;
  detail: string;
}

/** Human-readable status used by /api/health, the UI banner and `npm run doctor`. */
export function capabilityReport(): CapabilityReport[] {
  return [
    {
      capability: "database",
      mode: modes.database,
      vendor: modes.database === "live" ? "Neon Postgres" : "PGlite (embedded)",
      detail:
        modes.database === "live"
          ? "Pooled node-postgres connection"
          : "Embedded Postgres at .data/pgdata — same SQL, zero setup",
    },
    {
      capability: "llm",
      mode: modes.llm,
      vendor: modes.llm === "live" ? `Anthropic ${env.anthropicModel}` : "Local script engine",
      detail:
        modes.llm === "live"
          ? "Claude writes scripts and performs scene breakdown"
          : "Deterministic template writer — real structure, no API key needed",
    },
    {
      capability: "image",
      mode: modes.image,
      vendor: modes.image === "live" ? `Gemini ${env.geminiImageModel}` : "Procedural FFmpeg art",
      detail:
        modes.image === "live"
          ? "Google AI Studio generates each scene frame"
          : "Style-matched procedural gradients rendered by FFmpeg",
    },
    {
      capability: "tts",
      mode: modes.tts,
      vendor: modes.tts === "live" ? "ElevenLabs" : "Local preview voice",
      detail:
        modes.tts === "live"
          ? "Character-level timestamps drive word-accurate captions"
          : "In-process synthesis — word timings are exact by construction",
    },
    {
      capability: "render",
      mode: modes.render,
      vendor: modes.render === "live" ? "FFmpeg on Railway" : "Local FFmpeg",
      detail:
        modes.render === "live"
          ? "Jobs dispatched to the Railway render node"
          : "Real MP4s encoded by the ffmpeg binary on this machine",
    },
    {
      capability: "storage",
      mode: modes.storage,
      vendor: modes.storage === "live" ? "Cloudflare R2" : "Local filesystem",
      detail:
        modes.storage === "live"
          ? `S3 API against bucket ${env.r2Bucket}`
          : "Files at .data/storage, served from /api/media",
    },
    {
      capability: "youtube",
      mode: modes.youtube,
      vendor: "YouTube Data API v3",
      detail:
        modes.youtube === "live"
          ? "Resumable upload with altered-content disclosure"
          : "Dry run — returns the exact request body that would be sent",
    },
    {
      capability: "billing",
      mode: modes.billing,
      vendor: modes.billing === "live" ? "Stripe" : "Sandbox ledger",
      detail:
        modes.billing === "live"
          ? "Checkout Sessions + webhook-driven credit grants"
          : "Credit packs granted instantly for local testing",
    },
  ];
}

export const isLocalStudio = (): boolean =>
  capabilityReport().every((c) => c.capability === "youtube" || c.mode === "local");
