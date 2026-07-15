// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { createContext, useContext, type MutableRefObject } from "react";

export interface CanvasTransform {
  x: number;
  y: number;
  scale: number;
}

export const CanvasContext = createContext<MutableRefObject<CanvasTransform> | null>(null);

export function useCanvasTransform(): MutableRefObject<CanvasTransform> {
  const ctx = useContext(CanvasContext);
  if (!ctx) throw new Error("useCanvasTransform must be used inside Canvas");
  return ctx;
}
