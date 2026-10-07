/**
 * FFmpeg binary resolution.
 *
 * Calling `execFile("ffmpeg", …)` works on a developer machine where the
 * binary is on PATH as an executable, and fails in two ways elsewhere: the
 * error is a bare ENOENT with no indication of what was missing, and on
 * Windows a `.cmd` or `.bat` shim — which several package managers install —
 * is not executable through `execFile` at all without a shell.
 *
 * Resolving once, explicitly, turns both into a sentence the user can act on.
 * FFMPEG_PATH / FFPROBE_PATH override everything, for a machine where the
 * binary is installed somewhere unusual.
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";

const run = promisify(execFile);

export type BinaryName = "ffmpeg" | "ffprobe";

const isWindows = process.platform === "win32";

/** Common install locations, checked only if PATH resolution fails. */
const WINDOWS_FALLBACKS: Record<BinaryName, string[]> = {
  ffmpeg: [
    "C:\\ffmpeg\\bin\\ffmpeg.exe",
    "C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe",
    "C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe",
  ],
  ffprobe: [
    "C:\\ffmpeg\\bin\\ffprobe.exe",
    "C:\\Program Files\\ffmpeg\\bin\\ffprobe.exe",
    "C:\\ProgramData\\chocolatey\\bin\\ffprobe.exe",
  ],
};

const cache = new Map<BinaryName, string>();

async function probe(command: string): Promise<boolean> {
  try {
    await run(command, ["-version"], { timeout: 15_000, windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * The command to invoke for a binary, or throws with an actionable message.
 * Cached, because this runs on every scene image and every render.
 */
export async function resolveBinary(name: BinaryName): Promise<string> {
  const cached = cache.get(name);
  if (cached) return cached;

  const override = process.env[name === "ffmpeg" ? "FFMPEG_PATH" : "FFPROBE_PATH"]?.trim();
  const candidates = [
    ...(override ? [override] : []),
    name,
    ...(isWindows ? [`${name}.exe`, ...WINDOWS_FALLBACKS[name].filter((p) => existsSync(p))] : []),
  ];

  for (const candidate of candidates) {
    if (await probe(candidate)) {
      cache.set(name, candidate);
      return candidate;
    }
  }

  throw new Error(
    [
      `${name} was not found.`,
      "",
      isWindows
        ? `Install it with:  winget install Gyan.FFmpeg\nThen close and reopen your terminal so PATH updates, and check with:  ${name} -version`
        : `Install it with your package manager (apt install ffmpeg / brew install ffmpeg), then check with:  ${name} -version`,
      "",
      `If it is installed somewhere unusual, set ${name === "ffmpeg" ? "FFMPEG_PATH" : "FFPROBE_PATH"} in .env to its full path.`,
    ].join("\n"),
  );
}

/** Clears the cache. Only useful in tests and the self-test. */
export const resetBinaryCache = (): void => cache.clear();
