// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

// Cross-vault pull for singleton-state widgets (Bestiary, Card Decks, Roll Tables,
// Rule Cards, Party Tracker): read another vault's singleton state, rebuild the same
// bundle the widget exports, and feed it through the widget's existing import path so
// dedupe, the conflict dialog and apply are all reused unchanged.

import { buildBundle } from "./importExport";

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
    try {
      const b64 = await readFileBase64(`${sourceVault}/${folder}`, fileName);
      await writeFileBase64(rel, b64);
    } catch {
      // Source asset absent - leave the reference dangling; the UI degrades to text.
    }
  }
}
