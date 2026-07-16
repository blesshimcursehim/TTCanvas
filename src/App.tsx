// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, memo, Suspense } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { openPlayerWindow, closePlayerWindow, getPlayerWindowBounds, setPlayerFullscreen as invokeSetPlayerFullscreen } from "./playerWindow";
import type { WorldRect } from "./canvas/Canvas";
import "./App.css";
import { Canvas } from "./canvas/Canvas";
import { WidgetFrame } from "./canvas/WidgetFrame";
import { WidgetPicker } from "./canvas/WidgetPicker";
import { Icon } from "./icons/Icon";
import styles from "./App.module.css";
import { KeyboardHelp } from "./canvas/KeyboardHelp";
import { CommandPalette } from "./canvas/CommandPalette";
import { SettingsMenu } from "./canvas/SettingsMenu";
import { PreferencesModal } from "./canvas/PreferencesModal";
import { CanvasStatus } from "./canvas/CanvasStatus";
import { Titlebar } from "./chrome/Titlebar";
import { Sidebar, type RailWidget } from "./chrome/Sidebar";
import { getWidget, resolveDefaultState, getModWidgetTypes, clearModWidgets, getModFilename } from "./registry";
import { loadMods, importMod, type ScannedMod } from "./mods/loadMods";
import { logError } from "./diagnostics/log";
import { ModTrustPrompt } from "./canvas/ModTrustPrompt";
import { deleteVaultFile } from "./vault";
import { loadWorkspace, saveWorkspace } from "./workspace";
import type { WidgetInstance, Layout, WorkspaceState } from "./workspace";
import { DEFAULT_SESSION_TIMER } from "./sessionTimer";
import { VaultProvider } from "./VaultProvider";
import { WikilinkResolver, type NamedRef } from "./WikilinkResolver";
import { VaultSelector } from "./VaultSelector";
import { PartyContext, BestiaryContext, CalendarContext, GameTimeContext, ITContext, AIContext, ConditionsContext, pushPlayerScene, pushDateOverlay, useToast, type SharedPartyMember, type BestiaryCreatureRef, type CalendarState, type TimeTrackerState, type InitiativeTrackerState, type SessionTimerState } from "@ttcanvas/core";
import { advanceTimeSeconds, formatDateOverlay, mimeForImageExt, buildTurnOrder } from "@ttcanvas/widgets-builtin";
import { loadAppConfig, saveAppConfig, pushRecentVault, parentDir, type AppConfig, type AIConfigPatch } from "./appConfig";
import * as vaultApi from "./vault";

const CANVAS_AREA: React.CSSProperties = {
  position: "fixed",
  top: 44,
  left: 52,
  right: 0,
  bottom: 0,
};

const DEFAULT_CAL_STATE: CalendarState = { def: null, events: [] };
const DEFAULT_TIME_STATE: TimeTrackerState = {
  currentDate: null, currentHour: 8, currentMinute: 0, currentSecond: 0, history: [], showOnPlayer: false,
};
const DEFAULT_IT_STATE: InitiativeTrackerState = {
  combatants: [], currentId: null, round: 1, showOnPlayer: false, autoAdvanceTime: false, roundSeconds: 6,
};

/**
 * Serializes async writes to one file so callers never race each other, and
 * reports failures instead of losing them to an unhandled rejection. `enqueue`
 * always resolves (errors are caught and reported via `onError`); `flush`
 * lets a caller wait for whatever is currently in flight without starting a
 * new write.
 */
function createSerialQueue<T>(run: (value: T) => Promise<void>, onError: (message: string) => void) {
  let chain: Promise<void> = Promise.resolve();
  const enqueue = (value: T): Promise<void> => {
    chain = chain.catch(() => {}).then(() => run(value)).catch((err) => {
      onError(err instanceof Error ? err.message : String(err));
    });
    return chain;
  };
  const flush = (): Promise<void> => chain;
  return { enqueue, flush };
}

interface WidgetSlotProps {
  widget: WidgetInstance;
  effectiveState: unknown;
  isSingleton: boolean;
  focused: boolean;
  selected: boolean;
  lastPositionRef: { current: { id: string; x: number; y: number; width: number; height: number } | null };
  onUpdate: (id: string, patch: Partial<WidgetInstance>) => void;
  onRemove: (id: string) => void;
  onBringToFront: (id: string) => void;
  onClearSelection: () => void;
  onShiftClick: (id: string) => void;
  onGroupMove: (deltaX: number, deltaY: number) => void;
  onStateChange: (id: string, type: string, singleton: boolean, state: unknown) => void;
}

const WidgetSlot = memo(function WidgetSlot({
  widget: w,
  effectiveState,
  isSingleton,
  focused,
  selected,
  lastPositionRef,
  onUpdate,
  onRemove,
  onBringToFront,
  onClearSelection,
  onShiftClick,
  onGroupMove,
  onStateChange,
}: WidgetSlotProps) {
  const def = getWidget(w.type);

  const handleMove = useCallback((x: number, y: number) => {
    if (lastPositionRef.current?.id !== w.id)
      lastPositionRef.current = { id: w.id, x: w.x, y: w.y, width: w.width, height: w.height };
    onUpdate(w.id, { x, y });
  }, [lastPositionRef, onUpdate, w.id, w.x, w.y, w.width, w.height]);

  const handleResize = useCallback((width: number, height: number) => {
    if (lastPositionRef.current?.id !== w.id)
      lastPositionRef.current = { id: w.id, x: w.x, y: w.y, width: w.width, height: w.height };
    onUpdate(w.id, { width, height });
  }, [lastPositionRef, onUpdate, w.id, w.x, w.y, w.width, w.height]);

  const handleClose = useCallback(() => onRemove(w.id), [onRemove, w.id]);
  const handleFocus = useCallback(() => onBringToFront(w.id), [onBringToFront, w.id]);
  const handleSelect = useCallback(() => { onBringToFront(w.id); onClearSelection(); }, [onBringToFront, onClearSelection, w.id]);
  const handleShiftClick = useCallback(() => { onBringToFront(w.id); onShiftClick(w.id); }, [onBringToFront, onShiftClick, w.id]);
  const handleStateChange = useCallback((state: unknown) => onStateChange(w.id, w.type, isSingleton, state), [onStateChange, w.id, w.type, isSingleton]);

  const validatedState = def?.parseState ? def.parseState(effectiveState) : effectiveState;

  if (!def) {
    return (
      <WidgetFrame
        title={w.type}
        x={w.x}
        y={w.y}
        width={w.width}
        height={w.height}
        focused={focused}
        selected={selected}
        onMove={handleMove}
        onResize={handleResize}
        onClose={handleClose}
        onFocus={handleFocus}
        onSelect={handleSelect}
        onShiftClick={handleShiftClick}
        onGroupMove={onGroupMove}
      >
        <div style={{ padding: "16px 14px", color: "var(--ink-4)", fontSize: 12 }}>
          Unknown widget type: <code>{w.type}</code>
        </div>
      </WidgetFrame>
    );
  }

  const Component = def.component;
  return (
    <WidgetFrame
      title={def.title}
      icon={def.icon}
      help={def.help}
      x={w.x}
      y={w.y}
      width={w.width}
      height={w.height}
      focused={focused}
      selected={selected}
      minWidth={def.minWidth}
      minHeight={def.minHeight}
      onMove={handleMove}
      onResize={handleResize}
      onClose={handleClose}
      onFocus={handleFocus}
      onSelect={handleSelect}
      onShiftClick={handleShiftClick}
      onGroupMove={onGroupMove}
    >
      <Suspense fallback={<div style={{ padding: "16px 14px", color: "var(--ink-4)", fontSize: 12 }}>Loading…</div>}>
        <Component state={validatedState} onChange={handleStateChange} />
      </Suspense>
    </WidgetFrame>
  );
});

