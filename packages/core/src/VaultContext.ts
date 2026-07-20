// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { createContext, useContext } from "react";

export interface VaultContextValue {
  vaultPath: string | null;
  /** Increments whenever vault files change - use as useEffect dependency to re-load. */
  vaultVersion: number;
  openVault: () => Promise<void>;
  readFile: (relativePath: string) => Promise<string>;
  writeFile: (relativePath: string, content: string) => Promise<void>;
  deleteFile: (relativePath: string) => Promise<void>;
  listFiles: (extension: string) => Promise<string[]>;
  /** Open a folder picker dialog; returns the chosen path or null. */
  pickFolder: (defaultPath?: string | null) => Promise<string | null>;
  /** List files in any folder (not just the active vault). */
  listFolderFiles: (folderPath: string, extension: string) => Promise<string[]>;
  /** Read a file from any folder (not just the active vault). */
  readFolderFile: (folderPath: string, relativePath: string) => Promise<string>;
  /** Write a file to any folder (not just the active vault). */
  writeFolderFile: (folderPath: string, relativePath: string, content: string) => Promise<void>;
  /** List image files (PNG, JPEG, WebP) in any folder. */
  listFolderImages: (folderPath: string) => Promise<string[]>;
  /** Read a file by folder + filename and return base64-encoded content. */
  readFileBase64: (folderPath: string, fileName: string) => Promise<string>;
  /** Open a file picker dialog filtered to images; returns the chosen file path or null. */
  pickImageFile: () => Promise<string | null>;
  /** Open a file picker dialog filtered to audio files; returns the chosen file path or null. */
  pickAudioFile: () => Promise<string | null>;
  /** Read any file by absolute path and return base64-encoded content. */
  readBinaryFile: (absolutePath: string) => Promise<string>;
  /** Write raw bytes (supplied as base64) to a vault-relative path, e.g. "portraits/foo.jpg". */
  writeFileBase64: (relativePath: string, base64Content: string) => Promise<void>;
  /**
   * Show a native OS save dialog and write text content to the chosen path.
   * Returns true if saved, false if the user cancelled.
   */
  saveTextFile: (content: string, defaultName: string) => Promise<boolean>;
  /**
   * Copy a picked image file into the active vault's maps/ subfolder.
   * Returns null if no vault is open. Otherwise returns the destination folder + filename.
   */
  saveImageToVaultMaps: (sourcePath: string) => Promise<{ mapsFolder: string; fileName: string } | null>;
  /**
   * Copy a picked image file into the active vault's portraits/ subfolder,
   * naming it {memberId}.{ext}. Returns null if no vault is open.
   * portraitRelativePath is vault-relative, e.g. "portraits/abc.png".
   */
  savePortraitToVault: (memberId: string, sourcePath: string) => Promise<{ portraitRelativePath: string; fileName: string } | null>;
}

export const VaultContext = createContext<VaultContextValue | null>(null);

export function useVault(): VaultContextValue {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error("useVault must be used within VaultProvider");
  return ctx;
}
