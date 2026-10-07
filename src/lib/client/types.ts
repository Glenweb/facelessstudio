import type { Project, Render, Scene, Script, Voiceover } from "@/lib/db/schema";
import type { CaptionPreset } from "@/lib/studio/captions";
import type { MusicBed } from "@/lib/studio/music";
import type { StyleTemplate } from "@/lib/studio/styles";
import type { VoiceOption } from "@/lib/studio/voices";

export type SceneWithUrl = Scene & { imageUrl: string | null };
export type VoiceoverWithUrl = Voiceover & { audioUrl: string };
export type RenderWithUrls = Omit<Render, "spec" | "cues"> & {
  videoUrl: string | null;
  thumbnailUrl: string | null;
};

/** The payload GET /api/projects/[id] returns — the whole editor state. */
export interface ProjectPayload {
  project: Project;
  script: Script | null;
  scenes: SceneWithUrl[];
  voiceover: VoiceoverWithUrl | null;
  renders: RenderWithUrls[];
  style: StyleTemplate;
  voice: VoiceOption;
  captionPreset: CaptionPreset;
  musicBed: MusicBed;
}
