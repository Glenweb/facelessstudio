/**
 * Customer file storage.
 *
 * One interface, two drivers: Cloudflare R2 in production (S3 API, zero
 * egress fees, which matters a lot when customers re-download renders) and
 * the local filesystem otherwise.
 *
 * `localPath()` is the important method. When storage is local, FFmpeg reads
 * and writes files directly with no HTTP hop, which is what makes local
 * rendering fast enough to be a real development loop rather than a demo.
 */
import { env, modes } from "@/lib/env";

export interface StorageDriver {
  readonly kind: "r2" | "local";
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  remove(key: string): Promise<void>;
  /** A URL a browser can fetch. Presigned for R2 when no public base is set. */
  url(key: string): Promise<string>;
  /** Absolute path on this machine, or null when the object is remote. */
  localPath(key: string): string | null;
}

let cached: StorageDriver | undefined;

export async function storage(): Promise<StorageDriver> {
  if (cached) return cached;
  cached =
    modes.storage === "live"
      ? await (await import("./r2")).createR2Driver()
      : await (await import("./local")).createLocalDriver();
  return cached;
}

/** Deterministic key layout so objects can be found and lifecycled by prefix. */
export const keys = {
  sceneImage: (projectId: string, sceneIdx: number, revision: number) =>
    `projects/${projectId}/scenes/${String(sceneIdx).padStart(3, "0")}-r${revision}.png`,
  voiceover: (projectId: string, voiceoverId: string) =>
    `projects/${projectId}/audio/${voiceoverId}.wav`,
  renderVideo: (projectId: string, renderId: string) =>
    `projects/${projectId}/renders/${renderId}.mp4`,
  renderThumb: (projectId: string, renderId: string) =>
    `projects/${projectId}/renders/${renderId}.jpg`,
  captionFile: (projectId: string, renderId: string) =>
    `projects/${projectId}/renders/${renderId}.ass`,
  musicBed: (bedId: string, seconds: number) => `music/${bedId}-${seconds}s.wav`,
};

/** Public base used by the UI to build media links. */
export const mediaUrlFor = (key: string): string =>
  modes.storage === "live" && env.r2PublicBaseUrl
    ? `${env.r2PublicBaseUrl.replace(/\/$/, "")}/${key}`
    : `/api/media/${key}`;
