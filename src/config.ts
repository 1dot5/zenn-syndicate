import { access } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type {
  Diagnostic,
  DefaultsConfig,
  NoticeConfig,
  OutputConfig,
  ResolvedConfig,
  SourceConfig,
  ZennSyndicateConfig,
} from "./types.js";

/** Identity helper: exists purely so user config files get type checking/completion. */
export function defineConfig(config: ZennSyndicateConfig): ZennSyndicateConfig {
  return config;
}

const DEFAULT_INCLUDE = ["**/*.md"];
const DEFAULT_ARTICLES_DIR = "articles";
const DEFAULT_IMAGES_DIR = "images";
const DEFAULT_TYPE = "tech" as const;
const DEFAULT_PUBLISHED = false;
const DEFAULT_TOPICS: string[] = [];
const DEFAULT_NOTICE_ENABLED = true;
const DEFAULT_NOTICE_TEXT = "この記事は {sourceUrl} で公開したものをZenn向けに変換しています。";
export const DEFAULT_LOCK_FILE = ".zenn-syndicate.lock.json";

export type ConfigResult =
  { ok: true; config: ResolvedConfig } | { ok: false; diagnostics: Diagnostic[] };

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Loads and validates the user's config file. Failures here are always
 * fatal (exit code 2 territory) — they happen before any document is even
 * looked at, so there's nothing to partially process.
 */
export async function loadConfig(configPath: string, cwd: string): Promise<ConfigResult> {
  const absConfigPath = path.resolve(cwd, configPath);

  if (!(await pathExists(absConfigPath))) {
    return {
      ok: false,
      diagnostics: [
        {
          level: "error",
          code: "config-not-found",
          message: `config file not found: ${absConfigPath}`,
        },
      ],
    };
  }

  let mod: unknown;
  try {
    mod = await import(pathToFileURL(absConfigPath).href);
  } catch (err) {
    return {
      ok: false,
      diagnostics: [
        {
          level: "error",
          code: "config-load-failed",
          message: `failed to load config file: ${(err as Error).message}`,
        },
      ],
    };
  }

  const raw = (mod as { default?: unknown }).default;
  if (!raw || typeof raw !== "object") {
    return {
      ok: false,
      diagnostics: [
        {
          level: "error",
          code: "invalid-config",
          message:
            "config file must have a default export, e.g. `export default defineConfig({ ... })`",
        },
      ],
    };
  }

  const userConfig = raw as ZennSyndicateConfig;
  const configDir = path.dirname(absConfigPath);
  const diagnostics: Diagnostic[] = [];

  if (!userConfig.source?.dir) {
    diagnostics.push({
      level: "error",
      code: "missing-source-dir",
      message: "config.source.dir is required",
    });
  }
  if (!userConfig.output?.dir) {
    diagnostics.push({
      level: "error",
      code: "missing-output-dir",
      message: "config.output.dir is required",
    });
  }
  if (diagnostics.length > 0) return { ok: false, diagnostics };

  const source: SourceConfig = {
    dir: path.resolve(configDir, userConfig.source.dir),
    include: userConfig.source.include ?? DEFAULT_INCLUDE,
  };
  const output: OutputConfig = {
    dir: path.resolve(configDir, userConfig.output.dir),
    articlesDir: userConfig.output.articlesDir ?? DEFAULT_ARTICLES_DIR,
    imagesDir: userConfig.output.imagesDir ?? DEFAULT_IMAGES_DIR,
  };
  const defaults: DefaultsConfig = {
    type: userConfig.defaults?.type ?? DEFAULT_TYPE,
    published: userConfig.defaults?.published ?? DEFAULT_PUBLISHED,
    topics: userConfig.defaults?.topics ?? DEFAULT_TOPICS,
  };
  const notice: NoticeConfig = {
    enabled: userConfig.notice?.enabled ?? DEFAULT_NOTICE_ENABLED,
    text: userConfig.notice?.text ?? DEFAULT_NOTICE_TEXT,
  };
  const lockFile = path.resolve(configDir, userConfig.lockFile ?? DEFAULT_LOCK_FILE);

  // Existence checks happen before any document is processed — this is the
  // "nothing written at all" fatal case (exit code 2).
  if (!(await pathExists(source.dir))) {
    diagnostics.push({
      level: "error",
      code: "source-dir-not-found",
      message: `source.dir does not exist: ${source.dir}`,
    });
  }
  if (!(await pathExists(output.dir))) {
    diagnostics.push({
      level: "error",
      code: "output-dir-not-found",
      message: `output.dir does not exist: ${output.dir} (this must be an existing checkout of your Zenn repo)`,
    });
  }
  if (diagnostics.length > 0) return { ok: false, diagnostics };

  return { ok: true, config: { source, output, defaults, notice, lockFile, configDir } };
}
