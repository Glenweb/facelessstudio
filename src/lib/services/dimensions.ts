import type { AspectRatio } from "@/lib/studio/types";

/** Output dimensions per aspect ratio. 1080p class across the board. */
export const DIMENSIONS: Record<AspectRatio, { width: number; height: number }> = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
};

/** The complementary ratio rendered alongside the primary one. */
export const companionRatio = (primary: AspectRatio): AspectRatio =>
  primary === "9:16" ? "16:9" : "9:16";
