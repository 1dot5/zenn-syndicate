import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { computeHash, findOrphanedSlugs, isUnchanged } from "./lock.js";
import type { Diagnostic, LockFile, OutputConfig, ProcessedDoc, ResolvedAsset } from "./types.js";

export interface EmitResult {
  diagnostics: Diagnostic[];
  filesWritten: number;
  lock: LockFile;
}

async function hashAssets(assets: ResolvedAsset[]): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {};
  for (const asset of assets) {
    const buf = await readFile(asset.absPath);
    hashes[asset.outputRelPath] = computeHash(buf);
  }
  return hashes;
}

function sameImages(
  current: Record<string, string>,
  previous: Record<string, string> | undefined,
): boolean {
  const prev = previous ?? {};
  const currentKeys = Object.keys(current);
  const prevKeys = Object.keys(prev);
  if (currentKeys.length !== prevKeys.length) return false;
  return currentKeys.every((key) => current[key] === prev[key]);
}

/**
 * The only module allowed to write to the output directory. `--dry-run`
 * (and `check`) are implemented by simply not calling this function's
 * write path — diagnostics (including "unchanged" and "orphaned-output")
 * are still computed so the report is accurate either way.
 */
export async function emit(
  docs: ProcessedDoc[],
  output: OutputConfig,
  previousLock: LockFile,
  dryRun: boolean,
): Promise<EmitResult> {
  const diagnostics: Diagnostic[] = [];
  const lock: LockFile = { version: 1, entries: {} };
  let filesWritten = 0;

  const writableDocs = docs.filter((d) => !d.hasError);
  const currentSlugs = new Set(writableDocs.map((d) => d.slug));

  for (const doc of writableDocs) {
    const contentHash = computeHash(doc.content);
    const imageHashes = await hashAssets(doc.assets);
    const previousEntry = previousLock.entries[doc.slug];
    const unchanged =
      isUnchanged(previousLock, doc.slug, contentHash) &&
      sameImages(imageHashes, previousEntry?.images);

    if (unchanged) {
      diagnostics.push({
        level: "info",
        code: "unchanged",
        message: "article unchanged since last build, skipped writing",
        file: doc.relPath,
        slug: doc.slug,
      });
      lock.entries[doc.slug] = previousEntry!;
      continue;
    }

    if (!dryRun) {
      const articlePath = path.join(output.dir, doc.outputRelPath);
      await mkdir(path.dirname(articlePath), { recursive: true });
      await writeFile(articlePath, doc.content, "utf8");

      for (const asset of doc.assets) {
        const destPath = path.join(output.dir, asset.outputRelPath);
        await mkdir(path.dirname(destPath), { recursive: true });
        await copyFile(asset.absPath, destPath);
      }

      filesWritten++;
    }

    lock.entries[doc.slug] = {
      sourcePath: doc.relPath,
      contentHash,
      images: imageHashes,
    };
  }

  for (const slug of findOrphanedSlugs(previousLock, currentSlugs)) {
    diagnostics.push({
      level: "warning",
      code: "orphaned-output",
      message: `previously generated article for slug "${slug}" no longer has a matching source document; its output was NOT deleted automatically`,
      slug,
    });
    lock.entries[slug] = previousLock.entries[slug]!;
  }

  return { diagnostics, filesWritten, lock: dryRun ? previousLock : lock };
}
