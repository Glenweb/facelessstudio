import { NextResponse } from "next/server";
import { modes } from "@/lib/env";
import { authed } from "@/lib/http/handler";
import { fail } from "@/lib/http/respond";
import { authorisationUrl } from "@/lib/providers/youtube";

export const dynamic = "force-dynamic";

/** Starts the OAuth dance. `state` carries the user id, signed by the session. */
export const GET = authed(async (_req, { user }) => {
  if (modes.youtube === "local") {
    return fail(
      400,
      "youtube_not_configured",
      "Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET to connect a channel. Publishing works in dry-run mode without them.",
    );
  }
  return NextResponse.redirect(authorisationUrl(user.id));
});
