#!/usr/bin/env node
// Usage: node scripts/bump-version.mjs <new-version>
// How to use example: pnpm bump 1.2.3 
// Updates package.json, src-tauri/tauri.conf.json, src-tauri/Cargo.toml,
// site/src/pages/index.astro (hero badge), and converts "## Unreleased" in
// CHANGELOG.md to "## v<new-version> - <today>".

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error("Usage: node scripts/bump-version.mjs <major.minor.patch>");
  process.exit(1);
}

function patchJson(rel, key, value) {
  const path = resolve(root, rel);
  const obj = JSON.parse(readFileSync(path, "utf8"));
  const old = obj[key];
  obj[key] = value;
  writeFileSync(path, JSON.stringify(obj, null, 2) + "\n");
  console.log(`  ${rel}: ${key} ${old} → ${value}`);
}

function patchToml(rel) {
  const path = resolve(root, rel);
  let src = readFileSync(path, "utf8");
  const next = src.replace(/^version\s*=\s*"[^"]*"/m, `version = "${version}"`);
  if (next === src) {
    console.warn(`  ${rel}: no version line found — skipped`);
    return;
  }
  const old = src.match(/^version\s*=\s*"([^"]*)"/m)?.[1] ?? "?";
  writeFileSync(path, next);
  console.log(`  ${rel}: version ${old} → ${version}`);
}

function patchRegex(rel, pattern, replacement, label) {
  const path = resolve(root, rel);
  let src = readFileSync(path, "utf8");
  const next = src.replace(pattern, replacement);
  if (next === src) {
    console.warn(`  ${rel}: ${label} not found - skipped`);
    return;
  }
  writeFileSync(path, next);
  console.log(`  ${rel}: ${label} updated`);
}

function patchChangelog(rel) {
  const path = resolve(root, rel);
  let src = readFileSync(path, "utf8");
  const today = new Date().toISOString().slice(0, 10);
  const next = src.replace(/^## Unreleased$/m, `## v${version} - ${today}`);
  if (next === src) {
    console.warn(`  ${rel}: no "## Unreleased" heading found - skipped`);
    return;
  }
  writeFileSync(path, next);
  console.log(`  ${rel}: ## Unreleased -> ## v${version} - ${today}`);
}

console.log(`Bumping to v${version}...`);
patchJson("package.json", "version", version);
patchJson("src-tauri/tauri.conf.json", "version", version);
patchToml("src-tauri/Cargo.toml");
patchChangelog("CHANGELOG.md");
patchRegex(
  "site/src/pages/index.astro",
  /Public Alpha · v\d+\.\d+\.\d+/,
  `Public Alpha · v${version}`,
  "hero badge version",
);
console.log("Done. Stage, commit, tag, and push:");
console.log(`  git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml CHANGELOG.md site/src/pages/index.astro`);
console.log(`  git commit -m "chore: bump to v${version}"`);
console.log(`  git tag v${version}`);
console.log(`  git push && git push --tags`);
