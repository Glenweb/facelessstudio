/**
 * Credit ledger.
 *
 * Every balance change goes through here so `usage_credits` always reconciles
 * to `users.credits_balance`. Charges are taken *before* the work runs and
 * refunded on failure — a user should never pay for a render that errored.
 */
import { eq, sql } from "drizzle-orm";
import { getDb, usageCredits, users } from "@/lib/db";
import { ApiFailure } from "@/lib/http/respond";
import { newId } from "@/lib/ids";
import type { CreditOperation } from "@/lib/studio/pricing";

export type LedgerOperation =
  | CreditOperation
  | "grant.signup"
  | "grant.purchase"
  | "grant.refund";

interface MoveArgs {
  userId: string;
  /** Positive to grant, negative to charge. */
  delta: number;
  operation: LedgerOperation;
  referenceId?: string | null;
  note?: string;
}

/**
 * Applies a signed delta atomically and appends a ledger row.
 *
 * The balance update is a single conditional UPDATE, so two concurrent
 * charges cannot both pass an "enough credits?" check and overdraw.
 */
async function move(args: MoveArgs): Promise<number> {
  const db = await getDb();
  const { userId, delta, operation, referenceId = null, note = "" } = args;

  const updated = await db
    .update(users)
    .set({ creditsBalance: sql`${users.creditsBalance} + ${delta}` })
    .where(
      delta < 0
        ? sql`${users.id} = ${userId} AND ${users.creditsBalance} + ${delta} >= 0`
        : eq(users.id, userId),
    )
    .returning({ balance: users.creditsBalance });

  if (updated.length === 0) {
    const [row] = await db
      .select({ balance: users.creditsBalance })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!row) throw new ApiFailure(404, "not_found", "Account not found.");
    throw new ApiFailure(
      402,
      "insufficient_credits",
      `This needs ${Math.abs(delta)} credits and you have ${Math.floor(row.balance)}. Top up to continue.`,
      { needed: Math.abs(delta), balance: row.balance },
    );
  }

  const balanceAfter = updated[0]!.balance;
  await db.insert(usageCredits).values({
    id: newId("uc"),
    userId,
    delta,
    balanceAfter,
    operation,
    referenceId,
    note,
  });
  return balanceAfter;
}

export const chargeCredits = (
  args: Omit<MoveArgs, "delta"> & { credits: number },
): Promise<number> =>
  move({ ...args, delta: -Math.abs(args.credits) });

export const grantCredits = (
  args: Omit<MoveArgs, "delta"> & { credits: number },
): Promise<number> =>
  move({ ...args, delta: Math.abs(args.credits) });

/** Refund after a failed job. Never throws — a failed refund must not mask the original error. */
export async function refundCredits(args: {
  userId: string;
  credits: number;
  referenceId?: string | null;
  note?: string;
}): Promise<void> {
  if (args.credits <= 0) return;
  try {
    await move({
      userId: args.userId,
      delta: Math.abs(args.credits),
      operation: "grant.refund",
      referenceId: args.referenceId ?? null,
      note: args.note ?? "Automatic refund for a failed job",
    });
  } catch (err) {
    console.error("[credits] refund failed", { ...args, err });
  }
}

export async function balanceFor(userId: string): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ balance: users.creditsBalance })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.balance ?? 0;
}

export async function ledgerFor(userId: string, limit = 50) {
  const db = await getDb();
  return db
    .select()
    .from(usageCredits)
    .where(eq(usageCredits.userId, userId))
    .orderBy(sql`${usageCredits.createdAt} DESC`)
    .limit(limit);
}
