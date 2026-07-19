// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import type { ComponentType } from "react";

export type WidgetComponent = ComponentType<{
  state: unknown;
  onChange: (state: unknown) => void;
}>;

export interface WidgetDefinition {
  type: string;
  title: string;
  icon?: string;
  /** Short Markdown guidance shown from the widget frame. */
  help?: string;
  category: string;
  defaultSize: { width: number; height: number };
  defaultState: unknown | (() => unknown);
  singleton?: boolean;
  /** Registered and renderable (so already-placed instances keep working and their state still
   *  parses), but not offered in the Add Widget picker or Command Palette. For retired widget types
   *  that a newer widget subsumes - e.g. `time-tracker`, folded into the Almanac. */
  hidden?: boolean;
  minWidth?: number;
  minHeight?: number;
  component: WidgetComponent;
  parseState?: (raw: unknown) => unknown;
}

export function resolveDefaultState(def: WidgetDefinition): unknown {
  return typeof def.defaultState === "function" ? (def.defaultState as () => unknown)() : def.defaultState;
}

const registry = new Map<string, WidgetDefinition>();
const modTypes = new Set<string>();
const modFilenames = new Map<string, string>();

export function registerWidget(def: WidgetDefinition): void {
  registry.set(def.type, def);
}

export function registerModWidget(def: WidgetDefinition, filename?: string): void {
  if (registry.has(def.type) && !modTypes.has(def.type)) {
    // Built-in collision - refuse to overwrite so clearModWidgets can't delete a core widget.
    return;
  }
  registry.set(def.type, def);
  modTypes.add(def.type);
  if (filename) modFilenames.set(def.type, filename);
}

export function clearModWidgets(): void {
  for (const type of modTypes) registry.delete(type);
  modTypes.clear();
  modFilenames.clear();
}

export function getModFilename(type: string): string | undefined {
  return modFilenames.get(type);
}

export function getWidget(type: string): WidgetDefinition | undefined {
  return registry.get(type);
}

export function getAllWidgets(): WidgetDefinition[] {
  return Array.from(registry.values());
}

export function getModWidgetTypes(): string[] {
  return Array.from(modTypes);
}
