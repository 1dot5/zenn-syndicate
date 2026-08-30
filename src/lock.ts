import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import type { LockFile } from "./types.js";

function emptyLock(): LockFile {
  return { version: 1, entries: {} };
}

/** Deterministic content hash used to detect unchanged articles between runs. */
export function computeHash(content: string | Buffer): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

/** Reads the lock file, returning an empty lock when it's missing or unreadable. */
export async function readLockFile(filePath: string): Promise<LockFile> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<LockFile>;
    if (parsed && parsed.version === 1 && parsed.entries && typeof parsed.entries === "object") {
      return parsed as LockFile;
    }
    return emptyLock();
  } catch {
    return emptyLock();
  }
}

export async function writeLockFile(filePath: string, lock: LockFile): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
}

/** True when the given slug's previously recorded content hash matches. */
export function isUnchanged(lock: LockFile, slug: string, contentHash: string): boolean {
  return lock.entries[slug]?.contentHash === contentHash;
}

/** Slugs recorded in the lock file that no longer correspond to a current document. */
export function findOrphanedSlugs(lock: LockFile, currentSlugs: Set<string>): string[] {
  return Object.keys(lock.entries).filter((slug) => !currentSlugs.has(slug));
}
