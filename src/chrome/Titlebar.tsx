// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useRef, useState } from "react";
import type { SessionTimerState } from "@ttcanvas/core";
import type { AppClockFormat } from "../appConfig";
import { Icon } from "../icons/Icon";
import { SessionTime } from "./SessionTime";
import { useDismissOnOutsideClick } from "../hooks/useDismissOnOutsideClick";
import { version } from "../../package.json";
import styles from "./Titlebar.module.css";

interface Props {
  vaultPath: string;
  recentVaults: string[];
  playerWindowOpen: boolean;
  playerFullscreen: boolean;
  sessionTimer: SessionTimerState;
  clockFormat: AppClockFormat;
  onSessionTimerChange: (state: SessionTimerState) => void;
  onLayoutsClick: () => void;
  onOpenVault: () => void;
  onResumeVault: (path: string) => void;
  onPlayerWindowToggle: () => void;
  onClearPlayerScreen: () => void;
  onPlayerFullscreenToggle: () => void;
  onSettingsClick: () => void;
  onSearchClick: () => void;
}

export function Titlebar({ vaultPath, recentVaults, playerWindowOpen, playerFullscreen, sessionTimer, clockFormat, onSessionTimerChange, onLayoutsClick, onOpenVault, onResumeVault, onPlayerWindowToggle, onClearPlayerScreen, onPlayerFullscreenToggle, onSettingsClick, onSearchClick }: Props) {
  const [vaultMenuOpen, setVaultMenuOpen] = useState(false);
  const crumbRef = useRef<HTMLDivElement>(null);
  useDismissOnOutsideClick(crumbRef, vaultMenuOpen, () => setVaultMenuOpen(false));

  const vaultName = vaultPath.split("/").filter(Boolean).pop() ?? vaultPath;

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => undefined);
    } else {
      document.exitFullscreen().catch(() => undefined);
    }
  }

  return (
    <header className={styles.bar}>
      {/* Brand */}
      <div className={styles.brand}>
        <span className={styles.mark}>t</span>
        <span className={styles.appName}>ttcanvas</span>
        <span className={styles.version}>v{version}</span>
      </div>

      {/* Vault crumb (centred) */}
      <div className={styles.crumbWrap} ref={crumbRef}>
        <button
          className={styles.crumb}
          onClick={() => setVaultMenuOpen((o) => !o)}
          title="Switch vault"
        >
          <span className={styles.pulsingDot} aria-hidden="true" />
          <span className={styles.crumbName}>{vaultName}</span>
          <Icon name="chev-d" size={12} stroke={2} className={styles.crumbChev} />
        </button>

        {vaultMenuOpen && (
          <div className={styles.vaultDropdown}>
            {recentVaults.filter((p) => p !== vaultPath).length > 0 && (
              <>
                <div className={styles.vaultDropdownLabel}>Recent vaults</div>
                {recentVaults
                  .filter((p) => p !== vaultPath)
                  .map((p) => {
                    const name = p.split("/").filter(Boolean).pop() ?? p;
                    return (
                      <button
                        key={p}
                        className={styles.vaultItem}
                        title={p}
                        onClick={() => { onResumeVault(p); setVaultMenuOpen(false); }}
                      >
                        {name}
                      </button>
                    );
                  })}
                <div className={styles.vaultDivider} />
              </>
            )}
            <button
              className={styles.vaultNewBtn}
              onClick={() => { onOpenVault(); setVaultMenuOpen(false); }}
            >
              Open new vault…
            </button>
          </div>
        )}
      </div>

      {/* Right tools */}
      <div className={styles.tools}>
        <SessionTime state={sessionTimer} clockFormat={clockFormat} onChange={onSessionTimerChange} />
        <button
          className={`${styles.playerBtn} ${playerWindowOpen ? styles.playerBtnActive : ""}`}
          onClick={onPlayerWindowToggle}
          title={playerWindowOpen ? "Close player screen" : "Open player screen"}
        >
          {playerWindowOpen && <span className={styles.playerDot} aria-hidden="true" />}
          <Icon name="monitor" size={15} stroke={1.5} />
          <span className={styles.playerLabel}>{playerWindowOpen ? "LIVE" : "PLAYER"}</span>
        </button>
        {playerWindowOpen && (
          <>
            <button
              className={`${styles.clearBtn} ${playerFullscreen ? styles.clearBtnActive : ""}`}
              onClick={onPlayerFullscreenToggle}
              title={playerFullscreen ? "Exit player fullscreen (F11)" : "Player fullscreen (F11)"}
            >
              <Icon name="fullscreen" size={11} stroke={1.6} />
            </button>
            <button
              className={styles.clearBtn}
              onClick={onClearPlayerScreen}
              title="Clear player screen"
            >
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <line x1="1.5" y1="1.5" x2="9.5" y2="9.5" />
                <line x1="9.5" y1="1.5" x2="1.5" y2="9.5" />
              </svg>
            </button>
          </>
        )}
        <span className={styles.divider} aria-hidden="true" />
        <button className={styles.iconBtn} onClick={onLayoutsClick} title="Layouts">
          <Icon name="layouts" size={16} stroke={1.5} />
        </button>
        <button className={styles.iconBtn} onClick={onSearchClick} title="Search (Cmd+K)">
          <Icon name="search" size={16} stroke={1.5} />
        </button>
        <button className={styles.iconBtn} onClick={onSettingsClick} title="Settings">
          <Icon name="settings" size={16} stroke={1.5} />
        </button>
        <button className={styles.iconBtn} onClick={toggleFullscreen} title="Toggle fullscreen">
          <Icon name="fullscreen" size={16} stroke={1.5} />
        </button>
      </div>
    </header>
  );
}
