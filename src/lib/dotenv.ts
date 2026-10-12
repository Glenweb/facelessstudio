/**
 * Minimal .env loader.
 *
 * Next.js reads .env itself, so the app has always seen these values. The CLI
 * scripts — doctor, selftest, db-seed, smoke, worker — run under plain tsx,
 * which does not, so they silently reported every provider as `local` no
 * matter what was configured. `doctor` existing to answer "is my key working"
 * while being unable to see the key is the worst version of that bug.
 *
 * Written by hand rather than pulling in dotenv: it is thirty lines, it runs
 * before anything else, and it keeps the dependency list honest.
 *
 * Load order matches Next.js — .env.local wins over .env — and a variable
 * already present in the real environment always wins over both, so
 * `ELEVENLABS_API_KEY=... npm run doctor` behaves as expected.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function parse(contents: string): Record<string, string> {
  const out: Record<string, string> = {};

  // Split on \n after stripping \r, so a Windows-authored file parses the
  // same as a Unix one. Without this every value carries a trailing \r and
  // an API key silently fails authentication.
  for (const rawLine of contents.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;

    const withoutExport = line.startsWith("export ") ? line.slice(7).trim() : line;
    const eq = withoutExport.indexOf("=");
    if (eq <= 0) continue;

    const key = withoutExport.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let value = withoutExport.slice(eq + 1).trim();

    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote) && value.length > 1) {
      value = value.slice(1, -1);
      // Only double quotes carry escapes, as in every other dotenv dialect.
      if (quote === '"') value = value.replace(/\\n/g, "\n").replace(/\\"/g, '"');
    } else {
      // An unquoted value ends at an inline comment, but only one that is
      // actually separated — a '#' inside a token is part of the value.
      const hash = value.search(/\s#/);
      if (hash >= 0) value = value.slice(0, hash).trim();
    }

    out[key] = value;
  }

  return out;
}

let loaded = false;

/** Idempotent. Safe to call from any entry point, including under Next.js. */
export function loadDotEnv(cwd: string = process.cwd()): void {
  if (loaded) return;
  loaded = true;

  // Later files do not override earlier ones, so .env.local takes precedence.
  for (const name of [".env.local", ".env"]) {
    const path = join(cwd, name);
    if (!existsSync(path)) continue;
    try {
      for (const [key, value] of Object.entries(parse(readFileSync(path, "utf8")))) {
        // A real environment variable always beats a file.
        if (process.env[key] === undefined) process.env[key] = value;
      }
    } catch (err) {
      console.warn(`[env] could not read ${name}:`, err instanceof Error ? err.message : err);
    }
  }
}
