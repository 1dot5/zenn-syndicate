import { readFile } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { glob } from "tinyglobby";
import YAML from "yaml";
import type { Diagnostic, SourceConfig, SourceDoc } from "./types.js";

/**
 * Collects source documents matching `source.include` under `source.dir`.
 * Front matter is parsed with the `yaml` package (not gray-matter's default
 * js-yaml engine) — `yaml` is used for reading only; writing is handled by
 * hand-built strings in frontmatter.ts, never by a YAML dumper.
 */
export async function collectSourceDocs(
  source: SourceConfig,
): Promise<{ docs: SourceDoc[]; diagnostics: Diagnostic[] }> {
  const diagnostics: Diagnostic[] = [];
  const docs: SourceDoc[] = [];
  const absSourceDir = path.resolve(source.dir);

  const files = (
    await glob(source.include, { cwd: absSourceDir, absolute: false, onlyFiles: true })
  ).sort();

  for (const relPath of files) {
    const absPath = path.join(absSourceDir, relPath);
    let raw: string;
    try {
      raw = await readFile(absPath, "utf8");
    } catch (err) {
      diagnostics.push({
        level: "error",
        code: "read-failed",
        message: `failed to read file: ${(err as Error).message}`,
        file: relPath,
      });
      continue;
    }

    let frontMatter: Record<string, unknown>;
    let body: string;
    try {
      const parsed = matter(raw, { engines: { yaml: (s: string) => YAML.parse(s) ?? {} } });
      frontMatter = parsed.data;
      body = parsed.content;
    } catch (err) {
      diagnostics.push({
        level: "error",
        code: "frontmatter-parse-failed",
        message: `failed to parse front matter: ${(err as Error).message}`,
        file: relPath,
      });
      continue;
    }

    docs.push({
      absPath,
      relPath,
      dir: path.dirname(absPath),
      frontMatter,
      body,
    });
  }

  return { docs, diagnostics };
}
