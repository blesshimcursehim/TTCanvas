// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect, vi, beforeEach } from "vitest";

const invoke = vi.fn();

class FakeChannel<T> {
  onmessage: ((data: T) => void) | undefined;
}

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  Channel: FakeChannel,
}));

const { ollamaGenerate, openaiGenerate } = await import("./ollama");

describe("ollamaGenerate / openaiGenerate cancellation", () => {
  beforeEach(() => invoke.mockReset());

  it("cancel tells Rust to stop the same request it started", () => {
    invoke.mockResolvedValue(undefined);
    const { cancel } = ollamaGenerate("llama3", "hi", () => {});
    cancel();

    expect(invoke).toHaveBeenCalledTimes(2);
    const [generateCommand, generateArgs] = invoke.mock.calls[0] as [string, { requestId: string }];
    const [cancelCommand, cancelArgs] = invoke.mock.calls[1] as [string, { requestId: string }];
    expect(generateCommand).toBe("ollama_generate");
    expect(cancelCommand).toBe("ai_cancel_generate");
    expect(cancelArgs.requestId).toBe(generateArgs.requestId);
  });

  it("openaiGenerate cancels with its own distinct request id", () => {
    invoke.mockResolvedValue(undefined);
    const first = ollamaGenerate("llama3", "hi", () => {});
    const second = openaiGenerate("http://localhost:1234", "", "gpt", "hi", () => {});
    first.cancel();
    second.cancel();

    const firstRequestId = (invoke.mock.calls[0][1] as { requestId: string }).requestId;
    const secondRequestId = (invoke.mock.calls[1][1] as { requestId: string }).requestId;
    expect(firstRequestId).not.toBe(secondRequestId);
  });

  it("cancel is idempotent - a second call does not re-invoke the cancel command", () => {
    invoke.mockResolvedValue(undefined);
    const { cancel } = ollamaGenerate("llama3", "hi", () => {});
    cancel();
    cancel();

    const cancelCalls = invoke.mock.calls.filter(([command]) => command === "ai_cancel_generate");
    expect(cancelCalls).toHaveLength(1);
  });

  it("chunks delivered after cancel are not forwarded to the caller", () => {
    invoke.mockResolvedValue(undefined);
    const onChunk = vi.fn();
    const { cancel } = ollamaGenerate("llama3", "hi", onChunk);
    cancel();

    const channel = invoke.mock.calls[0][1].onEvent as FakeChannel<{ type: string }>;
    channel.onmessage?.({ type: "token" });

    expect(onChunk).not.toHaveBeenCalled();
  });
});
