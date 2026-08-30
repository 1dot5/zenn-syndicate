import type { ZennFrontMatterInput } from "./types.js";

/**
 * Escapes a string for use inside a double-quoted YAML-ish scalar built by
 * hand. We deliberately do NOT use a YAML library's dump here: libraries
 * such as `yaml` escape non-ASCII scalars (emoji included) into `\uXXXX` /
 * `\UXXXXXXXX` sequences, which breaks Zenn's rendering of the emoji field.
 * Building the string ourselves keeps emoji and other unicode untouched.
 */
function escapeQuoted(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function quote(value: string): string {
  return `"${escapeQuoted(value)}"`;
}

const emojiSegmenter = new Intl.Segmenter("en", { granularity: "grapheme" });

/**
 * True when `value` is exactly one non-ASCII grapheme cluster — a single
 * emoji, including multi-codepoint forms (ZWJ sequences, flags, skin tone
 * modifiers). Uses the built-in `Intl.Segmenter` rather than a hand-rolled
 * emoji regex, since grapheme-cluster boundaries are exactly "one visible
 * character" regardless of how many code points it's made of.
 */
export function isSingleEmoji(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  const segments = [...emojiSegmenter.segment(value)];
  if (segments.length !== 1) return false;
  // Reject plain ASCII (a single letter/digit/punctuation is one grapheme too,
  // but not an emoji).
  return (value.codePointAt(0) ?? 0) > 0x7f;
}

/**
 * Builds a Zenn-compatible front matter block as a plain string, with a
 * fixed field order (title, emoji, type, topics, published).
 */
export function buildFrontMatter(input: ZennFrontMatterInput): string {
  const topics = `[${input.topics.map(quote).join(", ")}]`;
  const lines = [
    "---",
    `title: ${quote(input.title)}`,
    `emoji: ${quote(input.emoji)}`,
    `type: ${quote(input.type)}`,
    `topics: ${topics}`,
    `published: ${input.published ? "true" : "false"}`,
    "---",
    "",
  ];
  return lines.join("\n");
}
