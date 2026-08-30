import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  computeHash,
  findOrphanedSlugs,
  isUnchanged,
  readLockFile,
  writeLockFile,
} from "../src/lock.js";
import type { LockFile } from "../src/types.js";

describe("computeHash", () => {
  it("is deterministic for the same content", () => {
    expect(computeHash("hello")).toBe(computeHash("hello"));
  });

  it("differs for different content", () => {
    expect(computeHash("hello")).not.toBe(computeHash("world"));
  });
});

describe("readLockFile / writeLockFile", () => {
  let dir: string;
  let lockPath: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "zenn-syndicate-lock-"));
    lockPath = path.join(dir, ".zenn-syndicate.lock.json");
  });

  it("returns an empty lock when the file does not exist", async () => {
    const lock = await readLockFile(lockPath);
    expect(lock).toEqual({ version: 1, entries: {} });
  });

  it("returns an empty lock when the file is corrupt JSON", async () => {
    await writeFile(lockPath, "{not valid json", "utf8");
    const lock = await readLockFile(lockPath);
    expect(lock).toEqual({ version: 1, entries: {} });
  });

  it("round-trips a written lock file", async () => {
    const lock: LockFile = {
      version: 1,
      entries: {
        "my-article-slug-1": {
          sourcePath: "a.md",
          contentHash: computeHash("content"),
          images: { "images/my-article-slug-1/pic.png": computeHash("pic") },
        },
      },
    };
    await writeLockFile(lockPath, lock);
    const reread = await readLockFile(lockPath);
    expect(reread).toEqual(lock);
  });
});

describe("isUnchanged", () => {
  it("is true when the hash matches the lock entry", () => {
    const hash = computeHash("content");
    const lock: LockFile = {
      version: 1,
      entries: { "my-article-slug-1": { sourcePath: "a.md", contentHash: hash, images: {} } },
    };
    expect(isUnchanged(lock, "my-article-slug-1", hash)).toBe(true);
  });

  it("is false when the hash differs or the slug is new", () => {
    const lock: LockFile = {
      version: 1,
      entries: {
        "my-article-slug-1": { sourcePath: "a.md", contentHash: computeHash("old"), images: {} },
      },
    };
    expect(isUnchanged(lock, "my-article-slug-1", computeHash("new"))).toBe(false);
    expect(isUnchanged(lock, "unknown-slug-here-1", computeHash("new"))).toBe(false);
  });
});

describe("findOrphanedSlugs", () => {
  it("lists slugs from the lock that are absent from the current run", () => {
    const lock: LockFile = {
      version: 1,
      entries: {
        "kept-slug-aaaaaa": { sourcePath: "a.md", contentHash: "x", images: {} },
        "gone-slug-bbbbbb": { sourcePath: "b.md", contentHash: "y", images: {} },
      },
    };
    const orphaned = findOrphanedSlugs(lock, new Set(["kept-slug-aaaaaa"]));
    expect(orphaned).toEqual(["gone-slug-bbbbbb"]);
  });
});
