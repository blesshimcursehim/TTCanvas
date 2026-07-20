// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect } from "vitest";
import {
  hashContent,
  dedupe,
  parseImportFile,
  exportCollection,
  buildBundle,
  readBundle,
  BUNDLE_VERSION,
} from "./importExport";

describe("hashContent", () => {
  it("is stable regardless of key order", () => {
    const a = { name: "Bob", race: "Human", occupation: "Guard" };
    const b = { occupation: "Guard", name: "Bob", race: "Human" };
    expect(hashContent(a)).toBe(hashContent(b));
  });

  it("is deterministic across repeated calls", () => {
    const value = { name: "Bob", tags: ["a", "b"] };
    expect(hashContent(value)).toBe(hashContent(value));
  });

  it("differs for different content", () => {
    expect(hashContent({ name: "Bob" })).not.toBe(hashContent({ name: "Alice" }));
  });

  it("distinguishes nested object content", () => {
    const a = { stats: { hp: 10, ac: 15 } };
    const b = { stats: { hp: 10, ac: 16 } };
    expect(hashContent(a)).not.toBe(hashContent(b));
  });

  it("hashes arrays positionally", () => {
    expect(hashContent({ tags: ["a", "b"] })).not.toBe(hashContent({ tags: ["b", "a"] }));
  });
});

interface TestItem { id: string; name: string; notes: string; }

function contentKeyOf(item: TestItem): string {
  const { id: _id, ...rest } = item;
  return hashContent(rest);
}

describe("dedupe", () => {
  const existing: TestItem[] = [
    { id: "1", name: "Bob", notes: "a guard" },
    { id: "2", name: "Alice", notes: "a merchant" },
  ];

  it("flags an id match as an id conflict", () => {
    const incoming: TestItem[] = [{ id: "1", name: "Bob (edited)", notes: "still a guard" }];
    const result = dedupe(incoming, existing, { idOf: (i) => i.id, contentKeyOf });
    expect(result.idConflicts).toEqual(incoming);
    expect(result.contentDuplicates).toEqual([]);
    expect(result.clean).toEqual([]);
  });

  it("flags identical content under a different id as a content duplicate", () => {
    const incoming: TestItem[] = [{ id: "different-id", name: "Bob", notes: "a guard" }];
    const result = dedupe(incoming, existing, { idOf: (i) => i.id, contentKeyOf });
    expect(result.idConflicts).toEqual([]);
    expect(result.contentDuplicates).toEqual(incoming);
    expect(result.clean).toEqual([]);
  });

  it("treats a genuinely new item as clean", () => {
    const incoming: TestItem[] = [{ id: "3", name: "Carol", notes: "a blacksmith" }];
    const result = dedupe(incoming, existing, { idOf: (i) => i.id, contentKeyOf });
    expect(result.idConflicts).toEqual([]);
    expect(result.contentDuplicates).toEqual([]);
    expect(result.clean).toEqual(incoming);
  });

  it("prefers id conflict over content duplicate when both would match", () => {
    const incoming: TestItem[] = [{ id: "1", name: "Bob", notes: "a guard" }];
    const result = dedupe(incoming, existing, { idOf: (i) => i.id, contentKeyOf });
    expect(result.idConflicts).toEqual(incoming);
    expect(result.contentDuplicates).toEqual([]);
  });

  it("sorts a mixed batch into the right buckets", () => {
    const incoming: TestItem[] = [
      { id: "1", name: "Bob (edited)", notes: "still a guard" },      // id conflict
      { id: "different-id", name: "Alice", notes: "a merchant" },     // content dup
      { id: "3", name: "Carol", notes: "a blacksmith" },              // clean
    ];
    const result = dedupe(incoming, existing, { idOf: (i) => i.id, contentKeyOf });
    expect(result.idConflicts.map((i) => i.id)).toEqual(["1"]);
    expect(result.contentDuplicates.map((i) => i.id)).toEqual(["different-id"]);
    expect(result.clean.map((i) => i.id)).toEqual(["3"]);
  });

  it("only keeps one of two incoming items sharing an id (intra-batch)", () => {
    const incoming: TestItem[] = [
      { id: "dup", name: "Carol", notes: "a blacksmith" },
      { id: "dup", name: "Dave", notes: "a farrier" },
    ];
    const result = dedupe(incoming, existing, { idOf: (i) => i.id, contentKeyOf });
    // First is clean; the second is caught as an id conflict, not added again.
    expect(result.clean.map((i) => i.name)).toEqual(["Carol"]);
    expect(result.idConflicts.map((i) => i.name)).toEqual(["Dave"]);
  });

  it("only keeps one of two incoming items with identical content (intra-batch)", () => {
    const incoming: TestItem[] = [
      { id: "a", name: "Eve", notes: "a scout" },
      { id: "b", name: "Eve", notes: "a scout" },
    ];
    const result = dedupe(incoming, existing, { idOf: (i) => i.id, contentKeyOf });
    expect(result.clean.map((i) => i.id)).toEqual(["a"]);
    expect(result.contentDuplicates.map((i) => i.id)).toEqual(["b"]);
  });
});

