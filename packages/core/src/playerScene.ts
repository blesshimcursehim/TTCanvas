// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { emitTo } from "@tauri-apps/api/event";
import type { PlayerScene, CharacterPayload, LocationPayload, ShopPayload } from "./types";
import type { InitiativeOverlay } from "./ITContext";

export async function pushPlayerScene(scene: PlayerScene): Promise<void> {
  await emitTo("player", "player-update", scene);
}

export async function pushCharacterScene(character: CharacterPayload): Promise<void> {
  await emitTo("player", "player-update", { type: "character", character } satisfies PlayerScene);
}

// Cast arbitrary result text (e.g. a Roll Tables roll) to the player window as a text reveal.
export async function pushTextScene(text: { title?: string; body: string }): Promise<void> {
  await emitTo("player", "player-update", { type: "text", text } satisfies PlayerScene);
}

// Cast a full-bleed image (e.g. a drawn card's art) to the player window as a handout.
export async function pushHandoutScene(imgSrc: string): Promise<void> {
  await emitTo("player", "player-update", { type: "handout", handout: { imgSrc } } satisfies PlayerScene);
}

// Cast a Gazetteer location's establishing card (image + name + player-safe blurb) to the players.
export async function pushLocationScene(location: LocationPayload): Promise<void> {
  await emitTo("player", "player-update", { type: "location", location } satisfies PlayerScene);
}

// Cast a merchant's shelves to the players as a price list. GM-only figures (buyback rate, the
// party purse, the merchant's notes) never enter the payload - see buildShopPayload.
export async function pushShopScene(shop: ShopPayload): Promise<void> {
  await emitTo("player", "player-update", { type: "shop", shop } satisfies PlayerScene);
}

// Separate channel for the player window's text scale. It reads the setting rather than owning it,
// because the player webview's capability is deliberately listen-only and can't load app config.
export async function pushPlayerTextScale(scale: number): Promise<void> {
  await emitTo("player", "text-scale", scale);
}

// Separate channel for the date overlay - does not touch the map scene.
export async function pushDateOverlay(date: string | null): Promise<void> {
  await emitTo("player", "date-update", date);
}

// Separate channel for the initiative overlay - overlays the active scene
// without replacing it. Pass null to clear it.
export async function pushInitiativeOverlay(overlay: InitiativeOverlay | null): Promise<void> {
  await emitTo("player", "it-update", overlay);
}

/** A single Progress Clock shown as a small corner overlay - see InitiativeOverlay for the sibling
 * pattern (a separate channel that overlays the active scene without replacing it). */
export interface ClockOverlay {
  name: string;
  segments: number;
  filled: number;
}

// Separate channel for the Progress Clocks overlay. Pass null to clear it.
export async function pushClockOverlay(overlay: ClockOverlay | null): Promise<void> {
  await emitTo("player", "clock-update", overlay);
}

/** A cast dice roll shown as a small overlay in the lower-middle of the player screen - a sibling
 * of ClockOverlay/InitiativeOverlay (own channel, overlays any scene). The GM-only detail (raw dice)
 * stays on the GM screen; players see the label, the total, and a crit/fumble flag. */
export interface DiceOverlay {
  label: string;
  total: number;
  breakdown: string;
  crit: boolean;
  fumble: boolean;
}

// Separate channel for the dice-result overlay. Pass null to clear it.
export async function pushDiceOverlay(overlay: DiceOverlay | null): Promise<void> {
  await emitTo("player", "dice-update", overlay);
}

/** How long a ping pulse stays visible - shared so the GM and player fade out in lockstep. */
export const PING_LIFETIME_MS = 1500;

/** A transient pointer on the map - "look here", nothing persisted (unlike MapAnnotation). */
export interface MapPing {
  /** Normalised 0-1 position of the image, same convention as MapAnnotation coordinates. */
  x: number;
  y: number;
  /** Timestamp so two pings at the same spot are still distinct React keys on the player side. */
  at: number;
}

// Alt-click on the map drops this as a ~2s pulse on the player window.
export async function pushMapPing(x: number, y: number): Promise<void> {
  await emitTo("player", "map-ping", { x, y, at: Date.now() } satisfies MapPing);
}
