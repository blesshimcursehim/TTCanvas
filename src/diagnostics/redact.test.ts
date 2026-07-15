// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect } from "vitest";
import { redact } from "./redact";

describe("redact", () => {
  it("strips OpenAI-style keys", () => {
    const out = redact("calling with sk-proj-ABCdef0123456789ghijkl now");
    expect(out).not.toContain("sk-proj-ABCdef0123456789ghijkl");
    expect(out).toContain("<redacted-key>");
  });

  it("strips bearer tokens", () => {
    const out = redact("Authorization: Bearer abc123def456ghi789");
    expect(out).not.toContain("abc123def456ghi789");
    expect(out).toContain("Bearer <redacted-key>");
  });

  it("strips apiKey/token/password assignments in any quoting", () => {
    expect(redact('"apiKey": "supersecretvalue"')).toBe('"apiKey": "<redacted>"');
    expect(redact("api_key=supersecretvalue")).toBe("api_key=<redacted>");
    expect(redact('"password":"hunter2"')).toBe('"password":"<redacted>"');
  });

  it("removes the username from a unix home path but keeps the structure", () => {
    const out = redact("failed to open /home/yonas/Vaults/Campaign/notes.md");
    expect(out).toBe("failed to open /home/<user>/Vaults/Campaign/notes.md");
    expect(out).not.toContain("yonas");
  });

  it("removes the username from a macOS and Windows path", () => {
    expect(redact("/Users/yonas/vault")).toBe("/Users/<user>/vault");
    expect(redact("C:\\Users\\Yonas\\vault")).toBe("C:\\Users\\<user>\\vault");
  });

  it("leaves benign text untouched", () => {
    const text = "Widget \"Map Display\" crashed while rendering layer 3";
    expect(redact(text)).toBe(text);
  });

  it("does not redact short words after an assignment keyword", () => {
    expect(redact("parse error: unexpected token = in expression")).toBe(
      "parse error: unexpected token = in expression",
    );
  });

  it("strips a literal known secret regardless of shape", () => {
    const key = "my-custom-provider-key-987zzz";
    const out = redact(`request failed with ${key} attached`, [key]);
    expect(out).not.toContain(key);
    expect(out).toContain("<redacted>");
  });

  it("ignores too-short extra secrets to avoid mangling the report", () => {
    expect(redact("the cat sat", ["cat"])).toBe("the cat sat");
  });
});
