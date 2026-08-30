import { describe, expect, it } from "vitest";
import {
  findExcludedRanges,
  findLocalImageRefs,
  insertNotice,
  rewriteImagePaths,
} from "../src/body.js";

describe("findExcludedRanges", () => {
  it("finds no ranges in plain text", () => {
    expect(findExcludedRanges("just some text")).toHaveLength(0);
  });

  it("excludes a fenced code block using triple backticks", () => {
    const body = "before\n```\ncode here\n```\nafter";
    const ranges = findExcludedRanges(body);
    expect(ranges).toHaveLength(1);
    const fenceStart = body.indexOf("```");
    const fenceEnd = body.lastIndexOf("```") + 3;
    expect(ranges[0]).toEqual({ start: fenceStart, end: fenceEnd });
  });

  it("excludes a fenced code block using tildes", () => {
    const body = "before\n~~~\ncode here\n~~~\nafter";
    const ranges = findExcludedRanges(body);
    expect(ranges).toHaveLength(1);
  });

  it("does not let a shorter nested fence close an outer longer fence", () => {
    const body = ["outer", "````", "```", "still inside", "````", "after"].join("\n");
    const ranges = findExcludedRanges(body);
    expect(ranges).toHaveLength(1);
    const start = body.indexOf("````");
    const end = body.lastIndexOf("````") + 4;
    expect(ranges[0]).toEqual({ start, end });
  });

  it("excludes an inline code span", () => {
    const body = "text `code span` more text";
    const ranges = findExcludedRanges(body);
    expect(ranges).toHaveLength(1);
    expect(ranges[0]).toEqual({ start: body.indexOf("`code"), end: body.indexOf("` more") + 1 });
  });

  it("does not treat an unmatched backtick run as a span", () => {
    const body = "text ` unmatched backtick";
    const ranges = findExcludedRanges(body);
    expect(ranges).toHaveLength(0);
  });
});

describe("rewriteImagePaths", () => {
  const resolve = (rawPath: string) =>
    rawPath.startsWith("http") ? undefined : `/images/my-slug/${rawPath.split("/").pop()}`;

  it("rewrites a plain image reference", () => {
    const body = "![alt text](./assets/pic.png)";
    const out = rewriteImagePaths(body, resolve);
    expect(out).toBe("![alt text](/images/my-slug/pic.png)");
  });

  it("does not rewrite an image reference inside an inline code span", () => {
    const body = "see `![a](b.png)` for example";
    const out = rewriteImagePaths(body, resolve);
    expect(out).toBe(body);
  });

  it("does not rewrite an image reference inside a fenced code block", () => {
    const body = "```md\n![a](b.png)\n```";
    const out = rewriteImagePaths(body, resolve);
    expect(out).toBe(body);
  });

  it("does not rewrite inside a nested fence (4-backtick outer containing a 3-backtick line)", () => {
    const body = ["````", "```", "![a](b.png)", "```", "````"].join("\n");
    const out = rewriteImagePaths(body, resolve);
    expect(out).toBe(body);
  });

  it("does not rewrite http(s) image paths", () => {
    const body = "![remote](https://example.com/pic.png)";
    const out = rewriteImagePaths(body, resolve);
    expect(out).toBe(body);
  });

  it("rewrites multiple images outside code while leaving code-block images untouched", () => {
    const body = ["![one](a.png)", "", "```", "![two](b.png)", "```", "", "![three](c.png)"].join(
      "\n",
    );
    const out = rewriteImagePaths(body, resolve);
    expect(out).toContain("![one](/images/my-slug/a.png)");
    expect(out).toContain("![two](b.png)");
    expect(out).toContain("![three](/images/my-slug/c.png)");
  });

  it("leaves the reference unchanged when the resolver returns undefined for a local path", () => {
    const noResolve = () => undefined;
    const body = "![alt](missing.png)";
    const out = rewriteImagePaths(body, noResolve);
    expect(out).toBe(body);
  });
});

describe("findLocalImageRefs", () => {
  it("lists local image paths outside code, skipping remote and code-block ones", () => {
    const body = [
      "![one](a.png)",
      "`![inline](b.png)`",
      "```",
      "![two](c.png)",
      "```",
      "![remote](https://example.com/d.png)",
      "![three](e.png)",
    ].join("\n");
    const refs = findLocalImageRefs(body);
    expect(refs.map((r) => r.rawPath)).toEqual(["a.png", "e.png"]);
  });
});

describe("insertNotice", () => {
  it("substitutes {sourceUrl} when canonicalUrl is present", () => {
    const result = insertNotice(
      "Hello world",
      "Originally posted at {sourceUrl}.",
      "https://x.example/post",
    );
    expect(result.skipped).toBe(false);
    expect(result.body.startsWith("> Originally posted at https://x.example/post.")).toBe(true);
    expect(result.body).toContain("Hello world");
  });

  it("skips insertion when the template needs {sourceUrl} but canonicalUrl is missing", () => {
    const original = "Hello world";
    const result = insertNotice(original, "Originally posted at {sourceUrl}.", undefined);
    expect(result.skipped).toBe(true);
    expect(result.body).toBe(original);
  });

  it("always inserts a template with no {sourceUrl} placeholder", () => {
    const result = insertNotice("Hello world", "This is a syndicated copy.", undefined);
    expect(result.skipped).toBe(false);
    expect(result.body.startsWith("> This is a syndicated copy.")).toBe(true);
  });
});
