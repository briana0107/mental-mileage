import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const distDir = join(rootDir, "dist");
const indexPath = join(distDir, "index.html");

let html = await readFile(indexPath, "utf8");

const assetPathFromUrl = (url) => join(distDir, url.replace(/^\//, ""));

html = await replaceAsync(
  html,
  /<link rel="stylesheet" crossorigin href="([^"]+)">/g,
  async (_match, href) => {
    const css = await readFile(assetPathFromUrl(href), "utf8");
    return `<style>${css}</style>`;
  },
);

html = await replaceAsync(
  html,
  /<script type="module" crossorigin src="([^"]+)"><\/script>/g,
  async (_match, src) => {
    const js = await readFile(assetPathFromUrl(src), "utf8");
    return `<script type="module">${js.replaceAll("</script", "<\\/script")}</script>`;
  },
);

await writeFile(indexPath, html);

async function replaceAsync(value, pattern, replacer) {
  const matches = [...value.matchAll(pattern)];
  let next = value;

  for (const match of matches.reverse()) {
    const replacement = await replacer(...match);
    next = `${next.slice(0, match.index)}${replacement}${next.slice(
      match.index + match[0].length,
    )}`;
  }

  return next;
}
