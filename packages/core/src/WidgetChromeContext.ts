// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { createContext, useContext } from "react";

/**
 * Lets a widget place a control into its frame's header chrome without the frame
 * knowing anything about the widget's internals. The frame (`WidgetFrame`)
 * renders an empty header slot and publishes its DOM node here; a widget can
 * then portal a button (e.g. the settings cog) into that node via
 * `WidgetSettingsCog`. It lives in core because the app owns the frame while the
 * built-in widgets are the consumers - both depend on core, nothing else joins
 * them. `headerSlot` is null before the frame's slot has mounted.
 */
export interface WidgetChromeContextValue {
  headerSlot: HTMLElement | null;
}

const defaultValue: WidgetChromeContextValue = { headerSlot: null };

export const WidgetChromeContext = createContext<WidgetChromeContextValue>(defaultValue);

export function useWidgetChrome(): WidgetChromeContextValue {
  return useContext(WidgetChromeContext);
}
