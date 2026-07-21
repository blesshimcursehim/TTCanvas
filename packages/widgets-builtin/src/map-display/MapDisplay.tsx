// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useState, useEffect, useRef, useCallback } from "react";
import { useVault, useIT, useGazetteerLocations, pushPlayerScene, pushMapPing, PING_LIFETIME_MS, drawFogCanvas, renderFogReveals, lastBrushPoint, fogModeOf } from "@ttcanvas/core";
import type { FogReveal, MapToken, MapTokenKind, FogMode, BrushPoint, MapAnnotation, AnnotationColor } from "@ttcanvas/core";
import type { MapDisplayState, MapScene, MarkupPreset } from "./types";
import { getActiveTokenDrag, clearActiveTokenDrag } from "../shared/tokenDrag";
import { mimeForImageExt } from "../shared/mime";
import { fitTransform, measureDistance, panToPoint } from "./utils";
import { AnnotationLayer } from "./AnnotationLayer";
import {
  annotationBounds, handlePoint, pickAnnotation, translateAnnotation,
  scaleAnnotationToBounds, boundsFromHandle, bboxAnnotationFromDrag, arrowAnnotationFromDrag,
  isDragMeaningful, nextAutoLabel, HANDLE_IDS, type HandleId, type Rect,
} from "./annotations";
import styles from "./MapDisplay.module.css";

interface Props {
  state: MapDisplayState;
  onChange: (state: MapDisplayState) => void;
}

type MarkupTool = "ring" | "box" | "arrow" | "highlight";
type ActiveTool = "pan" | "brush" | "rect" | "token" | "measure" | "place-location" | MarkupTool;

const MARKUP_TOOLS: MarkupTool[] = ["ring", "arrow", "box", "highlight"];
function isMarkupTool(t: ActiveTool): t is MarkupTool {
  return (MARKUP_TOOLS as string[]).includes(t);
}
/** Hit-test tolerance for selecting markup, in normalised units. */
const ANN_HIT_TOL = 0.012;

/** Swatch dot colours for the markup colour picker (vivid, preset-independent). */
const SWATCH: Record<AnnotationColor, string> = {
  amber: "oklch(0.82 0.17 80)",
  rose: "oklch(0.66 0.20 15)",
  azure: "oklch(0.70 0.14 240)",
  sage: "oklch(0.74 0.13 150)",
};
const MARKUP_COLORS: AnnotationColor[] = ["amber", "rose", "azure", "sage"];
const STROKE_LABELS: Record<1 | 2 | 3, string> = { 1: "S", 2: "M", 3: "L" };

// Visibility (M4): absent onBoard/showPlayers means on-board + mirrored to players.
const isOnBoard = (item: { onBoard?: boolean }) => item.onBoard !== false;
const isPlayerVisible = (item: { showPlayers?: boolean }) => item.showPlayers !== false;
const tokenKindOf = (t: MapToken): MapTokenKind => t.kind ?? "npc";
// Cycle order for the Visibility panel's reclassify button - a hand-placed token isn't stuck in
// the group its drag source implied.
const nextKind = (k: MapTokenKind): MapTokenKind => KIND_ORDER[(KIND_ORDER.indexOf(k) + 1) % KIND_ORDER.length];
const KIND_LABELS: Record<MapTokenKind, string> = { player: "Players", npc: "NPCs", enemy: "Enemies", location: "Locations" };
const KIND_ORDER: MapTokenKind[] = ["player", "npc", "enemy", "location"];
const ANN_TYPE_LABELS: Record<MapAnnotation["type"], string> = { ring: "Ring", box: "Box", arrow: "Arrow", highlight: "Highlight" };

const GM_FOG_OPACITY = 0.85;

const TOKEN_COLORS = [
  "oklch(0.60 0.20 25)",
  "oklch(0.55 0.20 260)",
  "oklch(0.60 0.20 150)",
  "oklch(0.60 0.20 300)",
  "oklch(0.75 0.20 90)",
  "oklch(0.65 0.20 45)",
];

function uid() { return crypto.randomUUID(); }

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

function defaultScene(name: string): MapScene {
  return {
    id: uid(),
    name,
    selectedMap: null,
    fogEnabled: false,
    fogReveals: [],
    tokens: [],
    annotations: [],
    gridEnabled: false,
    gridSize: 40,
    panX: 0,
    panY: 0,
    scale: 1,
  };
}

// Promote legacy flat state (pre-scenes) to scenes structure - no data loss.
function migrateToken(t: Record<string, unknown>): MapToken {
  if (!("imgSrc" in t)) return t as unknown as MapToken;
  const { imgSrc, ...rest } = t;
  // Vault-relative paths (non-data-URL) migrate cleanly; base64 data URLs are dropped
  if (typeof imgSrc === "string" && !imgSrc.startsWith("data:")) {
    return { ...rest, portraitPath: imgSrc } as unknown as MapToken;
  }
  return rest as unknown as MapToken;
}

function migrateState(raw: unknown): MapDisplayState {
  const r = raw as Record<string, unknown>;
  if (Array.isArray(r.scenes)) {
    const scenes = (r.scenes as MapScene[]).map((sc) => ({
      ...sc,
      tokens: (sc.tokens ?? []).map((t) => migrateToken(t as unknown as Record<string, unknown>)),
    }));
    return { ...(r as unknown as MapDisplayState), scenes };
  }
  const scene: MapScene = {
    id: uid(),
    name: "Scene 1",
    selectedMap: (r.selectedMap as string | null) ?? null,
    fogEnabled: (r.fogEnabled as boolean) ?? false,
    fogReveals: (r.fogReveals as FogReveal[]) ?? [],
    tokens: ((r.tokens as Record<string, unknown>[] | undefined) ?? []).map(migrateToken),
    gridEnabled: (r.gridEnabled as boolean) ?? false,
    gridSize: (r.gridSize as number) ?? 40,
    panX: (r.panX as number) ?? 0,
    panY: (r.panY as number) ?? 0,
    scale: (r.scale as number) ?? 1,
  };
  return {
    mapsFolder: (r.mapsFolder as string | null) ?? null,
    scenes: [scene],
    activeSceneId: scene.id,
    autoPushMap: (r.autoPushMap as boolean) ?? false,
  };
}


const TOKEN_BASE_PX = 52;
const TOKEN_SIZE_MIN = 0.5;
const TOKEN_SIZE_MAX = 6;
// Movement under this many pixels between a token's mousedown and mouseup counts as a click, not a drag.
const TOKEN_CLICK_TOL_PX = 4;

interface TokenPinProps {
  token: MapToken;
  imgW: number;
  imgH: number;
  ghost?: boolean; // on the board but hidden from players - GM-only "ghost" look
  spotlight?: boolean; // this token's combatant currently has the initiative turn
  onDragStart: (e: React.MouseEvent, id: string) => void;
  onRemove: (id: string) => void;
  onResize: (id: string, size: number) => void;
}

