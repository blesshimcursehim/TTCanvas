// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useState } from "react";
import { logError, type OtherVault } from "@ttcanvas/core";
import styles from "./VaultPullControl.module.css";

interface Props {
  /** Vaults offered as pull sources (recent, minus the one open now). */
  otherVaults: OtherVault[];
  /**
   * Pull this widget's content from the chosen vault into the current one.
   * Resolve to false when that vault held nothing for this widget (the control
   * then shows a brief "Nothing to pull"), true otherwise. May reject - the
   * rejection is logged and surfaced through onError.
   */
  onPull: (vaultPath: string) => Promise<boolean>;
  /** Reports a failed pull, mirroring CollectionIO's onError. */
  onError?: (message: string) => void;
}

function failureMessage(err: unknown): string {
  return `Pull failed - ${err instanceof Error ? err.message : String(err)}`;
}

/**
 * The shared cross-vault "Pull from" control for the settings cog: a source-vault
 * dropdown plus a Pull button. It only chooses the source and reports failure or an
 * empty result; the widget's own onPull rebuilds a bundle from that vault and feeds
 * it through the same import path as a file (dedupe, conflict dialog, apply), so
 * pulling behaves exactly like importing a file the widget itself exported.
 */
export function VaultPullControl({ otherVaults, onPull, onError }: Props) {
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  if (otherVaults.length === 0) {
    return (
      <span className={styles.group}>
        <span className={styles.hint}>Open another vault to pull from it</span>
      </span>
    );
  }

  // Fall back to the first source until the user picks one, so Pull always has a target.
  const target = selected || otherVaults[0].path;

  async function handlePull() {
    setNote(null);
    setBusy(true);
    try {
      const pulled = await onPull(target);
      if (!pulled) setNote("Nothing to pull");
    } catch (err) {
      logError("Cross-vault pull failed", err);
      onError?.(failureMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className={styles.group}>
      <label className={styles.label}>
        Pull from
        <select
          className={styles.select}
          value={target}
          onChange={(e) => {
            setSelected(e.target.value);
            setNote(null);
          }}
          disabled={busy}
        >
          {otherVaults.map((v) => (
            <option key={v.path} value={v.path}>{v.name}</option>
          ))}
        </select>
      </label>
      <button type="button" className={styles.btn} onClick={handlePull} disabled={busy}>
        {busy ? "Pulling…" : "Pull"}
      </button>
      {note && <span className={styles.note}>{note}</span>}
    </span>
  );
}
