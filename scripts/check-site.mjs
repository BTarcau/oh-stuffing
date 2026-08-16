// Zero-dependency sanity checks for the static site, run in CI.
// 1) Every local href/src in index.html must resolve to a file on disk.
// 2) Core asset files must be present.
import { readFile, access } from "node:fs/promises";
import { constants } from "node:fs";

const errors = [];
const exists = async (p) => {
  try { await access(p, constants.F_OK); return true; } catch { return false; }
};

// 1) Local references in index.html
const html = await readFile("index.html", "utf8");
const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
const local = refs.filter((r) => !/^(https?:)?\/\//.test(r) && !/^(mailto:|data:|#)/.test(r));
for (const ref of local) {
  const file = ref.split(/[?#]/)[0].replace(/^\//, "");
  if (file && !(await exists(file))) errors.push(`index.html references a missing file: ${ref}`);
}

// 2) Core files that must ship with the site
const required = ["styles.css", "app.js", "favicon.svg", "og-image.png", "robots.txt", "sitemap.xml"];
for (const f of required) if (!(await exists(f))) errors.push(`missing required file: ${f}`);

if (errors.length) {
  console.error("✗ Site checks failed:\n" + errors.map((e) => "  - " + e).join("\n"));
  process.exit(1);
}
console.log(`✓ Site checks passed: ${local.length} local reference(s) resolve, all core files present.`);
