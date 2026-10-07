/**
 * Environment report.
 *
 * Prints which mode every capability resolved to and checks the external
 * binaries the render path needs, so "why is my video not rendering" is one
 * command rather than a support thread.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { capabilityReport, isLocalStudio } from "../src/lib/env";

const run = promisify(execFile);

const GREEN = "\u001b[32m";
const YELLOW = "\u001b[33m";
const RED = "\u001b[31m";
const DIM = "\u001b[2m";
const RESET = "\u001b[0m";

async function binaryVersion(bin: string): Promise<string | null> {
  try {
    const { stdout } = await run(bin, ["-version"]);
    return stdout.split("\n")[0] ?? bin;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  console.log("\nFaceless Video Studio — environment report\n");

  for (const cap of capabilityReport()) {
    const tag = cap.mode === "live" ? `${GREEN}live ${RESET}` : `${YELLOW}local${RESET}`;
    console.log(`  ${tag}  ${cap.capability.padEnd(9)} ${cap.vendor}`);
    console.log(`         ${DIM}${cap.detail}${RESET}`);
  }

  console.log("\n  Render dependencies");
  for (const bin of ["ffmpeg", "ffprobe"]) {
    const version = await binaryVersion(bin);
    if (version) {
      console.log(`  ${GREEN}ok   ${RESET}  ${bin.padEnd(9)} ${DIM}${version}${RESET}`);
    } else {
      console.log(`  ${RED}MISS ${RESET}  ${bin.padEnd(9)} not on PATH — rendering will fail`);
    }
  }

  console.log(
    isLocalStudio()
      ? `\n  ${YELLOW}Local Studio mode.${RESET} Everything runs on this machine with no vendor keys.\n  The full pipeline works; add keys in .env to upgrade individual providers.\n`
      : `\n  ${GREEN}Some providers are live.${RESET} See the report above for which.\n`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
