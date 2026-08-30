import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { defineConfig, loadConfig } from "../src/config.js";

describe("defineConfig", () => {
  it("returns its input unchanged", () => {
    const input = { source: { dir: "a" }, output: { dir: "b" } };
    expect(defineConfig(input)).toBe(input);
  });
});

describe("loadConfig", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "zenn-syndicate-config-"));
    await mkdir(path.join(root, "content"));
    await mkdir(path.join(root, "zenn-repo"));
  });

  async function writeConfig(name: string, body: string): Promise<string> {
    const p = path.join(root, name);
    await writeFile(p, body, "utf8");
    return p;
  }

  it("loads a minimal valid config and applies defaults", async () => {
    const configPath = await writeConfig(
      "zenn-syndicate.config.mjs",
      `export default { source: { dir: "./content" }, output: { dir: "./zenn-repo" } };\n`,
    );
    const result = await loadConfig(configPath, root);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.source.dir).toBe(path.join(root, "content"));
    expect(result.config.output.dir).toBe(path.join(root, "zenn-repo"));
    expect(result.config.source.include).toEqual(["**/*.md"]);
    expect(result.config.output.articlesDir).toBe("articles");
    expect(result.config.output.imagesDir).toBe("images");
    expect(result.config.defaults.type).toBe("tech");
    expect(result.config.defaults.published).toBe(false);
    expect(result.config.notice.enabled).toBe(true);
  });

  it("resolves relative dirs against the config file's directory", async () => {
    const nested = path.join(root, "nested");
    await mkdir(nested);
    const configPath = await writeConfig(
      "nested/zenn-syndicate.config.mjs",
      `export default { source: { dir: "../content" }, output: { dir: "../zenn-repo" } };\n`,
    );
    const result = await loadConfig(configPath, root);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.source.dir).toBe(path.join(root, "content"));
  });

  it("fails when the config file does not exist", async () => {
    const result = await loadConfig(path.join(root, "nope.mjs"), root);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics[0]?.code).toBe("config-not-found");
  });

  it("fails when source.dir is missing from the config", async () => {
    const configPath = await writeConfig(
      "zenn-syndicate.config.mjs",
      `export default { output: { dir: "./zenn-repo" } };\n`,
    );
    const result = await loadConfig(configPath, root);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics.some((d) => d.code === "missing-source-dir")).toBe(true);
  });

  it("fails when output.dir does not exist on disk", async () => {
    const configPath = await writeConfig(
      "zenn-syndicate.config.mjs",
      `export default { source: { dir: "./content" }, output: { dir: "./does-not-exist" } };\n`,
    );
    const result = await loadConfig(configPath, root);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics.some((d) => d.code === "output-dir-not-found")).toBe(true);
  });

  it("fails when source.dir does not exist on disk", async () => {
    const configPath = await writeConfig(
      "zenn-syndicate.config.mjs",
      `export default { source: { dir: "./does-not-exist" }, output: { dir: "./zenn-repo" } };\n`,
    );
    const result = await loadConfig(configPath, root);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics.some((d) => d.code === "source-dir-not-found")).toBe(true);
  });
});
