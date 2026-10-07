/** Uniform JSON envelopes so the client never has to guess an error shape. */
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}

export const ok = <T>(data: T, init?: ResponseInit): NextResponse =>
  NextResponse.json(data as object, { status: 200, ...init });

export const created = <T>(data: T): NextResponse =>
  NextResponse.json(data as object, { status: 201 });

export const fail = (
  status: number,
  code: string,
  message: string,
  details?: unknown,
): NextResponse<ApiError> =>
  NextResponse.json({ error: { code, message, ...(details ? { details } : {}) } }, { status });

export const unauthorized = () => fail(401, "unauthorized", "Sign in to continue.");
export const forbidden = () => fail(403, "forbidden", "You do not have access to that.");
export const notFound = (what = "Resource") => fail(404, "not_found", `${what} not found.`);

export const insufficientCredits = (needed: number, balance: number) =>
  fail(
    402,
    "insufficient_credits",
    `This needs ${needed} credits and you have ${Math.floor(balance)}. Top up to continue.`,
    { needed, balance },
  );

/** Turns anything thrown inside a route handler into a clean JSON response. */
export function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof ZodError) {
    return fail(422, "invalid_request", "Those details are not valid.", err.issues);
  }
  if (err instanceof ApiFailure) {
    return fail(err.status, err.code, err.message, err.details);
  }
  const message = err instanceof Error ? err.message : "Unexpected error.";
  console.error("[api] unhandled:", err);
  return fail(500, "internal_error", message);
}

/** Thrown by service code to short-circuit a handler with a specific status. */
export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiFailure";
  }
}
