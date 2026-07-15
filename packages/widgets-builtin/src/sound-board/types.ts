// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

export interface SoundTrack {
  id: string;
  audioPath: string;
}

export interface SoundPad {
  id: string;
  label: string;
  tracks: SoundTrack[];
  /** Play order within the playlist: sequential (false) or random (true). */
  shuffle: boolean;
  /** Repeat the playlist after the last track finishes. */
  loop: boolean;
  volume: number;
  /** Start automatically when this pad's scene becomes active. */
  autoplay: boolean;
}

export interface SoundScene {
  id: string;
  name: string;
  pads: SoundPad[];
}

export interface SoundBoardState {
  scenes: SoundScene[];
  activeSceneId: string;
}
