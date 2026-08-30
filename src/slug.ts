import { createHash } from "node:crypto";
import type { Diagnostic } from "./types.js";

const SLUG_RE = /^[0-9a-z\-_]{12,50}$/;
const MIN_LEN = 12;
const MAX_LEN = 50;

/** Zenn's slug constraint: 12-50 chars of [0-9a-z-_]. */
export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}

function sanitizeBase(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^0-9a-z\-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function hashSuffix(input: string, length: number): string {
  return createHash("sha256").update(input).digest("hex").slice(0, length);
}

function baseName(relPath: string): string {
  const withoutDir = relPath.split(/[\\/]/).pop() ?? relPath;
  return withoutDir.replace(/\.[^./\\]+$/, "");
}

/**
 * Derives a slug from a source file's path (relative to source.dir).
 * Deterministic: the same relPath always yields the same slug, so re-running
 * a build doesn't churn slugs. Short or symbol-only stems are padded with a
 * hash of the full relative path, keeping padded slugs unique across files
 * that happen to share a short base name in different directories.
 */
export function deriveSlug(relPath: string): string {
  let base = sanitizeBase(baseName(relPath));

  if (base.length < MIN_LEN) {
    base = base.length > 0 ? `${base}-${hashSuffix(relPath, 10)}` : hashSuffix(relPath, MIN_LEN);
  }

  if (base.length > MAX_LEN) {
    base = base.slice(0, MAX_LEN).replace(/-+$/, "");
  }

  return base;
}

/**
 * Resolves the slug for a document: validates an explicit front-matter slug
 * if given, otherwise derives one from the file path. Returns a diagnostic
 * (and no slug) when an explicit slug is invalid.
 */
export function resolveSlug(
  relPath: string,
  explicitSlug: unknown,
): { slug?: string; diagnostic?: Diagnostic } {
  if (explicitSlug === undefined || explicitSlug === null) {
    return { slug: deriveSlug(relPath) };
  }

  if (typeof explicitSlug !== "string" || !isValidSlug(explicitSlug)) {
    return {
      diagnostic: {
        level: "error",
        code: "invalid-slug",
        message: `front matter "slug" must be a string of 12-50 characters matching [0-9a-z-_], got ${JSON.stringify(
          explicitSlug,
        )}`,
        file: relPath,
      },
    };
  }

  return { slug: explicitSlug };
}

/** Flags every document whose resolved slug collides with another's, within one run. */
export function findDuplicateSlugs(items: { slug: string; file: string }[]): Diagnostic[] {
  const byslug = new Map<string, string[]>();
  for (const item of items) {
    const list = byslug.get(item.slug) ?? [];
    list.push(item.file);
    byslug.set(item.slug, list);
  }

  const diagnostics: Diagnostic[] = [];
  for (const [slug, files] of byslug) {
    if (files.length <= 1) continue;
    for (const file of files) {
      diagnostics.push({
        level: "error",
        code: "duplicate-slug",
        message: `slug "${slug}" is used by multiple documents: ${files.join(", ")}`,
        file,
        slug,
      });
    }
  }
  return diagnostics;
}
