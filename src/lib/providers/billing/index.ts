/**
 * Credit billing.
 *
 * With STRIPE_SECRET_KEY set, a purchase creates a Checkout Session and
 * credits are granted by the webhook — never by the browser returning to a
 * success URL, which a user can forge.
 *
 * Without it, the sandbox driver grants credits immediately so the billing and
 * metering paths are exercisable locally. The UI labels sandbox purchases
 * clearly; no card is ever involved.
 */
import { env, modes } from "@/lib/env";
import { grantCredits } from "@/lib/credits";
import { ApiFailure } from "@/lib/http/respond";
import { creditPackById, type CreditPack } from "@/lib/studio/pricing";

export interface CheckoutResult {
  mode: "stripe" | "sandbox";
  /** Where to send the browser. Null when credits were granted directly. */
  url: string | null;
  creditsGranted: number;
  balance: number | null;
}

export async function startCheckout(args: {
  userId: string;
  email: string;
  packId: string;
}): Promise<CheckoutResult> {
  const pack = creditPackById(args.packId);
  if (!pack) throw new ApiFailure(404, "unknown_pack", "That credit pack does not exist.");

  if (modes.billing === "local") {
    const balance = await grantCredits({
      userId: args.userId,
      credits: pack.credits,
      operation: "grant.purchase",
      referenceId: `sandbox:${pack.id}`,
      note: `${pack.name} pack (sandbox — no payment taken)`,
    });
    return { mode: "sandbox", url: null, creditsGranted: pack.credits, balance };
  }

  const { default: Stripe } = await import("stripe");
  const stripe = new Stripe(env.stripeSecretKey!);
  const priceId = env.stripePrices[pack.id];

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: args.email,
    success_url: `${env.appUrl}/billing?purchase=success`,
    cancel_url: `${env.appUrl}/billing?purchase=cancelled`,
    line_items: [
      priceId
        ? { price: priceId, quantity: 1 }
        : {
            // No price configured: build one inline so a fresh Stripe account
            // works without first creating a catalogue.
            quantity: 1,
            price_data: {
              currency: "gbp",
              unit_amount: Math.round(pack.priceGbp * 100),
              product_data: {
                name: `${pack.name} — ${pack.credits.toLocaleString()} credits`,
                description: pack.blurb,
              },
            },
          },
    ],
    // The webhook reads these back; never trust the browser for a grant.
    metadata: { userId: args.userId, packId: pack.id, credits: String(pack.credits) },
  });

  return { mode: "stripe", url: session.url, creditsGranted: 0, balance: null };
}

/**
 * Verify and apply a Stripe webhook.
 *
 * Returns the credits granted, or 0 for events we do not act on.
 */
export async function handleWebhook(rawBody: string, signature: string | null): Promise<number> {
  if (modes.billing === "local") return 0;
  if (!signature) throw new ApiFailure(400, "missing_signature", "Missing Stripe signature.");
  if (!env.stripeWebhookSecret) {
    throw new ApiFailure(500, "misconfigured", "STRIPE_WEBHOOK_SECRET is not set.");
  }

  const { default: Stripe } = await import("stripe");
  const stripe = new Stripe(env.stripeSecretKey!);

  let event: import("stripe").Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, env.stripeWebhookSecret);
  } catch (err) {
    throw new ApiFailure(
      400,
      "bad_signature",
      `Webhook signature verification failed: ${err instanceof Error ? err.message : "unknown"}`,
    );
  }

  if (event.type !== "checkout.session.completed") return 0;

  const session = event.data.object as import("stripe").Stripe.Checkout.Session;
  if (session.payment_status !== "paid") return 0;

  const userId = session.metadata?.userId;
  const credits = Number(session.metadata?.credits ?? 0);
  if (!userId || !Number.isFinite(credits) || credits <= 0) return 0;

  await grantCredits({
    userId,
    credits,
    operation: "grant.purchase",
    // The session id makes the grant traceable and the ledger auditable.
    referenceId: session.id,
    note: `Stripe purchase — ${session.metadata?.packId ?? "pack"}`,
  });

  return credits;
}
