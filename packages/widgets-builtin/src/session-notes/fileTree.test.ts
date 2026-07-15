// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect } from "vitest";
import { buildFileTree } from "./FileTree";

describe("buildFileTree", () => {
  it("returns empty array for empty input", () => {
    expect(buildFileTree([])).toEqual([]);
  });

  it("root-level file appears at depth 0 with no folder wrapper", () => {
    const result = buildFileTree(["session.md"]);
    expect(result).toHaveLength(1);
    expect(result[0].isFolder).toBe(false);
    expect(result[0].name).toBe("session.md");
    expect(result[0].path).toBe("session.md");
    expect(result[0].children).toHaveLength(0);
  });

  it("nested file creates folder nodes correctly", () => {
    const result = buildFileTree(["sessions/arc1/session-001.md"]);
    expect(result).toHaveLength(1);
    const sessions = result[0];
    expect(sessions.isFolder).toBe(true);
    expect(sessions.name).toBe("sessions");
    const arc1 = sessions.children[0];
    expect(arc1.isFolder).toBe(true);
    expect(arc1.name).toBe("arc1");
    const file = arc1.children[0];
    expect(file.isFolder).toBe(false);
    expect(file.name).toBe("session-001.md");
    expect(file.path).toBe("sessions/arc1/session-001.md");
  });

  it("filters out .ttcanvas/ paths", () => {
    const result = buildFileTree([".ttcanvas/workspace.json", "session.md"]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("session.md");
  });

  it("folders sorted before files, both alphabetical", () => {
    const result = buildFileTree([
      "session.md",
      "npcs/goblin.md",
      "aardvark.md",
      "sessions/001.md",
    ]);
    expect(result[0].isFolder).toBe(true);
    expect(result[1].isFolder).toBe(true);
    expect(result[2].isFolder).toBe(false);
    expect(result[3].isFolder).toBe(false);
    expect(result[0].name).toBe("npcs");
    expect(result[1].name).toBe("sessions");
    expect(result[2].name).toBe("aardvark.md");
    expect(result[3].name).toBe("session.md");
  });

  it("normalizes Windows backslash paths", () => {
    const result = buildFileTree(["sessions\\arc1\\session-001.md"]);
    expect(result[0].isFolder).toBe(true);
    expect(result[0].name).toBe("sessions");
    expect(result[0].children[0].name).toBe("arc1");
    expect(result[0].children[0].children[0].path).toBe("sessions/arc1/session-001.md");
  });

  it("multiple files in same folder share one folder node", () => {
    const result = buildFileTree(["sessions/001.md", "sessions/002.md"]);
    expect(result).toHaveLength(1);
    expect(result[0].children).toHaveLength(2);
  });
});