function App() {
  const { showToast } = useToast();
  const [widgets, setWidgets] = useState<WidgetInstance[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [layouts, setLayouts] = useState<Record<string, Layout>>({ Default: { widgets: [] } });
  const [activeLayout, setActiveLayout] = useState<string>("Default");
  const [showGrid, setShowGrid] = useState(true);
  const [showVignette, setShowVignette] = useState(false);
  // "Peek": a transient full-screen reveal of the layout's background with all widget chrome
  // hidden - deliberately not persisted (a momentary GM action, not a layout setting).
  const [peek, setPeek] = useState(false);
  // The active layout's background, resolved to a data URL for <img>/CSS use. Reloaded whenever
  // the layout's stored filename or the vault changes.
  const [backgroundSrc, setBackgroundSrc] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [singletonStates, setSingletonStates] = useState<Record<string, unknown>>({});
  const [disabledWidgetTypes, setDisabledWidgetTypes] = useState<string[]>([]);
  // Owned here rather than in Titlebar because peek unmounts the whole title bar, which would
  // otherwise wipe a running timer.
  const [sessionTimer, setSessionTimer] = useState<SessionTimerState>(DEFAULT_SESSION_TIMER);
  const [vaultPath, setVaultPath] = useState<string | null>(null);
  const [appConfig, setAppConfig] = useState<AppConfig>({ recentVaults: [], lastBrowsePath: null, aiProvider: "ollama", aiBaseUrl: "", aiApiKey: "", aiModel: null, playerWindowX: null, playerWindowY: null, playerWindowW: null, playerWindowH: null, customConditions: [], theme: "dark-vellum", accent: "amber", density: "comfortable", reduceMotion: false, trustedModHashes: [] });
  const [loaded, setLoaded] = useState(false);
  const [playerWindowOpen, setPlayerWindowOpen] = useState(false);
  const [playerFullscreen, setPlayerFullscreen] = useState(false);
  const [pendingModTrust, setPendingModTrust] = useState<{ vaultPath: string; mods: ScannedMod[] } | null>(null);
  const [appVersion, setAppVersion] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef<{ vaultPath: string; state: WorkspaceState } | null>(null);
  const playerWindowOpenRef = useRef(false);
  const zOrderOnlyRef = useRef(false);
  const workspaceQueueRef = useRef(
    createSerialQueue<{ vaultPath: string; state: WorkspaceState }>(
      ({ vaultPath: p, state }) => saveWorkspace(p, state),
      (msg) => showToast(`Failed to save workspace - ${msg}`, "error"),
    ),
  );
  const configQueueRef = useRef(
    createSerialQueue<AppConfig>(
      (config) => saveAppConfig(config),
      (msg) => showToast(`Failed to save preferences - ${msg}`, "error"),
    ),
  );

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => {});
  }, []);

  useEffect(() => {
    loadAppConfig()
      .then(({ config, recovered, backedUp }) => {
        setAppConfig(config);
        setLoaded(true);
        if (recovered) {
          showToast(
            backedUp
              ? "Your saved preferences were unreadable and have been reset to defaults. The old file was backed up."
              : "Your saved preferences were unreadable and have been reset to defaults. The old file could not be backed up and may be lost.",
            "error",
          );
        }
      })
      .catch((err) => {
        // Whatever went wrong, the app must still render - fall back to the
        // defaults already in state rather than leaving the UI blank forever.
        logError("Failed to load app config, starting with defaults", err);
        setLoaded(true);
        showToast("Couldn't load your saved preferences - starting with defaults.", "error");
      });
  }, [showToast]);

  useEffect(() => {
    if (!loaded) return;
    configQueueRef.current.enqueue(appConfig);
  }, [appConfig, loaded]);

  useEffect(() => {
    const unlisten = listen("player-window-closed", () => { setPlayerWindowOpen(false); setPlayerFullscreen(false); });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  useEffect(() => {
    const unlisten = listen<boolean>("player-fullscreen-changed", (e) => setPlayerFullscreen(e.payload));
    return () => { unlisten.then(fn => fn()); };
  }, []);

  useEffect(() => {
    const unlisten = listen<{ x: number; y: number; w: number; h: number }>("player-window-bounds", (e) => {
      // Side effects belong outside the updater: React.StrictMode double-invokes
      // updaters in dev to catch impure ones, which would double-save here.
      // The config-persist effect below saves whenever appConfig changes.
      setAppConfig((prev) => ({ ...prev, playerWindowX: e.payload.x, playerWindowY: e.payload.y, playerWindowW: e.payload.w, playerWindowH: e.payload.h }));
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  useEffect(() => { playerWindowOpenRef.current = playerWindowOpen; }, [playerWindowOpen]);

  useEffect(() => {
    const unlisten = listen("main-close-requested", async () => {
      if (playerWindowOpenRef.current) {
        try { await closePlayerWindow(); } catch { /* best-effort */ }
      }
      // A debounce timer not yet fired still holds its target in pendingSaveRef -
      // enqueue it now. If the timer already fired, pendingSaveRef is clear but the
      // save may still be running; flush() waits on that in-flight write instead of
      // starting a redundant concurrent one.
      const pending = pendingSaveRef.current;
      if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
      pendingSaveRef.current = null;
      await Promise.all([
        pending ? workspaceQueueRef.current.enqueue(pending) : workspaceQueueRef.current.flush(),
        configQueueRef.current.flush(),
      ]);
      invoke("confirm_close");
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  async function handlePlayerWindowToggle() {
    if (playerWindowOpen) {
      const bounds = await getPlayerWindowBounds();
      await closePlayerWindow();
      setPlayerWindowOpen(false);
      if (bounds) {
        setAppConfig({ ...appConfig, playerWindowX: bounds.x, playerWindowY: bounds.y, playerWindowW: bounds.w, playerWindowH: bounds.h });
      }
    } else {
      await openPlayerWindow({ x: appConfig.playerWindowX, y: appConfig.playerWindowY, w: appConfig.playerWindowW, h: appConfig.playerWindowH });
      setPlayerWindowOpen(true);
    }
  }

  async function handleClearPlayerScreen() {
    await pushPlayerScene({ type: "idle" });
  }

  async function handlePlayerFullscreenToggle() {
    const next = !playerFullscreen;
    setPlayerFullscreen(next);
    await invokeSetPlayerFullscreen(next);
  }

  useEffect(() => {
    if (!loaded || !vaultPath) return;
    if (zOrderOnlyRef.current) {
      zOrderOnlyRef.current = false;
      // The effect cleanup already cancelled the previous timer; re-schedule with the
      // same content so a real pending save isn't silently dropped.
      if (pendingSaveRef.current) {
        const pending = pendingSaveRef.current;
        saveTimer.current = setTimeout(() => {
          pendingSaveRef.current = null;
          workspaceQueueRef.current.enqueue(pending);
        }, 1000);
      }
      return;
    }
    const state: WorkspaceState = {
      version: 2,
      activeLayout,
      layouts: { ...layouts, [activeLayout]: { widgets, backgroundImage: layouts[activeLayout]?.backgroundImage } },
      showGrid,
      showVignette,
      singletonStates,
      disabledWidgetTypes,
      sessionTimer,
    };
    const pending = { vaultPath, state };
    pendingSaveRef.current = pending;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      pendingSaveRef.current = null;
      workspaceQueueRef.current.enqueue(pending);
    }, 1000);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [widgets, layouts, activeLayout, showGrid, showVignette, singletonStates, disabledWidgetTypes, sessionTimer, vaultPath, loaded]);

  const handleVaultChange = useCallback(async (newPath: string) => {
    if (vaultPath) {
      if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
      pendingSaveRef.current = null;
      // Errors are caught and toasted inside the queue, so this always
      // resolves - a save failure surfaces to the user but doesn't strand
      // them unable to switch vaults.
      await workspaceQueueRef.current.enqueue({
        vaultPath,
        state: {
          version: 2,
          activeLayout,
          layouts: { ...layouts, [activeLayout]: { widgets, backgroundImage: layouts[activeLayout]?.backgroundImage } },
          showGrid,
          showVignette,
          singletonStates,
          disabledWidgetTypes,
          sessionTimer,
        },
      });
    }
    let ws;
    let untrustedMods: ScannedMod[];
    try {
      [ws, untrustedMods] = await Promise.all([
        loadWorkspace(newPath),
        loadMods(newPath, (hash) => appConfig.trustedModHashes.includes(hash)),
      ]);
    } catch (err) {
      showToast(`Failed to load workspace - ${err instanceof Error ? err.message : String(err)}`, "error");
      return;
    }
    setLayouts(ws.layouts);
    setActiveLayout(ws.activeLayout);
    setWidgets(ws.layouts[ws.activeLayout]?.widgets ?? []);
    setShowGrid(ws.showGrid ?? true);
    setShowVignette(ws.showVignette ?? false);
    setSingletonStates(ws.singletonStates ?? {});
    setDisabledWidgetTypes(ws.disabledWidgetTypes ?? []);
    setSessionTimer(ws.sessionTimer ?? DEFAULT_SESSION_TIMER);
    setVaultPath(newPath);
    setPendingModTrust(untrustedMods.length > 0 ? { vaultPath: newPath, mods: untrustedMods } : null);
    const updated = pushRecentVault(appConfig, newPath);
    const withBrowse = { ...updated, lastBrowsePath: parentDir(newPath) };
    setAppConfig(withBrowse);
  }, [vaultPath, widgets, layouts, activeLayout, showGrid, showVignette, singletonStates, disabledWidgetTypes, sessionTimer, appConfig, showToast]);

  const handleOpenVault = useCallback(async () => {
    const path = await vaultApi.openVault(appConfig.lastBrowsePath);
    if (path) await handleVaultChange(path);
  }, [handleVaultChange, appConfig.lastBrowsePath]);

  const handleResume = useCallback(async (path: string) => {
    await handleVaultChange(path);
  }, [handleVaultChange]);

  const updateWidget = useCallback((id: string, patch: Partial<WidgetInstance>) => {
    setWidgets((ws) => ws.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  }, []);

  const widgetsRef = useRef(widgets);
  useEffect(() => { widgetsRef.current = widgets; });

  const removeWidget = useCallback((id: string) => {
    const widget = widgetsRef.current.find((w) => w.id === id);
    const def = widget ? getWidget(widget.type) : undefined;
    if (def?.singleton) {
      updateWidget(id, { hidden: true });
    } else {
      setWidgets((ws) => ws.filter((w) => w.id !== id));
    }
  }, [updateWidget]);

  const bringToFront = useCallback((id: string) => {
    setWidgets((ws) => {
      const idx = ws.findIndex((w) => w.id === id);
      if (idx === -1 || idx === ws.length - 1) return ws;
      zOrderOnlyRef.current = true;
      return [...ws.slice(0, idx), ...ws.slice(idx + 1), ws[idx]];
    });
  }, []);

  const handleFocusWidget = useCallback((id: string) => {
    bringToFront(id);
    const w = widgets.find((w) => w.id === id);
    if (w) {
      window.dispatchEvent(new CustomEvent("ttcanvas:focus-widget", {
        detail: { x: w.x, y: w.y, w: w.width, h: w.height },
      }));
    }
  }, [bringToFront, widgets]);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const focusedIdRef = useRef<string | null>(null);
  const lastPositionRef = useRef<{ id: string; x: number; y: number; width: number; height: number } | null>(null);

  useEffect(() => {
    function isInputActive() {
      const el = document.activeElement;
      if (!el) return false;
      const tag = el.tagName.toLowerCase();
      return tag === "input" || tag === "textarea" || tag === "select" || (el as HTMLElement).isContentEditable;
    }

    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;

      if (e.key === "Escape") {
        setSelectedIds(new Set());
        setPickerOpen(false);
        setPaletteOpen(false);
        setHelpOpen(false);
        setPeek(false);
        return;
      }

      if (e.key === "?" && !isInputActive()) {
        setHelpOpen((o) => !o);
        return;
      }

      if ((e.key === "Delete" || e.key === "Backspace") && !isInputActive()) {
        const id = focusedIdRef.current;
        if (id) { e.preventDefault(); removeWidget(id); }
        return;
      }

      if (meta && !e.shiftKey && e.key === "z" && !isInputActive()) {
        e.preventDefault();
        const last = lastPositionRef.current;
        if (last) {
          updateWidget(last.id, { x: last.x, y: last.y, width: last.width, height: last.height });
          lastPositionRef.current = null;
        }
        return;
      }

      if (meta && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }

      if (meta && e.key === "\\") {
        e.preventDefault();
        setPickerOpen((o) => !o);
        return;
      }

      if (meta && e.shiftKey && (e.key === "F" || e.key === "f")) {
        e.preventDefault();
        if (!document.fullscreenElement) document.documentElement.requestFullscreen();
        else document.exitFullscreen();
        return;
      }

      if (meta && e.key === "g" && !isInputActive()) {
        e.preventDefault();
        setShowGrid((v) => !v);
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [removeWidget, updateWidget]);

  // Suppress the X11 middle-click "primary selection" paste. The middle button is our
  // pan control, so on Linux clicking it over any input would dump the last selection in.
  // WebKitGTK performs that paste on the paste/auxclick path (not the mousedown default,
  // which the canvas already prevents), so we block a paste that lands right after a
  // middle-button press - leaving Ctrl+V, which has no preceding middle-click, untouched.
  useEffect(() => {
    let lastMiddleDown = 0;
    const onDown = (e: MouseEvent) => { if (e.button === 1) lastMiddleDown = e.timeStamp; };
    const onPaste = (e: ClipboardEvent) => {
      if (e.timeStamp - lastMiddleDown < 400) e.preventDefault();
    };
    const onAux = (e: MouseEvent) => { if (e.button === 1) e.preventDefault(); };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("paste", onPaste, true);
    document.addEventListener("auxclick", onAux, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("paste", onPaste, true);
      document.removeEventListener("auxclick", onAux, true);
    };
  }, []);

  const selectedIdsRef = useRef(selectedIds);
  useEffect(() => { selectedIdsRef.current = selectedIds; });

  const handleShiftClick = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleGroupMove = useCallback((deltaX: number, deltaY: number) => {
    const ids = selectedIdsRef.current;
    setWidgets((ws) =>
      ws.map((w) => (ids.has(w.id) ? { ...w, x: w.x + deltaX, y: w.y + deltaY } : w)),
    );
  }, []);

  const handleStateChange = useCallback((id: string, type: string, singleton: boolean, state: unknown) => {
    if (singleton) {
      setSingletonStates((ss) => ({ ...ss, [type]: state }));
    } else {
      updateWidget(id, { state });
    }
  }, [updateWidget]);

  const handleMarqueeSelect = useCallback(
    (rect: WorldRect) => {
      const ids = widgets
        .filter((w) => {
          if (w.hidden) return false;
          return (
            w.x < rect.x + rect.w &&
            w.x + w.width > rect.x &&
            w.y < rect.y + rect.h &&
            w.y + w.height > rect.y
          );
        })
        .map((w) => w.id);
      setSelectedIds(new Set(ids));
    },
    [widgets],
  );

  const handleClearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const addWidget = useCallback((type: string) => {
    const def = getWidget(type);
    if (!def) return;
    if (def.singleton) {
      const existing = widgets.find((w) => w.type === type);
      if (existing) {
        if (existing.hidden) updateWidget(existing.id, { hidden: false });
        bringToFront(existing.id);
        return;
      }
    }
    setWidgets((ws) => [
      ...ws,
      {
        id: crypto.randomUUID(),
        type,
        x: 120 + (ws.length % 5) * 24,
        y: 120 + (ws.length % 5) * 24,
        width: def.defaultSize.width,
        height: def.defaultSize.height,
        state: resolveDefaultState(def),
      },
    ]);
  }, [widgets, bringToFront, updateWidget]);

  const switchLayout = useCallback((name: string) => {
    setLayouts((ls) => ({ ...ls, [activeLayout]: { widgets, backgroundImage: ls[activeLayout]?.backgroundImage } }));
    setActiveLayout(name);
    setWidgets(layouts[name]?.widgets ?? []);
  }, [activeLayout, widgets, layouts]);

  const newLayout = useCallback((name: string) => {
    setLayouts((ls) => ({ ...ls, [activeLayout]: { widgets, backgroundImage: ls[activeLayout]?.backgroundImage }, [name]: { widgets: [] } }));
    setActiveLayout(name);
    setWidgets([]);
  }, [activeLayout, widgets]);

  const renameLayout = useCallback((oldName: string, newName: string) => {
    setLayouts((ls) => {
      const next = { ...ls, [newName]: ls[oldName] };
      delete next[oldName];
      return next;
    });
    if (activeLayout === oldName) setActiveLayout(newName);
  }, [activeLayout]);

  const deleteLayout = useCallback((name: string) => {
    const fallback = Object.keys(layouts).find((k) => k !== name) ?? "Default";
    setLayouts((ls) => {
      const next = { ...ls };
      delete next[name];
      if (!next[fallback]) next[fallback] = { widgets: [] };
      return next;
    });
    if (activeLayout === name) {
      setActiveLayout(fallback);
      setWidgets(layouts[fallback]?.widgets ?? []);
    }
  }, [activeLayout, layouts]);

  // Reuses the maps/ vault subfolder (same copy machinery as Map Display's own maps) rather than
  // a dedicated backgrounds/ folder - one less new Rust command for a rare, low-volume asset.
  const chooseLayoutBackground = useCallback(async () => {
    if (!vaultPath) return;
    const picked = await vaultApi.pickImageFile();
    if (!picked) return;
    const { file_name } = await vaultApi.copyToVaultMaps(vaultPath, picked);
    setLayouts((ls) => ({ ...ls, [activeLayout]: { widgets: ls[activeLayout]?.widgets ?? widgets, backgroundImage: file_name } }));
  }, [vaultPath, activeLayout, widgets]);

  const clearLayoutBackground = useCallback(() => {
    setLayouts((ls) => ({ ...ls, [activeLayout]: { widgets: ls[activeLayout]?.widgets ?? widgets, backgroundImage: undefined } }));
  }, [activeLayout, widgets]);

  // Resolve the active layout's stored filename to a displayable data URL whenever it (or the
  // vault) changes - mirrors the read pattern used throughout the widgets (pick -> base64 -> data URL).
  const activeBackgroundImage = layouts[activeLayout]?.backgroundImage;
  useEffect(() => {
    if (!vaultPath || !activeBackgroundImage) { setBackgroundSrc(null); return; }
    let cancelled = false;
    vaultApi.readFileBase64(`${vaultPath}/maps`, activeBackgroundImage)
      .then((b64) => { if (!cancelled) setBackgroundSrc(`data:${mimeForImageExt(activeBackgroundImage)};base64,${b64}`); })
      .catch(() => { if (!cancelled) setBackgroundSrc(null); });
    return () => { cancelled = true; };
  }, [vaultPath, activeBackgroundImage]);

  const focusByType = useCallback((type: string) => {
    const existing = widgets.find((w) => w.type === type);
    if (existing) bringToFront(existing.id);
  }, [widgets, bringToFront]);

  const visibleWidgets = useMemo(() => widgets.filter((w) => !w.hidden), [widgets]);

  const openTypes = useMemo(
    () => new Set(visibleWidgets.map((w) => w.type)),
    [visibleWidgets]
  );

  const focusedId = useMemo(
    () => visibleWidgets.length > 0 ? visibleWidgets[visibleWidgets.length - 1].id : null,
    [visibleWidgets]
  );
  useLayoutEffect(() => { focusedIdRef.current = focusedId; }, [focusedId]);

  const partyMembers = useMemo<SharedPartyMember[]>(() => {
    const partyWidget = widgets.find((w) => w.type === "party-tracker");
    if (!partyWidget) return [];
    const s = (singletonStates["party-tracker"] ?? partyWidget.state) as { members?: SharedPartyMember[] };
    return s?.members ?? [];
  }, [widgets, singletonStates]);

  // Read-only creature list for the Encounter Builder (mirrors partyMembers) - a subset of each
  // BestiaryEntry so other widgets never reach into the Bestiary's own widget state.
  const bestiaryCreatures = useMemo<BestiaryCreatureRef[]>(() => {
    const bestiaryWidget = widgets.find((w) => w.type === "bestiary");
    if (!bestiaryWidget) return [];
    const s = (singletonStates["bestiary"] ?? bestiaryWidget.state) as {
      entries?: { id: string; name: string; cr: string; hp: number; ac: number; portrait?: string; abilityScores?: import("@ttcanvas/core").AbilityScores }[];
    };
    return (s?.entries ?? []).map((e) => ({ id: e.id, name: e.name, cr: e.cr, hp: e.hp, ac: e.ac, portrait: e.portrait, abilityScores: e.abilityScores }));
  }, [widgets, singletonStates]);

  // Name lists for the wikilink resolver's state-backed targets. Read straight from singleton state
  // (not gated on the widget being on the canvas) so `[[creature:X]]` / `[[card:X]]` resolve even when
  // the widget is closed - the open handler adds it.
  // Prefer the singleton state but fall back to the widget instance state, exactly as the render path
  // (`singletonStates[type] ?? w.state`) and `bestiaryCreatures` do - older workspaces may still hold
  // the data on the instance, and reading only singletonStates would make links miss and fall to notes.
  const bestiaryState = singletonStates["bestiary"] ?? widgets.find((w) => w.type === "bestiary")?.state;
  const ruleCardsState = singletonStates["rule-cards"] ?? widgets.find((w) => w.type === "rule-cards")?.state;
  const resolverCreatures = useMemo<NamedRef[]>(() => {
    const s = bestiaryState as { entries?: { id: string; name: string }[] } | undefined;
    return (s?.entries ?? []).map((e) => ({ ref: e.id, name: e.name }));
  }, [bestiaryState]);
  const resolverCards = useMemo<NamedRef[]>(() => {
    const s = ruleCardsState as { cards?: { id: string; title: string }[] } | undefined;
    return (s?.cards ?? []).map((c) => ({ ref: c.id, name: c.title }));
  }, [ruleCardsState]);
  // Folder-backed link targets, with the same instance-state fallback so links resolve on older workspaces.
  const notesFolder = ((singletonStates["session-notes"] ?? widgets.find((w) => w.type === "session-notes")?.state) as { notesFolder?: string } | undefined)?.notesFolder ?? null;
  const rulesFolder = ((singletonStates["rules-reference"] ?? widgets.find((w) => w.type === "rules-reference")?.state) as { rulesFolder?: string } | undefined)?.rulesFolder ?? null;

  // The current turn's linked map token(s), if any - lets Map Display spotlight them on the GM's
  // own map (the player window gets the same value via InitiativeOverlay.activeSourceIds instead,
  // since it has no context, only the pushed overlay). A combined group's turn has no single
  // combatant - every member acts together, so every member's token spotlights (tracking/bugs.md);
  // buildTurnOrder is reused here (not re-derived) so group-collapsing logic stays in one place.
  // Depends only on the effective IT state (same narrowing as bestiaryState/resolverCreatures
  // above), not the whole singletonStates object - otherwise any unrelated singleton update (a
  // Time Tracker tick, say) would bounce ITContext's value and re-render every useIT() consumer,
  // including Map Display.
  const itState = singletonStates["initiative-tracker"] ?? widgets.find((w) => w.type === "initiative-tracker")?.state;
  const activeCombatantSourceIds = useMemo<string[]>(() => {
    if (!itState) return [];
    const it = itState as InitiativeTrackerState;
    const cur = buildTurnOrder(it.combatants, it.groups ?? []).find((e) => e.id === it.currentId);
    if (!cur) return [];
    const members = cur.kind === "group" ? cur.members : [cur.combatant];
    // Foes deliberately have no sourceId of their own (keeps repeated creatures independent -
    // see tracking/bugs.md); fall back to the combatant id itself so the spotlight still matches
    // the token that was dragged in with that same id (CombatantRow's drag handler does the same).
    return members.map((m) => m.sourceId ?? m.id);
  }, [itState]);

  const calState = (singletonStates["custom-calendar"] ?? DEFAULT_CAL_STATE) as CalendarState;
  const timeState = (singletonStates["time-tracker"] ?? DEFAULT_TIME_STATE) as TimeTrackerState;
  const setCalendarState = useCallback(
    (s: CalendarState) => setSingletonStates((ss) => ({ ...ss, "custom-calendar": s })),
    [setSingletonStates],
  );
  const setTimeState = useCallback(
    (s: TimeTrackerState) => setSingletonStates((ss) => ({ ...ss, "time-tracker": s })),
    [setSingletonStates],
  );

  // Advance the shared in-game clock (Time Tracker singleton state) by
  // deltaSeconds - used by Initiative Tracker's per-round auto-advance. Reads
  // through a ref so the callback stays referentially stable, and works even
  // while the Time Tracker widget itself is closed.
  const singletonStatesRef = useRef(singletonStates);
  useLayoutEffect(() => { singletonStatesRef.current = singletonStates; }, [singletonStates]);
  const advanceGameTime = useCallback((deltaSeconds: number) => {
    const cal = (singletonStatesRef.current["custom-calendar"] ?? DEFAULT_CAL_STATE) as CalendarState;
    if (!cal.def) return; // no calendar -> graceful no-op
    const calDef = cal.def;

    const computeNext = (t: TimeTrackerState) => {
      if (!t.currentDate) return null; // no date set -> graceful no-op
      const r = advanceTimeSeconds(t.currentDate, t.currentHour, t.currentMinute, t.currentSecond ?? 0, deltaSeconds, calDef);
      const next: TimeTrackerState = { ...t, currentDate: r.date, currentHour: r.hour, currentMinute: r.minute, currentSecond: r.second };
      return { next, date: r.date, hour: r.hour, minute: r.minute };
    };

    // The overlay push is a display nicety, not the authoritative record, so reading it off the
    // ref (occasionally one-commit stale) is fine here - unlike the state write below, it doesn't
    // need to survive two advances landing in the same batch.
    const approx = computeNext((singletonStatesRef.current["time-tracker"] ?? DEFAULT_TIME_STATE) as TimeTrackerState);
    if (approx?.next.showOnPlayer) pushDateOverlay(formatDateOverlay(approx.date, approx.hour, approx.minute, calDef));

    // Thread the base clock through the functional updater's `prev`, not the ref, so two advances
    // landing in the same batch (before the ref's useLayoutEffect refresh) each apply on top of
    // the other instead of the second clobbering the first.
    setSingletonStates((prev) => {
      const t = (prev["time-tracker"] ?? DEFAULT_TIME_STATE) as TimeTrackerState;
      const computed = computeNext(t);
      return computed ? { ...prev, "time-tracker": computed.next } : prev;
    });
  }, [setSingletonStates]);

  const addCombatant = useCallback((c: Omit<import("@ttcanvas/core").Combatant, "id">) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setSingletonStates((ss) => {
      const it = (ss["initiative-tracker"] ?? DEFAULT_IT_STATE) as InitiativeTrackerState;
      return { ...ss, "initiative-tracker": { ...it, combatants: [...it.combatants, { ...c, id }] } };
    });
  }, [setSingletonStates]);

  // Batch insert (Encounter Builder "Start combat") - a single state update for the whole encounter.
  // `groups` carries any pre-formed group-initiative groups (e.g. a count>1 monster stack added
  // with "Roll as group" on) to merge in alongside the new combatants.
  const addCombatants = useCallback((
    cs: Omit<import("@ttcanvas/core").Combatant, "id">[],
    groups?: import("@ttcanvas/core").InitiativeGroup[],
  ) => {
    if (cs.length === 0) return;
    setSingletonStates((ss) => {
      const it = (ss["initiative-tracker"] ?? DEFAULT_IT_STATE) as InitiativeTrackerState;
      const withIds = cs.map((c, i) => ({ ...c, id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}` }));
      const nextGroups = groups?.length ? [...(it.groups ?? []), ...groups] : it.groups;
      return { ...ss, "initiative-tracker": { ...it, combatants: [...it.combatants, ...withIds], groups: nextGroups } };
    });
  }, [setSingletonStates]);

  const aiContextValue = useMemo(() => ({
    config: {
      provider: appConfig.aiProvider,
      baseUrl: appConfig.aiBaseUrl,
      apiKey: appConfig.aiApiKey,
      model: appConfig.aiModel,
    },
  }), [appConfig.aiProvider, appConfig.aiBaseUrl, appConfig.aiApiKey, appConfig.aiModel]);

  const calendarContextValue = useMemo(() => ({
    def: calState.def,
    events: calState.events,
    setCalendarState,
    currentDate: timeState.currentDate,
    currentHour: timeState.currentHour,
    currentMinute: timeState.currentMinute,
    currentSecond: timeState.currentSecond ?? 0,
    history: timeState.history,
    showOnPlayer: timeState.showOnPlayer,
    setTimeState,
  }), [calState, timeState, setCalendarState, setTimeState]);

  const conditionsContextValue = useMemo(() => ({
    customConditions: appConfig.customConditions,
  }), [appConfig.customConditions]);

  const gameTimeContextValue = useMemo(() => ({ advanceGameTime }), [advanceGameTime]);
  const itContextValue = useMemo(
    () => ({ addCombatant, addCombatants, activeSourceIds: activeCombatantSourceIds }),
    [addCombatant, addCombatants, activeCombatantSourceIds],
  );
  const partyContextValue = useMemo(() => ({ members: partyMembers }), [partyMembers]);
  const bestiaryContextValue = useMemo(() => ({ creatures: bestiaryCreatures }), [bestiaryCreatures]);

  const railWidgets: RailWidget[] = useMemo(
    () => visibleWidgets.map((w) => ({ id: w.id, type: w.type, x: w.x, y: w.y, width: w.width, height: w.height })),
    [visibleWidgets],
  );

  function handleReorderWidgets(orderedIds: string[]) {
    setWidgets((prev) => {
      const byId = new Map(prev.map((w) => [w.id, w]));
      const reordered = orderedIds.map((id) => byId.get(id)).filter(Boolean) as typeof prev;
      const rest = prev.filter((w) => !orderedIds.includes(w.id));
      return [...rest, ...reordered];
    });
  }

  // Bring a singleton widget into view (unhide + raise it, or add it if it is not on the canvas yet).
  // Shared by every "open X" handler below so opening an entity always surfaces its widget.
  const revealWidget = useCallback((type: string) => {
    const existing = widgets.find((w) => w.type === type);
    if (existing) {
      if (existing.hidden) updateWidget(existing.id, { hidden: false });
      bringToFront(existing.id);
    } else {
      addWidget(type);
    }
  }, [widgets, bringToFront, updateWidget, addWidget]);

  const handleOpenNpc = useCallback((filename: string) => {
    setSingletonStates((ss) => ({ ...ss, "npc-library": { selectedFile: filename } }));
    revealWidget("npc-library");
  }, [revealWidget]);

  const handleOpenLocation = useCallback((filename: string) => {
    setSingletonStates((ss) => ({ ...ss, "gazetteer": { selectedFile: filename } }));
    revealWidget("gazetteer");
  }, [revealWidget]);

  const handleOpenFile = useCallback((filename: string) => {
    setSingletonStates((ss) => ({
      ...ss,
      "session-notes": { ...(ss["session-notes"] as object | undefined ?? {}), selectedFile: filename },
    }));
    revealWidget("session-notes");
  }, [revealWidget]);

  const handleOpenRule = useCallback((filename: string) => {
    setSingletonStates((ss) => ({
      ...ss,
      "rules-reference": { ...(ss["rules-reference"] as object | undefined ?? {}), selectedFile: filename },
    }));
    revealWidget("rules-reference");
  }, [revealWidget]);

  const handleOpenCard = useCallback((id: string) => {
    setSingletonStates((ss) => ({
      ...ss,
      "rule-cards": { ...(ss["rule-cards"] as object | undefined ?? {}), selectedId: id },
    }));
    revealWidget("rule-cards");
  }, [revealWidget]);

  // Bestiary has no persisted selection (it opens a modal), so we hand it a one-shot request id it
  // consumes and clears the same frame. The 1s save debounce coalesces the set+clear, so it never
  // reaches disk (the bestiary schema keeps the field so the widget can actually receive it).
  const handleOpenCreature = useCallback((id: string) => {
    setSingletonStates((ss) => ({
      ...ss,
      "bestiary": { ...(ss["bestiary"] as object | undefined ?? {}), openRequestId: id },
    }));
    revealWidget("bestiary");
  }, [revealWidget]);

  // Ask Map Display to jump to or arm placement of a Gazetteer place's pin. Same one-shot request-id
  // shape as handleOpenCreature: Map Display alone decides jump-vs-place (it holds the token data),
  // so this only needs to hand off the request and reveal the widget. Base the patch on the same
  // effective state the render path uses (singletonStates[type] ?? widget.state) - reading only
  // singletonStates would replace scenes/mapsFolder with an empty object on a workspace where Map
  // Display's state still lives on the widget instance, losing every scene.
  const handlePinLocation = useCallback((filename: string, name: string) => {
    setSingletonStates((ss) => {
      const base = (ss["map-display"] ?? widgets.find((w) => w.type === "map-display")?.state) as object | undefined ?? {};
      return { ...ss, "map-display": { ...base, locateRequest: { id: crypto.randomUUID(), locationRef: filename, label: name } } };
    });
    revealWidget("map-display");
  }, [revealWidget, widgets]);

  // Wikilink navigation: fired by SessionNotes when [[Page Name]] is clicked
  useEffect(() => {
    function handler(e: Event) {
      const { name } = (e as CustomEvent<{ name: string }>).detail;
      handleOpenFile(name.endsWith(".md") ? name : `${name}.md`);
    }
    window.addEventListener("ttcanvas:open-wikilink", handler);
    return () => window.removeEventListener("ttcanvas:open-wikilink", handler);
  }, [handleOpenFile]);

  // Open an NPC / Gazetteer place from a backlink or graph node (Session Notes' vault-wide links),
  // and hand off a Gazetteer "Pin this place" click to Map Display. The pin -> Gazetteer direction
  // reuses ttcanvas:open-location above - Map Display dispatches it directly on a linked-pin click.
  useEffect(() => {
    const npc = (e: Event) => handleOpenNpc((e as CustomEvent<{ filename: string }>).detail.filename);
    const loc = (e: Event) => handleOpenLocation((e as CustomEvent<{ filename: string }>).detail.filename);
    const pin = (e: Event) => {
      const { filename, name } = (e as CustomEvent<{ filename: string; name: string }>).detail;
      handlePinLocation(filename, name);
    };
    window.addEventListener("ttcanvas:open-npc", npc);
    window.addEventListener("ttcanvas:open-location", loc);
    window.addEventListener("ttcanvas:pin-location", pin);
    return () => {
      window.removeEventListener("ttcanvas:open-npc", npc);
      window.removeEventListener("ttcanvas:open-location", loc);
      window.removeEventListener("ttcanvas:pin-location", pin);
    };
  }, [handleOpenNpc, handleOpenLocation, handlePinLocation]);

  // Apply visual preferences to <body> - must be before any conditional returns
  useEffect(() => {
    const body = document.body;
    body.dataset.theme = appConfig.theme;
    body.dataset.accent = appConfig.accent;
    body.dataset.density = appConfig.density;
    body.dataset.reduceMotion = String(appConfig.reduceMotion);
  }, [appConfig.theme, appConfig.accent, appConfig.density, appConfig.reduceMotion]);

  if (!loaded) return null;

  if (!vaultPath) {
    return (
      <VaultSelector
        recentVaults={appConfig.recentVaults}
        onResume={handleResume}
        onOpenVault={handleOpenVault}
      />
    );
  }

  function handleWidgetToggle(type: string) {
    setDisabledWidgetTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  }

  async function handleModUninstall(type: string) {
    if (!vaultPath) return;
    if (!getModWidgetTypes().includes(type)) return;
    const filename = getModFilename(type);
    if (filename) {
      await deleteVaultFile(vaultPath, `mods/${filename}`).catch(() => undefined);
    }
    clearModWidgets();
    const untrustedMods = await loadMods(vaultPath, (hash) => appConfig.trustedModHashes.includes(hash));
    setPendingModTrust(untrustedMods.length > 0 ? { vaultPath, mods: untrustedMods } : null);
    setDisabledWidgetTypes((prev) => prev.filter((t) => t !== type));
  }

  function handleAIChange(patch: AIConfigPatch) {
    const next = {
      ...appConfig,
      aiProvider: patch.aiProvider ?? appConfig.aiProvider,
      aiBaseUrl:  patch.aiBaseUrl  !== undefined ? patch.aiBaseUrl  : appConfig.aiBaseUrl,
      aiApiKey:   patch.aiApiKey   !== undefined ? patch.aiApiKey   : appConfig.aiApiKey,
      aiModel:    patch.aiModel    !== undefined ? patch.aiModel    : appConfig.aiModel,
    };
    setAppConfig(next);
  }

  return (
    <VaultProvider vaultPath={vaultPath} onVaultPathChange={handleVaultChange}>
      <AIContext.Provider value={aiContextValue}>
      <CalendarContext.Provider value={calendarContextValue}>
      <GameTimeContext.Provider value={gameTimeContextValue}>
      <ConditionsContext.Provider value={conditionsContextValue}>
      <ITContext.Provider value={itContextValue}>
      <PartyContext.Provider value={partyContextValue}>
      <BestiaryContext.Provider value={bestiaryContextValue}>
        {/* Resolves cross-entity [[links]] from entity bodies; inside the provider so it can read the
            vault. Session Notes' own links stay note-only (separate channel), keeping Obsidian intact. */}
        <WikilinkResolver
          notesFolder={notesFolder}
          rulesFolder={rulesFolder}
          creatures={resolverCreatures}
          cards={resolverCards}
          onOpenNote={handleOpenFile}
          onOpenNpc={handleOpenNpc}
          onOpenPlace={handleOpenLocation}
          onOpenRule={handleOpenRule}
          onOpenCreature={handleOpenCreature}
          onOpenCard={handleOpenCard}
        />
        {pendingModTrust && (
          <ModTrustPrompt
            filenames={pendingModTrust.mods.map((m) => m.filename)}
            onSkip={() => setPendingModTrust(null)}
            onTrust={async () => {
              const { mods } = pendingModTrust;
              setPendingModTrust(null);
              setAppConfig((prev) => ({
                ...prev,
                trustedModHashes: [...new Set([...prev.trustedModHashes, ...mods.map((m) => m.hash)])],
              }));
              for (const { filename, content } of mods) {
                await importMod(filename, content);
              }
            }}
          />
        )}
        {!peek && (
          <Titlebar
            vaultPath={vaultPath}
            recentVaults={appConfig.recentVaults}
            playerWindowOpen={playerWindowOpen}
            playerFullscreen={playerFullscreen}
            sessionTimer={sessionTimer}
            onSessionTimerChange={setSessionTimer}
            onLayoutsClick={() => setSettingsOpen((o) => !o)}
            onOpenVault={handleOpenVault}
            onResumeVault={handleResume}
            onPlayerWindowToggle={handlePlayerWindowToggle}
            onClearPlayerScreen={handleClearPlayerScreen}
            onPlayerFullscreenToggle={handlePlayerFullscreenToggle}
            onSettingsClick={() => setPrefsOpen(true)}
            onSearchClick={() => setPaletteOpen(true)}
          />
        )}
        {!peek && (
          <Sidebar
            widgets={railWidgets}
            focusedId={focusedId}
            onFocusWidget={handleFocusWidget}
            onReorder={handleReorderWidgets}
          />
        )}
        <div style={CANVAS_AREA}>
          <Canvas
            showGrid={showGrid}
            showVignette={showVignette}
            backgroundSrc={backgroundSrc}
            onMarqueeSelect={handleMarqueeSelect}
            onClearSelection={handleClearSelection}
            statusBarSlot={
              !peek && (
                <CanvasStatus
                  widgetCount={visibleWidgets.length}
                  layoutName={activeLayout}
                />
              )
            }
          >
            {!peek && visibleWidgets.map((w) => {
              const def = getWidget(w.type);
              const effectiveState = def?.singleton ? (singletonStates[w.type] ?? w.state) : w.state;
              return (
                <WidgetSlot
                  key={w.id}
                  widget={w}
                  effectiveState={effectiveState}
                  isSingleton={!!def?.singleton}
                  focused={w.id === focusedId}
                  selected={selectedIds.has(w.id)}
                  lastPositionRef={lastPositionRef}
                  onUpdate={updateWidget}
                  onRemove={removeWidget}
                  onBringToFront={bringToFront}
                  onClearSelection={handleClearSelection}
                  onShiftClick={handleShiftClick}
                  onGroupMove={handleGroupMove}
                  onStateChange={handleStateChange}
                />
              );
            })}
          </Canvas>
          <button
            className={styles.peekToggle}
            onClick={() => setPeek((v) => !v)}
            title={peek ? "Exit peek (Esc)" : "Peek: hide all widgets and show just the background"}
            aria-label={peek ? "Exit peek" : "Peek"}
            aria-pressed={peek}
          >
            <Icon name={peek ? "close" : "eye"} size={18} stroke={1.8} />
          </button>
          {!peek && (
            <WidgetPicker
              openTypes={openTypes}
              onAdd={addWidget}
              onFocus={focusByType}
              open={pickerOpen}
              onOpenChange={setPickerOpen}
              disabledWidgetTypes={disabledWidgetTypes}
            />
          )}
          {!peek && helpOpen && <KeyboardHelp onClose={() => setHelpOpen(false)} />}
          {!peek && paletteOpen && (
            <CommandPalette
              openTypes={openTypes}
              onAdd={addWidget}
              onFocus={focusByType}
              onOpenNpc={handleOpenNpc}
              onOpenFile={handleOpenFile}
              onClose={() => setPaletteOpen(false)}
            />
          )}
          {!peek && (
            <SettingsMenu
              open={settingsOpen}
              onToggle={() => setSettingsOpen((o) => !o)}
              layouts={layouts}
              activeLayout={activeLayout}
              showGrid={showGrid}
              showVignette={showVignette}
              backgroundImage={activeBackgroundImage}
              onSwitch={switchLayout}
              onNew={newLayout}
              onRename={renameLayout}
              onDelete={deleteLayout}
              onToggleGrid={() => setShowGrid((v) => !v)}
              onToggleVignette={() => setShowVignette((v) => !v)}
              onChooseBackground={chooseLayoutBackground}
              onClearBackground={clearLayoutBackground}
            />
          )}
          {prefsOpen && (
            <PreferencesModal
              config={appConfig}
              version={appVersion}
              disabledWidgetTypes={disabledWidgetTypes}
              modWidgetTypes={getModWidgetTypes()}
              onClose={() => setPrefsOpen(false)}
              onChange={(patch) => setAppConfig((c) => ({ ...c, ...patch }))}
              onAIChange={handleAIChange}
              onWidgetToggle={handleWidgetToggle}
              onModUninstall={handleModUninstall}
            />
          )}
        </div>
      </BestiaryContext.Provider>
      </PartyContext.Provider>
      </ITContext.Provider>
      </ConditionsContext.Provider>
      </GameTimeContext.Provider>
      </CalendarContext.Provider>
      </AIContext.Provider>
    </VaultProvider>
  );
}

export default App;
