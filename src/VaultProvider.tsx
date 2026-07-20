// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useState, useCallback, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { VaultContext, type VaultContextValue } from "@ttcanvas/core";
import * as vault from "./vault";
import { logWarn } from "./diagnostics/log";

interface Props {
  vaultPath: string | null;
  onVaultPathChange: (path: string) => void | Promise<void>;
  children: ReactNode;
}

export function VaultProvider({ vaultPath, onVaultPathChange, children }: Props) {
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

  const value: VaultContextValue = {
    vaultPath,
    vaultVersion,
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
