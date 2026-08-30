/** A [start, end) byte range in a body string that must not be touched by rewrites. */
export interface CodeRange {
  start: number;
  end: number;
}

const FENCE_OPEN_RE = /^ {0,3}(`{3,}|~{3,})/;

function lineStarts(body: string): number[] {
  const starts = [0];
  for (let i = 0; i < body.length; i++) {
    if (body[i] === "\n") starts.push(i + 1);
  }
  return starts;
}

/**
 * Scans a Markdown body for fenced code blocks and inline code spans, and
 * returns the ranges they occupy. Callers use this to skip those ranges when
 * rewriting image references — a single global regex replace can't tell code
 * from prose apart, so we scan for code first and only touch what's outside it.
 *
 * Fenced blocks follow the CommonMark fence rule: an opening run of 3+
 * backticks or tildes can only be closed by a run of the same character at
 * least as long, so a shorter run of the same character nested inside (e.g.
 * a 3-backtick line inside a 4-backtick fence) does not close it.
 */
export function findExcludedRanges(body: string): CodeRange[] {
  const starts = lineStarts(body);
  const lineCount = starts.length;

  function lineBounds(idx: number): [number, number] {
    const start = starts[idx]!;
    const end = idx + 1 < lineCount ? starts[idx + 1]! - 1 : body.length;
    return [start, end];
  }

  const fenceRegions: CodeRange[] = [];
  let i = 0;
  while (i < lineCount) {
    const [ls, le] = lineBounds(i);
    const line = body.slice(ls, le);
    const openMatch = FENCE_OPEN_RE.exec(line);
    if (openMatch) {
      const fence = openMatch[1]!;
      const fenceChar = fence[0]!;
      const fenceLen = fence.length;
      const closeRe = new RegExp(`^ {0,3}${fenceChar === "`" ? "`" : "~"}{${fenceLen},}\\s*$`);

      let closeLineIdx: number | null = null;
      for (let j = i + 1; j < lineCount; j++) {
        const [cs, ce] = lineBounds(j);
        if (closeRe.test(body.slice(cs, ce))) {
          closeLineIdx = j;
          break;
        }
      }

      if (closeLineIdx !== null) {
        const [, ce] = lineBounds(closeLineIdx);
        fenceRegions.push({ start: ls, end: ce });
        i = closeLineIdx + 1;
      } else {
        fenceRegions.push({ start: ls, end: body.length });
        i = lineCount;
      }
      continue;
    }
    i++;
  }

  // Inline code spans are only meaningful outside fenced blocks, so scan the
  // gaps between fence regions rather than the whole body.
  const sortedFences = [...fenceRegions].sort((a, b) => a.start - b.start);
  const segments: CodeRange[] = [];
  let cursor = 0;
  for (const fr of sortedFences) {
    if (fr.start > cursor) segments.push({ start: cursor, end: fr.start });
    cursor = Math.max(cursor, fr.end);
  }
  if (cursor < body.length) segments.push({ start: cursor, end: body.length });

  const spanRegions: CodeRange[] = [];
  for (const seg of segments) {
    const text = body.slice(seg.start, seg.end);
    const runs: { start: number; len: number }[] = [];
    const backtickRunRe = /`+/g;
    let m: RegExpExecArray | null;
    while ((m = backtickRunRe.exec(text))) {
      runs.push({ start: m.index, len: m[0].length });
    }

    let k = 0;
    while (k < runs.length) {
      const opener = runs[k]!;
      let closerIdx = -1;
      for (let n = k + 1; n < runs.length; n++) {
        if (runs[n]!.len === opener.len) {
          closerIdx = n;
          break;
        }
      }
      if (closerIdx === -1) {
        k++;
        continue;
      }
      const closer = runs[closerIdx]!;
      spanRegions.push({
        start: seg.start + opener.start,
        end: seg.start + closer.start + closer.len,
      });
      k = closerIdx + 1;
    }
  }

  return [...fenceRegions, ...spanRegions].sort((a, b) => a.start - b.start);
}

const REMOTE_RE = /^(?:https?:)?\/\//;

function isRemotePath(rawPath: string): boolean {
  return REMOTE_RE.test(rawPath) || rawPath.startsWith("data:");
}

interface ImageMatch {
  alt: string;
  rawPath: string;
  matchStart: number;
  matchEnd: number;
  isLocal: boolean;
}

/** Finds `![alt](path)` occurrences, tagging which ones are local (not remote, not in code). */
function scanImages(body: string): ImageMatch[] {
  const excluded = findExcludedRanges(body);
  const imageRe = /!\[([^\]]*)\]\(([^)]*)\)/g;
  const matches: ImageMatch[] = [];
  let match: RegExpExecArray | null;

  while ((match = imageRe.exec(body))) {
    const alt = match[1] ?? "";
    const rawPath = match[2] ?? "";
    const matchStart = match.index;
    const matchEnd = matchStart + match[0].length;
    const pathStart = matchStart + 2 + alt.length + 2;
    const inExcluded = excluded.some((r) => pathStart >= r.start && pathStart < r.end);
    matches.push({
      alt,
      rawPath,
      matchStart,
      matchEnd,
      isLocal: !inExcluded && !isRemotePath(rawPath),
    });
  }

  return matches;
}

/**
 * Rewrites local image references (`![alt](path)`) found outside code
 * ranges, using `resolve` to compute the new path. Remote (http/https/data)
 * paths and anything inside a fenced block or inline code span are left
 * untouched. When `resolve` returns undefined for a local path (e.g. the
 * asset couldn't be found), the reference is left unchanged.
 */
export function rewriteImagePaths(
  body: string,
  resolve: (rawPath: string) => string | undefined,
): string {
  const matches = scanImages(body);
  let result = "";
  let lastEnd = 0;

  for (const m of matches) {
    result += body.slice(lastEnd, m.matchStart);
    const resolved = m.isLocal ? resolve(m.rawPath) : undefined;
    result +=
      resolved !== undefined ? `![${m.alt}](${resolved})` : body.slice(m.matchStart, m.matchEnd);
    lastEnd = m.matchEnd;
  }
  result += body.slice(lastEnd);

  return result;
}

/**
 * Lists local (non-remote, non-code) image references in a body, in the
 * order they appear. Used to resolve and validate assets before rewriting.
 */
export function findLocalImageRefs(body: string): { rawPath: string }[] {
  return scanImages(body)
    .filter((m) => m.isLocal)
    .map((m) => ({ rawPath: m.rawPath }));
}
