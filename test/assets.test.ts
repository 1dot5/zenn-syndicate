import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { resolveAssets } from "../src/assets.js";

describe("resolveAssets", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "zenn-syndicate-assets-"));
  });

  it("resolves an existing local image relative to the doc's directory", async () => {
    await writeFile(path.join(dir, "pic.png"), "fake");
    const { assets, diagnostics } = await resolveAssets(
      ["./pic.png"],
      dir,
      "my-article-slug-1",
      "article.md",
      "images",
    );
    expect(diagnostics).toHaveLength(0);
    expect(assets).toHaveLength(1);
    expect(assets[0]?.fileName).toBe("pic.png");
    expect(assets[0]?.outputRelPath).toBe("images/my-article-slug-1/pic.png");
    expect(assets[0]?.outputRefPath).toBe("/images/my-article-slug-1/pic.png");
  });

  it("reports an error diagnostic for a missing image and skips it", async () => {
    const { assets, diagnostics } = await resolveAssets(
      ["./missing.png"],
      dir,
      "my-article-slug-1",
      "article.md",
      "images",
    );
    expect(assets).toHaveLength(0);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe("image-not-found");
    expect(diagnostics[0]?.level).toBe("error");
  });

  it("flags a filename collision between two different images with the same basename", async () => {
    await mkdir(path.join(dir, "a"));
    await mkdir(path.join(dir, "b"));
    await writeFile(path.join(dir, "a", "pic.png"), "one");
    await writeFile(path.join(dir, "b", "pic.png"), "two");

    const { assets, diagnostics } = await resolveAssets(
      ["./a/pic.png", "./b/pic.png"],
      dir,
      "my-article-slug-1",
      "article.md",
      "images",
    );
    expect(assets).toHaveLength(1);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe("asset-filename-collision");
  });

  it("does not flag the same raw path referenced twice", async () => {
    await writeFile(path.join(dir, "pic.png"), "fake");
    const { assets, diagnostics } = await resolveAssets(
      ["./pic.png", "./pic.png"],
      dir,
      "my-article-slug-1",
      "article.md",
      "images",
    );
    expect(diagnostics).toHaveLength(0);
    expect(assets).toHaveLength(2);
  });
});
