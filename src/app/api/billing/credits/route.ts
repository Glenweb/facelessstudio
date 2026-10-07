import { balanceFor, ledgerFor } from "@/lib/credits";
import { authed } from "@/lib/http/handler";
import { ok } from "@/lib/http/respond";
import { CREDIT_PACKS, SIGNUP_CREDITS } from "@/lib/studio/pricing";
import { modes } from "@/lib/env";

export const dynamic = "force-dynamic";

export const GET = authed(async (_req, { user }) => {
  const [balance, ledger] = await Promise.all([balanceFor(user.id), ledgerFor(user.id, 60)]);
  return ok({
    balance,
    plan: user.plan,
    signupCredits: SIGNUP_CREDITS,
    packs: CREDIT_PACKS,
    billingMode: modes.billing,
    ledger,
  });
});
