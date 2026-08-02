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
// The tag deliberately does not appear until after the PR has merged. `main` only moves by pull
// request (a ruleset blocks direct pushes), the merge is a merge commit, and pushing a v* tag is what
// triggers release.yml - so tagging here would pin the release to a commit that isn't main's HEAD and
// publish installers before the required checks had run. See tracking/release-guide.md.
console.log(`\nDone. Stage and commit on dev:`);
console.log(`  git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock CHANGELOG.md site/src/pages/index.astro`);
console.log(`  git commit -m "chore: bump to v${version}"`);
console.log(`  git push`);
console.log(`\nThen open the release PR - and tag only once it has merged, on main:`);
console.log(`  gh pr create --base main --head dev --title "Release v${version}"`);
console.log(`  gh pr merge --merge          # once the Frontend and Rust checks pass`);
console.log(`  git checkout main && git pull origin main`);
console.log(`  git tag v${version} && git push origin v${version}`);
console.log(`\nPushing that tag is what builds the installers and publishes the release and the site.`);
console.log(`Do not tag dev: the tag belongs on main's merge commit. See tracking/release-guide.md.`);
