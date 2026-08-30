import { describe, expect, it } from "vitest";
import { deriveSlug, findDuplicateSlugs, isValidSlug, resolveSlug } from "../src/slug.js";

describe("isValidSlug", () => {
  it("accepts a valid 12-50 char slug of [0-9a-z-_]", () => {
    expect(isValidSlug("my-first-post")).toBe(true);
    expect(isValidSlug("abc_123-def_456")).toBe(true);
  });

  it("rejects slugs shorter than 12 characters", () => {
    expect(isValidSlug("short")).toBe(false);
  });

  it("rejects slugs longer than 50 characters", () => {
    expect(isValidSlug("a".repeat(51))).toBe(false);
  });

  it("rejects uppercase letters and disallowed characters", () => {
    expect(isValidSlug("Has-Upper-Case")).toBe(false);
    expect(isValidSlug("has spaces here")).toBe(false);
    expect(isValidSlug("has.dots.here.ok")).toBe(false);
  });
});

describe("deriveSlug", () => {
  it("lowercases, and converts spaces/symbols to hyphens", () => {
    const slug = deriveSlug("My Cool Post!!.md");
    expect(isValidSlug(slug)).toBe(true);
    expect(slug.startsWith("my-cool-post")).toBe(true);
  });

  it("pads short filenames deterministically to reach the minimum length", () => {
    const a = deriveSlug("hi.md");
    const b = deriveSlug("hi.md");
    expect(isValidSlug(a)).toBe(true);
    expect(a).toBe(b);
  });

  it("produces different padded slugs for different paths with the same short stem", () => {
    const a = deriveSlug("dir-one/hi.md");
    const b = deriveSlug("dir-two/hi.md");
    expect(a).not.toBe(b);
  });

  it("truncates filenames longer than 50 characters without a trailing hyphen", () => {
    const longName = `${"a".repeat(60)}.md`;
    const slug = deriveSlug(longName);
    expect(slug.length).toBeLessThanOrEqual(50);
    expect(slug.endsWith("-")).toBe(false);
    expect(isValidSlug(slug)).toBe(true);
  });

  it("handles a stem made entirely of symbols (empty after sanitizing)", () => {
    const slug = deriveSlug("!!!.md");
    expect(isValidSlug(slug)).toBe(true);
  });

  it("uses only the file's base name, not its directory path", () => {
    const slug = deriveSlug("some/nested/dir/my-post-name.md");
    expect(slug.startsWith("my-post-name")).toBe(true);
  });
});

describe("resolveSlug", () => {
  it("uses an explicit valid slug as-is", () => {
    const result = resolveSlug("articles/foo.md", "explicit-valid-slug");
    expect(result.diagnostic).toBeUndefined();
    expect(result.slug).toBe("explicit-valid-slug");
  });

  it("returns an error diagnostic for an invalid explicit slug", () => {
    const result = resolveSlug("articles/foo.md", "bad slug!");
    expect(result.diagnostic?.level).toBe("error");
    expect(result.diagnostic?.code).toBe("invalid-slug");
    expect(result.slug).toBeUndefined();
  });

  it("derives a slug when none is given", () => {
    const result = resolveSlug("articles/my-post.md", undefined);
    expect(result.diagnostic).toBeUndefined();
    expect(result.slug).toBeDefined();
    expect(isValidSlug(result.slug!)).toBe(true);
  });

  it("errors when the explicit slug front matter field is not a string", () => {
    const result = resolveSlug("articles/foo.md", 123);
    expect(result.diagnostic?.level).toBe("error");
    expect(result.diagnostic?.code).toBe("invalid-slug");
  });
});

describe("findDuplicateSlugs", () => {
  it("returns no diagnostics when all slugs are unique", () => {
    const diags = findDuplicateSlugs([
      { slug: "aaa-bbb-ccc-1", file: "a.md" },
      { slug: "aaa-bbb-ccc-2", file: "b.md" },
    ]);
    expect(diags).toHaveLength(0);
  });

  it("flags every file sharing a duplicated slug", () => {
    const diags = findDuplicateSlugs([
      { slug: "aaa-bbb-ccc-1", file: "a.md" },
      { slug: "aaa-bbb-ccc-1", file: "b.md" },
      { slug: "aaa-bbb-ccc-2", file: "c.md" },
    ]);
    expect(diags).toHaveLength(2);
    expect(diags.every((d) => d.code === "duplicate-slug" && d.level === "error")).toBe(true);
    expect(diags.map((d) => d.file).sort()).toEqual(["a.md", "b.md"]);
  });
});
