import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { collectSourceDocs } from "../src/collect.js";

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "src");

describe("collectSourceDocs", () => {
  it("collects markdown files matching the include globs, sorted", async () => {
    const { docs, diagnostics } = await collectSourceDocs({
      dir: fixturesDir,
      include: ["**/*.md"],
    });
    expect(diagnostics).toHaveLength(0);
    expect(docs.map((d) => d.relPath)).toEqual(["hello-world.md", "missing-image.md"]);
  });

  it("parses front matter without mangling emoji or unicode", async () => {
    const { docs } = await collectSourceDocs({ dir: fixturesDir, include: ["hello-world.md"] });
    expect(docs[0]?.frontMatter.title).toBe("Hello World");
    expect(docs[0]?.frontMatter.emoji).toBe("🔧");
    expect(docs[0]?.frontMatter.topics).toEqual(["ts", "cli"]);
    expect(docs[0]?.frontMatter.published).toBe(true);
  });

  it("strips front matter from the body", async () => {
    const { docs } = await collectSourceDocs({ dir: fixturesDir, include: ["hello-world.md"] });
    expect(docs[0]?.body).not.toContain("title:");
    expect(docs[0]?.body).toContain("Some intro text.");
  });

  it("resolves an empty result for a source dir with no matches, without throwing", async () => {
    const { docs, diagnostics } = await collectSourceDocs({
      dir: fixturesDir,
      include: ["**/*.nonexistent"],
    });
    expect(docs).toHaveLength(0);
    expect(diagnostics).toHaveLength(0);
  });
});
