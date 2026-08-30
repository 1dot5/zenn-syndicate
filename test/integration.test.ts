import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { build, check } from "../src/index.js";
import { formatJson } from "../src/report.js";

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

describe("build / check integration", () => {
  let root: string;
  let sourceDir: string;
  let outputDir: string;
  let configPath: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "zenn-syndicate-e2e-"));
    sourceDir = path.join(root, "content");
    outputDir = path.join(root, "zenn-repo");
    await mkdir(sourceDir, { recursive: true });
    await mkdir(outputDir, { recursive: true });

    configPath = path.join(root, "zenn-syndicate.config.mjs");
    await writeFile(
      configPath,
      [
        "export default {",
        `  source: { dir: ${JSON.stringify(sourceDir)} },`,
        `  output: { dir: ${JSON.stringify(outputDir)} },`,
        `  lockFile: ${JSON.stringify(path.join(root, ".zenn-syndicate.lock.json"))},`,
        "};",
        "",
      ].join("\n"),
    );
  });

  it("writes valid articles and skips ones with errors, exiting with code 1", async () => {
    await writeFile(
      path.join(sourceDir, "good-article.md"),
      [
        "---",
        'title: "A good article"',
        'emoji: "🔧"',
        "published: true",
        "---",
        "",
        "Body text.",
      ].join("\n"),
    );
    await writeFile(
      path.join(sourceDir, "bad-article.md"),
      ["---", 'emoji: "🐛"', "---", "", "Missing a title."].join("\n"),
    );

    const { report, exitCode } = await build({ configPath, cwd: root });

    expect(exitCode).toBe(1);
    expect(report.summary.errors).toBeGreaterThan(0);
    expect(await exists(path.join(outputDir, "articles", "good-article.md"))).toBe(true);
    expect(report.diagnostics.some((d) => d.file === "bad-article.md" && d.level === "error")).toBe(
      true,
    );
    expect(report.summary.filesWritten).toBe(1);
  });

  it("returns exit code 2 and writes nothing when output.dir does not exist", async () => {
    await writeFile(
      path.join(sourceDir, "good-article.md"),
      ["---", 'title: "A good article"', 'emoji: "🔧"', "---", "", "Body."].join("\n"),
    );
    const badConfigPath = path.join(root, "bad.config.mjs");
    await writeFile(
      badConfigPath,
      [
        "export default {",
        `  source: { dir: ${JSON.stringify(sourceDir)} },`,
        `  output: { dir: ${JSON.stringify(path.join(root, "does-not-exist"))} },`,
        "};",
        "",
      ].join("\n"),
    );

    const { report, exitCode } = await build({ configPath: badConfigPath, cwd: root });

    expect(exitCode).toBe(2);
    expect(report.summary.filesWritten).toBe(0);
    expect(report.diagnostics.some((d) => d.code === "output-dir-not-found")).toBe(true);
  });

  it("check never writes files even when a valid article is found", async () => {
    await writeFile(
      path.join(sourceDir, "good-article.md"),
      ["---", 'title: "A good article"', 'emoji: "🔧"', "---", "", "Body."].join("\n"),
    );

    const { report, exitCode } = await check({ configPath, cwd: root });

    expect(exitCode).toBe(0);
    expect(report.summary.filesWritten).toBe(0);
    const files = await readFile(configPath, "utf8"); // just confirm config still readable / no crash
    expect(files).toContain("source");
  });

  it("build --dry-run writes nothing", async () => {
    await writeFile(
      path.join(sourceDir, "good-article.md"),
      ["---", 'title: "A good article"', 'emoji: "🔧"', "---", "", "Body."].join("\n"),
    );

    const { exitCode, report } = await build({ configPath, cwd: root, dryRun: true });

    expect(exitCode).toBe(0);
    expect(report.summary.filesWritten).toBe(0);
    expect(await exists(path.join(outputDir, "articles"))).toBe(false);
  });

  it("produces a JSON report matching the documented shape", async () => {
    await writeFile(
      path.join(sourceDir, "good-article.md"),
      ["---", 'title: "A good article"', 'emoji: "🔧"', "---", "", "Body."].join("\n"),
    );

    const { report } = await build({ configPath, cwd: root });
    const json = JSON.parse(formatJson(report));

    expect(json).toHaveProperty("diagnostics");
    expect(json).toHaveProperty("summary.errors");
    expect(json).toHaveProperty("summary.warnings");
    expect(json).toHaveProperty("summary.infos");
    expect(json).toHaveProperty("summary.filesProcessed");
    expect(json).toHaveProperty("summary.filesWritten");
  });

  it("second build with unchanged content reports 'unchanged' and does not rewrite", async () => {
    await writeFile(
      path.join(sourceDir, "good-article.md"),
      ["---", 'title: "A good article"', 'emoji: "🔧"', "---", "", "Body."].join("\n"),
    );

    const first = await build({ configPath, cwd: root });
    expect(first.report.summary.filesWritten).toBe(1);

    const second = await build({ configPath, cwd: root });
    expect(second.report.summary.filesWritten).toBe(0);
    expect(second.report.diagnostics.some((d) => d.code === "unchanged")).toBe(true);
  });
});
