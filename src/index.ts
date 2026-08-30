import path from "node:path";
import { findLocalImageRefs, insertNotice, rewriteImagePaths } from "./body.js";
import { collectSourceDocs } from "./collect.js";
import { loadConfig } from "./config.js";
import { emit } from "./emit.js";
import { buildFrontMatter, isSingleEmoji } from "./frontmatter.js";
import { resolveAssets } from "./assets.js";
import { readLockFile, writeLockFile } from "./lock.js";
import { buildReport, exitCodeForReport } from "./report.js";
import { findDuplicateSlugs, resolveSlug } from "./slug.js";
import type {
  Diagnostic,
  ExitCode,
  ProcessedDoc,
  Report,
  ResolvedConfig,
  SourceDoc,
  ZennFrontMatterInput,
  ZennType,
} from "./types.js";

export { defineConfig } from "./config.js";
export type {
  Diagnostic,
  DiagnosticLevel,
  ExitCode,
  LockEntry,
  LockFile,
  ProcessedDoc,
  Report,
  ReportSummary,
  ResolvedAsset,
  ResolvedConfig,
  SourceDoc,
  Target,
  ZennFrontMatterInput,
  ZennSyndicateConfig,
  ZennType,
} from "./types.js";

export interface RunOptions {
  /** Path to the config file, relative to `cwd`. Defaults to "zenn-syndicate.config.mjs". */
  configPath?: string;
  /** Working directory used to resolve `configPath`. Defaults to `process.cwd()`. */
  cwd?: string;
  /** Skip writing files (and updating the lock file). `check()` always behaves this way. */
  dryRun?: boolean;
}

export interface RunResult {
  report: Report;
  exitCode: ExitCode;
}

interface Prepared {
  doc: SourceDoc;
  slug?: string;
  fm?: ZennFrontMatterInput;
  canonicalUrl?: string;
  hasError: boolean;
}

function validateDoc(
  doc: SourceDoc,
  config: ResolvedConfig,
): { prepared: Prepared; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  let hasError = false;

  const title = doc.frontMatter.title;
  if (typeof title !== "string" || title.trim().length === 0) {
    diagnostics.push({
      level: "error",
      code: "invalid-title",
      message: 'front matter "title" is required and must be a non-empty string',
      file: doc.relPath,
    });
    hasError = true;
  }

  const emoji = doc.frontMatter.emoji;
  if (!isSingleEmoji(emoji)) {
    diagnostics.push({
      level: "error",
      code: "invalid-emoji",
      message: 'front matter "emoji" is required and must be exactly one emoji character',
      file: doc.relPath,
    });
    hasError = true;
  }

  let type: ZennType = config.defaults.type;
  if (doc.frontMatter.type !== undefined) {
    if (doc.frontMatter.type !== "tech" && doc.frontMatter.type !== "idea") {
      diagnostics.push({
        level: "error",
        code: "invalid-type",
        message: `front matter "type" must be "tech" or "idea", got ${JSON.stringify(doc.frontMatter.type)}`,
        file: doc.relPath,
      });
      hasError = true;
    } else {
      type = doc.frontMatter.type;
    }
  }

  let topics: string[] = config.defaults.topics;
  if (doc.frontMatter.topics !== undefined) {
    const rawTopics = doc.frontMatter.topics;
    if (!Array.isArray(rawTopics) || !rawTopics.every((t) => typeof t === "string")) {
      diagnostics.push({
        level: "error",
        code: "invalid-topics",
        message: 'front matter "topics" must be an array of strings',
        file: doc.relPath,
      });
      hasError = true;
    } else if (rawTopics.length > 5) {
      diagnostics.push({
        level: "error",
        code: "too-many-topics",
        message: `front matter "topics" must have at most 5 entries, got ${rawTopics.length}`,
        file: doc.relPath,
      });
      hasError = true;
    } else {
      topics = rawTopics;
    }
  }

  let published: boolean = config.defaults.published;
  if (doc.frontMatter.published !== undefined) {
    if (typeof doc.frontMatter.published !== "boolean") {
      diagnostics.push({
        level: "error",
        code: "invalid-published",
        message: 'front matter "published" must be a boolean',
        file: doc.relPath,
      });
      hasError = true;
    } else {
      published = doc.frontMatter.published;
    }
  }

  const canonicalUrl =
    typeof doc.frontMatter.canonicalUrl === "string" ? doc.frontMatter.canonicalUrl : undefined;

  const slugResult = resolveSlug(doc.relPath, doc.frontMatter.slug);
  if (slugResult.diagnostic) {
    diagnostics.push(slugResult.diagnostic);
    hasError = true;
  }

  const fm: ZennFrontMatterInput | undefined = hasError
    ? undefined
    : { title: title as string, emoji: emoji as string, type, topics, published };

  return {
    prepared: { doc, slug: slugResult.slug, fm, canonicalUrl, hasError },
    diagnostics,
  };
}

