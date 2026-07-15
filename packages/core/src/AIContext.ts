// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { createContext, useContext } from "react";

export type AIProvider = "ollama" | "openai";

export interface AIConfig {
  provider: AIProvider;
  baseUrl: string;
  apiKey: string;
  model: string | null;
}

export const defaultAIConfig: AIConfig = {
  provider: "ollama",
  baseUrl: "",
  apiKey: "",
  model: null,
};

export interface AIContextValue {
  config: AIConfig;
}

const defaultValue: AIContextValue = { config: defaultAIConfig };

export const AIContext = createContext<AIContextValue>(defaultValue);
export function useAI(): AIContextValue { return useContext(AIContext); }
