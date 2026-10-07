/** Filesystem storage driver — objects under .data/storage, served by /api/media. */
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";
import { DATA_DIR } from "@/lib/env";
import type { StorageDriver } from "./index";

export const STORAGE_ROOT = join(DATA_DIR, "storage");

/**
 * Keys arrive from request paths, so resolve defensively: a key containing
 * `..` must not be able to escape the storage root.
 */
export function resolveKey(key: string): string {
  const cleaned = normalize(key).replace(/^(\.\.(\/|\\|$))+/, "");
  const full = join(STORAGE_ROOT, cleaned);
  if (full !== STORAGE_ROOT && !full.startsWith(STORAGE_ROOT + sep)) {
    throw new Error(`Rejected storage key outside root: ${key}`);
  }
  return full;
}

export async function createLocalDriver(): Promise<StorageDriver> {
  await mkdir(STORAGE_ROOT, { recursive: true });
  return {
    kind: "local",
    async put(key, data) {
      const full = resolveKey(key);
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, data);
    },
    async get(key) {
      return readFile(resolveKey(key));
    },
    async exists(key) {
      try {
        return existsSync(resolveKey(key));
      } catch {
        return false;
      }
    },
    async remove(key) {
      await rm(resolveKey(key), { force: true });
    },
    async url(key) {
      return `/api/media/${key}`;
    },
    localPath(key) {
      try {
        return resolveKey(key);
      } catch {
        return null;
      }
    },
  };
}
