// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useState, useRef, useEffect } from "react";
import { useVault } from "@ttcanvas/core";
import type { SoundBoardState, SoundPad as SoundPadType, SoundScene, SoundTrack } from "./types";
import { advancePlaylist, type PlaylistCursor } from "./playlist";
import { SoundPad } from "./SoundPad";
import styles from "./SoundBoard.module.css";

interface Props {
  state: SoundBoardState;
  onChange: (state: SoundBoardState) => void;
}

/** How long a track-to-track or scene-to-scene fade takes. Fixed, not user-configurable. */
const CROSSFADE_MS = 2000;

function mimeForExt(ext: string): string {
  const map: Record<string, string> = {
    mp3: "audio/mpeg",
    ogg: "audio/ogg",
    wav: "audio/wav",
    flac: "audio/flac",
    m4a: "audio/mp4",
    aac: "audio/aac",
  };
  return map[ext] ?? "audio/mpeg";
}

function uid(): string {
  return `sb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function defaultScene(name: string): SoundScene {
  return { id: uid(), name, pads: [] };
}

function sanitizeTrack(t: unknown): SoundTrack | null {
  const track = t as Record<string, unknown>;
  if (typeof track?.id !== "string" || typeof track.audioPath !== "string") return null;
  return { id: track.id, audioPath: track.audioPath };
}

function sanitizePad(p: unknown): SoundPadType | null {
  const pad = p as Record<string, unknown>;
  if (typeof pad?.id !== "string") return null;
  const tracks = Array.isArray(pad.tracks)
    ? (pad.tracks as unknown[]).map(sanitizeTrack).filter((t): t is SoundTrack => t !== null)
    : [];
  return {
    id: pad.id,
    label: typeof pad.label === "string" ? pad.label : "",
    tracks,
    shuffle: typeof pad.shuffle === "boolean" ? pad.shuffle : false,
    loop: typeof pad.loop === "boolean" ? pad.loop : false,
    volume: typeof pad.volume === "number" ? pad.volume : 1,
    autoplay: typeof pad.autoplay === "boolean" ? pad.autoplay : false,
  };
}

// `fallbackId` (not a fresh uid()) keeps a corrupt-but-non-empty scenes array stable across
// re-renders - this path isn't persisted back (see the `migrated` check below), so a random id
// here would otherwise mint a new scene identity - and a new sceneTabs `key` - on every render.
function sanitizeScene(s: unknown, fallbackId: string): SoundScene {
  const scene = s as Record<string, unknown>;
  const pads = Array.isArray(scene?.pads)
    ? (scene.pads as unknown[]).map(sanitizePad).filter((p): p is SoundPadType => p !== null)
    : [];
  return {
    id: typeof scene?.id === "string" ? scene.id : fallbackId,
    name: typeof scene?.name === "string" ? scene.name : "Scene",
    pads,
  };
}

// Promote legacy flat state (pre-scenes, one audioPath per pad) into the scenes/playlist shape, and
// sanitise whatever shape comes in - malformed, empty or null state must still produce at least one
// valid scene, since rendering always reads the active scene's pads without an existence check.
// Same split as Map Display: the zod schema only validates the outer shape, this does the deep work.
function migrateSoundBoardState(raw: unknown): SoundBoardState {
  const r = (raw ?? {}) as Record<string, unknown>;

  if (Array.isArray(r.scenes) && r.scenes.length > 0) {
    const scenes = r.scenes.map((sc, i) => sanitizeScene(sc, `scene-${i}`));
    const activeSceneId = typeof r.activeSceneId === "string" && scenes.some((sc) => sc.id === r.activeSceneId)
      ? r.activeSceneId
      : scenes[0].id;
    return { scenes, activeSceneId };
  }

  // Legacy pre-scenes state, or empty/corrupt scenes - either way, build one valid starter scene.
  const legacyPads = ((r.pads as Record<string, unknown>[] | undefined) ?? []);
  const pads: SoundPadType[] = legacyPads.map((p) => ({
    id: (p.id as string) ?? uid(),
    label: (p.label as string) ?? "",
    tracks: p.audioPath ? [{ id: uid(), audioPath: p.audioPath as string }] : [],
    shuffle: false,
    loop: (p.loop as boolean) ?? false,
    volume: (p.volume as number) ?? 1,
    autoplay: false,
  }));
  const scene: SoundScene = { id: uid(), name: "Scene 1", pads };
  return { scenes: [scene], activeSceneId: scene.id };
}

interface PadPlayback {
  el: HTMLAudioElement;
  cursor: PlaylistCursor;
  /** Set once a crossfade to the next track has been kicked off, so onended doesn't double-advance. */
  advancing: boolean;
}

/** Linear volume ramp over rAF. Returns a cancel function. */
function fadeVolume(el: HTMLAudioElement, from: number, to: number, durationMs: number, onDone?: () => void): () => void {
  let cancelled = false;
  el.volume = from;
  const start = performance.now();
  function step(now: number) {
    if (cancelled) return;
    const t = Math.min(1, (now - start) / durationMs);
    el.volume = from + (to - from) * t;
    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      onDone?.();
    }
  }
  requestAnimationFrame(step);
  return () => { cancelled = true; };
}

export function SoundBoard({ state: rawState, onChange }: Props) {
  const vault = useVault();

  const state = migrateSoundBoardState(rawState);
  const rawScenes = (rawState as unknown as Record<string, unknown> | null)?.scenes;
  const migrated = !Array.isArray(rawScenes) || rawScenes.length === 0;
  useEffect(() => {
    if (migrated) onChange(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [playing, setPlaying] = useState<Set<string>>(new Set());
  const playbackRef = useRef<Map<string, PadPlayback>>(new Map());
  const blobUrls = useRef<Map<string, string>>(new Map());
  // Bumped every time a pad's playback is stopped or freshly (re)started, so an in-flight async
  // start/crossfade that resolves after the pad moved on (stopped, scene switched away, deleted)
  // can tell it's been superseded and abort instead of starting a sound nobody asked for anymore.
  const padEpoch = useRef<Map<string, number>>(new Map());

  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; });

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Cleanup on unmount. Deliberately reads ref.current fresh inside the cleanup
  // closure rather than a captured snapshot: this needs whatever pads have
  // accumulated by unmount time, not whatever existed when the effect first ran.
  useEffect(() => {
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      for (const pb of playbackRef.current.values()) {
        pb.el.pause();
        pb.el.src = "";
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
      for (const url of blobUrls.current.values()) {
        URL.revokeObjectURL(url);
      }
    };
  }, []);

  function findPad(padId: string): SoundPadType | undefined {
    for (const sc of stateRef.current.scenes) {
      const pad = sc.pads.find((p) => p.id === padId);
      if (pad) return pad;
    }
    return undefined;
  }

  async function loadTrackUrl(track: SoundTrack): Promise<string> {
    const cached = blobUrls.current.get(track.id);
    if (cached) return cached;
    const ext = track.audioPath.replace(/\\/g, "/").split("/").pop()?.split(".").pop()?.toLowerCase() ?? "mp3";
    const mime = mimeForExt(ext);
    const b64 = await vault.readBinaryFile(track.audioPath);
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob);
    blobUrls.current.set(track.id, url);
    return url;
  }

  function bumpEpoch(padId: string): number {
    const next = (padEpoch.current.get(padId) ?? 0) + 1;
    padEpoch.current.set(padId, next);
    return next;
  }

  function currentEpoch(padId: string): number {
    return padEpoch.current.get(padId) ?? 0;
  }

  function stopPad(padId: string) {
    bumpEpoch(padId); // invalidate any in-flight start/crossfade for this pad
    const pb = playbackRef.current.get(padId);
    if (pb) {
      pb.el.ontimeupdate = null;
      pb.el.onended = null;
      pb.el.pause();
      pb.el.currentTime = 0;
      playbackRef.current.delete(padId);
    }
    setPlaying((prev) => {
      const next = new Set(prev);
      next.delete(padId);
      return next;
    });
  }

  /** Fades a pad's currently-playing audio to silence instead of an instant stop. Used on scene switch. */
  function fadeOutAndStop(padId: string) {
    bumpEpoch(padId); // invalidate any in-flight start/crossfade for this pad
    const pb = playbackRef.current.get(padId);
    if (!pb) return;
    pb.el.ontimeupdate = null;
    pb.el.onended = null;
    fadeVolume(pb.el, pb.el.volume, 0, CROSSFADE_MS, () => {
      pb.el.pause();
      pb.el.src = "";
    });
    playbackRef.current.delete(padId);
    setPlaying((prev) => {
      const next = new Set(prev);
      next.delete(padId);
      return next;
    });
  }

  function stopAll() {
    for (const padId of [...playbackRef.current.keys()]) stopPad(padId);
  }

  function attachHandlers(padId: string, el: HTMLAudioElement) {
    el.ontimeupdate = () => {
      const pb = playbackRef.current.get(padId);
      const pad = findPad(padId);
      if (!pb || pb.el !== el || pb.advancing || !pad || pad.tracks.length <= 1) return;
      if (!isFinite(el.duration)) return;
      const remaining = el.duration - el.currentTime;
      if (remaining <= CROSSFADE_MS / 1000) {
        pb.advancing = true;
        void crossfadeToNext(padId, pad, pb);
      }
    };
    el.onended = () => {
      const pb = playbackRef.current.get(padId);
      if (!pb || pb.el !== el) return;
      const pad = findPad(padId);
      if (pad && pad.tracks.length > 1 && !pb.advancing) {
        // Crossfade never triggered (track shorter than the crossfade window) - jump straight to the next.
        const next = advancePlaylist(pb.cursor, pad.tracks.length, pad.shuffle, pad.loop);
        if (next) {
          void startTrack(padId, pad, next, false);
          return;
        }
      }
      playbackRef.current.delete(padId);
      setPlaying((prev) => {
        const next = new Set(prev);
        next.delete(padId);
        return next;
      });
    };
  }

  async function startTrack(padId: string, pad: SoundPadType, cursor: PlaylistCursor, fadeIn: boolean) {
    const track = pad.tracks[cursor.index];
    if (!track) return;

    // A fresh start supersedes anything already in flight for this pad (a pending start, a
    // pending crossfade, or nothing) - bump first so a stale resolution later knows to bail out.
    const epoch = bumpEpoch(padId);
    let url: string;
    try {
      url = await loadTrackUrl(track);
    } catch {
      return; // Couldn't read the file from the vault - nothing to play.
    }
    if (currentEpoch(padId) !== epoch) return; // superseded while loading

    const el = new Audio(url);
    el.loop = pad.tracks.length <= 1 && pad.loop;
    el.volume = fadeIn ? 0 : pad.volume;
    attachHandlers(padId, el);
    try {
      await el.play();
    } catch {
      return; // Playback failed (e.g. blocked) - leave the pad stopped.
    }
    if (currentEpoch(padId) !== epoch) {
      // Stopped, or superseded by a newer start, while play() was resolving.
      el.pause();
      el.src = "";
      return;
    }

    playbackRef.current.set(padId, { el, cursor, advancing: false });
    if (fadeIn) fadeVolume(el, 0, pad.volume, CROSSFADE_MS);
    setPlaying((prev) => new Set([...prev, padId]));
  }

  async function crossfadeToNext(padId: string, pad: SoundPadType, pb: PadPlayback) {
    const next = advancePlaylist(pb.cursor, pad.tracks.length, pad.shuffle, pad.loop);
    if (!next) return; // Nothing to cross into - let the current track ring out to its natural end.
    const track = pad.tracks[next.index];
    if (!track) return;

    // Read (don't bump) - a crossfade is a continuation of the pad's current epoch, not a new
    // start. If something else bumps it while we're loading (stop, scene switch, a fresh start),
    // this crossfade is stale and should abort rather than start a sound over top of it.
    const epoch = currentEpoch(padId);
    const oldEl = pb.el;
    let url: string;
    try {
      url = await loadTrackUrl(track);
    } catch {
      return; // Couldn't read the next track - let the current one ring out instead.
    }
    if (currentEpoch(padId) !== epoch) return;

    const newEl = new Audio(url);
    newEl.volume = 0;
    attachHandlers(padId, newEl);
    try {
      await newEl.play();
    } catch {
      return; // Couldn't start the next track - let the current one ring out instead.
    }
    if (currentEpoch(padId) !== epoch) {
      newEl.pause();
      newEl.src = "";
      return;
    }

    fadeVolume(newEl, 0, pad.volume, CROSSFADE_MS);
    fadeVolume(oldEl, oldEl.volume, 0, CROSSFADE_MS, () => {
      oldEl.pause();
      oldEl.src = "";
    });
    playbackRef.current.set(padId, { el: newEl, cursor: next, advancing: false });
  }

  function playPad(pad: SoundPadType) {
    if (pad.tracks.length === 0) return;
    void startTrack(pad.id, pad, { index: 0, playsDone: 0 }, false);
  }

  function patchActiveScenePads(updater: (pads: SoundPadType[]) => SoundPadType[]) {
    onChange({
      ...stateRef.current,
      scenes: stateRef.current.scenes.map((sc) =>
        sc.id === stateRef.current.activeSceneId ? { ...sc, pads: updater(sc.pads) } : sc,
      ),
    });
  }

  function patchPad(updated: SoundPadType) {
    const pb = playbackRef.current.get(updated.id);
    if (pb) pb.el.volume = updated.volume;
    patchActiveScenePads((pads) => pads.map((p) => (p.id === updated.id ? updated : p)));
  }

  function revokeTrackUrl(trackId: string) {
    const url = blobUrls.current.get(trackId);
    if (url) {
      URL.revokeObjectURL(url);
      blobUrls.current.delete(trackId);
    }
  }

  function removePad(padId: string) {
    stopPad(padId);
    for (const t of findPad(padId)?.tracks ?? []) revokeTrackUrl(t.id);
    patchActiveScenePads((pads) => pads.filter((p) => p.id !== padId));
  }

  function addPad() {
    const activeScene = stateRef.current.scenes.find((sc) => sc.id === stateRef.current.activeSceneId);
    const newPad: SoundPadType = {
      id: uid(),
      label: `Pad ${(activeScene?.pads.length ?? 0) + 1}`,
      tracks: [],
      shuffle: false,
      loop: false,
      volume: 1,
      autoplay: false,
    };
    patchActiveScenePads((pads) => [...pads, newPad]);
  }

  async function addTrack(padId: string) {
    const picked = await vault.pickAudioFile();
    if (!picked) return;
    const track: SoundTrack = { id: uid(), audioPath: picked };
    patchActiveScenePads((pads) =>
      pads.map((p) => (p.id === padId ? { ...p, tracks: [...p.tracks, track] } : p)),
    );
  }

  function removeTrack(padId: string, trackId: string) {
    // Removing any track shifts the remaining ones' indices, which would leave the pad's
    // playback cursor pointing at the wrong track (or, for the last track, at none at all
    // with no way left to reach Stop) - stop cleanly first rather than try to reconcile it.
    if (playbackRef.current.has(padId)) stopPad(padId);
    revokeTrackUrl(trackId);
    patchActiveScenePads((pads) =>
      pads.map((p) => (p.id === padId ? { ...p, tracks: p.tracks.filter((t) => t.id !== trackId) } : p)),
    );
  }

  function moveTrack(padId: string, trackId: string, dir: -1 | 1) {
    patchActiveScenePads((pads) =>
      pads.map((p) => {
        if (p.id !== padId) return p;
        const idx = p.tracks.findIndex((t) => t.id === trackId);
        const swapIdx = idx + dir;
        if (idx < 0 || swapIdx < 0 || swapIdx >= p.tracks.length) return p;
        const tracks = [...p.tracks];
        [tracks[idx], tracks[swapIdx]] = [tracks[swapIdx], tracks[idx]];
        return { ...p, tracks };
      }),
    );
  }

  // ── Scene management ─────────────────────────────────────────────────────

  function addScene() {
    const scene = defaultScene(`Scene ${state.scenes.length + 1}`);
    onChange({ ...state, scenes: [...state.scenes, scene], activeSceneId: scene.id });
  }

  function switchScene(id: string) {
    if (id === state.activeSceneId) return;
    const outgoing = state.scenes.find((sc) => sc.id === state.activeSceneId);
    const incoming = state.scenes.find((sc) => sc.id === id);
    onChange({ ...state, activeSceneId: id });

    if (outgoing) {
      // Bump every outgoing pad's epoch, not just the ones already in playbackRef - a pad whose
      // startTrack/crossfade is still mid-flight (e.g. a just-pressed Play, or an autoplay pad
      // whose file is still loading) must not go on to start audible playback in the new scene.
      for (const pad of outgoing.pads) fadeOutAndStop(pad.id);
    }
    if (incoming) {
      for (const pad of incoming.pads) {
        if (pad.autoplay && pad.tracks.length > 0 && !playbackRef.current.has(pad.id)) {
          void startTrack(pad.id, pad, { index: 0, playsDone: 0 }, true);
        }
      }
    }
  }

  function startRename(id: string, name: string) {
    setRenamingId(id);
    setRenameVal(name);
    setTimeout(() => renameInputRef.current?.select(), 0);
  }

  function commitRename() {
    if (!renamingId) return;
    const name = renameVal.trim() || "Untitled";
    onChange({ ...state, scenes: state.scenes.map((sc) => (sc.id === renamingId ? { ...sc, name } : sc)) });
    setRenamingId(null);
  }

  function deleteScene(id: string) {
    if (state.scenes.length <= 1) return;
    const sc = state.scenes.find((s) => s.id === id);
    if (!confirm(`Delete scene "${sc?.name ?? "this scene"}"?`)) return;
    for (const pad of sc?.pads ?? []) removePad(pad.id);
    const remaining = state.scenes.filter((s) => s.id !== id);
    const newActiveId = state.activeSceneId === id ? remaining[0].id : state.activeSceneId;
    onChange({ ...state, scenes: remaining, activeSceneId: newActiveId });
  }

  const activeScene = state.scenes.find((sc) => sc.id === state.activeSceneId) ?? state.scenes[0];
  const hasPlaying = playing.size > 0;

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <span className={styles.toolbarTitle}>Sound Board</span>
        <div className={styles.spacer} />
        <button
          className={`${styles.toolbarBtn} ${hasPlaying ? styles.stopAllActive : ""}`}
          onClick={stopAll}
          disabled={!hasPlaying}
          title="Stop all playing sounds"
        >
          Stop All
        </button>
        <button className={styles.toolbarBtn} onClick={addPad} title="Add a new sound pad">
          + Add Pad
        </button>
      </div>

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
                  title={`${sc.name}  ·  Double-click to rename`}
                >
                  {sc.name}
                </button>
              )}
              {state.scenes.length > 1 && (
                <button
                  className={styles.sceneDeleteBtn}
                  onClick={(e) => { e.stopPropagation(); deleteScene(sc.id); }}
                  title="Delete scene"
                  aria-label={`Delete scene "${sc.name}"`}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        <button className={styles.sceneAddBtn} onClick={addScene} title="New scene" aria-label="New scene">+</button>
      </div>

      {activeScene.pads.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyHint}>No pads yet - click "Add Pad" to get started</p>
          <button className={styles.emptyBtn} onClick={addPad}>
            + Add Pad
          </button>
        </div>
      ) : (
        <div className={styles.grid}>
          {activeScene.pads.map((pad) => (
            <SoundPad
              key={pad.id}
              pad={pad}
              isPlaying={playing.has(pad.id)}
              onPlay={() => playPad(pad)}
              onStop={() => stopPad(pad.id)}
              onChange={patchPad}
              onRemove={() => removePad(pad.id)}
              onAddTrack={() => addTrack(pad.id)}
              onRemoveTrack={(trackId) => removeTrack(pad.id, trackId)}
              onMoveTrack={(trackId, dir) => moveTrack(pad.id, trackId, dir)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
