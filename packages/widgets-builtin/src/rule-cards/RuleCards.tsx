// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useState } from "react";
import { useVault } from "@ttcanvas/core";
import type { RuleCard, RuleCardsState } from "./types";
import { renderMarkdown } from "../shared/markdownRenderer";
import { ImportConflictDialog } from "../shared/ImportConflictDialog";
import { dedupe, hashContent, readBundle, buildBundle, exportCollection, type DedupeResult } from "../shared/importExport";
import { CollectionIO } from "../shared/CollectionIO";
import styles from "./RuleCards.module.css";

interface Props {
  state: RuleCardsState;
  onChange: (state: RuleCardsState) => void;
}

const EMPTY_ADD = { title: "", category: "" };

function cardContentKey(card: RuleCard): string {
  const { id: _id, ...rest } = card;
  return hashContent(rest);
}

function validateRuleCardsBundle(parsed: unknown): RuleCard[] | null {
  if (!parsed || typeof parsed !== "object") return null;
  const bundle = parsed as Record<string, unknown>;
  if (bundle.type !== "ttcanvas-rule-cards" || !Array.isArray(bundle.cards)) return null;
  // Normalise every field, not just id/title - an incoming category/body that isn't a string
  // would otherwise reach groupByCategory's unconditional `.trim()` and crash the render.
  return bundle.cards.flatMap((c: unknown): RuleCard[] => {
    if (!c || typeof c !== "object") return [];
    const card = c as Record<string, unknown>;
    if (typeof card.id !== "string" || typeof card.title !== "string" || !card.title.trim()) return [];
    return [{
      id: card.id,
      title: card.title,
      category: typeof card.category === "string" ? card.category : "",
      body: typeof card.body === "string" ? card.body : "",
    }];
  });
}

function groupByCategory(cards: RuleCard[]): Array<{ category: string; cards: RuleCard[] }> {
  // Keyed case-insensitively so "Combat" and "combat" don't split into separate groups -
  // search already matches both case-insensitively, so grouping should agree with it.
  const map = new Map<string, { label: string; cards: RuleCard[] }>();
  for (const c of cards) {
    const trimmed = c.category.trim();
    const key = trimmed.toLowerCase();
    if (!map.has(key)) map.set(key, { label: trimmed || "Uncategorized", cards: [] });
    map.get(key)!.cards.push(c);
  }
  return [...map.values()]
    .sort((a, b) => a.label.localeCompare(b.label))
    .map(({ label, cards: list }) => ({ category: label, cards: [...list].sort((a, b) => a.title.localeCompare(b.title)) }));
}