function TokenPin({ token, imgW, imgH, ghost, spotlight, onDragStart, onRemove, onResize }: TokenPinProps) {
  const vault = useVault();
  const size = token.size ?? 1;
  const px = TOKEN_BASE_PX * size;
  const divRef = useRef<HTMLDivElement>(null);
  const [portraitSrc, setPortraitSrc] = useState<string | null>(null);

  const sizeRef = useRef(size);
  sizeRef.current = size;
  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;
  const tokenId = token.id;

  useEffect(() => {
    const path = token.portraitPath;
    if (!path) { setPortraitSrc(null); return; }
    // Bestiary portraits arrive as inline data URLs (no file to read); use them as-is.
    if (path.startsWith("data:")) { setPortraitSrc(path); return; }
    if (!vault.vaultPath) { setPortraitSrc(null); return; }
    const fileName = path.split("/").pop()!;
    const mime = mimeForImageExt(fileName);
    let cancelled = false;
    vault.readFileBase64(`${vault.vaultPath}/portraits`, fileName)
      .then((b64) => { if (!cancelled) setPortraitSrc(`data:${mime};base64,${b64}`); })
      .catch(() => { if (!cancelled) setPortraitSrc(null); });
    return () => { cancelled = true; };
    // vault's context value is a fresh object every render (tracked in
    // tracking/phase6-fixes.md) - depending on the whole object instead of
    // its stable fields would re-run this on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token.portraitPath, vault.vaultPath, vault.vaultVersion]);

  useEffect(() => {
    const el = divRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const s = sizeRef.current;
      const delta = e.deltaY < 0 ? 0.1 : -0.1;
      const next = Math.min(TOKEN_SIZE_MAX, Math.max(TOKEN_SIZE_MIN, Math.round((s + delta) * 10) / 10));
      if (next !== s) onResizeRef.current(tokenId, next);
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [tokenId]);

  return (
    <div
      ref={divRef}
      className={`${styles.token} ${ghost ? styles.tokenGhost : ""} ${spotlight ? styles.tokenSpotlight : ""}`}
      style={{
        left: token.x * imgW,
        top: token.y * imgH,
        width: px,
        height: px,
        background: portraitSrc ? "transparent" : token.color,
      }}
      onMouseDown={(e) => { e.stopPropagation(); onDragStart(e, token.id); }}
    >
      {portraitSrc && (
        <img src={portraitSrc} className={styles.tokenPortrait} alt={token.label} />
      )}
      {ghost && <span className={styles.tokenGhostTag}>GM</span>}
      {token.locationRef && <span className={styles.tokenLinkedTag} title="Linked to a Gazetteer place" />}
      <span className={styles.tokenLabel}>{token.label}</span>
      <button
        className={styles.tokenRemove}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onRemove(token.id); }}
      >
        ×
      </button>
    </div>
  );
}

// A single visibility toggle in the manager: "board" (exists for anyone) or
// "players" (mirrored to the player window).
function VisToggle({ on, disabled, kind, onClick }: { on: boolean; disabled?: boolean; kind: "board" | "players"; onClick: () => void }) {
  return (
    <button
      className={`${styles.visBtn} ${on ? styles.visBtnOn : ""}`}
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={kind === "board"
        ? (on ? "On the board - click to stage off-board" : "Off the board - click to place on the map")
        : (on ? "Shown to players - click to keep GM-only" : "Hidden from players - click to reveal")}
    >
      {kind === "board" ? (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="4" width="16" height="16" rx="2" />
        </svg>
      ) : on ? (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" />
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 12s3.5-7 10-7c1.5 0 2.8.3 4 .8M22 12s-1 2.1-3 4M9.5 9.5a3 3 0 0 0 4.2 4.2" /><path d="M2 2l20 20" />
        </svg>
      )}
    </button>
  );
}

export function MapDisplay({ state: rawState, onChange }: Props) {
  const vault = useVault();
  const { activeSourceIds } = useIT();
  // Only to name a linked pin's place in the Visibility panel - resolved live, so a place renamed in
  // Gazetteer reads correctly here even though the token keeps its original label.
  const { locations: gazetteerLocations } = useGazetteerLocations();

  // Migrate old flat state on first render
  const state = migrateState(rawState);
  const migrated = !Array.isArray((rawState as unknown as Record<string, unknown>).scenes);
  useEffect(() => {
    if (migrated) onChange(state);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeScene = state.scenes.find((sc) => sc.id === state.activeSceneId) ?? state.scenes[0];
  const autoPushMap = state.autoPushMap ?? false;

  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [loadedMap, setLoadedMap] = useState<string | null>(null);
  // True while a different map is loading - shield covers the viewport so the
  // old map is never visible at the new scene's transform or fog state.
  const showShield = !!activeScene.selectedMap && loadedMap !== activeScene.selectedMap;
  const [files, setFiles] = useState<string[]>([]);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [activeTool, setActiveTool] = useState<ActiveTool>("pan");
  const [fogMode, setFogMode] = useState<FogMode>("reveal");
  // Overlay inspector drawer: auto-opens when a tool with settings is active
  // (measure / markup) or an annotation is selected; collapsible.
  const [drawerCollapsed, setDrawerCollapsed] = useState(false);
  // Markup (annotations) - selection + the style applied to newly drawn shapes.
  const [selectedAnnId, setSelectedAnnId] = useState<string | null>(null);
  const [markupColor, setMarkupColor] = useState<AnnotationColor>("amber");
  const [markupStroke, setMarkupStroke] = useState<1 | 2 | 3>(2);
  const [liveAnn, setLiveAnn] = useState<MapAnnotation | null>(null);
  // Visibility manager panel (token + markup All/Players toggles) open in the drawer.
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [liveRect, setLiveRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [liveMeasure, setLiveMeasure] = useState<{ start: { x: number; y: number }; end: { x: number; y: number } } | null>(null);
  // Local mirror of an alt-click ping, purely for the GM's own visual confirmation - the player
  // window gets its copy over the map-ping IPC channel, independently. Not scene state; never saved.
  const [gmPings, setGmPings] = useState<{ id: string; x: number; y: number }[]>([]);
  const [scaleEditorOpen, setScaleEditorOpen] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [calibPixels, setCalibPixels] = useState<number | null>(null);
  const [calibRealInput, setCalibRealInput] = useState("");
  const [scaleUnitLabel, setScaleUnitLabel] = useState(() => activeScene.mapScale?.unitLabel ?? "ft");
  const [scaleUnitsPerCell, setScaleUnitsPerCell] = useState(() => String(activeScene.mapScale?.unitsPerCell ?? 5));
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [pendingDrop, setPendingDrop] = useState<{
    draft: { sourceId?: string; label: string; color: string; portraitPath?: string; kind?: MapTokenKind };
    x: number;
    y: number;
    existingId: string;
  } | null>(null);
  // "place-location" tool: armed by a Gazetteer "Pin this place" click that found no existing pin.
  const [pendingLocationPin, setPendingLocationPin] = useState<{ locationRef: string; label: string } | null>(null);
  // A located pin to pan/ping once its scene's map has actually finished loading.
  const [pendingJump, setPendingJump] = useState<{ sceneId: string; tokenId: string } | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; });
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; });
  useEffect(() => { imgSizeRef.current = imgSize; }, [imgSize]);

  // Sync scale-panel inputs when switching scenes so they reflect the new scene's config.
  useEffect(() => {
    const sc = stateRef.current.scenes.find((s) => s.id === stateRef.current.activeSceneId) ?? stateRef.current.scenes[0];
    setScaleUnitLabel(sc?.mapScale?.unitLabel ?? "ft");
    setScaleUnitsPerCell(String(sc?.mapScale?.unitsPerCell ?? 5));
    setCalibPixels(null);
    setCalibRealInput("");
    setCalibrating(false);
    setLiveMeasure(null);
  }, [activeScene.id]);

  // The ghost measurement survives leaving the canvas (see onMouseLeave) so it can be inspected
  // and edited, but it's still scratch data - clear it once the GM actually steps out of the
  // Measure tool, rather than leaving a stale line on the map indefinitely.
  useEffect(() => {
    if (activeTool !== "measure") setLiveMeasure(null);
  }, [activeTool]);

  const viewportRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const fogCanvasRef = useRef<HTMLCanvasElement>(null);
  const viewportSizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const imgSizeRef = useRef<{ w: number; h: number } | null>(null);
  const autoFitDoneRef = useRef(false);
  const fogStampedLenRef = useRef(0);
  const lastStampedBrushRef = useRef<BrushPoint | null>(null);
  const loadingForMapRef = useRef<string | null>(null);
  // True only after an image has finished loading for the current scene.
  // Set synchronously so fog effects can check it in the same effect cycle.
  const imageReadyRef = useRef(false);
  // Guard: only wipe imgSize when the map path actually changes, not on spurious re-runs.
  const prevMapParamsRef = useRef<{ folder: string | null; map: string | null }>({ folder: null, map: null });

  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const brushDragRef = useRef<{ lastNX: number; lastNY: number } | null>(null);
  const rectStartRef = useRef<{ nx: number; ny: number } | null>(null);
  const measureStartRef = useRef<{ x: number; y: number } | null>(null);
  // Which endpoint of a completed liveMeasure is being dragged to adjust it, if any.
  const measureHandleRef = useRef<"start" | "end" | null>(null);
  const tokenDragRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    startNX: number;
    startNY: number;
  } | null>(null);
  // Markup interaction refs (draw / move / resize / freehand-in-progress).
  const annDrawRef = useRef<{ type: Exclude<MarkupTool, "highlight">; start: { x: number; y: number } } | null>(null);
  const annMoveRef = useRef<{ id: string; startNX: number; startNY: number; orig: MapAnnotation } | null>(null);
  const annResizeRef = useRef<{ id: string; handle: HandleId; from: Rect; orig: MapAnnotation } | null>(null);
  const highlightPtsRef = useRef<{ x: number; y: number }[] | null>(null);

  // Patch top-level state fields (e.g. autoPushMap, activeSceneId)
  const patch = useCallback(
    (fields: Partial<MapDisplayState>) => {
      onChangeRef.current({ ...stateRef.current, ...fields });
    },
    [],
  );

  // Patch fields of the currently active scene
  const patchScene = useCallback(
    (fields: Partial<MapScene>) => {
      const s = stateRef.current;
      const scenes = s.scenes.map((sc) =>
        sc.id === s.activeSceneId ? { ...sc, ...fields } : sc,
      );
      onChangeRef.current({ ...s, scenes });
    },
    [],
  );

  // Replace the active scene's annotations via an updater.
  const setAnnotations = useCallback((updater: (anns: MapAnnotation[]) => MapAnnotation[]) => {
    const s = stateRef.current;
    const scenes = s.scenes.map((sc) =>
      sc.id === s.activeSceneId ? { ...sc, annotations: updater(sc.annotations ?? []) } : sc,
    );
    onChangeRef.current({ ...s, scenes });
  }, []);

  const replaceAnnotation = useCallback((id: string, next: MapAnnotation) => {
    setAnnotations((anns) => anns.map((a) => (a.id === id ? next : a)));
  }, [setAnnotations]);

  const deleteAnnotation = useCallback((id: string) => {
    setAnnotations((anns) => anns.filter((a) => a.id !== id));
    setSelectedAnnId((cur) => (cur === id ? null : cur));
  }, [setAnnotations]);

  const setTokens = useCallback((updater: (tokens: MapToken[]) => MapToken[]) => {
    const s = stateRef.current;
    const scenes = s.scenes.map((sc) =>
      sc.id === s.activeSceneId ? { ...sc, tokens: updater(sc.tokens) } : sc,
    );
    onChangeRef.current({ ...s, scenes });
  }, []);

  // Visibility toggles for a single item or a whole group (ids). value=true means
  // on-board / mirrored-to-players; we store the boolean explicitly.
  const setTokenVis = useCallback((ids: Set<string>, field: "onBoard" | "showPlayers", value: boolean) => {
    setTokens((ts) => ts.map((t) => (ids.has(t.id) ? { ...t, [field]: value } : t)));
  }, [setTokens]);
  // A token's kind is seeded from its drag source but isn't fixed - the Visibility panel lets a
  // hand-placed token be reclassified into a different group.
  const setTokenKind = useCallback((id: string, kind: MapTokenKind) => {
    setTokens((ts) => ts.map((t) => (t.id === id ? { ...t, kind } : t)));
  }, [setTokens]);
  // Drop a pin's link to its Gazetteer place, leaving the pin itself on the map. The map side had no
  // way to do this before - you had to go through Gazetteer. Matches NPC Library's unlink, which also
  // clears the ref without a confirm step (re-linking is one click from Gazetteer).
  const unlinkToken = useCallback((id: string) => {
    setTokens((ts) => ts.map((t) => (t.id === id ? { ...t, locationRef: undefined } : t)));
  }, [setTokens]);
  const setAnnVis = useCallback((ids: Set<string>, field: "onBoard" | "showPlayers", value: boolean) => {
    setAnnotations((anns) => anns.map((a) => (ids.has(a.id) ? ({ ...a, [field]: value } as MapAnnotation) : a)));
  }, [setAnnotations]);

  // Restyle the selected annotation (or the current tool default when nothing is selected).
  const restyle = useCallback((fields: { color?: AnnotationColor; stroke?: 1 | 2 | 3 }) => {
    if (fields.color !== undefined) setMarkupColor(fields.color);
    if (fields.stroke !== undefined) setMarkupStroke(fields.stroke);
    setSelectedAnnId((sel) => {
      if (sel) setAnnotations((anns) => anns.map((a) => (a.id === sel ? ({ ...a, ...fields } as MapAnnotation) : a)));
      return sel;
    });
  }, [setAnnotations]);

  // A short GM-only tag on the selected shape ("A", "trap") - shown in the Visibility list in
  // place of the generic type name, so a scene full of rings/boxes stays distinguishable at a glance.
  const setSelectedAnnLabel = useCallback((label: string) => {
    setSelectedAnnId((sel) => {
      if (sel) setAnnotations((anns) => anns.map((a) => (a.id === sel ? ({ ...a, label: label || undefined } as MapAnnotation) : a)));
      return sel;
    });
  }, [setAnnotations]);

  // Reload image when active scene's selectedMap changes
  useEffect(() => {
    const prev = prevMapParamsRef.current;
    const mapChanged = prev.folder !== state.mapsFolder || prev.map !== activeScene.selectedMap;
    prevMapParamsRef.current = { folder: state.mapsFolder, map: activeScene.selectedMap };
    imageReadyRef.current = false;
    loadingForMapRef.current = activeScene.selectedMap;
    // Only wipe imgSize when the map path actually changes. If this effect fires
    // spuriously with the same path (e.g. after token drops), we skip the clear so
    // the fog canvas and token pins stay mounted.
    if (mapChanged) setImgSize(null);
    if (!state.mapsFolder || !activeScene.selectedMap) {
      setImgSrc(null);
      return;
    }
    vault
      // readBinaryFile (not readFileBase64) - selectedMap can be a subfolder-relative path (e.g.
      // "dungeons/goblin-lair.png") from listFolderImages, and readFileBase64's file_name argument
      // rejects any "/" outright. readBinaryFile splits at the last "/" itself, so it always sends a
      // bare filename regardless of nesting depth (see bugs.md - the same fix as Handout Gallery).
      .readBinaryFile(`${state.mapsFolder}/${activeScene.selectedMap}`)
      .then((b64) => {
        setImgSrc(`data:${mimeForImageExt(activeScene.selectedMap!)};base64,${b64}`);
        // If this was a spurious re-run (same map), setImgSrc is a no-op and onLoad
        // won't re-fire. Restore imgSize directly from the already-decoded image element.
        if (!mapChanged && imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
          imageReadyRef.current = true;
          setLoadedMap(loadingForMapRef.current);
          setImgSize({ w: imgRef.current.naturalWidth, h: imgRef.current.naturalHeight });
        }
      })
      .catch(() => { setImgSrc(null); setLoadedMap(loadingForMapRef.current); });
    // vault's context value is a fresh object every render (tracked in
    // tracking/phase6-fixes.md) - depending on the whole object instead of
    // its stable fields would re-run this on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.mapsFolder, activeScene.selectedMap]);

  // Track viewport size for fit calculations. Depend on `expanded`: toggling full-screen swaps in a
  // new `.viewport` DOM node (MapDisplay itself never unmounts, so a `[]`-only effect would keep
  // observing the old, now-detached node) - reattaching here keeps Fit/min-zoom sized to whichever
  // viewport is actually on screen.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const e = entries[0];
      if (e) viewportSizeRef.current = { w: e.contentRect.width, h: e.contentRect.height };
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [expanded]);

  // Non-passive wheel for zoom - stopPropagation keeps canvas zoom isolated. Same reattach-on-
  // `expanded` reasoning as the ResizeObserver above.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const s = stateRef.current;
      const sc = s.scenes.find((sc) => sc.id === s.activeSceneId) ?? s.scenes[0];
      const delta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
      const factor = delta < 0 ? 1.1 : 1 / 1.1;
      const vp = viewportSizeRef.current;
      const sz = imgSizeRef.current;
      const minScale = vp.w && vp.h && sz
        ? Math.min(vp.w / sz.w, vp.h / sz.h)
        : 0.05;
      const newScale = clamp(sc.scale * factor, minScale, 20);
      const scenes = s.scenes.map((sc2) =>
        sc2.id === s.activeSceneId ? { ...sc2, scale: newScale } : sc2,
      );
      onChangeRef.current({ ...s, scenes });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [expanded]);

  useEffect(() => {
    if (!state.mapsFolder) { setFiles([]); return; }
    vault.listFolderImages(state.mapsFolder).then(setFiles).catch(() => setFiles([]));
    // vault's context value is a fresh object every render (tracked in
    // tracking/phase6-fixes.md) - depending on the whole object instead of
    // its stable fields would re-run this on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.mapsFolder]);

  const applyFit = useCallback(() => {
    const vp = viewportSizeRef.current;
    if (!vp.w || !vp.h || !imgSize) return;
    const { panX, panY, scale } = fitTransform(vp, imgSize);
    patchScene({ panX, panY, scale });
  }, [imgSize, patchScene]);

  const getMinScale = useCallback(() => {
    const vp = viewportSizeRef.current;
    if (!vp.w || !vp.h || !imgSize) return 0.05;
    return Math.min(vp.w / imgSize.w, vp.h / imgSize.h);
  }, [imgSize]);

  // Reset auto-fit flag whenever a new image starts loading
  useEffect(() => {
    autoFitDoneRef.current = false;
  }, [imgSrc]);

  // Fit to viewport the first time dimensions are known for a new image
  useEffect(() => {
    if (!imgSize || autoFitDoneRef.current) return;
    applyFit();
    autoFitDoneRef.current = true;
  }, [imgSize, applyFit]);

  // Fog canvas - full redraw on scene switch, fog toggle, or image resize
  useEffect(() => {
    const canvas = fogCanvasRef.current;
    const sz = imgSize;
    fogStampedLenRef.current = 0;
    lastStampedBrushRef.current = null;
    if (!canvas || !sz || !imageReadyRef.current) {
      // Clear fog while the new image is loading so the placeholder shows cleanly
      if (canvas && sz) {
        canvas.width = sz.w;
        canvas.height = sz.h;
        canvas.getContext("2d")!.clearRect(0, 0, sz.w, sz.h);
      }
      return;
    }
    if (!activeScene.fogEnabled) {
      canvas.width = sz.w;
      canvas.height = sz.h;
      canvas.getContext("2d")!.clearRect(0, 0, sz.w, sz.h);
      return;
    }
    drawFogCanvas(canvas, sz.w, sz.h, activeScene.fogReveals);
    fogStampedLenRef.current = activeScene.fogReveals.length;
    lastStampedBrushRef.current = lastBrushPoint(activeScene.fogReveals);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeScene.fogEnabled, activeScene.id, imgSize]);

  // Fog canvas - incremental stamp for each new brush dab (O(1) per stroke)
  useEffect(() => {
    const canvas = fogCanvasRef.current;
    const sz = imgSizeRef.current;
    if (!canvas || !sz || !activeScene.fogEnabled || !imageReadyRef.current) return;
    const reveals = activeScene.fogReveals;
    const stamped = fogStampedLenRef.current;
    if (reveals.length < stamped) {
      // Undo/clear - fall back to full redraw
      drawFogCanvas(canvas, sz.w, sz.h, reveals);
      fogStampedLenRef.current = reveals.length;
      lastStampedBrushRef.current = lastBrushPoint(reveals);
      return;
    }
    if (reveals.length === stamped) return;
    // Stamp only the new tail, connected to the last stamped brush point
    const newReveals = reveals.slice(stamped);
    const ctx = canvas.getContext("2d")!;
    renderFogReveals(ctx, newReveals, sz.w, sz.h, lastStampedBrushRef.current);
    fogStampedLenRef.current = reveals.length;
    // Only the tail's last element continues the chain - if it's a rect (or the tail is
    // somehow empty), continuity intentionally breaks rather than reaching back past it.
    const lastNew = newReveals[newReveals.length - 1];
    lastStampedBrushRef.current = lastNew && lastNew.shape === "brush"
      ? { cx: lastNew.cx, cy: lastNew.cy, r: lastNew.r, mode: fogModeOf(lastNew) }
      : null;
  }, [activeScene.fogReveals, activeScene.fogEnabled]);


  const toNorm = useCallback(
    (clientX: number, clientY: number): { nx: number; ny: number } | null => {
      const vp = viewportRef.current?.getBoundingClientRect();
      const sz = imgSize;
      if (!vp || !sz) return null;
      const s = stateRef.current;
      const sc = s.scenes.find((sc) => sc.id === s.activeSceneId) ?? s.scenes[0];
      const tlX = vp.left + vp.width / 2 + sc.panX - (sz.w * sc.scale) / 2;
      const tlY = vp.top + vp.height / 2 + sc.panY - (sz.h * sc.scale) / 2;
      return {
        nx: (clientX - tlX) / (sz.w * sc.scale),
        ny: (clientY - tlY) / (sz.h * sc.scale),
      };
    },
    [imgSize],
  );

  const BRUSH_RADIUS = 0.05;

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0 || browserOpen) return;
      e.preventDefault();
      const s = stateRef.current;
      const sc = s.scenes.find((sc) => sc.id === s.activeSceneId) ?? s.scenes[0];

      // Alt-click drops a transient "look here" pulse regardless of the active tool - a pointer,
      // not a mark, so it never touches scene state (see MapAnnotation for the persistent kind).
      if (e.altKey) {
        const norm = toNorm(e.clientX, e.clientY);
        if (!norm) return;
        void pushMapPing(norm.nx, norm.ny);
        const id = uid();
        setGmPings((pings) => [...pings, { id, x: norm.nx, y: norm.ny }]);
        setTimeout(() => setGmPings((pings) => pings.filter((p) => p.id !== id)), PING_LIFETIME_MS);
        return;
      }

      if (isMarkupTool(activeTool)) {
        const norm = toNorm(e.clientX, e.clientY);
        if (!norm) return;
        if (activeTool === "highlight") {
          highlightPtsRef.current = [{ x: norm.nx, y: norm.ny }];
          setLiveAnn({ id: "live", type: "highlight", color: markupColor, stroke: markupStroke, points: [{ x: norm.nx, y: norm.ny }] });
        } else {
          annDrawRef.current = { type: activeTool, start: { x: norm.nx, y: norm.ny } };
        }
        return;
      }

      if (activeTool === "pan") {
        const norm = toNorm(e.clientX, e.clientY);
        const anns = sc.annotations ?? [];
        // 1. Grab a resize handle of the already-selected annotation.
        if (norm && selectedAnnId) {
          const sel = anns.find((a) => a.id === selectedAnnId);
          if (sel) {
            const b = annotationBounds(sel);
            const hit = HANDLE_IDS.find((hid) => {
              const hp = handlePoint(b, hid);
              return Math.hypot(norm.nx - hp.x, norm.ny - hp.y) <= ANN_HIT_TOL * 1.5;
            });
            if (hit) {
              annResizeRef.current = { id: sel.id, handle: hit, from: b, orig: sel };
              return;
            }
          }
        }
        // 2. Click an annotation to select + start moving it.
        if (norm) {
          const hitId = pickAnnotation(anns, norm.nx, norm.ny, ANN_HIT_TOL);
          if (hitId) {
            const orig = anns.find((a) => a.id === hitId)!;
            setSelectedAnnId(hitId);
            annMoveRef.current = { id: hitId, startNX: norm.nx, startNY: norm.ny, orig };
            return;
          }
        }
        // 3. Empty space: deselect and pan the map.
        setSelectedAnnId(null);
        dragRef.current = { x: e.clientX, y: e.clientY, panX: sc.panX, panY: sc.panY };
        return;
      }

      if (activeTool === "brush") {
        const norm = toNorm(e.clientX, e.clientY);
        if (!norm) return;
        brushDragRef.current = { lastNX: norm.nx, lastNY: norm.ny };
        const newReveal: FogReveal = { shape: "brush", cx: norm.nx, cy: norm.ny, r: BRUSH_RADIUS, mode: fogMode };
        const scenes = s.scenes.map((sc2) =>
          sc2.id === s.activeSceneId
            ? { ...sc2, fogReveals: [...sc2.fogReveals, newReveal] }
            : sc2,
        );
        onChangeRef.current({ ...s, scenes });
        return;
      }

      if (activeTool === "rect") {
        const norm = toNorm(e.clientX, e.clientY);
        if (!norm) return;
        rectStartRef.current = norm;
        return;
      }

      if (activeTool === "token") {
        const norm = toNorm(e.clientX, e.clientY);
        if (!norm) return;
        const newToken: MapToken = {
          id: crypto.randomUUID(),
          label: `Token ${sc.tokens.length + 1}`,
          color: TOKEN_COLORS[sc.tokens.length % TOKEN_COLORS.length],
          x: norm.nx,
          y: norm.ny,
        };
        const scenes = s.scenes.map((sc2) =>
          sc2.id === s.activeSceneId
            ? { ...sc2, tokens: [...sc2.tokens, newToken] }
            : sc2,
        );
        onChangeRef.current({ ...s, scenes });
        setActiveTool("pan");
        return;
      }

      if (activeTool === "place-location" && pendingLocationPin) {
        const norm = toNorm(e.clientX, e.clientY);
        if (!norm) return;
        const newToken: MapToken = {
          id: crypto.randomUUID(),
          label: pendingLocationPin.label,
          color: TOKEN_COLORS[sc.tokens.length % TOKEN_COLORS.length],
          x: norm.nx,
          y: norm.ny,
          kind: "location",
          locationRef: pendingLocationPin.locationRef,
        };
        const scenes = s.scenes.map((sc2) =>
          sc2.id === s.activeSceneId
            ? { ...sc2, tokens: [...sc2.tokens, newToken] }
            : sc2,
        );
        onChangeRef.current({ ...s, scenes });
        setActiveTool("pan");
        setPendingLocationPin(null);
        return;
      }

      if (activeTool === "measure") {
        const norm = toNorm(e.clientX, e.clientY);
        if (!norm) return;
        measureStartRef.current = { x: norm.nx, y: norm.ny };
        setLiveMeasure(null);
        return;
      }
    },
    [browserOpen, activeTool, toNorm, fogMode, selectedAnnId, markupColor, markupStroke, pendingLocationPin],
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (measureHandleRef.current) {
        const norm = toNorm(e.clientX, e.clientY);
        if (!norm) return;
        const handle = measureHandleRef.current;
        setLiveMeasure((lm) => (lm ? { ...lm, [handle]: { x: norm.nx, y: norm.ny } } : lm));
        return;
      }

      if (annResizeRef.current) {
        const norm = toNorm(e.clientX, e.clientY);
        if (!norm) return;
        const { id, handle, from, orig } = annResizeRef.current;
        const to = boundsFromHandle(from, handle, norm.nx, norm.ny);
        replaceAnnotation(id, scaleAnnotationToBounds(orig, from, to));
        return;
      }

      if (annMoveRef.current) {
        const norm = toNorm(e.clientX, e.clientY);
        if (!norm) return;
        const { id, startNX, startNY, orig } = annMoveRef.current;
        replaceAnnotation(id, translateAnnotation(orig, norm.nx - startNX, norm.ny - startNY));
        return;
      }

      if (highlightPtsRef.current) {
        const norm = toNorm(e.clientX, e.clientY);
        if (!norm) return;
        const pts = highlightPtsRef.current;
        const last = pts[pts.length - 1];
        if (Math.hypot(norm.nx - last.x, norm.ny - last.y) < 0.004) return;
        pts.push({ x: norm.nx, y: norm.ny });
        setLiveAnn({ id: "live", type: "highlight", color: markupColor, stroke: markupStroke, points: [...pts] });
        return;
      }

      if (annDrawRef.current) {
        const norm = toNorm(e.clientX, e.clientY);
        if (!norm) return;
        const { type, start } = annDrawRef.current;
        const end = { x: norm.nx, y: norm.ny };
        setLiveAnn(type === "arrow"
          ? arrowAnnotationFromDrag("live", start, end, markupColor, markupStroke)
          : bboxAnnotationFromDrag("live", type, start, end, markupColor, markupStroke));
        return;
      }

      if (activeTool === "pan" && dragRef.current) {
        const dx = e.clientX - dragRef.current.x;
        const dy = e.clientY - dragRef.current.y;
        const s = stateRef.current;
        const scenes = s.scenes.map((sc) =>
          sc.id === s.activeSceneId
            ? { ...sc, panX: dragRef.current!.panX + dx, panY: dragRef.current!.panY + dy }
            : sc,
        );
        onChangeRef.current({ ...s, scenes });
        return;
      }

      if (activeTool === "brush" && brushDragRef.current) {
        const norm = toNorm(e.clientX, e.clientY);
        if (!norm) return;
        const { lastNX, lastNY } = brushDragRef.current;
        const dist = Math.hypot(norm.nx - lastNX, norm.ny - lastNY);
        if (dist < BRUSH_RADIUS * 0.25) return;
        brushDragRef.current = { lastNX: norm.nx, lastNY: norm.ny };
        const s = stateRef.current;
        const newReveal: FogReveal = { shape: "brush", cx: norm.nx, cy: norm.ny, r: BRUSH_RADIUS, mode: fogMode };
        const scenes = s.scenes.map((sc) =>
          sc.id === s.activeSceneId
            ? { ...sc, fogReveals: [...sc.fogReveals, newReveal] }
            : sc,
        );
        onChangeRef.current({ ...s, scenes });
        return;
      }

      if (activeTool === "rect" && rectStartRef.current) {
        const norm = toNorm(e.clientX, e.clientY);
        if (!norm) return;
        const { nx: sx, ny: sy } = rectStartRef.current;
        setLiveRect({
          x: Math.min(sx, norm.nx),
          y: Math.min(sy, norm.ny),
          w: Math.abs(norm.nx - sx),
          h: Math.abs(norm.ny - sy),
        });
        return;
      }

      if (tokenDragRef.current) {
        const norm = toNorm(e.clientX, e.clientY);
        if (!norm) return;
        const { id, startX, startY, startNX, startNY } = tokenDragRef.current;
        const sz = imgSize;
        if (!sz) return;
        const s = stateRef.current;
        const sc = s.scenes.find((sc) => sc.id === s.activeSceneId) ?? s.scenes[0];
        const dnx = (e.clientX - startX) / (sz.w * sc.scale);
        const dny = (e.clientY - startY) / (sz.h * sc.scale);
        const scenes = s.scenes.map((sc2) =>
          sc2.id === s.activeSceneId
            ? { ...sc2, tokens: sc2.tokens.map((t) => t.id === id ? { ...t, x: startNX + dnx, y: startNY + dny } : t) }
            : sc2,
        );
        onChangeRef.current({ ...s, scenes });
      }

      if (activeTool === "measure" && measureStartRef.current) {
        const norm = toNorm(e.clientX, e.clientY);
        if (!norm) return;
        setLiveMeasure({ start: measureStartRef.current, end: { x: norm.nx, y: norm.ny } });
      }
    },
    [activeTool, toNorm, imgSize, fogMode, markupColor, markupStroke, replaceAnnotation],
  );

  const onMouseUp = useCallback(
    (e: React.MouseEvent) => {
      dragRef.current = null;
      brushDragRef.current = null;
      const tokenDrag = tokenDragRef.current;
      tokenDragRef.current = null;

      // A token mousedown+mouseup with negligible movement is a click, not a drag: if it landed on
      // a Gazetteer-linked pin, jump back to that place. Gated to the pan tool so a GM mid fog-brush
      // /measure/markup who happens to click a pin isn't yanked into another widget unexpectedly.
      if (tokenDrag) {
        if (activeTool === "pan" && Math.hypot(e.clientX - tokenDrag.startX, e.clientY - tokenDrag.startY) < TOKEN_CLICK_TOL_PX) {
          const s = stateRef.current;
          const sc = s.scenes.find((sc2) => sc2.id === s.activeSceneId) ?? s.scenes[0];
          const token = sc.tokens.find((t) => t.id === tokenDrag.id);
          if (token?.locationRef) {
            window.dispatchEvent(new CustomEvent("ttcanvas:open-location", { detail: { filename: token.locationRef } }));
          }
        }
        return;
      }

      if (measureHandleRef.current) { measureHandleRef.current = null; return; }
      if (annResizeRef.current) { annResizeRef.current = null; return; }
      if (annMoveRef.current) { annMoveRef.current = null; return; }

      if (highlightPtsRef.current) {
        const pts = highlightPtsRef.current;
        highlightPtsRef.current = null;
        setLiveAnn(null);
        if (pts.length >= 2) {
          const a: MapAnnotation = { id: uid(), type: "highlight", color: markupColor, stroke: markupStroke, points: pts };
          setAnnotations((anns) => [...anns, a]);
          setSelectedAnnId(a.id);
        }
        return;
      }

      if (annDrawRef.current) {
        const { type, start } = annDrawRef.current;
        annDrawRef.current = null;
        setLiveAnn(null);
        const norm = toNorm(e.clientX, e.clientY);
        if (!norm) return;
        const end = { x: norm.nx, y: norm.ny };
        if (!isDragMeaningful(start, end)) return;
        const id = uid();
        const a = type === "arrow"
          ? arrowAnnotationFromDrag(id, start, end, markupColor, markupStroke)
          : bboxAnnotationFromDrag(id, type, start, end, markupColor, markupStroke);
        // Auto-tag a fresh ring/box with the next unused letter, computed against the live
        // annotation list inside the updater (not the render-time activeScene) so two draws in
        // quick succession never race for the same label.
        setAnnotations((anns) => [...anns, type === "arrow" ? a : { ...a, label: nextAutoLabel(anns) }]);
        setSelectedAnnId(id);
        return;
      }

      if (activeTool === "rect" && rectStartRef.current) {
        const norm = toNorm(e.clientX, e.clientY);
        const start = rectStartRef.current;
        rectStartRef.current = null;
        setLiveRect(null);
        if (!norm) return;
        const rx = Math.min(start.nx, norm.nx);
        const ry = Math.min(start.ny, norm.ny);
        const rw = Math.abs(norm.nx - start.nx);
        const rh = Math.abs(norm.ny - start.ny);
        if (rw < 0.005 || rh < 0.005) return;
        const s = stateRef.current;
        const newReveal: FogReveal = { shape: "rect", x: rx, y: ry, w: rw, h: rh, mode: fogMode };
        const scenes = s.scenes.map((sc) =>
          sc.id === s.activeSceneId
            ? { ...sc, fogReveals: [...sc.fogReveals, newReveal] }
            : sc,
        );
        onChangeRef.current({ ...s, scenes });
      }

      if (activeTool === "measure" && measureStartRef.current) {
        const norm = toNorm(e.clientX, e.clientY);
        const start = measureStartRef.current;
        measureStartRef.current = null;
        if (norm) {
          const end = { x: norm.nx, y: norm.ny };
          setLiveMeasure({ start, end });
          if (calibrating) {
            const sz = imgSizeRef.current;
            if (sz) {
              const dx = (end.x - start.x) * sz.w;
              const dy = (end.y - start.y) * sz.h;
              setCalibPixels(Math.hypot(dx, dy));
            }
            setCalibrating(false);
          }
        } else {
          setLiveMeasure(null);
        }
      }
    },
    [activeTool, toNorm, calibrating, fogMode, markupColor, markupStroke, setAnnotations],
  );

  const onMouseLeave = useCallback(() => {
    dragRef.current = null;
    brushDragRef.current = null;
    rectStartRef.current = null;
    tokenDragRef.current = null;
    // Only wipe the measurement if a fresh drag was actually in progress - moving the mouse off
    // the map to reach the "Save as arrow" button (or any other drawer control) shouldn't discard
    // an already-completed measurement, only cancel an incomplete one.
    const wasMeasuring = measureStartRef.current !== null;
    measureStartRef.current = null;
    measureHandleRef.current = null;
    annDrawRef.current = null;
    annMoveRef.current = null;
    annResizeRef.current = null;
    highlightPtsRef.current = null;
    setLiveRect(null);
    if (wasMeasuring) setLiveMeasure(null);
    setLiveAnn(null);
  }, []);

  // Delete / Escape act on the selected annotation (ignored while typing in a field).
  useEffect(() => {
    if (!selectedAnnId) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); deleteAnnotation(selectedAnnId); }
      else if (e.key === "Escape") setSelectedAnnId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedAnnId, deleteAnnotation]);

  const startTokenDrag = useCallback((e: React.MouseEvent, id: string) => {
    const s = stateRef.current;
    const sc = s.scenes.find((sc) => sc.id === s.activeSceneId) ?? s.scenes[0];
    const token = sc.tokens.find((t) => t.id === id);
    if (!token) return;
    tokenDragRef.current = { id, startX: e.clientX, startY: e.clientY, startNX: token.x, startNY: token.y };
  }, []);

  const removeToken = useCallback((id: string) => {
    const s = stateRef.current;
    const scenes = s.scenes.map((sc) =>
      sc.id === s.activeSceneId ? { ...sc, tokens: sc.tokens.filter((t) => t.id !== id) } : sc,
    );
    onChangeRef.current({ ...s, scenes });
  }, []);

  const resizeToken = useCallback((id: string, size: number) => {
    const s = stateRef.current;
    const scenes = s.scenes.map((sc) =>
      sc.id === s.activeSceneId
        ? { ...sc, tokens: sc.tokens.map((t) => t.id === id ? { ...t, size } : t) }
        : sc,
    );
    onChangeRef.current({ ...s, scenes });
  }, []);

  const addOrMoveToken = useCallback(
    (draft: { sourceId?: string; label: string; color: string; portraitPath?: string; kind?: MapTokenKind }, x: number, y: number) => {
      const s = stateRef.current;
      const sc = s.scenes.find((sc) => sc.id === s.activeSceneId) ?? s.scenes[0];
      const existing = draft.sourceId ? sc.tokens.find((t) => t.sourceId === draft.sourceId) : null;
      if (existing) {
        setPendingDrop({ draft, x, y, existingId: existing.id });
        return;
      }
      const newTokens = [...sc.tokens, { id: crypto.randomUUID(), ...draft, x, y }];
      const scenes = s.scenes.map((sc2) =>
        sc2.id === s.activeSceneId ? { ...sc2, tokens: newTokens } : sc2,
      );
      onChangeRef.current({ ...s, scenes });
    },
    [],
  );

  function resolveDrop(move: boolean) {
    if (!pendingDrop) return;
    const { draft, x, y, existingId } = pendingDrop;
    const s = stateRef.current;
    const sc = s.scenes.find((sc2) => sc2.id === s.activeSceneId) ?? s.scenes[0];
    const newTokens = move
      ? sc.tokens.map((t) => t.id === existingId ? { ...t, x, y } : t)
      : [...sc.tokens, { id: crypto.randomUUID(), ...draft, x, y }];
    const scenes = s.scenes.map((sc2) =>
      sc2.id === s.activeSceneId ? { ...sc2, tokens: newTokens } : sc2,
    );
    onChangeRef.current({ ...s, scenes });
    setPendingDrop(null);
  }

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (getActiveTokenDrag() === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const data = getActiveTokenDrag();
      clearActiveTokenDrag();
      if (!data) return;
      const norm = toNorm(e.clientX, e.clientY);
      if (!norm) return;
      addOrMoveToken(data, norm.nx, norm.ny);
    },
    [toNorm, addOrMoveToken],
  );

  useEffect(() => {
    function handler(e: Event) {
      const { sourceId, label, color, portraitPath, kind } = (
        e as CustomEvent<{ sourceId: string; label: string; color: string; portraitPath?: string; kind?: MapTokenKind }>
      ).detail;
      addOrMoveToken({ sourceId, label, color, portraitPath, kind }, 0.5, 0.5);
    }
    window.addEventListener("ttcanvas:place-token", handler);
    return () => window.removeEventListener("ttcanvas:place-token", handler);
  }, [addOrMoveToken]);

  // Consume a "pin this place" request from the Gazetteer (App.tsx sets state.locateRequest). If a
  // pin already exists for this location, bring it onto the board, switch to its scene and queue a
  // pan/ping; otherwise arm the place-location tool so the next map click drops it. Fires once per
  // request id - not a state.locateRequest dependency edge case, the effect itself clears it.
  useEffect(() => {
    const req = state.locateRequest;
    if (!req) return;

    let foundSceneId: string | null = null;
    let foundTokenId: string | null = null;
    for (const sc of state.scenes) {
      const token = sc.tokens.find((t) => t.locationRef === req.locationRef);
      if (token) { foundSceneId = sc.id; foundTokenId = token.id; break; }
    }

    if (foundSceneId && foundTokenId) {
      const scenes = state.scenes.map((sc) =>
        sc.id === foundSceneId
          ? { ...sc, tokens: sc.tokens.map((t) => (t.id === foundTokenId ? { ...t, onBoard: true } : t)) }
          : sc,
      );
      onChange({ ...state, scenes, activeSceneId: foundSceneId, locateRequest: undefined });
      setPendingJump({ sceneId: foundSceneId, tokenId: foundTokenId });
    } else {
      onChange({ ...state, locateRequest: undefined });
      setPendingLocationPin({ locationRef: req.locationRef, label: req.label });
      setActiveTool("place-location");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire on the request id alone, like Bestiary's openRequestId
  }, [state.locateRequest?.id]);

  // Cancel place-location placement with Escape, mirroring the annotation-delete Escape handler below.
  useEffect(() => {
    if (activeTool !== "place-location") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setActiveTool("pan"); setPendingLocationPin(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeTool]);

  // Drive the native <dialog> from `expanded`. showModal() (rather than just toggling the `open`
  // attribute) gives a native focus trap, initial focus, focus restoration on close, and Escape-to-
  // close for free - see the `lean` skill's web reference for why <dialog> beats a hand-rolled modal.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!expanded || !dialog) return;
    dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, [expanded]);

  // Once the jump target's scene has actually finished loading its map image, pan to the pin and
  // flash the existing GM-only ping (not pushMapPing, which would broadcast to the player window).
  // Checking `loadedMap === activeScene.selectedMap` (not just `imgSize` truthy) matters: on a scene
  // switch, the "reload image" effect above clears imgSize only via setState, which this effect's
  // stale closure won't see until the next render - so right after switching scenes, this effect can
  // otherwise still see the *previous* scene's imgSize and pan using the wrong image's dimensions.
  // loadedMap and imgSize are always set together (handleImgLoad), so this stays in sync with imgSize.
  useEffect(() => {
    if (!pendingJump || pendingJump.sceneId !== state.activeSceneId || !imgSize || loadedMap !== activeScene.selectedMap) return;
    const token = activeScene.tokens.find((t) => t.id === pendingJump.tokenId);
    setPendingJump(null);
    if (!token) return;
    const { panX, panY } = panToPoint(imgSize, { nx: token.x, ny: token.y }, activeScene.scale);
    patchScene({ panX, panY });
    const id = uid();
    setGmPings((pings) => [...pings, { id, x: token.x, y: token.y }]);
    setTimeout(() => setGmPings((pings) => pings.filter((p) => p.id !== id)), PING_LIFETIME_MS);
  }, [pendingJump, imgSize, loadedMap, state.activeSceneId, activeScene, patchScene]);

  const onDoubleClick = useCallback(() => {
    applyFit();
  }, [applyFit]);

  const handleImgLoad = useCallback(() => {
    if (imgRef.current) {
      imageReadyRef.current = true;
      setLoadedMap(loadingForMapRef.current);
      setImgSize({ w: imgRef.current.naturalWidth, h: imgRef.current.naturalHeight });
    }
  }, []);

  async function handlePushToPlayer() {
    if (!state.mapsFolder || !activeScene.selectedMap || !imgSize) return;
    const { w: gmViewW, h: gmViewH } = viewportSizeRef.current;
    await pushPlayerScene({
      type: "map",
      map: {
        mapFolder: state.mapsFolder,
        mapFile: activeScene.selectedMap,
        portraitsFolder: vault.vaultPath ? `${vault.vaultPath}/portraits` : undefined,
        imgW: imgSize.w,
        imgH: imgSize.h,
        fogEnabled: activeScene.fogEnabled,
        fogReveals: activeScene.fogReveals,
        tokens: activeScene.tokens.filter((t) => isOnBoard(t) && isPlayerVisible(t)),
        annotations: (activeScene.annotations ?? []).filter((a) => isOnBoard(a) && isPlayerVisible(a)),
        markupPreset: activeScene.markupPreset ?? "cartographer",
        panX: activeScene.panX,
        panY: activeScene.panY,
        scale: activeScene.scale,
        gmViewW,
        gmViewH,
      },
    });
  }

  useEffect(() => {
    if (!autoPushMap || !state.mapsFolder || !activeScene.selectedMap || !imgSize) return;
    const { w, h } = imgSize;
    const folder = state.mapsFolder;
    const file = activeScene.selectedMap;
    const timer = setTimeout(() => {
      const { w: gmViewW, h: gmViewH } = viewportSizeRef.current;
      pushPlayerScene({
        type: "map",
        map: {
          mapFolder: folder,
          mapFile: file,
          portraitsFolder: vault.vaultPath ? `${vault.vaultPath}/portraits` : undefined,
          imgW: w,
          imgH: h,
          fogEnabled: activeScene.fogEnabled,
          fogReveals: activeScene.fogReveals,
          tokens: activeScene.tokens.filter((t) => isOnBoard(t) && isPlayerVisible(t)),
          annotations: (activeScene.annotations ?? []).filter((a) => isOnBoard(a) && isPlayerVisible(a)),
          markupPreset: activeScene.markupPreset ?? "cartographer",
          panX: activeScene.panX,
          panY: activeScene.panY,
          scale: activeScene.scale,
          gmViewW,
          gmViewH,
        },
      });
    }, 600);
    return () => clearTimeout(timer);
    // state.mapsFolder and vault.vaultPath are read as their current value at push
    // time, not triggers for this debounced push - and vault's context value is a
    // fresh object every render (tracked in tracking/phase6-fixes.md), so including
    // the whole object would defeat the debounce by re-running on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPushMap, imgSize, activeScene]);

  // Re-open the overlay drawer whenever the active tool or selection changes, so
  // a manual collapse only lasts for the current context. Switching tool / selecting
  // also closes the visibility panel so the tool's own settings show.
  useEffect(() => { setDrawerCollapsed(false); setVisibilityOpen(false); }, [activeTool, selectedAnnId]);

  // ── Scene management ─────────────────────────────────────────────────────

  function addScene() {
    const scene = defaultScene(`Scene ${state.scenes.length + 1}`);
    onChange({ ...state, scenes: [...state.scenes, scene], activeSceneId: scene.id });
  }

  function switchScene(id: string) {
    if (id === state.activeSceneId) return;
    onChange({ ...state, activeSceneId: id });
  }

  function startRename(id: string, name: string) {
    setRenamingId(id);
    setRenameVal(name);
    setTimeout(() => renameInputRef.current?.select(), 0);
  }

  function commitRename() {
    if (!renamingId) return;
    const name = renameVal.trim() || "Untitled";
    onChange({ ...state, scenes: state.scenes.map((sc) => sc.id === renamingId ? { ...sc, name } : sc) });
    setRenamingId(null);
  }

  function deleteScene(id: string) {
    if (state.scenes.length <= 1) return;
    const sc = state.scenes.find((s) => s.id === id);
    if (!confirm(`Delete scene "${sc?.name ?? "this scene"}"?`)) return;
    const remaining = state.scenes.filter((s) => s.id !== id);
    const newActiveId = state.activeSceneId === id ? remaining[0].id : state.activeSceneId;
    onChange({ ...state, scenes: remaining, activeSceneId: newActiveId });
  }

  // ── Derived display values ────────────────────────────────────────────────

  const folderName = state.mapsFolder
    ? state.mapsFolder.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? state.mapsFolder
    : null;
  const mapName = activeScene.selectedMap
    ? activeScene.selectedMap.replace(/\\/g, "/").replace(/\.[^.]+$/, "").split("/").pop() ?? activeScene.selectedMap
    : null;
  const crumbText = folderName
    ? mapName ? `${folderName} / ${mapName}` : folderName
    : "Choose map…";

  async function pickFolder() {
    const picked = await vault.pickFolder(state.mapsFolder);
    if (!picked) return;
    const scenes = state.scenes.map((sc) =>
      sc.id === state.activeSceneId ? { ...sc, selectedMap: null, panX: 0, panY: 0, scale: 1 } : sc,
    );
    onChange({ ...state, mapsFolder: picked, scenes });
    vault.listFolderImages(picked).then(setFiles).catch(() => setFiles([]));
    setBrowserOpen(true);
  }

  async function pickSingleImage() {
    const sourcePath = await vault.pickImageFile();
    if (!sourcePath) return;
    const result = await vault.saveImageToVaultMaps(sourcePath);
    if (!result) return;
    const scenes = state.scenes.map((sc) =>
      sc.id === state.activeSceneId ? { ...sc, selectedMap: result.fileName, panX: 0, panY: 0, scale: 1 } : sc,
    );
    onChange({ ...state, mapsFolder: result.mapsFolder, scenes });
    vault.listFolderImages(result.mapsFolder).then(setFiles).catch(() => setFiles([]));
    setBrowserOpen(false);
  }

  function selectMap(file: string) {
    patchScene({ selectedMap: file, panX: 0, panY: 0, scale: 1 });
    setBrowserOpen(false);
  }

  const hasVault = Boolean(vault.vaultPath);
  const pickImageTitle = hasVault
    ? "Pick a single image - copies it to your vault's maps/ folder"
    : "Open a vault first to use this feature";

  const cursorClass =
    activeTool === "brush" ? styles.cursorBrush
    : activeTool === "rect" ? styles.cursorRect
    : activeTool === "token" || activeTool === "place-location" ? styles.cursorToken
    : activeTool === "measure" || calibrating || isMarkupTool(activeTool) ? styles.cursorMeasure
    : "";

  // Markup inspector: preset + colour/stroke of the selection (or the new-shape default).
  const markupPreset: MarkupPreset = activeScene.markupPreset ?? "cartographer";
  const selectedAnn = selectedAnnId ? (activeScene.annotations ?? []).find((a) => a.id === selectedAnnId) ?? null : null;
  const curColor = selectedAnn?.color ?? markupColor;
  const curStroke = selectedAnn?.stroke ?? markupStroke;
  // Which contextual panel the overlay drawer shows, if any.
  const drawerContent: "measure" | "markup" | "visibility" | null =
    !imgSrc ? null
    : visibilityOpen ? "visibility"
    : activeTool === "measure" ? "measure"
    : isMarkupTool(activeTool) || (activeTool === "pan" && selectedAnnId) ? "markup"
    : null;
  const drawerOpen = drawerContent !== null && !drawerCollapsed;

  // Measure scale strip state (plain-language summary + editor visibility)
  const ms = activeScene.mapScale;
  const hasScale = !!ms && (
    (ms.mode === "grid" && (ms.unitsPerCell ?? 0) > 0) ||
    (ms.mode === "calibrate" && (ms.pixelsPerUnit ?? 0) > 0)
  );
  const measureEditorVisible = scaleEditorOpen || calibrating || calibPixels !== null;
  const measureSummary =
    calibrating && calibPixels === null ? "Drag across something of known length…"
    : calibPixels !== null ? "Now enter its real length below"
    : hasScale && ms!.mode === "grid" ? `1 square = ${ms!.unitsPerCell} ${ms!.unitLabel}`
    : hasScale ? `Measuring in ${ms!.unitLabel}`
    : activeScene.gridEnabled ? "No scale set - counting grid squares"
    : "No scale set - drag to measure";

  const body = (
    <>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <button
          className={styles.crumb}
          onClick={() => (state.mapsFolder ? setBrowserOpen((v) => !v) : pickFolder())}
          title={state.mapsFolder ? "Open map browser" : "Choose a folder of map images"}
        >
          {crumbText}
        </button>

        <div className={styles.toolGroup}>
          <button
            className={`${styles.iconBtn} ${activeScene.gridEnabled ? styles.iconBtnActive : ""}`}
            onClick={() => patchScene({ gridEnabled: !activeScene.gridEnabled })}
            title={activeScene.gridEnabled ? "Hide grid overlay" : "Show grid overlay"}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z" />
            </svg>
          </button>

          {activeScene.gridEnabled && (
            <input
              type="number"
              className={styles.gridSizeInput}
              value={activeScene.gridSize}
              min={8}
              max={200}
              title="Grid cell size in pixels"
              onChange={(e) => {
                const v = Number(e.target.value);
                if (v >= 8 && v <= 200) patchScene({ gridSize: v });
              }}
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
          )}
        </div>


        {imgSrc && (
          <div className={styles.toolGroup}>
            <button
              className={styles.zoomTextBtn}
              onClick={applyFit}
              title="Fit map to viewport (double-click viewport)"
            >Fit</button>
            <button
              className={styles.zoomTextBtn}
              onClick={() => patchScene({ panX: 0, panY: 0, scale: 1 })}
              title="Zoom to 100%"
            >1:1</button>
            <button
              className={styles.iconBtn}
              onClick={() => patchScene({ scale: clamp(activeScene.scale / 1.25, getMinScale(), 20) })}
              title="Zoom out"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
            <button
              className={styles.iconBtn}
              onClick={() => patchScene({ scale: clamp(activeScene.scale * 1.25, getMinScale(), 20) })}
              title="Zoom in"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>
        )}

        <div className={styles.spacer} />

        <div className={styles.toolGroup}>
          <button
            className={`${styles.iconBtn} ${autoPushMap ? styles.iconBtnActive : ""}`}
            onClick={() => patch({ autoPushMap: !autoPushMap })}
            title={autoPushMap ? "Live sync ON - click to turn off" : "Live sync OFF - click to turn on"}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>

          <button
            className={styles.iconBtn}
            disabled={!imgSrc}
            onClick={handlePushToPlayer}
            title={imgSrc
              ? autoPushMap ? "Push current view to player screen" : "Cast current view to player screen"
              : "Load a map first"}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 16.1A5 5 0 0 1 5.9 20M2 12.05A9 9 0 0 1 9.95 20M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6" />
              <line x1="2" y1="20" x2="2.01" y2="20" />
            </svg>
          </button>
        </div>

        <button
          className={styles.zoomTextBtn}
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? "Exit full screen" : "Open full screen"}
          aria-label={expanded ? "Exit full screen" : "Open full screen"}
        >
          {expanded ? "Exit" : "Expand"}
        </button>
      </div>

      {/* Scene tab strip */}
      <div className={styles.sceneTabs}>
        <div className={styles.sceneTabList}>
          {state.scenes.map((sc) => (
            <div
              key={sc.id}
              className={`${styles.sceneTab} ${sc.id === state.activeSceneId ? styles.sceneTabActive : ""}`}
            >
              {renamingId === sc.id ? (
                <input
                  ref={renameInputRef}
                  className={styles.sceneRenameInput}
                  value={renameVal}
                  onChange={(e) => setRenameVal(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <button
                  className={styles.sceneTabBtn}
                  onClick={() => switchScene(sc.id)}
                  onDoubleClick={(e) => { e.stopPropagation(); startRename(sc.id, sc.name); }}
                  title={`${sc.name}  · Double-click to rename`}
                >
                  {sc.name}
                </button>
              )}
              {state.scenes.length > 1 && (
                <button
                  className={styles.sceneDeleteBtn}
                  onClick={(e) => { e.stopPropagation(); deleteScene(sc.id); }}
                  title="Delete scene"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        <button className={styles.sceneAddBtn} onClick={addScene} title="New scene">+</button>
      </div>

      {/* Map area: tool rail + viewport + overlay inspector drawer */}
      <div className={styles.mapArea}>
        {/* Tool rail (left edge) */}
        <div className={styles.rail}>
          <button
            className={`${styles.iconBtn} ${activeTool === "pan" ? styles.iconBtnActive : ""}`}
            onClick={() => setActiveTool("pan")}
            title="Select / pan - drag the map to move it"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 3l6.5 16 2.2-6.8L19.5 10 4 3z" />
            </svg>
          </button>

          <div className={styles.railDivider} />

          <button
            className={`${styles.iconBtn} ${activeTool === "ring" ? styles.iconBtnActive : ""}`}
            disabled={!imgSrc}
            onClick={() => setActiveTool((t) => (t === "ring" ? "pan" : "ring"))}
            title="Ring - drag to draw a ring around something"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="8" />
            </svg>
          </button>
          <button
            className={`${styles.iconBtn} ${activeTool === "arrow" ? styles.iconBtnActive : ""}`}
            disabled={!imgSrc}
            onClick={() => setActiveTool((t) => (t === "arrow" ? "pan" : "arrow"))}
            title="Arrow - drag to point at something"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 19L19 5M11 5h8v8" />
            </svg>
          </button>
          <button
            className={`${styles.iconBtn} ${activeTool === "box" ? styles.iconBtnActive : ""}`}
            disabled={!imgSrc}
            onClick={() => setActiveTool((t) => (t === "box" ? "pan" : "box"))}
            title="Box - drag to draw a rectangle"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="5" width="16" height="14" rx="1" />
            </svg>
          </button>
          <button
            className={`${styles.iconBtn} ${activeTool === "highlight" ? styles.iconBtnActive : ""}`}
            disabled={!imgSrc}
            onClick={() => setActiveTool((t) => (t === "highlight" ? "pan" : "highlight"))}
            title="Highlight - draw a freehand line"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 16c3 0 3-5 6-5s3 5 6 5 3-5 6-5" />
            </svg>
          </button>

          <div className={styles.railDivider} />

          <button
            className={`${styles.iconBtn} ${activeScene.fogEnabled ? styles.iconBtnActive : ""}`}
            onClick={() => {
              patchScene({ fogEnabled: !activeScene.fogEnabled });
              if (activeScene.fogEnabled) { setActiveTool("pan"); setFogMode("reveal"); }
            }}
            title={activeScene.fogEnabled ? "Disable fog of war" : "Enable fog of war"}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 10h18M3 14h18M3 18h18M5 6h14" />
            </svg>
          </button>
          <button
            className={`${styles.iconBtn} ${activeTool === "brush" ? styles.iconBtnActive : ""}`}
            disabled={!activeScene.fogEnabled}
            onClick={() => setActiveTool((t) => (t === "brush" ? "pan" : "brush"))}
            title={`Brush - drag to ${fogMode === "hide" ? "hide" : "reveal"} fog`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19c-1 1-3 1-4 0s-1-3 0-4l7-7 4 4-7 7z" />
              <path d="M18 13l3-3a2.83 2.83 0 0 0-4-4l-3 3" />
            </svg>
          </button>
          <button
            className={`${styles.iconBtn} ${activeTool === "rect" ? styles.iconBtnActive : ""}`}
            disabled={!activeScene.fogEnabled}
            onClick={() => setActiveTool((t) => (t === "rect" ? "pan" : "rect"))}
            title={`Rectangle - drag to ${fogMode === "hide" ? "hide" : "reveal"} a rectangular area`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
            </svg>
          </button>
          <button
            className={`${styles.iconBtn} ${fogMode === "hide" ? styles.iconBtnActive : ""}`}
            disabled={!activeScene.fogEnabled}
            onClick={() => setFogMode((m) => (m === "hide" ? "reveal" : "hide"))}
            title="Censor - paint fog back on (hide mode)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12s3.5-7 10-7c1.5 0 2.8.3 4 .8M22 12s-1 2.1-3 4M9.5 9.5a3 3 0 0 0 4.2 4.2" />
              <path d="M2 2l20 20" />
            </svg>
          </button>

          <div className={styles.railDivider} />

          <button
            className={`${styles.iconBtn} ${activeTool === "token" ? styles.iconBtnActive : ""}`}
            disabled={!imgSrc}
            onClick={() => setActiveTool((t) => (t === "token" ? "pan" : "token"))}
            title="Place token - click on the map to drop a named marker"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="10" r="4" />
              <path d="M12 14v6M9 20h6" />
            </svg>
          </button>
          <button
            className={`${styles.iconBtn} ${activeTool === "measure" ? styles.iconBtnActive : ""}`}
            disabled={!imgSrc}
            onClick={() => {
              const next = activeTool === "measure" ? "pan" : "measure";
              setActiveTool(next);
              if (next === "measure") setDrawerCollapsed(false);
              else { setScaleEditorOpen(false); setCalibrating(false); }
            }}
            title="Measure - drag to measure distances"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 16L16 2l6 6L8 22 2 16z" />
              <path d="M9 9l2 2M12 12l2 2" />
            </svg>
          </button>

          <div className={styles.railSpacer} />

          <button
            className={`${styles.iconBtn} ${visibilityOpen ? styles.iconBtnActive : ""}`}
            disabled={!imgSrc}
            onClick={() => setVisibilityOpen((v) => !v)}
            title="Visibility - show / hide tokens and markup from players"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>

          <button
            className={styles.iconBtn}
            disabled={!activeScene.fogEnabled}
            onClick={() => patchScene({ fogReveals: [] })}
            title="Clear fog - restore full fog (keeps tokens)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
            </svg>
          </button>
        </div>

      {/* Main viewport */}
      <div
        ref={viewportRef}
        className={`${styles.viewportWrap} ${cursorClass}`}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
        onDoubleClick={onDoubleClick}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        {activeTool === "place-location" && pendingLocationPin && (
          <div className={styles.placeLocationBanner}>
            Drop a pin for &quot;{pendingLocationPin.label}&quot; - click the map (Esc to cancel)
          </div>
        )}
        <div
          data-testid="map-wrapper"
          className={styles.mapWrapper}
          style={{
            transform: `translate(${activeScene.panX}px, ${activeScene.panY}px) scale(${activeScene.scale})`,
          }}
        >
          {imgSrc && (
            <img
              ref={imgRef}
              src={imgSrc}
              className={styles.mapImg}
              draggable={false}
              alt={mapName ?? "Map"}
              onLoad={handleImgLoad}
            />
          )}
          {activeScene.gridEnabled && imgSrc && (
            <div
              className={styles.gridOverlay}
              style={{
                backgroundSize: `${activeScene.gridSize}px ${activeScene.gridSize}px`,
                backgroundPosition: `${activeScene.gridOffsetX ?? 0}px ${activeScene.gridOffsetY ?? 0}px`,
              }}
            />
          )}
          {imgSrc && imgSize && (
            <canvas
              ref={fogCanvasRef}
              className={styles.fogCanvas}
              style={{ opacity: activeScene.fogEnabled ? GM_FOG_OPACITY : 0 }}
            />
          )}
          {liveRect && imgSize && (
            <div
              className={styles.liveRect}
              data-mode={fogMode}
              style={{
                left: liveRect.x * imgSize.w,
                top: liveRect.y * imgSize.h,
                width: liveRect.w * imgSize.w,
                height: liveRect.h * imgSize.h,
              }}
            />
          )}
          {liveMeasure && imgSize && (
            <svg
              className={styles.measureSvg}
              width={imgSize.w}
              height={imgSize.h}
            >
              <line
                x1={liveMeasure.start.x * imgSize.w}
                y1={liveMeasure.start.y * imgSize.h}
                x2={liveMeasure.end.x * imgSize.w}
                y2={liveMeasure.end.y * imgSize.h}
                stroke="oklch(0.82 0.18 80)"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
                strokeDasharray="6 3"
              />
              <circle
                className={styles.measureHandle}
                cx={liveMeasure.start.x * imgSize.w}
                cy={liveMeasure.start.y * imgSize.h}
                r={7 / activeScene.scale}
                fill="oklch(0.82 0.18 80)"
                onMouseDown={(e) => { e.stopPropagation(); measureHandleRef.current = "start"; }}
              />
              <circle
                className={styles.measureHandle}
                cx={liveMeasure.end.x * imgSize.w}
                cy={liveMeasure.end.y * imgSize.h}
                r={7 / activeScene.scale}
                fill="oklch(0.82 0.18 80)"
                onMouseDown={(e) => { e.stopPropagation(); measureHandleRef.current = "end"; }}
              />
              <text
                x={(liveMeasure.start.x + liveMeasure.end.x) / 2 * imgSize.w}
                y={(liveMeasure.start.y + liveMeasure.end.y) / 2 * imgSize.h - 8 / activeScene.scale}
                textAnchor="middle"
                fontSize={13 / activeScene.scale}
                fontFamily='"JetBrains MonoVariable", "JetBrains Mono", monospace'
                fontWeight="700"
                fill="oklch(0.95 0.02 80)"
                stroke="rgba(0,0,0,0.75)"
                strokeWidth={3 / activeScene.scale}
                paintOrder="stroke"
              >
                {measureDistance(liveMeasure.start, liveMeasure.end, imgSize, activeScene.mapScale, activeScene.gridSize).formatted}
              </text>
            </svg>
          )}
          {imgSize && gmPings.map((p) => (
            <div key={p.id} className={styles.ping} style={{ left: p.x * imgSize.w, top: p.y * imgSize.h }} />
          ))}
          {imgSize && (() => {
            const boardAnns = (activeScene.annotations ?? []).filter(isOnBoard);
            return (
              <AnnotationLayer
                annotations={liveAnn ? [...boardAnns, liveAnn] : boardAnns}
                imgW={imgSize.w}
                imgH={imgSize.h}
                preset={activeScene.markupPreset ?? "cartographer"}
                scale={activeScene.scale}
                selectedId={activeTool === "pan" ? selectedAnnId : null}
                gm
              />
            );
          })()}
          {imgSize && activeScene.tokens.filter(isOnBoard).map((t) => (
            <TokenPin
              key={t.id}
              token={t}
              imgW={imgSize.w}
              imgH={imgSize.h}
              ghost={!isPlayerVisible(t)}
              spotlight={!!t.sourceId && activeSourceIds.includes(t.sourceId)}
              onDragStart={startTokenDrag}
              onRemove={removeToken}
              onResize={resizeToken}
            />
          ))}
        </div>

        {showShield && (
          <div data-testid="transition-shield" className={styles.transitionShield} />
        )}

        {pendingDrop && (
          <div className={styles.tokenConflictPrompt}>
            <span className={styles.tokenConflictLabel}>
              <strong>{pendingDrop.draft.label}</strong> is already on the map
            </span>
            <button className={styles.tokenConflictBtn} onClick={() => resolveDrop(true)}>Move here</button>
            <button className={styles.tokenConflictBtn} onClick={() => resolveDrop(false)}>Add second</button>
            <button className={styles.tokenConflictDismiss} onClick={() => setPendingDrop(null)}>×</button>
          </div>
        )}

        {!imgSrc && !browserOpen && (
          <div className={styles.placeholder}>
            <p className={styles.placeholderHint}>Load a map from a folder or pick a single image</p>
            <div className={styles.placeholderActions}>
              <button className={styles.placeholderBtn} onClick={pickFolder} title="Browse any folder of images">
                Choose map folder…
              </button>
              <button
                className={styles.placeholderBtn}
                onClick={pickSingleImage}
                disabled={!hasVault}
                title={pickImageTitle}
              >
                Pick single image…
              </button>
            </div>
            {!hasVault && (
              <p className={styles.placeholderNote}>Open a vault to use "Pick single image"</p>
            )}
          </div>
        )}

        {browserOpen && (
          <>
            <div className={styles.browserOverlay} onClick={() => setBrowserOpen(false)} />
            <div className={styles.browser} onMouseDown={(e) => e.stopPropagation()}>
              <div className={styles.browserHeader}>
                <span className={styles.browserTitle}>{folderName ?? "Maps"}</span>
                <button className={styles.browserClose} onClick={() => setBrowserOpen(false)} title="Close browser">
                  ×
                </button>
              </div>
              <div className={styles.browserActions}>
                <button className={styles.browserActionBtn} onClick={pickFolder} title="Browse a different folder">
                  Change folder…
                </button>
                <button
                  className={styles.browserActionBtn}
                  onClick={pickSingleImage}
                  disabled={!hasVault}
                  title={pickImageTitle}
                >
                  Pick image…
                </button>
              </div>
              <div className={styles.fileList}>
                {files.length === 0 ? (
                  <div className={styles.noFiles}>No images found in this folder</div>
                ) : (
                  files.map((f) => (
                    <button
                      key={f}
                      className={`${styles.fileItem} ${f === activeScene.selectedMap ? styles.fileItemActive : ""}`}
                      onClick={() => selectMap(f)}
                      title={f}
                    >
                      {f.replace(/\\/g, "/").replace(/\.[^.]+$/, "").split("/").pop() ?? f}
                    </button>
                  ))
                )}
              </div>
              <div className={styles.browserFooter}>Double-click map to fit view</div>
            </div>
          </>
        )}
      </div>

        {/* Overlay inspector drawer - floats over the map's right edge */}
        {drawerOpen && (
          <div className={styles.inspector} onMouseDown={(e) => e.stopPropagation()}>
            <div className={styles.inspectorHeader}>
              <span className={styles.inspectorTitle}>{drawerContent === "markup" ? "Markup" : drawerContent === "visibility" ? "Visibility" : "Measure"}</span>
              <button className={styles.inspectorClose} onClick={() => setDrawerCollapsed(true)} title="Collapse">×</button>
            </div>
            <div className={styles.inspectorBody}>
              {drawerContent === "visibility" && (() => {
                const anns = activeScene.annotations ?? [];
                const empty = activeScene.tokens.length === 0 && anns.length === 0;
                return (
                  <div className={styles.visPanel}>
                    <div className={styles.inspHint}>
                      <strong>Board</strong> = exists for anyone · <strong>Eye</strong> = shown to players. Board-on + eye-off shows as a GM-only ghost.
                    </div>
                    {KIND_ORDER.map((kind) => {
                      const items = activeScene.tokens.filter((t) => tokenKindOf(t) === kind);
                      if (items.length === 0) return null;
                      const ids = new Set(items.map((t) => t.id));
                      const allOn = items.every(isOnBoard);
                      const allPlayers = items.every((t) => isOnBoard(t) && isPlayerVisible(t));
                      return (
                        <div key={kind} className={styles.visGroup}>
                          <div className={styles.visGroupHeader}>
                            <span className={styles.visGroupName}>{KIND_LABELS[kind]}</span>
                            <span className={styles.visCount}>{items.length}</span>
                            <VisToggle on={allOn} kind="board" onClick={() => setTokenVis(ids, "onBoard", !allOn)} />
                            <VisToggle on={allPlayers} disabled={!allOn} kind="players" onClick={() => setTokenVis(ids, "showPlayers", !allPlayers)} />
                          </div>
                          {items.map((t) => {
                            const on = isOnBoard(t); const players = isPlayerVisible(t); const one = new Set([t.id]);
                            const k = tokenKindOf(t);
                            return (
                              <div key={t.id} className={styles.visRow}>
                                <button
                                  className={styles.visKindBtn}
                                  onClick={(e) => { e.stopPropagation(); setTokenKind(t.id, nextKind(k)); }}
                                  title={`${KIND_LABELS[k]} - click to move to ${KIND_LABELS[nextKind(k)]}`}
                                >
                                  {k.charAt(0).toUpperCase()}
                                </button>
                                <span className={styles.visRowName} title={t.label}>{t.label}</span>
                                {t.locationRef && (() => {
                                  const place = gazetteerLocations.find((l) => l.filename === t.locationRef);
                                  const placeName = place?.name ?? t.locationRef;
                                  return (
                                    <button
                                      className={styles.visUnlinkBtn}
                                      onClick={(e) => { e.stopPropagation(); unlinkToken(t.id); }}
                                      title={`Linked to ${placeName} - click to unlink (the pin stays)`}
                                      aria-label={`Unlink ${t.label} from ${placeName}`}
                                    >
                                      ⛓
                                    </button>
                                  );
                                })()}
                                <VisToggle on={on} kind="board" onClick={() => setTokenVis(one, "onBoard", !on)} />
                                <VisToggle on={players} disabled={!on} kind="players" onClick={() => setTokenVis(one, "showPlayers", !players)} />
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                    {anns.length > 0 && (() => {
                      const ids = new Set(anns.map((a) => a.id));
                      const allOn = anns.every(isOnBoard);
                      const allPlayers = anns.every((a) => isOnBoard(a) && isPlayerVisible(a));
                      return (
                        <div className={styles.visGroup}>
                          <div className={styles.visGroupHeader}>
                            <span className={styles.visGroupName}>Markup</span>
                            <span className={styles.visCount}>{anns.length}</span>
                            <VisToggle on={allOn} kind="board" onClick={() => setAnnVis(ids, "onBoard", !allOn)} />
                            <VisToggle on={allPlayers} disabled={!allOn} kind="players" onClick={() => setAnnVis(ids, "showPlayers", !allPlayers)} />
                          </div>
                          {anns.map((a) => {
                            const on = isOnBoard(a); const players = isPlayerVisible(a); const one = new Set([a.id]);
                            const name = a.label || ANN_TYPE_LABELS[a.type];
                            return (
                              <div key={a.id} className={styles.visRow}>
                                <span className={styles.visRowName} title={name}>{name}</span>
                                <VisToggle on={on} kind="board" onClick={() => setAnnVis(one, "onBoard", !on)} />
                                <VisToggle on={players} disabled={!on} kind="players" onClick={() => setAnnVis(one, "showPlayers", !players)} />
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                    {empty && <div className={styles.inspHint}>No tokens or markup on this scene yet.</div>}
                  </div>
                );
              })()}
              {drawerContent === "markup" && (
                <div className={styles.markupPanel}>
                  <div className={styles.inspSection}>
                    <div className={styles.inspLabel}>Style</div>
                    <div className={styles.segmented}>
                      <button className={`${styles.segBtn} ${markupPreset === "cartographer" ? styles.segBtnActive : ""}`} onClick={() => patchScene({ markupPreset: "cartographer" })}>Cartographer</button>
                      <button className={`${styles.segBtn} ${markupPreset === "ink" ? styles.segBtnActive : ""}`} onClick={() => patchScene({ markupPreset: "ink" })}>Ink</button>
                    </div>
                  </div>
                  <div className={styles.inspSection}>
                    <div className={styles.inspLabel}>Colour</div>
                    <div className={styles.swatchRow}>
                      {MARKUP_COLORS.map((c) => (
                        <button
                          key={c}
                          className={`${styles.swatch} ${curColor === c ? styles.swatchActive : ""}`}
                          style={{ background: SWATCH[c] }}
                          onClick={() => restyle({ color: c })}
                          title={c}
                        />
                      ))}
                    </div>
                  </div>
                  <div className={styles.inspSection}>
                    <div className={styles.inspLabel}>Stroke</div>
                    <div className={styles.segmented}>
                      {([1, 2, 3] as const).map((s) => (
                        <button key={s} className={`${styles.segBtn} ${curStroke === s ? styles.segBtnActive : ""}`} onClick={() => restyle({ stroke: s })}>{STROKE_LABELS[s]}</button>
                      ))}
                    </div>
                  </div>
                  {selectedAnn ? (
                    <>
                      <div className={styles.inspSection}>
                        <div className={styles.inspLabel}>Label</div>
                        <input
                          key={selectedAnn.id}
                          className={styles.labelInput}
                          defaultValue={selectedAnn.label ?? ""}
                          placeholder="e.g. A, trap"
                          maxLength={24}
                          onChange={(e) => setSelectedAnnLabel(e.target.value)}
                        />
                      </div>
                      <button className={styles.markupDeleteBtn} onClick={() => deleteAnnotation(selectedAnn.id)}>Delete selected</button>
                    </>
                  ) : (
                    <div className={styles.inspHint}>Drag on the map to draw. Switch to Select to move, resize, or delete.</div>
                  )}
                </div>
              )}
              {drawerContent === "measure" && (<>
              <div className={styles.measureBar}>
                <svg className={styles.measureBarIcon} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2 16L16 2l6 6L8 22 2 16z" />
                  <path d="M9 9l2 2M12 12l2 2" />
                </svg>
                <span className={styles.measureSummary}>{measureSummary}</span>
                <button
                  className={`${styles.measureChangeBtn} ${measureEditorVisible ? styles.measureChangeBtnOpen : ""}`}
                  onClick={() => setScaleEditorOpen((v) => !v)}
                >
                  {hasScale ? "Change scale" : "Set scale"}
                </button>
              </div>

              {liveMeasure && (
                <button
                  className={styles.measureSnapshotBtn}
                  onClick={() => {
                    const id = uid();
                    setAnnotations((anns) => [...anns, arrowAnnotationFromDrag(id, liveMeasure.start, liveMeasure.end, markupColor, markupStroke)]);
                    setSelectedAnnId(id);
                    setActiveTool("pan"); // leaving "measure" flips the drawer over to the Markup panel for the new arrow
                  }}
                >
                  Save as arrow
                </button>
              )}

              {measureEditorVisible && (
                <div className={styles.scaleEditor}>
                  <div className={styles.scalePanelRow}>
                    <span className={styles.scalePanelLabel}>Use grid</span>
                    {activeScene.gridEnabled ? (
                      <>
                        <span className={styles.scalePanelNote}>1 square =</span>
                        <input
                          type="number"
                          className={styles.scaleNumInput}
                          value={scaleUnitsPerCell}
                          min="0.1"
                          step="1"
                          onChange={(e) => setScaleUnitsPerCell(e.target.value)}
                          onClick={(e) => (e.target as HTMLInputElement).select()}
                        />
                        <input
                          className={styles.scaleUnitInput}
                          value={scaleUnitLabel}
                          placeholder="ft"
                          onChange={(e) => setScaleUnitLabel(e.target.value)}
                        />
                        <button
                          className={styles.scaleSetBtn}
                          onClick={() => {
                            const n = parseFloat(scaleUnitsPerCell);
                            if (n > 0) {
                              patchScene({ mapScale: { mode: "grid", unitLabel: scaleUnitLabel || "ft", unitsPerCell: n } });
                              setScaleEditorOpen(false);
                            }
                          }}
                        >Set</button>
                      </>
                    ) : (
                      <span className={styles.scalePanelNote}>Turn on the grid to use this</span>
                    )}
                  </div>

                  <div className={styles.scalePanelRow}>
                    <span className={styles.scalePanelLabel}>Or measure</span>
                    {calibPixels !== null ? (
                      <>
                        <span className={styles.scalePanelNote}>That's</span>
                        <input
                          type="number"
                          className={styles.scaleNumInput}
                          value={calibRealInput}
                          min="0.1"
                          placeholder="dist"
                          onChange={(e) => setCalibRealInput(e.target.value)}
                          onClick={(e) => (e.target as HTMLInputElement).select()}
                          autoFocus
                        />
                        <input
                          className={styles.scaleUnitInput}
                          value={scaleUnitLabel}
                          placeholder="ft"
                          onChange={(e) => setScaleUnitLabel(e.target.value)}
                        />
                        <button
                          className={styles.scaleSetBtn}
                          onClick={() => {
                            const real = parseFloat(calibRealInput);
                            if (real > 0 && calibPixels > 0) {
                              patchScene({ mapScale: { mode: "calibrate", unitLabel: scaleUnitLabel || "ft", pixelsPerUnit: calibPixels / real } });
                              setCalibPixels(null);
                              setCalibRealInput("");
                              setScaleEditorOpen(false);
                            }
                          }}
                        >Set</button>
                        <button className={styles.scaleCancelBtn} onClick={() => { setCalibPixels(null); setCalibRealInput(""); }}>×</button>
                      </>
                    ) : (
                      <button
                        className={`${styles.scaleSetBtn} ${calibrating ? styles.scaleSetBtnArmed : ""}`}
                        onClick={() => setCalibrating((v) => !v)}
                      >
                        {calibrating ? "Drag across it on the map…" : "Measure a known length"}
                      </button>
                    )}
                  </div>

                  <div className={styles.scalePanelRow}>
                    <span className={styles.scalePanelLabel}>Nudge grid</span>
                    <span className={styles.scalePanelNote}>X</span>
                    <button className={styles.nudgeBtn} onClick={() => patchScene({ gridOffsetX: (activeScene.gridOffsetX ?? 0) - 1 })}>‹</button>
                    <span className={styles.scalePanelVal}>{activeScene.gridOffsetX ?? 0}</span>
                    <button className={styles.nudgeBtn} onClick={() => patchScene({ gridOffsetX: (activeScene.gridOffsetX ?? 0) + 1 })}>›</button>
                    <span className={styles.scalePanelNote}>Y</span>
                    <button className={styles.nudgeBtn} onClick={() => patchScene({ gridOffsetY: (activeScene.gridOffsetY ?? 0) - 1 })}>‹</button>
                    <span className={styles.scalePanelVal}>{activeScene.gridOffsetY ?? 0}</span>
                    <button className={styles.nudgeBtn} onClick={() => patchScene({ gridOffsetY: (activeScene.gridOffsetY ?? 0) + 1 })}>›</button>
                  </div>
                </div>
              )}
              </>)}
            </div>
          </div>
        )}
      </div>
    </>
  );

  if (expanded) {
    return (
      <dialog
        ref={dialogRef}
        className={styles.expandDialog}
        aria-label="Map Display, full screen"
        onClose={() => setExpanded(false)}
        // A click that lands outside the dialog's own box reports the dialog element itself as
        // e.target (the standard "click the backdrop" detector for <dialog>) - no stopPropagation
        // needed on inner content since a bubbled child click never matches this check.
        onClick={(e) => { if (e.target === dialogRef.current) setExpanded(false); }}
      >
        {body}
      </dialog>
    );
  }
  return <div className={styles.root}>{body}</div>;
}
