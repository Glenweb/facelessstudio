/**
 * Route handler wrappers.
 *
 * Every API route runs through one of these so error shape, auth and logging
 * are uniform and no handler has to remember to try/catch.
 */
import type { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import type { User } from "@/lib/db";
import { toErrorResponse } from "./respond";

type Ctx<P> = { params: Promise<P> };

export function route<P = Record<string, never>>(
  handler: (req: NextRequest, ctx: { params: P }) => Promise<NextResponse>,
) {
  return async (req: NextRequest, ctx: Ctx<P>): Promise<NextResponse> => {
    try {
      const params = (ctx?.params ? await ctx.params : ({} as P)) as P;
      return await handler(req, { params });
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}

export function authed<P = Record<string, never>>(
  handler: (req: NextRequest, ctx: { params: P; user: User }) => Promise<NextResponse>,
) {
  return route<P>(async (req, ctx) => {
    const user = await requireUser();
    return handler(req, { params: ctx.params, user });
  });
}
