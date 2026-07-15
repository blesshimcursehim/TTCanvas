// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useState } from "react";
import type { SoundPad as SoundPadType } from "./types";
import styles from "./SoundPad.module.css";

interface Props {
  pad: SoundPadType;
  isPlaying: boolean;
  onPlay: () => void;
  onStop: () => void;
  onChange: (pad: SoundPadType) => void;
  onRemove: () => void;
  onAddTrack: () => void;
  onRemoveTrack: (trackId: string) => void;
  onMoveTrack: (trackId: string, dir: -1 | 1) => void;
}

function trackName(audioPath: string): string {
  return audioPath.replace(/\\/g, "/").split("/").pop()?.replace(/\.[^.]+$/, "") ?? audioPath;
}

export function SoundPad({
  pad, isPlaying, onPlay, onStop, onChange, onRemove, onAddTrack, onRemoveTrack, onMoveTrack,
}: Props) {
  const [panelOpen, setPanelOpen] = useState(false);
  const hasTracks = pad.tracks.length > 0;

  return (
    <div className={`${styles.pad} ${isPlaying ? styles.playing : ""} ${!hasTracks ? styles.empty : ""}`}>
      <button className={styles.removeBtn} onClick={onRemove} title="Remove pad" aria-label="Remove pad" tabIndex={-1}>
        ×
      </button>

      <input
        className={styles.label}
        value={pad.label}
        onChange={(e) => onChange({ ...pad, label: e.target.value })}
        maxLength={40}
        placeholder="Label"
        title="Pad label"
      />

      <button
        className={styles.playBtn}
        onClick={isPlaying ? onStop : onPlay}
        disabled={!hasTracks}
        title={hasTracks ? (isPlaying ? "Stop" : "Play") : "Add a track first"}
        aria-label={hasTracks ? (isPlaying ? "Stop" : "Play") : "Add a track first"}
      >
        {isPlaying ? (
          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <path d="M6 4l14 8-14 8V4z" />
          </svg>
        )}
        {hasTracks ? (
          <span className={styles.fileName}>
            {pad.tracks.length === 1 ? trackName(pad.tracks[0].audioPath) : `${pad.tracks.length} tracks`}
          </span>
        ) : (
          <span className={styles.noFile}>No tracks</span>
        )}
      </button>

      <div className={styles.controls}>
        <button
          className={`${styles.ctrlBtn} ${pad.loop ? styles.ctrlBtnActive : ""}`}
          onClick={() => onChange({ ...pad, loop: !pad.loop })}
          title={pad.loop ? "Loop on - click to turn off" : "Loop off - click to turn on"}
          aria-label={pad.loop ? "Loop on - click to turn off" : "Loop off - click to turn on"}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3" />
          </svg>
        </button>

        <input
          type="range"
          className={styles.volumeSlider}
          min={0}
          max={1}
          step={0.01}
          value={pad.volume}
          onChange={(e) => onChange({ ...pad, volume: Number(e.target.value) })}
          title={`Volume: ${Math.round(pad.volume * 100)}%`}
        />

        <button
          className={`${styles.ctrlBtn} ${panelOpen ? styles.ctrlBtnActive : ""}`}
          onClick={() => setPanelOpen((v) => !v)}
          title="Manage playlist"
          aria-label="Manage playlist"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
          </svg>
        </button>
      </div>

      {panelOpen && (
        <div className={styles.playlistPanel} onClick={(e) => e.stopPropagation()}>
          <div className={styles.playlistHeader}>
            <span>Playlist</span>
            <button className={styles.playlistClose} onClick={() => setPanelOpen(false)} title="Close" aria-label="Close playlist panel">×</button>
          </div>

          <div className={styles.trackList}>
            {pad.tracks.length === 0 ? (
              <p className={styles.trackListEmpty}>No tracks yet</p>
            ) : (
              pad.tracks.map((track, i) => (
                <div key={track.id} className={styles.trackRow}>
                  <span className={styles.trackName} title={track.audioPath}>{trackName(track.audioPath)}</span>
                  <button
                    className={styles.trackBtn}
                    onClick={() => onMoveTrack(track.id, -1)}
                    disabled={i === 0}
                    title="Move up"
                    aria-label={`Move ${trackName(track.audioPath)} up`}
                  >
                    ↑
                  </button>
                  <button
                    className={styles.trackBtn}
                    onClick={() => onMoveTrack(track.id, 1)}
                    disabled={i === pad.tracks.length - 1}
                    title="Move down"
                    aria-label={`Move ${trackName(track.audioPath)} down`}
                  >
                    ↓
                  </button>
                  <button
                    className={styles.trackBtn}
                    onClick={() => onRemoveTrack(track.id)}
                    title="Remove track"
                    aria-label={`Remove ${trackName(track.audioPath)}`}
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>

          <button className={styles.addTrackBtn} onClick={onAddTrack}>+ Track</button>

          <div className={styles.playlistToggles}>
            <label className={styles.toggleRow} title="Play tracks in random order instead of in sequence">
              <input
                type="checkbox"
                checked={pad.shuffle}
                onChange={(e) => onChange({ ...pad, shuffle: e.target.checked })}
              />
              Shuffle
            </label>
            <label className={styles.toggleRow} title="Start this pad automatically when its scene becomes active">
              <input
                type="checkbox"
                checked={pad.autoplay}
                onChange={(e) => onChange({ ...pad, autoplay: e.target.checked })}
              />
              Auto-play on scene
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
