// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

// Cross-vault pull for singleton-state widgets (Bestiary, Card Decks, Roll Tables,
// Rule Cards, Party Tracker): read another vault's singleton state, rebuild the same
// bundle the widget exports, and feed it through the widget's existing import path so
// dedupe, the conflict dialog and apply are all reused unchanged.

import { buildBundle, type DedupeResult } from "./importExport";

/**
 * Read `singletonKey`'s state from `sourceVault`, turn it into a `bundleType` bundle
 * with `toCollection`, and hand the serialized bundle to the widget's own import-text
 * function. Returns false (so the UI can say "Nothing to pull") when that vault has
 * no content for this widget - which `toCollection` signals by returning null.
 *
 * Note the two distinct keys: `singletonKey` is the widget's registered type, used to
 * index `singletonStates` (e.g. "bestiary"); `bundleType` is the export envelope's
 * discriminator (e.g. "ttcanvas-bestiary"). They differ, so both are passed.
 *
 * The round-trip through JSON + the widget's `importText` is deliberate: the foreign
 * state goes through the very same `readBundle` + validator gate as an imported file,
 * so a malformed foreign workspace can't bypass validation.
 */
export async function pullSingletonBundle(
  readForeignSingleton: (vaultPath: string, widgetType: string) => Promise<unknown>,
  sourceVault: string,
  singletonKey: string,
  bundleType: string,
  toCollection: (foreignState: unknown) => Record<string, unknown> | null,
  importText: (text: string) => void | Promise<void>,
): Promise<boolean> {
  const foreign = await readForeignSingleton(sourceVault, singletonKey);
  const collection = toCollection(foreign);
  if (!collection) return false;
  await importText(JSON.stringify(buildBundle(bundleType, collection)));
  return true;
}

/**
 * Copy vault-relative asset files (e.g. "portraits/uuid.jpg") from a source vault
 * into the current one, for pulled content that references them by path. Paths are
 * kept identical across vaults - they're uuid/id-based, so the reference in the
 * pulled JSON stays valid. A missing source file is skipped, not fatal: the item
 * just renders without art, exactly as importing a pack with no art does.
 *
 * `readFileBase64`/`writeFileBase64` are `VaultContext`'s - read takes an arbitrary
 * folder (the source vault's), write is relative to the current (target) vault.
 */
export async function copyVaultAssets(
  sourceVault: string,
  relativePaths: readonly string[],
  readFileBase64: (folderPath: string, fileName: string) => Promise<string>,
  writeFileBase64: (relativePath: string, base64Content: string) => Promise<void>,
): Promise<void> {
  for (const rel of new Set(relativePaths)) {
    const slash = rel.lastIndexOf("/");
    if (slash < 0) continue; // not a foldered asset path - nothing to copy
    const folder = rel.slice(0, slash);
    const fileName = rel.slice(slash + 1);
    // Catch only the *read*: a missing source asset is an acceptable degrade-to-text
    // (the item just renders without art). A *write* failure - permissions, full disk -
    // is a real fault that would leave dangling references, so let it propagate and be
    // surfaced by the caller rather than swallowing it as a missing source.
    let b64: string;
    try {
      b64 = await readFileBase64(`${sourceVault}/${folder}`, fileName);
    } catch {
      continue;
    }
    await writeFileBase64(rel, b64);
  }
}

/**
 * The subset of a pull that copies assets, deferred so it runs only for content the
 * user actually accepts. `assetsOf` lists an item's vault-relative asset paths (nulls
 * allowed - they're filtered).
 */
export interface PullAssets<T> {
  sourceVault: string;
  assetsOf: (item: T) => readonly (string | null | undefined)[];
}

/**
 * Copy assets for the *accepted* items of a dedupe result only - never for skipped or
 * cancelled conflicts. Clean items are always accepted; id-conflict items count only
 * when the user chose "replace" (matching ids reuse the same id-based asset path, so
 * copying a *skipped* conflict would clobber the current vault's art). Call this from
 * the widget's apply step, before it commits the collection, so a copy failure aborts
 * the whole pull instead of leaving content without its art.
 */
export async function copyPulledAssets<T>(
  pull: PullAssets<T>,
  result: DedupeResult<T>,
  mode: "skip" | "replace",
  readFileBase64: (folderPath: string, fileName: string) => Promise<string>,
  writeFileBase64: (relativePath: string, base64Content: string) => Promise<void>,
): Promise<void> {
  const accepted = mode === "replace" ? [...result.clean, ...result.idConflicts] : result.clean;
  const paths = accepted.flatMap((item) => pull.assetsOf(item)).filter((p): p is string => !!p);
  await copyVaultAssets(pull.sourceVault, paths, readFileBase64, writeFileBase64);
}
