import { capabilityReport } from "@/lib/env";
import { route } from "@/lib/http/handler";
import { ok } from "@/lib/http/respond";
import { CAPTION_PRESETS } from "@/lib/studio/captions";
import { MUSIC_BEDS } from "@/lib/studio/music";
import { CREDIT_COSTS, CREDIT_PACKS, SIGNUP_CREDITS } from "@/lib/studio/pricing";
import { STYLE_TEMPLATES } from "@/lib/studio/styles";
import { VOICES } from "@/lib/studio/voices";

/** Everything the wizard needs to render its pickers, in one request. */
export const GET = route(async () =>
  ok({
    styles: STYLE_TEMPLATES,
    voices: VOICES,
    captionPresets: CAPTION_PRESETS,
    musicBeds: MUSIC_BEDS,
    creditPacks: CREDIT_PACKS,
    creditCosts: CREDIT_COSTS,
    signupCredits: SIGNUP_CREDITS,
    capabilities: capabilityReport(),
  }),
);
