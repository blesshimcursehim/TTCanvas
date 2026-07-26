// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useState, useEffect, useCallback, useMemo } from "react";
import { ModalDialog } from "@ttcanvas/widgets-builtin";
import { getAddableWidgets } from "../registry";
import type { AppTheme, AppAccent, AppDensity, AppClockFormat, AppConfig } from "../appConfig";
import { useToast, redact, logError, type AIProvider } from "@ttcanvas/core";
import {
  revealLogFile, readLogTail, clearLog, exportDiagnostics,
  type DiagnosticsMeta,
} from "../diagnostics/diagnostics";
import { openUrl } from "@tauri-apps/plugin-opener";
import styles from "./PreferencesModal.module.css";

type Pane = "appearance" | "canvas" | "keyboard" | "diagnostics" | "about";

// Opens an external URL in the user's default browser. opener:default already
// grants allow-open-url for http/https, so no extra capability is needed.
function openExternal(url: string) {
  void openUrl(url).catch((e) => logError("Failed to open external link", e));
}

const isMac = typeof navigator !== "undefined" && /mac/i.test(navigator.platform);
const mod = isMac ? "⌘" : "Ctrl";

const SHORTCUTS = [
  { key: `${mod}+K`,    action: "Command palette" },
  { key: `${mod}+\\`,   action: "Toggle widget picker" },
  { key: "Escape",      action: "Clear selection / close panels" },
  { key: "Del / ⌫",    action: "Remove focused widget" },
  { key: `${mod}+Z`,    action: "Undo last move or resize" },
  { key: `${mod}+⇧+F`, action: "Toggle fullscreen" },
  { key: `${mod}+G`,    action: "Toggle dot grid" },
  { key: "?",           action: "Show keyboard help" },
];

const THEMES: { id: AppTheme; label: string; soon?: boolean }[] = [
  { id: "dark-vellum", label: "Dark Vellum" },
  { id: "dark-amber",  label: "Dark Amber" },
];

const ACCENTS: { id: AppAccent; color: string; label: string }[] = [
  { id: "amber", color: "oklch(0.80 0.115 78)",   label: "Amber"  },
  { id: "plum",  color: "oklch(0.72 0.155 290)",  label: "Plum"   },
  { id: "moss",  color: "oklch(0.74 0.13 145)",   label: "Moss"   },
  { id: "ink",   color: "oklch(0.72 0.04 258)",   label: "Ink"    },
];

const DENSITIES: { id: AppDensity; label: string }[] = [
  { id: "compact",     label: "Compact"     },
  { id: "comfortable", label: "Comfortable" },
  { id: "spacious",    label: "Spacious"    },
];

const CLOCK_FORMATS: { id: AppClockFormat; label: string; hint: string }[] = [
  { id: "system", label: "System", hint: "Follow this app's locale" },
  { id: "24h",    label: "24-hour", hint: "16:07" },
  { id: "12h",    label: "12-hour", hint: "4:07 PM" },
];

interface AIConfigPatch {
  aiProvider?: AIProvider;
  aiBaseUrl?: string;
  aiApiKey?: string;
  aiModel?: string | null;
}

interface Props {
  config: AppConfig;
  version: string;
  /** The `version` the open workspace file claims, or null if absent or non-numeric. */
  workspaceVersion: number | null;
  /** The workspace schema version this build supports. */
  supportedWorkspaceVersion: number;
  /** True when the open workspace was written by a newer build and so opened read-only. */
  workspaceReadOnly: boolean;
  disabledWidgetTypes: string[];
  modWidgetTypes: string[];
  onClose: () => void;
  onChange: (patch: Partial<AppConfig>) => void;
  onAIChange: (patch: AIConfigPatch) => void;
  onWidgetToggle: (type: string) => void;
  onModUninstall: (type: string) => void;
}

function ConditionAddRow({ onAdd }: { onAdd: (name: string) => void }) {
  const [value, setValue] = useState("");
  function commit() {
    const name = value.trim();
    if (!name) return;
    onAdd(name);
    setValue("");
  }
  return (
    <div className={styles.conditionAddRow}>
      <input
        className={styles.conditionInput}
        placeholder="Add condition…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
      />
      <button className={styles.conditionAddBtn} onClick={commit} disabled={!value.trim()}>Add</button>
    </div>
  );
}

