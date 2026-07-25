// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import type { ReactNode } from "react";
import { VaultContext, logWarn, type VaultContextValue, type OtherVault } from "@ttcanvas/core";
import * as vault from "./vault";
import { loadWorkspace } from "./workspace";

interface Props {
  vaultPath: string | null;
  /** Recent vaults from AppConfig; the source list for cross-vault pull, minus the open one. */
  recentVaults: string[];
  onVaultPathChange: (path: string) => void | Promise<void>;
  children: ReactNode;
}

/** Last path segment of a vault folder, for display. Handles both separators. */
function basename(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

export function VaultProvider({ vaultPath, recentVaults, onVaultPathChange, children }: Props) {
  const [vaultVersion, setVaultVersion] = useState(0);
  const vaultDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!vaultPath) return;
    vault.watchVault(vaultPath).catch((e: unknown) => logWarn(`watchVault failed: ${String(e)}`));
    let unlisten: (() => void) | undefined;
    vault
      .onVaultChanged(() => {
        if (vaultDebounceTimer.current) clearTimeout(vaultDebounceTimer.current);
        vaultDebounceTimer.current = setTimeout(() => {
          setVaultVersion((v) => v + 1);
        }, 300);
      })
      .then((fn) => { unlisten = fn; })
      .catch((e: unknown) => logWarn(`onVaultChanged failed: ${String(e)}`));
    return () => {
      unlisten?.();
      if (vaultDebounceTimer.current) clearTimeout(vaultDebounceTimer.current);
    };
  }, [vaultPath]);

  const openVault = useCallback(async () => {
    const path = await vault.openVault();
    if (path) onVaultPathChange(path);
  }, [onVaultPathChange]);

  const readFile = useCallback(
    (relativePath: string) => {
      if (!vaultPath) return Promise.reject(new Error("No vault selected"));
      return vault.readVaultFile(vaultPath, relativePath);
    },
    [vaultPath],
  );

  const writeFile = useCallback(
    (relativePath: string, content: string) => {
      if (!vaultPath) return Promise.reject(new Error("No vault selected"));
      return vault.writeVaultFile(vaultPath, relativePath, content);
    },
    [vaultPath],
  );

  const deleteFile = useCallback(
    (relativePath: string) => {
      if (!vaultPath) return Promise.reject(new Error("No vault selected"));
      return vault.deleteVaultFile(vaultPath, relativePath);
    },
    [vaultPath],
  );

  const listFiles = useCallback(
    (extension: string) => {
      if (!vaultPath) return Promise.reject(new Error("No vault selected"));
      return vault.listVaultFiles(vaultPath, extension);
    },
    [vaultPath],
  );

  const pickFolder = useCallback(
    (defaultPath?: string | null) => vault.openVault(defaultPath),
    [],
  );

  const listFolderFiles = useCallback(
    (folderPath: string, extension: string) => vault.listVaultFiles(folderPath, extension),
    [],
  );

  const readFolderFile = useCallback(
    (folderPath: string, relativePath: string) => vault.readVaultFile(folderPath, relativePath),
    [],
  );

  const writeFolderFile = useCallback(
    (folderPath: string, relativePath: string, content: string) =>
      vault.writeVaultFile(folderPath, relativePath, content),
    [],
  );

  const listFolderImages = useCallback(
    (folderPath: string) => vault.listFolderImages(folderPath),
    [],
  );

  const readFileBase64 = useCallback(
    (folderPath: string, fileName: string) => vault.readFileBase64(folderPath, fileName),
    [],
  );

  const pickImageFile = useCallback(() => vault.pickImageFile(), []);

  const pickAudioFile = useCallback(() => vault.pickAudioFile(), []);

  const readBinaryFile = useCallback((absolutePath: string) => {
    const norm = absolutePath.replace(/\\/g, "/");
    const sep = norm.lastIndexOf("/");
    return vault.readFileBase64(norm.slice(0, sep), norm.slice(sep + 1));
  }, []);

  const writeFileBase64 = useCallback(
    (relativePath: string, base64Content: string) => {
      if (!vaultPath) return Promise.reject(new Error("No vault is open"));
      return vault.writeFileBase64(vaultPath, relativePath, base64Content);
    },
    [vaultPath],
  );

  const saveImageToVaultMaps = useCallback(
    async (sourcePath: string) => {
      if (!vaultPath) return null;
      const { maps_folder, file_name } = await vault.copyToVaultMaps(vaultPath, sourcePath);
      return { mapsFolder: maps_folder, fileName: file_name };
    },
    [vaultPath],
  );

  const saveTextFile = useCallback(
    (content: string, defaultName: string) => vault.saveTextFile(content, defaultName),
    [],
  );

  const savePortraitToVault = useCallback(
    async (memberId: string, sourcePath: string) => {
      if (!vaultPath) return null;
      const { file_name } = await vault.copyToVaultPortraits(vaultPath, memberId, sourcePath);
      return { portraitRelativePath: `portraits/${file_name}`, fileName: file_name };
    },
    [vaultPath],
  );

  // Recent vaults minus the one open now - the pull sources a widget can offer.
  const otherVaults = useMemo<OtherVault[]>(
    () => recentVaults.filter((p) => p !== vaultPath).map((p) => ({ path: p, name: basename(p) })),
    [recentVaults, vaultPath],
  );

  const readForeignSingleton = useCallback(
    async (sourceVault: string, widgetType: string) => {
      const { state } = await loadWorkspace(sourceVault);
      return state.singletonStates?.[widgetType];
    },
    [],
  );

  const value: VaultContextValue = {
    vaultPath,
    vaultVersion,
    otherVaults,
    readForeignSingleton,
    openVault,
    readFile,
    writeFile,
    deleteFile,
    listFiles,
    pickFolder,
    listFolderFiles,
    readFolderFile,
    listFolderImages,
    readFileBase64,
    pickImageFile,
    pickAudioFile,
    readBinaryFile,
    saveImageToVaultMaps,
    savePortraitToVault,
    writeFileBase64,
    writeFolderFile,
    saveTextFile,
  };

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}
