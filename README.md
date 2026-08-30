# @1dot5/zenn-syndicate

Write Markdown articles anywhere — a blog repo, an Obsidian vault, wherever —
and convert them into [Zenn](https://zenn.dev)-ready articles (front matter,
image paths, an optional syndication notice), written into an **existing**
local checkout of your Zenn-connected repo.

This package only writes files. It never creates, clones, commits, or pushes
a repo — that stays yours to do (manually, or with the sample GitHub Actions
workflow below).

## Install

```sh
npm install --save-dev @1dot5/zenn-syndicate
```

Requires Node.js 20+.

## Quick start

```sh
npx zenn-syndicate init
```

This creates:

- `zenn-syndicate.config.mjs` — your configuration
- `.github/workflows/sync-zenn.yml` — a sample CI workflow (see below)

Edit the config to point at your source articles and an existing local
checkout of your Zenn repo, then:

```sh
npx zenn-syndicate check   # validate only, writes nothing
npx zenn-syndicate build   # convert and write into output.dir
```

## Configuration

```js
// zenn-syndicate.config.mjs
import { defineConfig } from "@1dot5/zenn-syndicate";

export default defineConfig({
  source: {
    dir: "content/articles", // where your Markdown articles live
    include: ["**/*.md"], // globs, relative to source.dir
  },
  output: {
    // Path to an EXISTING local checkout of your Zenn repo.
    dir: "../my-zenn-repo",
    articlesDir: "articles", // relative to output.dir
    imagesDir: "images", // relative to output.dir
  },
  defaults: {
    type: "tech", // "tech" | "idea", used when an article omits `type`
    published: false,
    topics: [],
  },
  notice: {
    enabled: true,
    // {sourceUrl} is replaced with the article's `canonicalUrl` front
    // matter field. If an article has no canonicalUrl, the notice is
    // skipped for that article (and an info diagnostic is reported).
    text: "この記事は {sourceUrl} で公開したものをZenn向けに変換しています。",
  },
  lockFile: ".zenn-syndicate.lock.json",
});
```

`source.dir` and `output.dir` are required; `output.dir` must already exist
(the build fails fast, exit code `2`, if it doesn't). Everything else has a
default.

## Writing an article

Any Markdown file under `source.dir` matching `source.include` is a source
article. Front matter fields:

| field          | required | notes                                                                        |
| -------------- | -------- | ---------------------------------------------------------------------------- |
| `title`        | yes      | non-empty string                                                             |
| `emoji`        | yes      | exactly one emoji character                                                  |
| `type`         | no       | `"tech"` \| `"idea"`, defaults to `defaults.type`                            |
| `topics`       | no       | array of strings, max 5, defaults to `defaults.topics`                       |
| `published`    | no       | boolean, defaults to `defaults.published`                                    |
| `slug`         | no       | must match `/^[0-9a-z-_]{12,50}$/`; auto-derived from the filename otherwise |
| `canonicalUrl` | no       | used to fill `{sourceUrl}` in the notice                                     |

```md
---
title: "TypeScriptのビルドを速くする"
emoji: "⚡"
type: "tech"
topics: ["typescript", "tsdown"]
published: true
canonicalUrl: "https://blog.example.com/faster-typescript-builds"
---

本文はここから。

![説明](./images/before-after.png)
```

Local images referenced with `![alt](path)` are resolved relative to the
article's own directory, copied into
`output.dir/<imagesDir>/<slug>/<filename>`, and the reference is rewritten to
Zenn's root-relative form (`/images/<slug>/<filename>`). References inside
fenced code blocks or inline code spans are left untouched, and remote
(`http(s)://`, `data:`) images are never rewritten.

Front matter is written as a hand-built string, not through a YAML dumper —
common YAML libraries escape emoji into `\uXXXX`/`\UXXXXXXXX` sequences,
which breaks how Zenn renders the `emoji` field.

## CLI

```
zenn-syndicate init
zenn-syndicate build   [--config <path>] [--json] [--dry-run]
zenn-syndicate check   [--config <path>] [--json]
```

- `init` — creates the config file and sample workflow if they don't already
  exist (skips, without overwriting, otherwise).
- `build` — converts and writes into `output.dir`. `--dry-run` runs the full
  pipeline and reports the same diagnostics, but skips writing anything.
- `check` — same validation as `build`, but never writes (equivalent to
  always running with `--dry-run`).

`--json` prints the report as JSON instead of colorized text:

```json
{
  "diagnostics": [{ "level": "error", "code": "invalid-slug", "message": "...", "file": "a.md" }],
  "summary": {
    "errors": 0,
    "warnings": 0,
    "infos": 0,
    "filesProcessed": 0,
    "filesWritten": 0
  }
}
```

### Exit codes

| code | meaning                                                                                            |
| ---- | -------------------------------------------------------------------------------------------------- |
| `0`  | success, no errors                                                                                 |
| `1`  | one or more articles had errors and were skipped; everything else was processed normally           |
| `2`  | fatal — config couldn't be loaded, or `output.dir`/`source.dir` doesn't exist; nothing was written |

A build never stops at the first error — every article is processed, and all
findings are reported together so you can fix everything in one pass.

## How change detection works

Every build records a content hash per article (and per image) in the lock
file (`lockFile` in config, default `.zenn-syndicate.lock.json`). An
unchanged article is skipped on the next build (reported as `unchanged`,
info level). If a source article disappears, its previously generated output
is **not** deleted automatically — you'll get an `orphaned-output` warning
instead, so you can decide.

`--dry-run` and `check` never update the lock file.

## Using it as a library

```ts
import { build, check, defineConfig } from "@1dot5/zenn-syndicate";

const { report, exitCode } = await build({ configPath: "./zenn-syndicate.config.mjs" });
```

`build`/`check` both return `{ report, exitCode }`; `report.diagnostics` and
`report.summary` match the `--json` shape above.

## GitHub Actions

`zenn-syndicate` itself never touches git. `npx zenn-syndicate init` also
generates `.github/workflows/sync-zenn.yml`, a starting point that:

1. Checks out your source repo.
2. Checks out your Zenn repo as a second checkout (needs a token with push
   access, stored as a secret).
3. Runs `npx zenn-syndicate build` against that checkout.
4. Commits and pushes, with plain `git` commands, only if something changed.

Edit the `ZENN_REPO` env var and add the token secret it references before
enabling the workflow.

## Scope

Not covered in v1: Zenn Books, other publishing targets (the `Target` type
leaves room for one, but only `"zenn"` exists today), and image
optimization/resizing.
