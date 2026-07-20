// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export function openVault(defaultPath?: string | null): Promise<string | null> {
  return invoke<string | null>("open_vault", { defaultPath: defaultPath ?? null });
}

export function readVaultFile(vaultPath: string, relativePath: string): Promise<string> {
  return invoke<string>("read_vault_file", { vaultPath, relativePath });
}

export function writeVaultFile(
  vaultPath: string,
  relativePath: string,
  content: string,
): Promise<void> {
  return invoke("write_vault_file", { vaultPath, relativePath, content });
}

export function listVaultFiles(vaultPath: string, extension: string): Promise<string[]> {
  return invoke<string[]>("list_vault_files", { vaultPath, extension });
}

export function deleteVaultFile(vaultPath: string, relativePath: string): Promise<void> {
  return invoke("delete_vault_file", { vaultPath, relativePath });
}

export function listFolderImages(folderPath: string): Promise<string[]> {
  return invoke<string[]>("list_folder_images", { folderPath });
}

export function pickImageFile(): Promise<string | null> {
  return invoke<string | null>("pick_image_file");
}

export function pickAudioFile(): Promise<string | null> {
  return invoke<string | null>("pick_audio_file");
}

export interface SavedImage { maps_folder: string; file_name: string; }
export function copyToVaultMaps(vaultPath: string, sourcePath: string): Promise<SavedImage> {
  return invoke<SavedImage>("copy_to_vault_maps", { vaultPath, sourcePath });
}

export interface SavedPortrait { portraits_folder: string; file_name: string; }
export function copyToVaultPortraits(
  vaultPath: string,
  memberId: string,
  sourcePath: string,
): Promise<SavedPortrait> {
  return invoke<SavedPortrait>("copy_to_vault_portraits", { vaultPath, memberId, sourcePath });
}

export function readFileBase64(folderPath: string, fileName: string): Promise<string> {
  return invoke<string>("read_file_base64", { folderPath, fileName });
}

export function writeFileBase64(
  vaultPath: string,
  relativePath: string,
  base64Content: string,
): Promise<void> {
  return invoke("write_file_base64", { vaultPath, relativePath, base64Content });
}

/** Show a native save dialog and write content to the chosen path. Returns false if user cancelled. */
export function saveTextFile(content: string, defaultName: string): Promise<boolean> {
  return invoke<boolean>("save_text_file", { content, defaultName });
}

export function watchVault(vaultPath: string): Promise<void> {
  return invoke("watch_vault", { vaultPath });
}

export function onVaultChanged(callback: (paths: string[]) => void): Promise<() => void> {
  return listen<string[]>("vault-changed", (event) => callback(event.payload));
}
