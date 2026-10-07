import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/**
 * Short, sortable-enough, URL-safe ids with a type prefix so a stray id in a
 * log line is immediately identifiable.
 */
export function newId(prefix: string): string {
  const bytes = randomBytes(12);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return `${prefix}_${Date.now().toString(36)}${out}`;
}
