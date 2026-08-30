import { describe, expect, it } from "vitest";
import { buildFrontMatter, isSingleEmoji } from "../src/frontmatter.js";

describe("buildFrontMatter", () => {
  it("does not escape emoji into \\U-style sequences", () => {
    const out = buildFrontMatter({
      title: "Hello",
      emoji: "🔧",
      type: "tech",
      topics: [],
      published: true,
    });
    expect(out).toContain('emoji: "🔧"');
    expect(out).not.toMatch(/\\U[0-9A-Fa-f]{8}/);
    expect(out).not.toMatch(/\\u[0-9A-Fa-f]{4}/);
  });

  it("escapes backslashes and double quotes in title", () => {
    const out = buildFrontMatter({
      title: 'He said "hi" \\ there',
      emoji: "🔧",
      type: "tech",
      topics: [],
      published: true,
    });
    expect(out).toContain('title: "He said \\"hi\\" \\\\ there"');
  });

  it("renders an empty topics array as []", () => {
    const out = buildFrontMatter({
      title: "T",
      emoji: "🔧",
      type: "tech",
      topics: [],
      published: true,
    });
    expect(out).toContain("topics: []");
  });

  it("escapes each topic element", () => {
    const out = buildFrontMatter({
      title: "T",
      emoji: "🔧",
      type: "tech",
      topics: ["typescript", 'weird "topic"'],
      published: true,
    });
    expect(out).toContain('topics: ["typescript", "weird \\"topic\\""]');
  });

  it("renders published as an unquoted boolean literal", () => {
    const outTrue = buildFrontMatter({
      title: "T",
      emoji: "🔧",
      type: "tech",
      topics: [],
      published: true,
    });
    const outFalse = buildFrontMatter({
      title: "T",
      emoji: "🔧",
      type: "tech",
      topics: [],
      published: false,
    });
    expect(outTrue).toContain("published: true");
    expect(outTrue).not.toContain('"true"');
    expect(outFalse).toContain("published: false");
    expect(outFalse).not.toContain('"false"');
  });

  it("emits fields in a fixed order: title, emoji, type, topics, published", () => {
    const out = buildFrontMatter({
      title: "T",
      emoji: "🔧",
      type: "idea",
      topics: ["a"],
      published: false,
    });
    const lines = out.split("\n").filter((l) => l.trim().length > 0 && l !== "---");
    expect(lines[0]?.startsWith("title:")).toBe(true);
    expect(lines[1]?.startsWith("emoji:")).toBe(true);
    expect(lines[2]?.startsWith("type:")).toBe(true);
    expect(lines[3]?.startsWith("topics:")).toBe(true);
    expect(lines[4]?.startsWith("published:")).toBe(true);
  });

  it("wraps the block in --- delimiters", () => {
    const out = buildFrontMatter({
      title: "T",
      emoji: "🔧",
      type: "tech",
      topics: [],
      published: true,
    });
    expect(out.startsWith("---\n")).toBe(true);
    expect(out.trimEnd().endsWith("---")).toBe(true);
  });

  it("accepts a plain single emoji", () => {
    expect(isSingleEmoji("🔧")).toBe(true);
  });

  it("accepts a ZWJ family emoji sequence as one character", () => {
    expect(isSingleEmoji("👨‍👩‍👧‍👦")).toBe(true);
  });

  it("accepts a flag emoji (regional indicator pair) as one character", () => {
    expect(isSingleEmoji("🇯🇵")).toBe(true);
  });

  it("rejects a plain ASCII letter", () => {
    expect(isSingleEmoji("a")).toBe(false);
  });

  it("rejects two emoji concatenated", () => {
    expect(isSingleEmoji("🔧🐛")).toBe(false);
  });

  it("rejects an empty string and non-strings", () => {
    expect(isSingleEmoji("")).toBe(false);
    expect(isSingleEmoji(undefined)).toBe(false);
    expect(isSingleEmoji(123)).toBe(false);
  });

  it("quotes the type field", () => {
    const out = buildFrontMatter({
      title: "T",
      emoji: "🔧",
      type: "idea",
      topics: [],
      published: true,
    });
    expect(out).toContain('type: "idea"');
  });
});
