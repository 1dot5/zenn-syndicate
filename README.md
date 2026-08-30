# @1dot5/zenn-syndicate

好きな場所（ブログ用リポジトリ、Obsidian vaultなど）に書いたMarkdown記事を、
[Zenn](https://zenn.dev) が読み込める形式（front matter・画像パス）に変換し、
**既に存在する**ローカルのZenn連携用リポジトリのチェックアウトへ書き出すツールです。

このパッケージはファイルを書き出すだけです。リポジトリの作成・clone・commit・push は一切行いません
（それらはあなた自身、または後述のGitHub Actionsサンプルワークフローが行います）。

## インストール

```sh
npm install --save-dev @1dot5/zenn-syndicate
```

Node.js 20以上が必要です。

## クイックスタート

```sh
npx zenn-syndicate init
```

以下が生成されます:

- `zenn-syndicate.config.mjs` — 設定ファイル
- `.github/workflows/sync-zenn.yml` — サンプルのCIワークフロー（後述）

設定ファイルを編集して、記事の置き場所と、既存のZennリポジトリのローカルチェックアウトパスを指定したら:

```sh
npx zenn-syndicate check   # 検証のみ。何も書き出さない
npx zenn-syndicate build   # 変換して output.dir に書き出す
```

## 設定ファイル

```js
// zenn-syndicate.config.mjs
import { defineConfig } from "@1dot5/zenn-syndicate";

export default defineConfig({
  source: {
    dir: "content/articles", // Markdown記事が置かれているディレクトリ
    include: ["**/*.md"], // source.dir からの相対glob
  },
  output: {
    // 既に存在するZennリポジトリのローカルチェックアウトパス
    dir: "../my-zenn-repo",
    articlesDir: "articles", // output.dir からの相対
    imagesDir: "images", // output.dir からの相対
  },
  defaults: {
    type: "tech", // "tech" | "idea"。記事側で省略された場合に使われる
    published: false,
    topics: [],
  },
  lockFile: ".zenn-syndicate.lock.json",
});
```

`source.dir` と `output.dir` は必須です。`output.dir` は事前に存在している必要があります
（存在しない場合はビルドがすぐに失敗し、終了コードは `2` になります）。それ以外はすべてデフォルト値があります。

## 記事の書き方

`source.dir` 配下で `source.include` にマッチするMarkdownファイルはすべてソース記事として扱われます。
front matterのフィールドは以下の通りです。

| フィールド  | 必須 | 説明                                                                       |
| ----------- | ---- | -------------------------------------------------------------------------- |
| `title`     | 必須 | 空でない文字列                                                             |
| `emoji`     | 必須 | 絵文字1文字ちょうど                                                        |
| `type`      | 任意 | `"tech"` \| `"idea"`。省略時は `defaults.type`                             |
| `topics`    | 任意 | 文字列配列、最大5個。省略時は `defaults.topics`                            |
| `published` | 任意 | 真偽値。省略時は `defaults.published`                                      |
| `slug`      | 任意 | `/^[0-9a-z-_]{12,50}$/` に一致する必要あり。省略時はファイル名から自動生成 |

```md
---
title: "TypeScriptのビルドを速くする"
emoji: "⚡"
type: "tech"
topics: ["typescript", "tsdown"]
published: true
---

本文はここから。

![説明](./images/before-after.png)
```

`![alt](path)` で参照されたローカル画像は、記事ファイル自身のディレクトリからの相対パスとして解決され、
`output.dir/<imagesDir>/<slug>/<ファイル名>` にコピーされます。本文中の参照は
Zennのルート相対形式（`/images/<slug>/<ファイル名>`）に書き換えられます。
フェンスドコードブロックやインラインコードスパンの中にある参照は書き換えません。
また、リモート画像（`http(s)://`、`data:`）は一切書き換えません。

front matterはYAMLライブラリのdumpを使わず、文字列を組み立てて出力します。
一般的なYAMLライブラリは絵文字を `\uXXXX` / `\UXXXXXXXX` のようにエスケープすることがあり、
Zenn側で `emoji` フィールドの表示が壊れてしまうためです。

## CLI

```
zenn-syndicate init
zenn-syndicate build   [--config <path>] [--json] [--dry-run]
zenn-syndicate check   [--config <path>] [--json]
```

- `init` — 設定ファイルとサンプルワークフローを、まだ無ければ生成する（既にあれば上書きせずスキップ）
- `build` — 変換して `output.dir` に書き出す。`--dry-run` を付けると、同じ検証・レポートを行うが書き込みだけスキップする
- `check` — `build` と同じ検証を行うが、常に何も書き込まない（`--dry-run` を常に付けた `build` と同等）

`--json` を付けると、色付きテキストの代わりにJSONでレポートを出力します:

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

### 終了コード

| コード | 意味                                                                                                            |
| ------ | --------------------------------------------------------------------------------------------------------------- |
| `0`    | 成功。エラーなし                                                                                                |
| `1`    | 1件以上の記事でエラーが発生しスキップされた。それ以外の記事は通常通り処理された                                 |
| `2`    | 致命的エラー。設定ファイルが読み込めない、または `output.dir`/`source.dir` が存在しない。何も書き出されていない |

ビルドは最初のエラーで止まりません。全記事を処理しきってから、すべての結果をまとめて報告します。
1回の実行で全部の問題を直せるようにするためです。

## 差分検出の仕組み

ビルドのたびに、記事ごと（および画像ごと）のコンテンツハッシュがロックファイル
（設定の `lockFile`、デフォルトは `.zenn-syndicate.lock.json`）に記録されます。
変更が無い記事は次回ビルドでスキップされます（`unchanged` というinfoレベルの診断が出ます）。
ソース記事が削除された場合、以前生成した出力ファイルは**自動削除されません**。
代わりに `orphaned-output` という警告が出るので、対応はあなたが判断してください。

`--dry-run` と `check` はロックファイルを更新しません。

## ライブラリとして使う

```ts
import { build, check, defineConfig } from "@1dot5/zenn-syndicate";

const { report, exitCode } = await build({ configPath: "./zenn-syndicate.config.mjs" });
```

`build`/`check` はどちらも `{ report, exitCode }` を返します。`report.diagnostics` と
`report.summary` は上記の `--json` の形式と一致します。

## GitHub Actions

`zenn-syndicate` 自体はgit操作を一切行いません。`npx zenn-syndicate init` は
`.github/workflows/sync-zenn.yml` も生成します。これは以下を行うサンプルです:

1. ソースリポジトリをチェックアウトする
2. Zennリポジトリを別途チェックアウトする（push権限のあるトークンをsecretとして必要とする）
3. そのチェックアウトに対して `npx zenn-syndicate build` を実行する
4. 変更があった場合のみ、素の `git` コマンドでcommit・pushする

有効化する前に、`ZENN_REPO` 環境変数と、参照しているトークンのsecretを設定してください。