async function runPipeline(options: RunOptions, forceDryRun: boolean): Promise<RunResult> {
  const cwd = options.cwd ?? process.cwd();
  const configPath = options.configPath ?? "zenn-syndicate.config.mjs";
  const dryRun = forceDryRun || options.dryRun === true;

  const configResult = await loadConfig(configPath, cwd);
  if (!configResult.ok) {
    const report = buildReport(configResult.diagnostics, 0, 0);
    return { report, exitCode: 2 };
  }
  const config = configResult.config;

  const diagnostics: Diagnostic[] = [];
  const { docs, diagnostics: collectDiagnostics } = await collectSourceDocs(config.source);
  diagnostics.push(...collectDiagnostics);

  const previousLock = await readLockFile(config.lockFile);

  const prepared: Prepared[] = [];
  for (const doc of docs) {
    const result = validateDoc(doc, config);
    diagnostics.push(...result.diagnostics);
    prepared.push(result.prepared);
  }

  const dupDiagnostics = findDuplicateSlugs(
    prepared
      .filter((p) => !p.hasError && p.slug !== undefined)
      .map((p) => ({ slug: p.slug!, file: p.doc.relPath })),
  );
  diagnostics.push(...dupDiagnostics);
  const duplicatedFiles = new Set(dupDiagnostics.map((d) => d.file!));
  for (const p of prepared) {
    if (duplicatedFiles.has(p.doc.relPath)) p.hasError = true;
  }

  const processedDocs: ProcessedDoc[] = [];
  for (const p of prepared) {
    if (p.hasError || !p.fm || p.slug === undefined) {
      processedDocs.push({
        slug: p.slug ?? p.doc.relPath,
        relPath: p.doc.relPath,
        content: "",
        outputRelPath: "",
        assets: [],
        hasError: true,
      });
      continue;
    }

    const localRefs = findLocalImageRefs(p.doc.body).map((r) => r.rawPath);
    const { assets, diagnostics: assetDiagnostics } = await resolveAssets(
      localRefs,
      p.doc.dir,
      p.slug,
      p.doc.relPath,
      config.output.imagesDir,
    );
    diagnostics.push(...assetDiagnostics);
    if (assetDiagnostics.some((d) => d.level === "error")) {
      processedDocs.push({
        slug: p.slug,
        relPath: p.doc.relPath,
        content: "",
        outputRelPath: "",
        assets: [],
        hasError: true,
      });
      continue;
    }

    const assetMap = new Map(assets.map((a) => [a.rawPath, a.outputRefPath]));
    let body = rewriteImagePaths(p.doc.body, (rawPath) => assetMap.get(rawPath));

    if (config.notice.enabled) {
      const noticeResult = insertNotice(body, config.notice.text, p.canonicalUrl);
      body = noticeResult.body;
      if (noticeResult.skipped) {
        diagnostics.push({
          level: "info",
          code: "notice-skipped-no-canonical-url",
          message: "notice not inserted: front matter has no canonicalUrl",
          file: p.doc.relPath,
          slug: p.slug,
        });
      }
    }

    const content = `${buildFrontMatter(p.fm)}${body}`;

    processedDocs.push({
      slug: p.slug,
      relPath: p.doc.relPath,
      content,
      outputRelPath: path.posix.join(config.output.articlesDir, `${p.slug}.md`),
      assets,
      hasError: false,
    });
  }

  const emitResult = await emit(processedDocs, config.output, previousLock, dryRun);
  diagnostics.push(...emitResult.diagnostics);

  if (!dryRun) {
    await writeLockFile(config.lockFile, emitResult.lock);
  }

  const report = buildReport(diagnostics, docs.length, emitResult.filesWritten);
  return { report, exitCode: exitCodeForReport(report) };
}

/** Converts, validates, and writes source documents into the configured Zenn repo checkout. */
export async function build(options: RunOptions = {}): Promise<RunResult> {
  return runPipeline(options, false);
}

/** Same validation as `build`, but never writes anything (files or the lock file). */
export async function check(options: RunOptions = {}): Promise<RunResult> {
  return runPipeline(options, true);
}
