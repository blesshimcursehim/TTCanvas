// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useRef, type ChangeEvent } from "react";
import styles from "./CollectionIO.module.css";

interface Props {
  /** Called with the chosen file when the user picks one to import. */
  onImportFile: (file: File) => void | Promise<void>;
  /** Called when the user clicks "Export all". */
  onExportAll: () => void | Promise<void>;
  /** Disable the export button (e.g. an empty collection). */
  exportDisabled?: boolean;
  /**
   * Reports a failed import/export. The callbacks may reject (a cancelled save
   * dialog is not an error, but a failed vault write is), and without this the
   * rejection would be swallowed with no feedback to the user.
   */
  onError?: (message: string) => void;
  /** Extra class on the button group, to slot into a widget's own footer flex. */
  className?: string;
}

function failureMessage(action: string, err: unknown): string {
  return `${action} failed - ${err instanceof Error ? err.message : String(err)}`;
}

/**
 * The shared collection-level import/export controls (an "Import" + "Export all"
 * button pair plus the one hidden file input they drive), so every JSON-backed
 * collection widget stops hand-rolling its own buttons, input and labels. The
 * error banner stays with each widget, since its placement differs; pair this
 * with `buildBundle`/`readBundle` in `importExport.ts` and `ImportConflictDialog`.
 */
export function CollectionIO({ onImportFile, onExportAll, exportDisabled, onError, className }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset so re-importing the same file fires change again.
    e.target.value = "";
    if (!file) return;
    try {
      await onImportFile(file);
    } catch (err) {
      onError?.(failureMessage("Import", err));
    }
  }

  async function handleExport() {
    try {
      await onExportAll();
    } catch (err) {
      onError?.(failureMessage("Export", err));
    }
  }

  return (
    <span className={className ? `${styles.group} ${className}` : styles.group}>
      <button type="button" className={styles.btn} onClick={() => inputRef.current?.click()}>
        Import
      </button>
      <button type="button" className={styles.btn} onClick={handleExport} disabled={exportDisabled}>
        Export all
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={handleChange}
      />
    </span>
  );
}
