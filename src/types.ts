/** Severity of a single diagnostic. */
export type DiagnosticLevel = "error" | "warning" | "info";

/**
 * A single finding produced while collecting, validating, or converting a
 * source document. Diagnostics are collected, never thrown — a build/check
 * run processes every document and reports everything at once.
 */
export interface Diagnostic {
  level: DiagnosticLevel;
  /** Stable machine-readable code, e.g. "invalid-slug", "image-not-found". */
  code: string;
  message: string;
  /** Source file path, relative to the configured source directory. */
  file?: string;
  slug?: string;
}

/** Publication target. Only "zenn" is implemented in v1. */
export type Target = "zenn";

/** Zenn article type. */
export type ZennType = "tech" | "idea";

/** Front matter as read from a source Markdown file (before conversion). */
export interface SourceFrontMatter {
  title?: unknown;
  emoji?: unknown;
  type?: unknown;
  topics?: unknown;
  published?: unknown;
  slug?: unknown;
  [key: string]: unknown;
}

/** A source document collected from disk, not yet validated or converted. */
export interface SourceDoc {
  /** Absolute path to the source file. */
  absPath: string;
  /** Path relative to `source.dir`, used for reporting and slug fallback. */
  relPath: string;
  /** Directory containing the source file (for resolving relative images). */
  dir: string;
  frontMatter: SourceFrontMatter;
  /** Markdown body, front matter stripped. */
  body: string;
}

/** Fully resolved, validated fields ready to become Zenn front matter. */
export interface ZennFrontMatterInput {
  title: string;
  emoji: string;
  type: ZennType;
  topics: string[];
  published: boolean;
}

/** A single local image reference found in a document body. */
export interface ImageReference {
  /** Raw path as written in the Markdown, e.g. "./images/foo.png". */
  rawPath: string;
  /** Index into the body string where the path starts. */
  index: number;
}

/** Resolved location of an image on disk plus its destination. */
export interface ResolvedAsset {
  rawPath: string;
  /** Absolute path to the source image file. */
  absPath: string;
  /** File name only, used as the destination file name. */
  fileName: string;
  /** Path the body should be rewritten to, e.g. "/images/<slug>/foo.png". */
  outputRefPath: string;
  /** Path relative to output.dir, e.g. "images/<slug>/foo.png". */
  outputRelPath: string;
}

/** One fully processed article, ready to be (or not be) written to disk. */
export interface ProcessedDoc {
  slug: string;
  relPath: string;
  /** Final Markdown content (front matter + body) to write. */
  content: string;
  /** Path relative to output.dir where the article should be written. */
  outputRelPath: string;
  assets: ResolvedAsset[];
  /** True when this document has an error diagnostic and must not be written. */
  hasError: boolean;
}

export interface SourceConfig {
  dir: string;
  include: string[];
}

export interface OutputConfig {
  dir: string;
  articlesDir: string;
  imagesDir: string;
}

export interface DefaultsConfig {
  type: ZennType;
  published: boolean;
  topics: string[];
}

/** Fully resolved configuration (after defaults have been applied). */
export interface ResolvedConfig {
  source: SourceConfig;
  output: OutputConfig;
  defaults: DefaultsConfig;
  lockFile: string;
  /** Absolute path to the directory the config file lives in. */
  configDir: string;
}

/** User-facing configuration, as passed to `defineConfig`. All fields optional except source/output. */
export interface ZennSyndicateConfig {
  source: Partial<SourceConfig> & { dir: string };
  output: Partial<OutputConfig> & { dir: string };
  defaults?: Partial<DefaultsConfig>;
  lockFile?: string;
}

export interface LockEntry {
  sourcePath: string;
  contentHash: string;
  images: Record<string, string>;
}

export interface LockFile {
  version: 1;
  entries: Record<string, LockEntry>;
}

export interface ReportSummary {
  errors: number;
  warnings: number;
  infos: number;
  filesProcessed: number;
  filesWritten: number;
}

export interface Report {
  diagnostics: Diagnostic[];
  summary: ReportSummary;
}

/** Exit code convention shared by build/check. */
export type ExitCode = 0 | 1 | 2;
