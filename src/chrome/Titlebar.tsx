// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useState, useEffect } from "react";
import { Icon } from "../icons/Icon";
import { version } from "../../package.json";
import styles from "./Titlebar.module.css";

interface Props {
  vaultPath: string;
  recentVaults: string[];
  playerWindowOpen: boolean;
  playerFullscreen: boolean;
  onLayoutsClick: () => void;
  onOpenVault: () => void;
  onResumeVault: (path: string) => void;
  onPlayerWindowToggle: () => void;
  onClearPlayerScreen: () => void;
  onPlayerFullscreenToggle: () => void;
  onSettingsClick: () => void;
  onSearchClick: () => void;
}

type TimerStatus = "stopped" | "running" | "paused";

function formatElapsed(s: number): string {
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return `${h}:${m}:${sec}`;
}

export function Titlebar({ vaultPath, recentVaults, playerWindowOpen, playerFullscreen, onLayoutsClick, onOpenVault, onResumeVault, onPlayerWindowToggle, onClearPlayerScreen, onPlayerFullscreenToggle, onSettingsClick, onSearchClick }: Props) {
  const [timerStatus, setTimerStatus] = useState<TimerStatus>("stopped");
  const [accumulated, setAccumulated] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [displaySeconds, setDisplaySeconds] = useState(0);
  const [vaultMenuOpen, setVaultMenuOpen] = useState(false);

  useEffect(() => {
    if (timerStatus !== "running" || startedAt === null) return;
    const id = setInterval(() => {
      setDisplaySeconds(accumulated + Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [timerStatus, startedAt, accumulated]);

  function handleTimerClick() {
    if (timerStatus === "stopped") {
      setStartedAt(Date.now());
      setAccumulated(0);
      setDisplaySeconds(0);
      setTimerStatus("running");
    } else if (timerStatus === "running") {
      const now = Date.now();
      setAccumulated((a) => a + Math.floor((now - startedAt!) / 1000));
      setStartedAt(null);
      setTimerStatus("paused");
    } else {
      setStartedAt(Date.now());
      setTimerStatus("running");
    }
  }

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
      <div className={styles.crumbWrap}>
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
          <>
            <div
              className={styles.vaultOverlay}
              onClick={() => setVaultMenuOpen(false)}
            />
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
          </>
        )}
      </div>

      {/* Right tools */}
      <div className={styles.tools}>
        <button
          className={`${styles.sessionPill} ${styles[`sessionPill_${timerStatus}`]}`}
          onClick={handleTimerClick}
          title={timerStatus === "stopped" ? "Start session timer" : timerStatus === "running" ? "Pause session timer" : "Resume session timer"}
        >
          {timerStatus === "running" && <span className={styles.pulsingDot} aria-hidden="true" />}
          {timerStatus === "stopped"
            ? "SESSION"
            : timerStatus === "running"
            ? `SESSION · ${formatElapsed(displaySeconds)}`
            : `PAUSED · ${formatElapsed(displaySeconds)}`}
        </button>
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
