// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { invoke, Channel } from "@tauri-apps/api/core";

export type OllamaChunk =
  | { type: "token"; text: string }
  | { type: "done" };

export const ollamaCheck = (): Promise<boolean> =>
  invoke<boolean>("ollama_check");

export const ollamaListModels = (): Promise<string[]> =>
  invoke<string[]>("ollama_list_models");

// Tells the still-running Rust request to stop; a no-op if it already finished.
// Fire-and-forget - cancellation is best-effort, so a rejection here (e.g. the
// request already completed) shouldn't surface as an unhandled promise error.
const cancelGenerateRequest = (requestId: string): void => {
  // Deliberately unlogged: cancelling a request that already finished is the normal race here.
  invoke("ai_cancel_generate", { requestId }).catch(() => {});
};

export function ollamaGenerate(
  model: string,
  prompt: string,
  onChunk: (chunk: OllamaChunk) => void,
): { promise: Promise<void>; cancel: () => void } {
  let cancelled = false;
  const requestId = crypto.randomUUID();
  const channel = new Channel<OllamaChunk>();
  channel.onmessage = (chunk) => { if (!cancelled) onChunk(chunk); };
  const promise = invoke<void>("ollama_generate", { model, prompt, onEvent: channel, requestId });
  return {
    promise,
    cancel: () => {
      if (cancelled) return;
      cancelled = true;
      cancelGenerateRequest(requestId);
    },
  };
}

export const openaiListModels = (baseUrl: string, apiKey: string): Promise<string[]> =>
  invoke<string[]>("openai_list_models", { baseUrl, apiKey });

export function openaiGenerate(
  baseUrl: string,
  apiKey: string,
  model: string,
  prompt: string,
  onChunk: (chunk: OllamaChunk) => void,
): { promise: Promise<void>; cancel: () => void } {
  let cancelled = false;
  const requestId = crypto.randomUUID();
  const channel = new Channel<OllamaChunk>();
  channel.onmessage = (chunk) => { if (!cancelled) onChunk(chunk); };
  const promise = invoke<void>("openai_generate", { baseUrl, apiKey, model, prompt, onEvent: channel, requestId });
  return {
    promise,
    cancel: () => {
      if (cancelled) return;
      cancelled = true;
      cancelGenerateRequest(requestId);
    },
  };
}