describe("parseImportFile", () => {
  it("returns the validated payload for valid JSON", () => {
    const result = parseImportFile("{\"n\":1}", (p) => (p as { n: number }).n);
    expect(result).toBe(1);
  });

  it("returns null for invalid JSON", () => {
    const result = parseImportFile("not json {{", () => "unreachable");
    expect(result).toBeNull();
  });

  it("returns null when the validator rejects the payload", () => {
    const result = parseImportFile("{\"bad\":true}", () => null);
    expect(result).toBeNull();
  });

  it("returns null when the validator throws", () => {
    const result = parseImportFile("{}", () => { throw new Error("nope"); });
    expect(result).toBeNull();
  });
});

describe("exportCollection", () => {
  it("serializes the payload and forwards it to the save function", async () => {
    let seenContent = "";
    let seenName = "";
    const saveTextFile = async (content: string, defaultName: string) => {
      seenContent = content;
      seenName = defaultName;
      return true;
    };
    const ok = await exportCollection(saveTextFile, { a: 1 }, "out.json");
    expect(ok).toBe(true);
    expect(seenName).toBe("out.json");
    expect(JSON.parse(seenContent)).toEqual({ a: 1 });
  });

  it("propagates a cancelled save (false)", async () => {
    const ok = await exportCollection(async () => false, {}, "out.json");
    expect(ok).toBe(false);
  });
});

describe("buildBundle / readBundle", () => {
  const validate = (parsed: unknown): { items: number[] } | null => {
    const items = (parsed as { items?: unknown }).items;
    return Array.isArray(items) ? { items: items as number[] } : null;
  };

  it("round-trips a bundle through build -> JSON -> read", () => {
    const bundle = buildBundle("ttcanvas-test", { items: [1, 2, 3] });
    expect(bundle).toEqual({ type: "ttcanvas-test", version: BUNDLE_VERSION, items: [1, 2, 3] });
    const read = readBundle(JSON.stringify(bundle), "ttcanvas-test", validate);
    expect(read).toEqual({ items: [1, 2, 3] });
  });

  it("rejects a bundle whose type is present but wrong", () => {
    const text = JSON.stringify(buildBundle("ttcanvas-other", { items: [1] }));
    expect(readBundle(text, "ttcanvas-test", validate)).toBeNull();
  });

  it("accepts a bundle with no type for back-compat with older exports", () => {
    const text = JSON.stringify({ version: 1, items: [9] });
    expect(readBundle(text, "ttcanvas-test", validate)).toEqual({ items: [9] });
  });

  it("returns null for malformed JSON or a failing validator", () => {
    expect(readBundle("not json", "ttcanvas-test", validate)).toBeNull();
    const rightType = JSON.stringify(buildBundle("ttcanvas-test", { nope: true }));
    expect(readBundle(rightType, "ttcanvas-test", validate)).toBeNull();
  });
});
