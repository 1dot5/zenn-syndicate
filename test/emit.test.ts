import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { emit } from "../src/emit.js";
import { computeHash } from "../src/lock.js";
import type { LockFile, OutputConfig, ProcessedDoc, ResolvedAsset } from "../src/types.js";

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

describe("emit", () => {
  let outDir: string;
  let assetSrcDir: string;
  let output: OutputConfig;
  let emptyLock: LockFile;

  beforeEach(async () => {
    outDir = await mkdtemp(path.join(tmpdir(), "zenn-syndicate-out-"));
    assetSrcDir = await mkdtemp(path.join(tmpdir(), "zenn-syndicate-asset-src-"));
    output = { dir: outDir, articlesDir: "articles", imagesDir: "images" };
    emptyLock = { version: 1, entries: {} };
  });

  function makeAsset(slug: string): ResolvedAsset {
    return {
      rawPath: "./pic.png",
      absPath: path.join(assetSrcDir, "pic.png"),
      fileName: "pic.png",
      outputRefPath: `/images/${slug}/pic.png`,
      outputRelPath: `images/${slug}/pic.png`,
    };
  }

  function makeDoc(slug: string, content: string, assets: ResolvedAsset[] = []): ProcessedDoc {
    return {
      slug,
      relPath: `${slug}.md`,
      content,
      outputRelPath: `articles/${slug}.md`,
      assets,
      hasError: false,
    };
  }

  it("writes the article file and copies its assets", async () => {
    await writeFile(path.join(assetSrcDir, "pic.png"), "fake-image-bytes");
    const slug = "article-one-slug";
    const doc = makeDoc(slug, "---\n---\nhello", [makeAsset(slug)]);

    const result = await emit([doc], output, emptyLock, false);

    expect(result.filesWritten).toBe(1);
    expect(await exists(path.join(outDir, "articles", `${slug}.md`))).toBe(true);
    expect(await readFile(path.join(outDir, "articles", `${slug}.md`), "utf8")).toBe(doc.content);
    expect(await exists(path.join(outDir, "images", slug, "pic.png"))).toBe(true);
    expect(result.lock.entries[slug]?.sourcePath).toBe(doc.relPath);
  });

  it("dry-run writes nothing and returns the lock unchanged", async () => {
    const slug = "article-two-slug";
    const doc = makeDoc(slug, "---\n---\nhello");

    const result = await emit([doc], output, emptyLock, true);

    expect(result.filesWritten).toBe(0);
    expect(await exists(path.join(outDir, "articles", `${slug}.md`))).toBe(false);
    expect(result.lock).toBe(emptyLock);
  });

  it("skips writing and reports 'unchanged' when content and assets match the lock", async () => {
    await writeFile(path.join(assetSrcDir, "pic.png"), "fake-image-bytes");
    const slug = "article-three-slug";
    const content = "---\n---\nhello";
    const asset = makeAsset(slug);
    const previousLock: LockFile = {
      version: 1,
      entries: {
        [slug]: {
          sourcePath: `${slug}.md`,
          contentHash: computeHash(content),
          images: { [asset.outputRelPath]: computeHash("fake-image-bytes") },
        },
      },
    };
    const doc = makeDoc(slug, content, [asset]);

    const result = await emit([doc], output, previousLock, false);

    expect(result.filesWritten).toBe(0);
    expect(await exists(path.join(outDir, "articles", `${slug}.md`))).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "unchanged")).toBe(true);
  });

  it("re-writes when the image content changed even though the markdown didn't", async () => {
    await writeFile(path.join(assetSrcDir, "pic.png"), "new-bytes");
    const slug = "article-four-slug";
    const content = "---\n---\nhello";
    const asset = makeAsset(slug);
    const previousLock: LockFile = {
      version: 1,
      entries: {
        [slug]: {
          sourcePath: `${slug}.md`,
          contentHash: computeHash(content),
          images: { [asset.outputRelPath]: computeHash("old-bytes") },
        },
      },
    };
    const doc = makeDoc(slug, content, [asset]);

    const result = await emit([doc], output, previousLock, false);

    expect(result.filesWritten).toBe(1);
    expect(result.diagnostics.some((d) => d.code === "unchanged")).toBe(false);
  });

  it("reports an orphaned-output warning for a slug no longer present, without deleting anything", async () => {
    const previousLock: LockFile = {
      version: 1,
      entries: {
        "gone-slug-aaaaaa": {
          sourcePath: "gone.md",
          contentHash: "sha256:x",
          images: {},
        },
      },
    };

    const result = await emit([], output, previousLock, false);

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe("orphaned-output");
    expect(result.diagnostics[0]?.level).toBe("warning");
  });

  it("does not write documents that have an error", async () => {
    const slug = "article-five-slug";
    const doc: ProcessedDoc = { ...makeDoc(slug, "content"), hasError: true };

    const result = await emit([doc], output, emptyLock, false);

    expect(result.filesWritten).toBe(0);
    expect(await exists(path.join(outDir, "articles", `${slug}.md`))).toBe(false);
  });
});
