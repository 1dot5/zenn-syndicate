import { stat } from "node:fs/promises";
import path from "node:path";
import type { Diagnostic, ResolvedAsset } from "./types.js";

/**
 * Resolves local image references (already extracted from a document body)
 * against the document's own directory, validates they exist, and computes
 * where each should land in the output tree. Read-only: no files are copied
 * here — emit.ts is the only module allowed to write.
 */
export async function resolveAssets(
  rawPaths: string[],
  docDir: string,
  slug: string,
  file: string,
  imagesDir: string,
): Promise<{ assets: ResolvedAsset[]; diagnostics: Diagnostic[] }> {
  const diagnostics: Diagnostic[] = [];
  const assets: ResolvedAsset[] = [];
  const seenFileNames = new Map<string, string>();

  for (const rawPath of rawPaths) {
    const absPath = path.resolve(docDir, rawPath);

    try {
      const st = await stat(absPath);
      if (!st.isFile()) throw new Error("not a regular file");
    } catch {
      diagnostics.push({
        level: "error",
        code: "image-not-found",
        message: `referenced image not found: ${rawPath}`,
        file,
        slug,
      });
      continue;
    }

    const fileName = path.basename(absPath);
    const existingRaw = seenFileNames.get(fileName);
    if (existingRaw !== undefined && existingRaw !== rawPath) {
      diagnostics.push({
        level: "error",
        code: "asset-filename-collision",
        message: `multiple images named "${fileName}" would collide in output for slug "${slug}": ${existingRaw} and ${rawPath}`,
        file,
        slug,
      });
      continue;
    }
    seenFileNames.set(fileName, rawPath);

    const outputRelPath = path.posix.join(imagesDir, slug, fileName);
    assets.push({
      rawPath,
      absPath,
      fileName,
      outputRefPath: `/${outputRelPath}`,
      outputRelPath,
    });
  }

  return { assets, diagnostics };
}
