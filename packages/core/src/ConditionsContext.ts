// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { createContext, useContext } from "react";

export interface CustomConditionDef {
  name: string;
  color?: string;
}

export interface ConditionsContextValue {
  customConditions: CustomConditionDef[];
}

export const ConditionsContext = createContext<ConditionsContextValue>({ customConditions: [] });
export function useConditions(): ConditionsContextValue { return useContext(ConditionsContext); }
