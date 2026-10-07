import { clearSessionCookie } from "@/lib/auth/session";
import { route } from "@/lib/http/handler";
import { ok } from "@/lib/http/respond";

export const POST = route(async () => {
  await clearSessionCookie();
  return ok({ ok: true });
});
