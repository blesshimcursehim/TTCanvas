// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import styles from "./VaultSelector.module.css";

interface Props {
  recentVaults: string[];
  onResume: (path: string) => void | Promise<void>;
  onOpenVault: () => Promise<void>;
}

function folderName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

export function VaultSelector({ recentVaults, onResume, onOpenVault }: Props) {
  const [most, ...others] = recentVaults;

  return (
    <div className={styles.root}>
      <div className={styles.card}>
        <div className={styles.logo}>⚔</div>
        <h1 className={styles.title}>TTCanvas</h1>
        <p className={styles.subtitle}>Your digital GM screen</p>

        <div className={styles.divider} />

        <p className={styles.body}>
          Choose a <strong>vault</strong>, the folder where your campaign files
          and canvas layout are stored.
        </p>

        {most && (
          <button className={styles.primaryBtn} onClick={() => onResume(most)}>
            Continue with "{folderName(most)}"
          </button>
        )}

        {others.length > 0 && (
          <div className={styles.recentList}>
            <span className={styles.recentLabel}>Recently opened</span>
            {others.map((path) => (
              <button
                key={path}
                className={styles.recentBtn}
                onClick={() => onResume(path)}
              >
                {folderName(path)}
              </button>
            ))}
          </div>
        )}

        <button
          className={most ? styles.secondaryBtn : styles.primaryBtn}
          onClick={onOpenVault}
        >
          {most ? "Open different vault" : "Open Vault Folder"}
        </button>
      </div>
    </div>
  );
}
