import { defineConfig } from "@1dot5/zenn-syndicate";

export default defineConfig({
  source: {
    // Directory containing your Markdown articles.
    dir: "content/articles",
    // Globs, relative to source.dir.
    include: ["**/*.md"],
  },
  output: {
    // Path to an EXISTING local checkout of your Zenn-connected repo.
    // zenn-syndicate never creates, clones, or pushes this repo — it only
    // writes files into it.
    dir: "../my-zenn-repo",
    articlesDir: "articles",
    imagesDir: "images",
  },
  defaults: {
    type: "tech", // "tech" | "idea"
    published: false,
    topics: [],
  },
  lockFile: ".zenn-syndicate.lock.json",
});