export function RuleCards({ state, onChange }: Props) {
  const vault = useVault();
  const { cards, selectedId, query } = state;

  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_ADD);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<RuleCard | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<DedupeResult<RuleCard> | null>(null);

  const selectedCard = cards.find((c) => c.id === selectedId) ?? null;
  const displayCard = editing && draft ? draft : selectedCard;

  const q = query.trim().toLowerCase();
  const filtered = q
    ? cards.filter((c) => c.title.toLowerCase().includes(q) || c.category.toLowerCase().includes(q) || c.body.toLowerCase().includes(q))
    : cards;
  const grouped = groupByCategory(filtered);

  function selectCard(id: string) {
    onChange({ ...state, selectedId: id });
    setEditing(false);
    setDraft(null);
    setAdding(false);
  }

  function handleAdd() {
    const title = addForm.title.trim();
    if (!title) return;
    const card: RuleCard = { id: crypto.randomUUID(), title, category: addForm.category.trim(), body: "" };
    onChange({ ...state, cards: [...cards, card], selectedId: card.id });
    setAdding(false);
    setAddForm(EMPTY_ADD);
  }

  function saveCard(card: RuleCard) {
    onChange({ ...state, cards: cards.map((c) => (c.id === card.id ? card : c)) });
  }

  function handleEditToggle() {
    if (editing) {
      if (draft) saveCard(draft);
      setEditing(false);
      setDraft(null);
    } else if (selectedCard) {
      setDraft({ ...selectedCard });
      setEditing(true);
    }
  }

  function patchDraft(p: Partial<RuleCard>) {
    setDraft((d) => (d ? { ...d, ...p } : d));
  }

  function handleDelete() {
    if (!selectedCard) return;
    const remaining = cards.filter((c) => c.id !== selectedCard.id);
    onChange({ ...state, cards: remaining, selectedId: remaining[0]?.id ?? null });
    setEditing(false);
    setDraft(null);
  }

  async function handleExportOne(card: RuleCard) {
    const bundle = buildBundle("ttcanvas-rule-cards", { cards: [card] });
    await exportCollection(vault.saveTextFile, bundle, `${card.title.replace(/[^a-z0-9]/gi, "_")}.rule-cards.json`);
  }

  async function handleExportAll() {
    const bundle = buildBundle("ttcanvas-rule-cards", { cards });
    await exportCollection(vault.saveTextFile, bundle, "rule-cards.rule-cards.json");
  }

  async function handleImportFile(file: File) {
    setImportError(null);
    let text: string;
    try {
      text = await file.text();
    } catch {
      setImportError("Failed to read import file.");
      return;
    }
    const incoming = readBundle(text, "ttcanvas-rule-cards", validateRuleCardsBundle);
    if (!incoming) {
      setImportError("Not a valid Rule Cards file.");
      return;
    }
    const result = dedupe(incoming, cards, { idOf: (c) => c.id, contentKeyOf: cardContentKey });
    if (result.idConflicts.length > 0 || result.contentDuplicates.length > 0) {
      setPendingImport(result);
    } else {
      applyImport(result, "skip");
    }
  }

  function applyImport(result: DedupeResult<RuleCard>, conflictMode: "skip" | "replace") {
    setPendingImport(null);
    // Drop any in-progress edit - if it was editing a card that import is about to
    // replace, saving the stale draft afterward would silently undo the import.
    setEditing(false);
    setDraft(null);
    let nextCards = cards;
    if (conflictMode === "replace") {
      const byId = new Map(result.idConflicts.map((c) => [c.id, c]));
      nextCards = nextCards.map((c) => byId.get(c.id) ?? c);
    }
    onChange({ ...state, cards: [...nextCards, ...result.clean] });
  }

  return (
    <div className={styles.root}>
      {/* ── Left: list pane ─────────────────────── */}
      <div className={styles.left}>
        <div className={styles.searchRow}>
          <input
            className={styles.search}
            placeholder="Search cards…"
            value={query}
            onChange={(e) => onChange({ ...state, query: e.target.value })}
          />
          <button className={styles.addIconBtn} onClick={() => { setAdding(true); setAddForm(EMPTY_ADD); }} title="Add rule card">+</button>
        </div>

        <div className={styles.listScroll}>
          {grouped.length === 0 && (
            <div className={styles.emptyList}>
              {cards.length === 0 ? "No rule cards yet. Hit + to add." : "No matches."}
            </div>
          )}
          {grouped.map(({ category, cards: group }) => (
            <div key={category} className={styles.categoryGroup}>
              <div className={styles.categoryHead}>{category}</div>
              {group.map((card) => (
                <div
                  key={card.id}
                  className={`${styles.listRow} ${card.id === selectedId ? styles.listRowActive : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => selectCard(card.id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") selectCard(card.id); }}
                >
                  <span className={styles.listTitle}>{card.title}</span>
                </div>
              ))}
            </div>
          ))}
        </div>

        {importError && (
          <div className={styles.importError} onClick={() => setImportError(null)}>{importError}</div>
        )}
        <div className={styles.listFooter}>
          <span>{cards.length} card{cards.length !== 1 ? "s" : ""}</span>
          <CollectionIO onImportFile={handleImportFile} onExportAll={handleExportAll} exportDisabled={cards.length === 0} />
        </div>
      </div>

      {/* ── Right: detail / add pane ────────────── */}
      <div className={styles.right}>
        {adding ? (
          <div className={styles.addForm}>
            <div className={styles.addFormTitle}>New Rule Card</div>
            <label className={styles.addLabel}>Title
              <input className={styles.addInput} value={addForm.title} autoFocus onChange={(e) => setAddForm((f) => ({ ...f, title: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }} />
            </label>
            <label className={styles.addLabel}>Category
              <input className={styles.addInput} value={addForm.category} placeholder="e.g. Combat" onChange={(e) => setAddForm((f) => ({ ...f, category: e.target.value }))} />
            </label>
            <div className={styles.addActions}>
              <button className={styles.cancelBtn} onClick={() => setAdding(false)}>Cancel</button>
              <button className={styles.saveBtn} onClick={handleAdd} disabled={!addForm.title.trim()}>Create</button>
            </div>
          </div>
        ) : displayCard ? (
          <div className={styles.detail}>
            <div className={styles.detailHeader}>
              {editing ? (
                <div className={styles.detailHeaderEdit}>
                  <input className={styles.titleInput} value={draft?.title ?? ""} placeholder="Title" onChange={(e) => patchDraft({ title: e.target.value })} />
                  <input className={styles.categoryInput} value={draft?.category ?? ""} placeholder="Category" onChange={(e) => patchDraft({ category: e.target.value })} />
                </div>
              ) : (
                <div className={styles.detailHeaderText}>
                  <span className={styles.detailTitle}>{displayCard.title}</span>
                  <span className={styles.detailCategory}>{displayCard.category || "Uncategorized"}</span>
                </div>
              )}
              <div className={styles.detailActions}>
                <button className={styles.sheetBtn} onClick={() => handleExportOne(displayCard)} title="Export this card">↓</button>
                <button
                  className={`${styles.editBtn} ${editing ? styles.editBtnActive : ""}`}
                  onClick={handleEditToggle}
                >
                  {editing ? "Done" : "Edit"}
                </button>
              </div>
            </div>

            {editing ? (
              <textarea
                className={styles.bodyTextarea}
                rows={14}
                value={draft?.body ?? ""}
                placeholder="Card body (Markdown supported - tables work too)"
                onChange={(e) => patchDraft({ body: e.target.value })}
              />
            ) : displayCard.body ? (
              <div className={styles.prose} dangerouslySetInnerHTML={{ __html: renderMarkdown(displayCard.body) }} />
            ) : (
              <p className={styles.empty}>No content yet. Hit Edit to write this card.</p>
            )}

            <div className={styles.detailFooter}>
              <button className={styles.removeBtn} onClick={handleDelete}>🗑 Remove</button>
            </div>
          </div>
        ) : (
          <div className={styles.emptyDetail}>Select a card or hit + to add.</div>
        )}
      </div>

      {/* Import conflict dialog */}
      {pendingImport && (
        <ImportConflictDialog
          title="Import Rule Cards"
          noun="rule card"
          totalCount={pendingImport.idConflicts.length + pendingImport.contentDuplicates.length + pendingImport.clean.length}
          idConflicts={pendingImport.idConflicts.map((c) => ({ id: c.id, label: c.title }))}
          contentDuplicates={pendingImport.contentDuplicates.map((c) => ({ id: c.id, label: c.title }))}
          onCancel={() => setPendingImport(null)}
          onSkip={() => applyImport(pendingImport, "skip")}
          onReplace={() => applyImport(pendingImport, "replace")}
        />
      )}
    </div>
  );
}
