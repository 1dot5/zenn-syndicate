# SPEC: zenn-syndicate

## 1. 目的

任意の場所（ブログ用リポジトリ、Obsidian vaultなど）にある Markdown 記事を、[Zenn](https://zenn.dev) が読み込める形式（front matter・画像パス）に変換し、**既にローカルに存在する別リポジトリのディレクトリ**（Zenn連携用リポジトリのチェックアウト）へ書き出す npm パッケージ。

- 書き出し先リポジトリの**作成・clone・commit・pushはこのパッケージの責務ではない**。書き出し先ディレクトリが既に存在し、git管理されていることを前提に、その中の `articles/` `images/` にファイルを置くだけ（=ローカルファイル書き込みのみ）。commit/push は利用者側（手動 or 別途CIのシェルステップ）が行う
- 変換時に「Zenn記法として妥当か」を検証し、診断（エラー/警告/情報）としてまとめて報告する。1件のエラーで止めず、全記事を処理しきってからレポートする

## 2. スコープ外

- 本（Zenn Books）対応
- Qiitaなど他媒体対応（型に `target` の余地だけ残す）
- 画像の最適化・リサイズ
- 書き出し先リポジトリの git 操作（clone/commit/push/PR作成）
- 設定ファイルのJSON Schema化・バリデーションライブラリ導入

## 3. CLI

```
npx zenn-syndicate init            # 設定ファイルとワークフローのひな形を生成
npx zenn-syndicate build [options] # 変換して書き出す
npx zenn-syndicate check [options] # 変換を試みるが書き出しはしない（検証のみ）
```

共通オプション:

- `--config <path>`: 設定ファイルの場所（デフォルト: cwdの `zenn-syndicate.config.mjs`）
- `--json`: レポートをJSONで標準出力に出す（デフォルトは人間向けの整形テキスト、picocolorsで色付け）
- `--dry-run`: `build` にのみ有効。実際のファイル書き込み（emit層）をスキップし、それ以外は通常のbuildと同じ処理・レポートを行う

`init` の挙動:

- cwdに `zenn-syndicate.config.mjs` が無ければ `templates/config.mjs` をコピーして生成する。既にあれば上書きせず「skip」の診断を出す
- cwdに `.github/workflows/sync-zenn.yml` が無ければ `templates/sync-zenn.yml` をコピーして生成する。既にあれば上書きせず「skip」の診断を出す
- 生成結果を人間向けに標準出力する（作った/スキップした、のリスト）。失敗時（書き込み権限が無い等）は終了コード2

`check` の挙動:

- `build --dry-run` と同じ検証を行うが、`build` 用の設定（出力先ディレクトリの存在確認など）は緩めず同様に検証する。ファイル書き込みは常に行わない

## 4. 終了コード

すべてのサブコマンド共通:

- `0`: 成功。エラーレベルの診断が0件（警告・情報はあってもよい）
- `1`: 1件以上のエラーレベルの診断がある。エラーになった記事はスキップされ、それ以外の正常な記事は処理される（`check`では単に検証結果として報告するのみ）
- `2`: 致命的エラー。設定ファイルが読み込めない／不正、または `build` 時に出力先ディレクトリ（`output.dir`）が存在しない、など個別記事の処理に進む前の段階で失敗した場合。この場合は1件も書き出さない

## 5. 設定ファイル

`defineConfig` を通して型補完付きで書く。ESM (`.mjs`)。

```js
// zenn-syndicate.config.mjs
import { defineConfig } from "zenn-syndicate";

export default defineConfig({
  source: {
    dir: "content/articles",
    include: ["**/*.md"], // source.dir からの相対glob
  },
  output: {
    // 既に存在する別リポジトリのローカルパス。存在しなければ build 時に致命的エラー（exit 2）
    dir: "../my-zenn-repo",
    articlesDir: "articles", // output.dir からの相対
    imagesDir: "images", // output.dir からの相対。Zenn規約により本文からは /images/... で参照される
  },
  defaults: {
    type: "tech", // "tech" | "idea"
    published: false,
    topics: [],
  },
  notice: {
    enabled: true,
    // {sourceUrl} は front matter の canonicalUrl に置換される。
    // canonicalUrl が無い記事では notice 全体を挿入しない（info診断を出す）
    text: "この記事は {sourceUrl} で公開したものをZenn向けに変換しています。",
  },
  lockFile: ".zenn-syndicate.lock.json", // cwdからの相対
});
```

未指定項目はすべて上記をデフォルト値として補う。`source.dir` `output.dir` は必須（デフォルト値なし。未指定なら致命的エラー）。

## 6. ソース記事のfront matter

ソース側（変換前のMarkdown）の front matter はgray-matterで読む。

必須:

- `title: string`
- `emoji: string`（絵文字1文字。複数文字や絵文字以外はエラー診断）

任意:

- `type: "tech" | "idea"`（省略時は `defaults.type`）
- `topics: string[]`（省略時は `defaults.topics`。6個以上はエラー診断、Zenn上限は5個）
- `published: boolean`（省略時は `defaults.published`）
- `slug: string`（省略時はファイル名から生成。生成規則は§7）
- `canonicalUrl: string`（notice用。無くてもエラーにはしない）

front matter に存在しないキーは無視する（他ツール用のメタデータが混ざっていてもよい）。

## 7. slug

Zennの制約: `/^[0-9a-z\-_]{12,50}$/`。

- source front matterに `slug` があればこの正規表現で検証し、不正ならエラー診断（その記事はスキップ）
- 無ければファイル名（拡張子除く）から生成する:
  1. 小文字化
  2. `[0-9a-z\-_]` 以外の文字は `-` に置換
  3. 連続する `-` を1つに畳む、前後の `-` を削る
  4. 12文字未満なら、ソースの相対パスから作った短いハッシュ（生成方法は実装時に決めてよいが、同じ入力からは常に同じ出力になる決定的な方式にする）を `-` で連結して12文字以上にする
  5. 50文字を超える場合は50文字に切り詰める（末尾が `-` にならないよう調整する）
- 1回のbuild/check内でslugが重複したら、重複した全記事をエラー診断にする

## 8. 画像・assets

- 本文中の Markdown画像記法 `![alt](path)` のうち、`path` が `http://` `https://` `data:` で始まらないものを「ローカル画像参照」とみなす
- 解決順序: まずソースファイルのあるディレクトリからの相対パスとして解決する。見つからなければエラー診断（`image not found`）。追加のasset探索ディレクトリは持たない（v1では持たない。source.dirからの相対解決のみ）
- 解決できた画像は `output.dir/output.imagesDir/<slug>/<元のファイル名>` にコピーする
- 同じslug内でファイル名が衝突する場合（別ディレクトリの同名画像を参照しているなど）はエラー診断にする
- 本文中の参照は `/<output.imagesDir>/<slug>/<元のファイル名>` に書き換える（Zennのルート相対パス規約）

## 9. front matterの出力（重要）

Zenn向けfront matterは **YAMLライブラリのdumpを使わず、文字列を組み立てて出力する**。理由: `yaml`パッケージ等のdumpは絵文字を `"\U0001F527"` のようにエスケープすることがあり、Zenn側で表示が壊れるため。

出力フォーマット（フィールド順固定）:

```
---
title: "<エスケープ済み文字列>"
emoji: "<絵文字>"
type: "tech"
topics: ["<esc>", "<esc>"]
published: true
---
```

- `title`: ダブルクォート文字列。内部の `\` と `"` をエスケープする
- `emoji`: ダブルクォートで1絵文字を囲む
- `type`: ダブルクォート文字列（`"tech"` または `"idea"`）
- `topics`: `[]` を使ったインライン配列。各要素はダブルクォート文字列（titleと同じエスケープ）。0件なら `[]`
- `published`: クォート無しの真偽値リテラル（`true`/`false`）

**この関数の入出力（絵文字がエスケープされないこと、特殊文字を含むtitleが壊れないこと）を検証するテストを必ず書く。**

読み込み側（ソースのfront matter parse）は `gray-matter` + `yaml` を使ってよい（読み込みでのエスケープ問題は発生しない）。

## 10. 本文の変換

### 10.1 画像パス書き換え（§8のルールを本文に適用する）

**正規表現の単純な一括置換ではなく、コード領域を除外してから置換すること。**

手順:

1. 本文を先頭から走査し、フェンスドコードブロックとインラインコードスパンの範囲を検出して `[start, end)` の除外区間リストを作る
   - フェンスドコードブロックの開始行は3つ以上の連続する `` ` `` または `~`（バッククォートとチルダは区別する）。開始と**同じ文字種・同じ長さ以上でない**行では閉じない。実際には「開始のフェンス長と同じ長さの、閉じフェンス（同じ文字種、それ以上の長さの並び）」で閉じる、という一般的なMarkdownのフェンスルールに従う
   - ネスト例: 4バッククォートのフェンスの中に3バッククォートの行があっても、それは閉じフェンスとして扱わない（4つ以上の連続バッククォートが来るまで閉じない）
   - インラインコードスパンは1個以上の連続バッククォートで開始し、同じ長さの連続バッククォートで閉じる（CommonMark準拠の考え方）。フェンスドコードブロックの外側でのみ検出する
2. 画像記法 `![alt](path)` を本文全体から探すが、その `(path)` の開始位置が除外区間に含まれる場合は書き換えない
3. 除外区間の外にある画像参照だけ、§8の規則でパスを解決・書き換える

Markdownパーサは使わず自前スキャンでよいが、テストケースを厚く書く（§12参照）。

### 10.2 notice挿入

`notice.enabled` が true のとき、本文の先頭（front matter直後の最初の非空行の前）に1行、`> ` で始まる blockquote として挿入する。

- `notice.text` に `{sourceUrl}` が含まれていて、source front matterに `canonicalUrl` が無い場合は、その記事へのnotice挿入をスキップし、info診断 (`notice-skipped-no-canonical-url`) を出す
- `{sourceUrl}` が含まれていて `canonicalUrl` がある場合は単純文字列置換する
- `{sourceUrl}` を含まないテンプレートなら常に挿入する

## 11. ロックファイル

前回buildの結果を記録し、差分検出に使う。パスは `lockFile`（cwd相対）。

フォーマット:

```json
{
  "version": 1,
  "entries": {
    "<slug>": {
      "sourcePath": "content/articles/foo.md",
      "contentHash": "sha256:...",
      "images": {
        "images/<slug>/bar.png": "sha256:..."
      }
    }
  }
}
```

- `contentHash` は書き出す記事Markdown全文（front matter込み）のSHA-256
- ハッシュ計算はNode組み込みの `crypto` を使う（追加依存を増やさない）
- build時、あるslugの新しい `contentHash` がロックファイルの値と同じなら、そのファイルへの書き込みをスキップしてよい（info診断 `unchanged`）。異なる／新規なら書き込み、ロックファイルを更新する
- ロックファイルにあるがソース側に対応する記事が無くなったslugは、出力ファイルを**自動削除しない**。warning診断 (`orphaned-output`) を出すのみ
- `--dry-run` および `check` ではロックファイルを更新しない（読み込みだけして差分表示に使う）

## 12. 診断（Diagnostic）とレポート

```ts
type DiagnosticLevel = "error" | "warning" | "info";

interface Diagnostic {
  level: DiagnosticLevel;
  code: string; // 例: "invalid-slug", "image-not-found", "duplicate-slug", "unchanged", "orphaned-output", "notice-skipped-no-canonical-url"
  message: string;
  file?: string; // ソースファイルの相対パス
  slug?: string;
}
```

- 全モジュールはエラーをthrowせず、`Diagnostic` を配列に集めて返す設計にする（例外的なバグはthrowしてよいが、想定内の検証エラーはthrowしない）
- 人間向け出力: ファイルごとにグルーピングし、レベルごとに色分け（picocolors）。末尾にサマリ行（エラー数・警告数・情報数、処理件数、書き込み件数）を出す
- `--json` 出力形式:

```json
{
  "diagnostics": [
    { "level": "error", "code": "...", "message": "...", "file": "...", "slug": "..." }
  ],
  "summary": {
    "errors": 0,
    "warnings": 0,
    "infos": 0,
    "filesProcessed": 0,
    "filesWritten": 0
  }
}
```

## 13. 出力先ディレクトリ構成

```
<output.dir>/
  <output.articlesDir>/<slug>.md
  <output.imagesDir>/<slug>/<元のファイル名>
```

## 14. ディレクトリ構成（実装）

```
src/
  index.ts          公開API（build, check, defineConfig, 型）
  cli.ts            CLIエントリ
  config.ts         defineConfig、設定の読み込みとデフォルト適用
  collect.ts        globでソースを集めて SourceDoc[] にする
  slug.ts           slug の解決と検証
  frontmatter.ts    Zenn front matter の構築と文字列化
  body.ts           画像パス書き換え、notice挿入
  assets.ts         画像の解決、検証、コピー
  lock.ts           ロックファイルの読み書きと差分検出
  emit.ts           出力ディレクトリへの書き出し
  report.ts         診断の収集と整形（人間向け / JSON）
  types.ts
templates/
  config.mjs
  sync-zenn.yml
test/
  fixtures/
  *.test.ts
```

副作用の分離: `build` の中で実際にファイルを書くのは `emit.ts` だけ。`--dry-run` はこの層の呼び出しをスキップするだけで実現できる構造にする。

## 15. GitHub Actions テンプレート（`templates/sync-zenn.yml`）

このパッケージ自体はgit操作をしないため、テンプレートは「ソースリポジトリのCI上でZenn向けリポジトリを別途チェックアウトし、buildを実行し、変更があればcommit/pushする」という**利用者側のワークフロー例**として提供する。commit/pushはワークフロー内のプレーンなgitコマンドで行い、ライブラリのAPIやCLIはbuildの実行にのみ使う。認証情報（PATやdeploy key）はSecretsで渡す想定とし、テンプレート内はプレースホルダーにする。

## 16. テスト

以下は最低限テストで覆う（`test/*.test.ts`）:

### frontmatter.ts

- 絵文字を含むtitleが `\U0001F527` のようにエスケープされずそのまま出力される
- title内の `"` と `\` が正しくエスケープされる
- topicsが空配列のとき `topics: []` になる
- topicsの各要素がエスケープされる
- publishedがクォート無しの `true`/`false` になる
- フィールド順が title, emoji, type, topics, published の順で固定である

### slug.ts

- 有効なslugはそのまま通る
- 12文字未満・50文字超・許可外文字を含むslugはエラー診断になる
- ファイル名からの自動生成: 大文字・スペース・記号を含むファイル名が正しく変換される
- 自動生成結果が12文字未満になるケースでパディングされ、決定的（同じ入力→同じ出力）である
- 同一build内でのslug重複がエラー診断になる

### body.ts（画像パス書き換え）

- 通常の画像参照が書き換えられる
- インラインコードスパン `` `![a](b.png)` `` の中は書き換えられない
- 3バッククォートのフェンスドコードブロック内の画像記法は書き換えられない
- 4バッククォートのフェンスの中に3バッククォートの行がある場合、内側の3バッククォートで閉じたと誤判定しない
- `~~~` によるフェンスドコードブロックも同様に除外される
- http(s)で始まる画像パスは書き換えない
- 除外区間の外にある複数の画像参照が正しくすべて書き換わる
- notice挿入: `canonicalUrl` ありでプレースホルダーが置換される
- notice挿入: `canonicalUrl` なしでプレースホルダーを含むtextの場合は挿入されず info診断が出る

### collect.ts / assets.ts / lock.ts / emit.ts

- 存在しない画像参照がエラー診断になり、該当記事はスキップされる
- 同一slug内でのファイル名衝突がエラー診断になる
- 初回buildでロックファイルが生成される
- 内容が変化していない記事は2回目のbuildで書き込まれず `unchanged` info診断になる
- ソースが削除された記事は出力ファイルが残ったまま `orphaned-output` warning診断になる
- `--dry-run` ではファイルが一切書き込まれない

### 統合（build/check）

- 複数記事のうち1件がエラーでも、他の正常な記事は書き出される（exit code 1）
- 設定ファイルが無い／`output.dir` が存在しない場合はexit code 2で1件も書き出さない
- `--json` 出力が §12 のスキーマ通りである