function DiagnosticsPane({ meta, apiKey }: { meta: DiagnosticsMeta; apiKey: string }) {
  const { showToast } = useToast();
  const [tail, setTail] = useState("");
  const [exporting, setExporting] = useState(false);
  const secrets = useMemo(() => (apiKey ? [apiKey] : []), [apiKey]);

  const refresh = useCallback(async () => {
    try {
      // Redact on display so the viewer offers the same guarantee as the export -
      // users commonly screenshot this panel for bug reports.
      setTail(redact(await readLogTail(300), secrets));
    } catch (e) {
      showToast(`Could not read log - ${String(e)}`);
    }
  }, [showToast, secrets]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function handleReveal() {
    try {
      await revealLogFile();
    } catch (e) {
      showToast(`Could not open log folder - ${String(e)}`);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      if (await exportDiagnostics(meta, secrets)) showToast("Diagnostics exported", "success");
    } catch (e) {
      showToast(`Export failed - ${String(e)}`);
    } finally {
      setExporting(false);
    }
  }

  async function handleClear() {
    try {
      await clearLog();
      await refresh();
      showToast("Log cleared", "success");
    } catch (e) {
      showToast(`Could not clear log - ${String(e)}`);
    }
  }

  return (
    <div className={styles.pane}>
      <div className={styles.sectionHead}>Diagnostics</div>
      <p className={styles.aiHint} style={{ fontStyle: "normal" }}>
        Errors and crashes are logged to a local file on this machine - nothing is ever sent
        automatically. You can export a redacted report to attach to a bug report.
      </p>
      <div className={styles.diagActions}>
        <button className={styles.diagBtn} onClick={handleReveal}>Open log folder</button>
        <button className={styles.diagBtn} onClick={handleExport} disabled={exporting}>
          {exporting ? "Exporting…" : "Export diagnostics…"}
        </button>
      </div>

      <div className={styles.logViewHead}>
        <div className={styles.sectionHead}>Recent log</div>
        <button className={styles.logTextBtn} onClick={() => { void refresh(); }}>Refresh</button>
        <button className={styles.logTextBtn} onClick={handleClear}>Clear</button>
      </div>
      <div className={styles.logView}>
        {tail
          ? tail
          : <span className={styles.logViewEmpty}>No log entries yet.</span>}
      </div>
    </div>
  );
}

export function PreferencesModal({
  config, version, workspaceVersion, supportedWorkspaceVersion, workspaceReadOnly,
  disabledWidgetTypes, modWidgetTypes,
  onClose, onChange, onAIChange,
  onWidgetToggle, onModUninstall,
}: Props) {
  const [pane, setPane] = useState<Pane>("appearance");
  const addableWidgets = getAddableWidgets();

  return (
    <ModalDialog label="Preferences" onClose={onClose}>
      <div className={styles.modal}>

        {/* Left rail */}
        <div className={styles.rail}>
          <div className={styles.railBrand}>
            <span className={styles.railLogo}>t</span>
            <div>
              <div className={styles.railTitle}>Preferences</div>
              <div className={styles.railVersion}>v{version}</div>
            </div>
          </div>

          <nav className={styles.railNav}>
            {(["appearance", "canvas", "keyboard", "diagnostics", "about"] as Pane[]).map((p) => (
              <button
                key={p}
                className={`${styles.navBtn} ${pane === p ? styles.navBtnActive : ""}`}
                onClick={() => setPane(p)}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </nav>

          <button className={styles.railClose} onClick={onClose}>Close</button>
        </div>

        {/* Body */}
        <div className={styles.body}>

          {/* ── Appearance pane ───────────────────────── */}
          {pane === "appearance" && (
            <div className={styles.pane}>
              <div className={styles.sectionHead}>Theme</div>
              <div className={styles.themeCards}>
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    className={`${styles.themeCard} ${config.theme === t.id ? styles.themeCardActive : ""}`}
                    onClick={() => onChange({ theme: t.id })}
                    data-theme-preview={t.id}
                  >
                    <div className={styles.themePreview} data-theme={t.id}>
                      <div className={styles.themePreviewBar} />
                      <div className={styles.themePreviewWidget} />
                    </div>
                    <span className={styles.themeLabel}>{t.label}</span>
                  </button>
                ))}
                <button className={`${styles.themeCard} ${styles.themeCardSoon}`} disabled>
                  <div className={styles.themePreview}>
                    <div className={styles.themePreviewBar} />
                    <div className={styles.themePreviewWidget} />
                  </div>
                  <span className={styles.themeLabel}>Light Paper</span>
                  <span className={styles.soonBadge}>soon</span>
                </button>
              </div>

              <div className={styles.sectionHead}>Accent</div>
              <div className={styles.accentRow}>
                {ACCENTS.map((a) => (
                  <button
                    key={a.id}
                    className={`${styles.accentSwatch} ${config.accent === a.id ? styles.accentSwatchActive : ""}`}
                    style={{ background: a.color }}
                    onClick={() => onChange({ accent: a.id })}
                    title={a.label}
                  />
                ))}
              </div>

              <div className={styles.sectionHead}>Density</div>
              <div className={styles.segmented}>
                {DENSITIES.map((d) => (
                  <button
                    key={d.id}
                    className={`${styles.segBtn} ${config.density === d.id ? styles.segBtnActive : ""}`}
                    onClick={() => onChange({ density: d.id })}
                  >
                    {d.label}
                  </button>
                ))}
              </div>

              <div className={styles.sectionHead}>Clock</div>
              <div className={styles.segmented}>
                {CLOCK_FORMATS.map((c) => (
                  <button
                    key={c.id}
                    className={`${styles.segBtn} ${config.clockFormat === c.id ? styles.segBtnActive : ""}`}
                    onClick={() => onChange({ clockFormat: c.id })}
                    title={c.hint}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <div className={styles.sectionNote}>
                How the title bar shows the real-world time. System follows this app's locale,
                which on Linux can differ from a desktop's own 24-hour toggle - pick 24-hour or
                12-hour directly if System doesn't match.
              </div>

              <div className={styles.toggleRow}>
                <span className={styles.toggleLabel} id="pref-reduce-motion">Reduce motion</span>
                <button
                  className={`${styles.toggle} ${config.reduceMotion ? styles.toggleOn : ""}`}
                  onClick={() => onChange({ reduceMotion: !config.reduceMotion })}
                  role="switch"
                  aria-checked={config.reduceMotion}
                  aria-labelledby="pref-reduce-motion"
                >
                  <span className={styles.toggleThumb} />
                </button>
              </div>

            </div>
          )}

          {/* ── Canvas pane ───────────────────────────── */}
          {pane === "canvas" && (
            <div className={styles.pane}>
              <div className={styles.sectionHead}>Widgets</div>
              {addableWidgets.filter((w) => !modWidgetTypes.includes(w.type)).map((w) => (
                <label key={w.type} className={styles.checkRow}>
                  <input
                    type="checkbox"
                    className={styles.check}
                    checked={!disabledWidgetTypes.includes(w.type)}
                    onChange={() => onWidgetToggle(w.type)}
                  />
                  <span className={styles.checkLabel}>{w.title}</span>
                </label>
              ))}
              {modWidgetTypes.length > 0 && (
                <>
                  <div className={styles.sectionHead} style={{ marginTop: 12 }}>Mods</div>
                  {modWidgetTypes.map((type) => (
                    <div key={type} className={styles.modRow}>
                      <span className={styles.modName}>{type}</span>
                      <button className={styles.modRemoveBtn} onClick={() => onModUninstall(type)}>Uninstall</button>
                    </div>
                  ))}
                </>
              )}

              <div className={styles.sectionHead} style={{ marginTop: 12 }}>AI Provider</div>
              <div className={styles.aiTabs}>
                {(["ollama", "openai"] as AIProvider[]).map((p) => (
                  <button
                    key={p}
                    className={`${styles.aiTab} ${config.aiProvider === p ? styles.aiTabActive : ""}`}
                    onClick={() => onAIChange({ aiProvider: p })}
                  >
                    {p === "ollama" ? "Ollama" : "OpenAI-compatible"}
                  </button>
                ))}
              </div>
              {config.aiProvider === "ollama" ? (
                <p className={styles.aiHint}>Ollama runs locally - no configuration needed.</p>
              ) : (
                <>
                  <input className={styles.aiInput} placeholder="Base URL (e.g. https://api.openai.com)" value={config.aiBaseUrl} onChange={(e) => onAIChange({ aiBaseUrl: e.target.value, aiModel: null })} />
                  <input className={styles.aiInput} placeholder="API key" type="password" value={config.aiApiKey} onChange={(e) => onAIChange({ aiApiKey: e.target.value })} />
                  <input className={styles.aiInput} placeholder="Model name (e.g. gpt-4o)" value={config.aiModel ?? ""} onChange={(e) => onAIChange({ aiModel: e.target.value || null })} />
                </>
              )}

              <div className={styles.sectionHead} style={{ marginTop: 12 }}>Custom Conditions</div>
              {config.customConditions.map((c, i) => (
                <div key={i} className={styles.conditionRow}>
                  <span className={styles.conditionName}>{c.name}</span>
                  <button
                    className={styles.conditionRemoveBtn}
                    onClick={() => onChange({ customConditions: config.customConditions.filter((_, j) => j !== i) })}
                  >×</button>
                </div>
              ))}
              <ConditionAddRow onAdd={(name) => onChange({ customConditions: [...config.customConditions, { name }] })} />
            </div>
          )}

          {/* ── Keyboard pane ─────────────────────────── */}
          {pane === "keyboard" && (
            <div className={styles.pane}>
              <div className={styles.sectionHead}>Keyboard shortcuts</div>
              <table className={styles.shortcutTable}>
                <tbody>
                  {SHORTCUTS.map(({ key, action }) => (
                    <tr key={key} className={styles.shortcutRow}>
                      <td className={styles.shortcutKey}>
                        {key.split("+").map((part, i, arr) => (
                          <span key={i}>
                            <kbd className={styles.kbd}>{part}</kbd>
                            {i < arr.length - 1 && <span className={styles.kbdPlus}>+</span>}
                          </span>
                        ))}
                      </td>
                      <td className={styles.shortcutAction}>{action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Diagnostics pane ──────────────────────────── */}
          {pane === "diagnostics" && (
            <DiagnosticsPane
              apiKey={config.aiApiKey}
              meta={{
                version,
                workspaceVersion,
                supportedWorkspaceVersion,
                workspaceReadOnly,
                aiProvider: config.aiProvider,
                enabledWidgets: addableWidgets.filter((w) => !disabledWidgetTypes.includes(w.type)).map((w) => w.type),
                disabledWidgets: disabledWidgetTypes,
                mods: modWidgetTypes,
              }}
            />
          )}

          {/* ── About pane ────────────────────────────────── */}
          {pane === "about" && (
            <div className={styles.pane}>
              <div className={styles.sectionHead}>TTCanvas</div>
              <p className={styles.aboutText}>
                Version {version}. An offline, local-first GM screen for tabletop RPGs.
                Your vault, notes and data stay on your machine.
              </p>

              <div className={styles.sectionHead}>Licence</div>
              <p className={styles.aboutText}>
                TTCanvas is free software under the GNU General Public License, version 3 or
                later (GPL-3.0-or-later).{" "}
                <button className={styles.aboutLink} onClick={() => openExternal("https://www.gnu.org/licenses/gpl-3.0.html")}>
                  Read the full licence
                </button>.
              </p>
              <p className={styles.aiHint}>
                Plugins loaded via the official Plugin SDK are not considered derivative works;
                see the Plugin Exception in the project&rsquo;s LICENSE.
              </p>

              <div className={styles.sectionHead}>Fifth-edition compatibility and attribution</div>
              <p className={styles.aboutText}>
                TTCanvas is independent, unofficial software. It is not approved, endorsed, or
                sponsored by Wizards of the Coast. Its optional 5E-compatible material is based on
                the 2024 rules released in the System Reference Document 5.2.1, adapted for its
                generator and stat-block tools; it does not reproduce the full SRD.
              </p>
              <p className={styles.aboutText}>
                This work includes material from the System Reference Document 5.2.1
                (&ldquo;SRD 5.2.1&rdquo;) by Wizards of the Coast LLC, available at{" "}
                <button className={styles.aboutLink} onClick={() => openExternal("https://www.dndbeyond.com/srd")}>
                  dndbeyond.com/srd
                </button>. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0
                International License, available at{" "}
                <button className={styles.aboutLink} onClick={() => openExternal("https://creativecommons.org/licenses/by/4.0/legalcode")}>
                  creativecommons.org/licenses/by/4.0
                </button>.
              </p>

              <div className={styles.sectionHead}>Open-source components</div>
              <p className={styles.aboutText}>
                Built with Tauri, React and TypeScript. Typefaces Inter, EB Garamond and
                JetBrains Mono are used under the SIL Open Font License. Full third-party licence
                texts ship with the source repository.
              </p>
            </div>
          )}
        </div>
      </div>
    </ModalDialog>
  );
}
