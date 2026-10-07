/**
 * Font resolution.
 *
 * Caption presets name font *families* ("DejaVu Sans"), which libass resolves
 * through fontconfig. That works on a Linux box with those families installed
 * and fails quietly everywhere else: on Windows and macOS libass substitutes
 * whatever it can find, so captions render in the wrong face at the wrong
 * metrics and the layout the preset was designed around no longer holds.
 * `drawtext` is worse — it takes a file path, so a hardcoded
 * /usr/share/fonts/... simply errors and fails the render.
 *
 * So the fonts ship with the repository. `fontsdir` points libass at them and
 * drawtext gets an absolute path to the bundled file, which makes a render
 * byte-identical on any machine regardless of what is installed. The system
 * paths remain as a fallback for a deployment that strips the assets.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

/** Bundled fonts, relative to the repository root. */
export const BUNDLED_FONTS_DIR = join(process.cwd(), "assets", "fonts");

const BUNDLED: Record<string, string> = {
  "DejaVu Sans": "DejaVuSans-Bold.ttf",
  "DejaVu Serif": "DejaVuSerif-Bold.ttf",
  "Liberation Sans": "LiberationSans-Bold.ttf",
};

/** Last-resort system locations, in order of preference. */
const SYSTEM_FALLBACKS: Record<string, string[]> = {
  "DejaVu Sans": [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
    "/Library/Fonts/Arial Bold.ttf",
    "C:\\Windows\\Fonts\\arialbd.ttf",
  ],
  "DejaVu Serif": [
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
    "/usr/share/fonts/dejavu/DejaVuSerif-Bold.ttf",
    "/Library/Fonts/Georgia Bold.ttf",
    "C:\\Windows\\Fonts\\georgiab.ttf",
  ],
  "Liberation Sans": [
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/liberation/LiberationSans-Bold.ttf",
    "/Library/Fonts/Arial Bold.ttf",
    "C:\\Windows\\Fonts\\arialbd.ttf",
  ],
};

/** True when the bundled directory is present and usable. */
export function hasBundledFonts(): boolean {
  return existsSync(join(BUNDLED_FONTS_DIR, "DejaVuSans-Bold.ttf"));
}

/**
 * An absolute path to a usable font file for `drawtext`.
 *
 * Returns null only when nothing at all can be found, in which case the caller
 * should skip the text rather than hand FFmpeg a path that will fail.
 */
export function resolveFontFile(family: string): string | null {
  const bundled = BUNDLED[family] ?? BUNDLED["DejaVu Sans"]!;
  const bundledPath = join(BUNDLED_FONTS_DIR, bundled);
  if (existsSync(bundledPath)) return bundledPath;

  for (const candidate of SYSTEM_FALLBACKS[family] ?? SYSTEM_FALLBACKS["DejaVu Sans"]!) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** Directory handed to libass via the `ass` filter's `fontsdir`, or null. */
export const assFontsDir = (): string | null =>
  hasBundledFonts() ? BUNDLED_FONTS_DIR : null;
