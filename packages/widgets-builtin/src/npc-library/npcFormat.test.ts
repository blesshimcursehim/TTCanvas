// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect } from "vitest";
import {
  parseNpcJson,
  serializeNpcJson,
  parseLegacyMd,
  nameToFilename,
  mdFilenameToJson,
  slugFromFilename,
  autoAccentColor,
  npcInitials,
} from "./npcFormat";

describe("parseNpcJson", () => {
  it("parses a valid NPC JSON string", () => {
    const raw = JSON.stringify({ id: "1", name: "Bob", race: "Human", occupation: "Guard" });
    const npc = parseNpcJson("npcs/bob.json", raw);
    expect(npc.name).toBe("Bob");
    expect(npc.filename).toBe("npcs/bob.json");
    expect(npc.race).toBe("Human");
  });

  it("returns a blank NPC for invalid JSON", () => {
    const npc = parseNpcJson("npcs/broken.json", "not json {{ at all");
    expect(npc.filename).toBe("npcs/broken.json");
    expect(typeof npc.name).toBe("string");
    expect(npc.name.length).toBeGreaterThan(0);
  });

  it("returns a blank NPC for an empty string", () => {
    const npc = parseNpcJson("npcs/empty.json", "");
    expect(npc.filename).toBe("npcs/empty.json");
  });

  it("migrates legacy faction field to customFields", () => {
    const raw = JSON.stringify({ id: "1", name: "Bob", race: "Human", occupation: "Guard", faction: "Thieves Guild" });
    const npc = parseNpcJson("npcs/bob.json", raw);
    expect(npc.customFields).toEqual([{ label: "Faction", value: "Thieves Guild" }]);
    expect((npc as unknown as Record<string, unknown>)["faction"]).toBeUndefined();
  });

  it("migrates intermediate customLabel/customValue to customFields", () => {
    const raw = JSON.stringify({ id: "1", name: "Bob", race: "Human", occupation: "Guard", customLabel: "Rank", customValue: "Captain" });
    const npc = parseNpcJson("npcs/bob.json", raw);
    expect(npc.customFields).toEqual([{ label: "Rank", value: "Captain" }]);
    expect((npc as unknown as Record<string, unknown>)["customLabel"]).toBeUndefined();
    expect((npc as unknown as Record<string, unknown>)["customValue"]).toBeUndefined();
  });

  it("uses default label 'Faction' if customLabel is missing in migration", () => {
    const raw = JSON.stringify({ id: "1", name: "Bob", race: "Human", occupation: "Guard", customValue: "Captain" });
    const npc = parseNpcJson("npcs/bob.json", raw);
    expect(npc.customFields?.[0].label).toBe("Faction");
  });

  it("does not overwrite existing customFields when faction is also present", () => {
    const raw = JSON.stringify({ id: "1", name: "Bob", race: "Human", occupation: "Guard", faction: "Guild", customFields: [{ label: "Rank", value: "Spy" }] });
    const npc = parseNpcJson("npcs/bob.json", raw);
    expect(npc.customFields).toEqual([{ label: "Rank", value: "Spy" }]);
  });
});

describe("serializeNpcJson", () => {
  it("produces valid JSON", () => {
    const npc = { filename: "npcs/bob.json", id: "1", name: "Bob", race: "Human", occupation: "Guard" };
    const json = serializeNpcJson(npc);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("strips the filename field from serialized output", () => {
    const npc = { filename: "npcs/bob.json", id: "1", name: "Bob", race: "Human", occupation: "Guard" };
    const parsed = JSON.parse(serializeNpcJson(npc));
    expect(parsed.filename).toBeUndefined();
    expect(parsed.name).toBe("Bob");
  });
});

describe("parseLegacyMd", () => {
  it("parses YAML frontmatter correctly", () => {
    const content = `---\nname: Gornak\nrace: Orc\nrole: Warrior\n---\nA fierce orc warrior.`;
    const npc = parseLegacyMd("npcs/gornak.md", content);
    expect(npc.name).toBe("Gornak");
    expect(npc.race).toBe("Orc");
    expect(npc.occupation).toBe("Warrior");
    expect(npc.notes).toBe("A fierce orc warrior.");
  });

  it("derives name from filename when no name field is present", () => {
    const content = `---\nrace: Elf\n---\n`;
    const npc = parseLegacyMd("npcs/elven-scout.md", content);
    expect(npc.name).toBe("Elven Scout");
  });

  it("handles content with no frontmatter", () => {
    const npc = parseLegacyMd("npcs/wanderer.md", "Just some notes.");
    expect(npc.notes).toBe("Just some notes.");
  });

  it("converts to json filename", () => {
    const npc = parseLegacyMd("npcs/guard.md", "");
    expect(npc.filename).toBe("npcs/guard.json");
  });
});

describe("nameToFilename", () => {
  it("slugifies a name to a vault-relative path", () => {
    expect(nameToFilename("Gornak the Orc")).toBe("npcs/gornak-the-orc.json");
  });

  it("handles names with special characters", () => {
    const result = nameToFilename("Bob's Inn");
    expect(result).toMatch(/^npcs\/.+\.json$/);
    expect(result).not.toContain("'");
  });

  it("handles an empty name without crashing", () => {
    const result = nameToFilename("");
    expect(result).toMatch(/^npcs\/.+\.json$/);
  });
});

describe("mdFilenameToJson", () => {
  it("replaces .md extension with .json", () => {
    expect(mdFilenameToJson("npcs/guard.md")).toBe("npcs/guard.json");
  });

  it("does not modify filenames without .md extension", () => {
    expect(mdFilenameToJson("npcs/guard.json")).toBe("npcs/guard.json");
  });
});

describe("slugFromFilename", () => {
  it("extracts slug from a .json filename", () => {
    expect(slugFromFilename("npcs/bob-the-guard.json")).toBe("bob-the-guard");
  });

  it("extracts slug from a .md filename", () => {
    expect(slugFromFilename("npcs/goblin.md")).toBe("goblin");
  });

  it("handles a plain string with no slashes", () => {
    const result = slugFromFilename("standalone");
    expect(typeof result).toBe("string");
  });
});

describe("autoAccentColor", () => {
  it("returns a valid oklch CSS string", () => {
    const color = autoAccentColor("Bob Smith");
    expect(color).toMatch(/^oklch\(/);
  });

  it("is deterministic for the same name", () => {
    expect(autoAccentColor("Gandalf")).toBe(autoAccentColor("Gandalf"));
  });

  it("produces different colors for different names", () => {
    const colors = ["Alice", "Bob", "Charlie", "Daenerys", "Elminster"].map(autoAccentColor);
    const unique = new Set(colors);
    expect(unique.size).toBeGreaterThan(1);
  });
});

describe("npcInitials", () => {
  it("returns first+last initial for a two-word name", () => {
    expect(npcInitials("Bob Smith")).toBe("BS");
  });

  it("returns first two letters for a single-word name", () => {
    expect(npcInitials("Gandalf")).toBe("GA");
  });

  it("uses first and last word for multi-word names", () => {
    expect(npcInitials("Bilbo Baggins of the Shire")).toBe("BS");
  });

  it("returns '?' for an empty string", () => {
    expect(npcInitials("")).toBe("?");
  });

  it("is uppercase", () => {
    const result = npcInitials("alice bob");
    expect(result).toBe(result.toUpperCase());
  });
});
