import { handleWebhook } from "@/lib/providers/billing";
import { route } from "@/lib/http/handler";
import { ok } from "@/lib/http/respond";

export const dynamic = "force-dynamic";

/**
 * Stripe webhook.
 *
 * Reads the raw body, because signature verification is computed over the
 * exact bytes Stripe sent — parsing and re-serialising breaks it.
 */
export const POST = route(async (req) => {
  const raw = await req.text();
  const signature = req.headers.get("stripe-signature");
  const credits = await handleWebhook(raw, signature);
  return ok({ received: true, creditsGranted: credits });
});
