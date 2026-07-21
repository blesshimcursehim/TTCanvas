// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useEffect, useRef, useState } from "react";
import { useVault, logError } from "@ttcanvas/core";
import type { CardDecksState, Deck, DeckCard, DeckDrawState } from "./types";
import {
  cardByKey,
  deckSize,
  draw,
  freshDrawState,
  reconcileDrawState,
  reshuffleDiscards,
  shuffle,
} from "./deck";
import { ConfirmDeleteButton } from "../shared/ConfirmDeleteButton";
import { ImportConflictDialog } from "../shared/ImportConflictDialog";
import { ModeToggle } from "../shared/ModeToggle";
import { RouteResultButton } from "../shared/RouteResultButton";
import { dedupe, hashContent, readBundle, buildBundle, exportCollection, type DedupeResult } from "../shared/importExport";
import { CollectionIO } from "../shared/CollectionIO";
import { WidgetSettingsCog } from "../shared/WidgetSettingsCog";
import { mimeForImageExt } from "../shared/mime";
import styles from "./CardDecks.module.css";

interface Props {
  state: CardDecksState;
  onChange: (state: CardDecksState) => void;
}

function deckContentKey(d: Deck): string {
  const { id: _id, ...rest } = d;
  return hashContent(rest);
}

function newCard(): DeckCard {
  return { id: crypto.randomUUID(), title: "", count: 1 };
}

function validateCardDecksBundle(parsed: unknown): Deck[] | null {
  if (!parsed || typeof parsed !== "object") return null;
  const bundle = parsed as Record<string, unknown>;
  if (bundle.type !== "ttcanvas-card-decks" || !Array.isArray(bundle.decks)) return null;
  return bundle.decks.flatMap((d: unknown): Deck[] => {
    if (!d || typeof d !== "object") return [];
    const deck = d as Record<string, unknown>;
    if (typeof deck.id !== "string" || typeof deck.name !== "string" || !deck.name.trim()) return [];
    const rawCards = Array.isArray(deck.cards) ? deck.cards : [];
    const cards = rawCards.flatMap((c: unknown): DeckCard[] => {
      if (!c || typeof c !== "object") return [];
      const card = c as Record<string, unknown>;
      if (typeof card.id !== "string") return [];
      const count = typeof card.count === "number" && card.count >= 1 ? Math.floor(card.count) : 1;
      return [{
        id: card.id,
        title: typeof card.title === "string" ? card.title : "",
        count,
        detail: typeof card.detail === "string" && card.detail ? card.detail : undefined,
        imagePath: typeof card.imagePath === "string" && card.imagePath ? card.imagePath : undefined,
      }];
    });
    return [{
      id: deck.id,
      name: deck.name,
      description: typeof deck.description === "string" && deck.description ? deck.description : undefined,
      cards,
    }];
  });
}

export function CardDecks({ state, onChange }: Props) {
  const vault = useVault();
  const { decks, selectedId, mode } = state;

  const [adding, setAdding] = useState(false);
  const [addName, setAddName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<DedupeResult<Deck> | null>(null);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [confirmDeleteDeck, setConfirmDeleteDeck] = useState(false);
  const [query, setQuery] = useState("");
  // Resolved card art, keyed by vault-relative imagePath -> data URL (like Party/NPC portraits).
  const [art, setArt] = useState<Record<string, string>>({});
  const rowRefs = useRef(new Map<string, HTMLInputElement>());

  const selected = decks.find((d) => d.id === selectedId) ?? null;

  // Load any of the selected deck's card art that we don't already have a data URL for.
  const imagePathsKey = (selected?.cards ?? []).map((c) => c.imagePath ?? "").join("|");
  useEffect(() => {
    if (!vault.vaultPath || !selected) return;
    const paths = [...new Set(selected.cards.flatMap((c) => (c.imagePath ? [c.imagePath] : [])))];
    if (paths.length === 0) return;
    let cancelled = false;
    void (async () => {
      const loaded: Record<string, string> = {};
      for (const p of paths) {
        const fileName = p.split("/").pop();
        if (!fileName) continue;
        try {
          const b64 = await vault.readFileBase64(`${vault.vaultPath}/portraits`, fileName);
          loaded[p] = `data:${mimeForImageExt(fileName)};base64,${b64}`;
        } catch {
          // File missing (e.g. imported pack without art) - skip; the card just shows text.
          // Deliberately unlogged: an art-less imported pack is normal, not a fault.
        }
      }
      if (!cancelled && Object.keys(loaded).length > 0) setArt((prev) => ({ ...prev, ...loaded }));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, imagePathsKey, vault.vaultPath]);

  // ── Deck CRUD ─────────────────────────────────────────────
  function patchDecks(next: Deck[]) {
    onChange({ ...state, decks: next });
  }
  function updateDeck(id: string, patch: Partial<Deck>) {
    patchDecks(decks.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }
  function setDrawState(deckId: string, ds: DeckDrawState) {
    onChange({ ...state, draw: { ...state.draw, [deckId]: ds } });
  }

  function selectDeck(id: string) {
    onChange({ ...state, selectedId: id });
    setAdding(false);
    setRenaming(false);
    setExpandedCardId(null);
    setConfirmDeleteDeck(false);
  }

  function handleAddDeck() {
    const name = addName.trim();
    if (!name) return;
    const deck: Deck = { id: crypto.randomUUID(), name, cards: [] };
    onChange({ ...state, decks: [...decks, deck], selectedId: deck.id, mode: "edit" });
    setAdding(false);
    setAddName("");
  }

  function handleDeleteDeck() {
    if (!selected) return;
    const remaining = decks.filter((d) => d.id !== selected.id);
    const { [selected.id]: _dropped, ...restDraw } = state.draw;
    onChange({ ...state, decks: remaining, selectedId: remaining[0]?.id ?? null, draw: restDraw });
    setRenaming(false);
    setConfirmDeleteDeck(false);
  }

  function commitRename() {
    if (selected && renameDraft.trim()) updateDeck(selected.id, { name: renameDraft.trim() });
    setRenaming(false);
  }

  function setMode(m: "play" | "edit") {
    onChange({ ...state, mode: m });
    setExpandedCardId(null);
  }

  // ── Card editing ──────────────────────────────────────────
  function addCard() {
    if (!selected) return;
    const card = newCard();
    updateDeck(selected.id, { cards: [...selected.cards, card] });
    requestAnimationFrame(() => rowRefs.current.get(card.id)?.focus());
  }
  function updateCard(cardId: string, patch: Partial<DeckCard>) {
    if (!selected) return;
    updateDeck(selected.id, { cards: selected.cards.map((c) => (c.id === cardId ? { ...c, ...patch } : c)) });
  }
  function deleteCard(cardId: string) {
    if (!selected) return;
    updateDeck(selected.id, { cards: selected.cards.filter((c) => c.id !== cardId) });
  }
  function moveCard(index: number, dir: -1 | 1) {
    if (!selected) return;
    const target = index + dir;
    if (target < 0 || target >= selected.cards.length) return;
    const next = [...selected.cards];
    [next[index], next[target]] = [next[target], next[index]];
    updateDeck(selected.id, { cards: next });
  }
  function onRowKeyDown(e: React.KeyboardEvent, index: number) {
    if (e.key !== "Enter" || !selected) return;
    e.preventDefault();
    if (index === selected.cards.length - 1) addCard();
    else rowRefs.current.get(selected.cards[index + 1].id)?.focus();
  }

  async function pickCardImage(cardId: string) {
    const src = await vault.pickImageFile();
    if (!src) return;
    const saved = await vault.savePortraitToVault(cardId, src);
    if (!saved) {
      setImportError("Open a vault first to add card art.");
      return;
    }
    updateCard(cardId, { imagePath: saved.portraitRelativePath });
  }

  // ── Drawing ───────────────────────────────────────────────
  function handleDraw() {
    if (!selected) return;
    // No persisted state yet means the deck is untouched - shuffle it for real on the first draw.
    const base = state.draw[selected.id]
      ? reconcileDrawState(selected, state.draw[selected.id])
      : freshDrawState(selected);
    if (base.drawPile.length === 0) return;
    setDrawState(selected.id, draw(base, 1).state);
  }
  function handleShuffle() {
    if (!selected) return;
    const persisted = state.draw[selected.id];
    // Shuffle only the undrawn pile - the discard stays spent. (Reshuffle discard is what reclaims it.)
    if (!persisted) { setDrawState(selected.id, freshDrawState(selected)); return; }
    const base = reconcileDrawState(selected, persisted);
    setDrawState(selected.id, { drawPile: shuffle(base.drawPile), discard: base.discard });
  }
  function handleReshuffle() {
    if (!selected) return;
    const base = state.draw[selected.id] ? reconcileDrawState(selected, state.draw[selected.id]) : freshDrawState(selected);
    setDrawState(selected.id, reshuffleDiscards(base));
  }

  // ── Import / export ───────────────────────────────────────
  async function handleExportOne(d: Deck) {
    const bundle = buildBundle("ttcanvas-card-decks", { decks: [d] });
    await exportCollection(vault.saveTextFile, bundle, `${d.name.replace(/[^a-z0-9]/gi, "_")}.card-decks.json`);
  }
  async function handleExportAll() {
    const bundle = buildBundle("ttcanvas-card-decks", { decks });
    await exportCollection(vault.saveTextFile, bundle, "card-decks.card-decks.json");
  }
  async function handleImportFile(file: File) {
    setImportError(null);
    let text: string;
    try {
      text = await file.text();
    } catch (err) {
      logError("Card Decks: could not read the import file", err);
      setImportError("Failed to read import file.");
      return;
    }
    const incoming = readBundle(text, "ttcanvas-card-decks", validateCardDecksBundle);
    if (!incoming) {
      setImportError("Not a valid Card Decks file.");
      return;
    }
    const result = dedupe(incoming, decks, { idOf: (d) => d.id, contentKeyOf: deckContentKey });
    if (result.idConflicts.length > 0 || result.contentDuplicates.length > 0) setPendingImport(result);
    else applyImport(result, "skip");
  }
  function applyImport(result: DedupeResult<Deck>, conflictMode: "skip" | "replace") {
    setPendingImport(null);
    let nextDecks = decks;
    if (conflictMode === "replace") {
      const byId = new Map(result.idConflicts.map((d) => [d.id, d]));
      nextDecks = nextDecks.map((d) => byId.get(d.id) ?? d);
    }
    onChange({ ...state, decks: [...nextDecks, ...result.clean] });
  }

  // ── Derived (display-only; reconcile is pure, never written from render) ──
  const persisted = selected ? state.draw[selected.id] : undefined;
  const viewDraw = selected && persisted ? reconcileDrawState(selected, persisted) : null;
  const total = selected ? deckSize(selected) : 0;
  const remaining = viewDraw ? viewDraw.drawPile.length : total;
  const discardPile = viewDraw ? viewDraw.discard : [];
  const lastKey = discardPile.length > 0 ? discardPile[discardPile.length - 1].key : null;
  const lastCard = selected && lastKey ? cardByKey(selected, lastKey) : null;
  const lastArt = lastCard?.imagePath ? art[lastCard.imagePath] : undefined;

  const q = query.trim().toLowerCase();
  const filtered = q
    ? decks.filter((d) => d.name.toLowerCase().includes(q) || (d.description ?? "").toLowerCase().includes(q))
    : decks;

  return (
    <div className={styles.root}>
      {/* ── Left: deck list ──────────────────────── */}
      <div className={styles.left}>
        <div className={styles.searchRow}>
          <input
            className={styles.search}
            placeholder="Search decks…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className={styles.addIconBtn} onClick={() => { setAdding(true); setAddName(""); }} title="New deck">+</button>
        </div>

        <div className={styles.listScroll}>
          {decks.length === 0 && <div className={styles.emptyList}>No decks yet. Hit + to add one.</div>}
          {decks.length > 0 && filtered.length === 0 && <div className={styles.emptyList}>No matches.</div>}
          {filtered.map((d) => (
            <div
              key={d.id}
              className={`${styles.listRow} ${d.id === selectedId ? styles.listRowActive : ""}`}
              role="button"
              tabIndex={0}
              onClick={() => selectDeck(d.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") selectDeck(d.id); }}
            >
              <span className={styles.listTitle}>{d.name}</span>
              <span className={styles.countBadge}>{deckSize(d)}</span>
            </div>
          ))}
        </div>

        <div className={styles.listFooter}>
          <span>{decks.length} deck{decks.length !== 1 ? "s" : ""}</span>
        </div>
        <WidgetSettingsCog>
          <CollectionIO onImportFile={handleImportFile} onExportAll={handleExportAll} exportDisabled={decks.length === 0} onError={setImportError} />
          {importError && <div className={styles.importError} onClick={() => setImportError(null)}>{importError}</div>}
        </WidgetSettingsCog>
      </div>

      {/* ── Right: detail / add pane ─────────────── */}
      <div className={styles.right}>
        {adding ? (
          <div className={styles.addForm}>
            <div className={styles.addFormTitle}>New Deck</div>
            <label className={styles.addLabel}>Name
              <input
                className={styles.addInput}
                value={addName}
                autoFocus
                placeholder="e.g. Deck of Many Things"
                onChange={(e) => setAddName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAddDeck(); }}
              />
            </label>
            <div className={styles.addActions}>
              <button className={styles.cancelBtn} onClick={() => setAdding(false)}>Cancel</button>
              <button className={styles.saveBtn} onClick={handleAddDeck} disabled={!addName.trim()}>Create</button>
            </div>
          </div>
        ) : selected ? (
          <div className={styles.detail}>
            <div className={styles.detailHeader}>
              <div className={styles.detailHeaderText}>
                {renaming ? (
                  <input
                    className={styles.titleInput}
                    value={renameDraft}
                    autoFocus
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenaming(false); }}
                    onBlur={commitRename}
                  />
                ) : (
                  <span
                    className={styles.detailTitle}
                    onDoubleClick={() => { setRenaming(true); setRenameDraft(selected.name); }}
                    title="Double-click to rename"
                  >{selected.name}</span>
                )}
                <span className={styles.detailSub}>{total} card{total !== 1 ? "s" : ""}</span>
              </div>
              <div className={styles.detailActions}>
                {!confirmDeleteDeck && (
                  <>
                    <ModeToggle
                      value={mode}
                      onChange={setMode}
                      options={[{ value: "play", label: "Play" }, { value: "edit", label: "Edit" }]}
                    />
                    <button className={styles.iconBtn} onClick={() => handleExportOne(selected)} title="Export this deck">↓</button>
                  </>
                )}
                <ConfirmDeleteButton
                  confirming={confirmDeleteDeck}
                  trigger="🗑"
                  triggerLabel="Delete deck"
                  confirmQuestion={`Delete "${selected.name}"?`}
                  confirmLabel="Yes, delete"
                  className={styles.iconBtn}
                  onRequestConfirm={() => setConfirmDeleteDeck(true)}
                  onConfirm={handleDeleteDeck}
                  onCancel={() => setConfirmDeleteDeck(false)}
                />
              </div>
            </div>

            {mode === "play" ? (
              <div className={styles.playView}>
                {selected.description?.trim() && <p className={styles.deckDescRead}>{selected.description}</p>}

                {/* Featured drawn card */}
                {lastCard ? (
                  <div className={styles.featured}>
                    {lastArt && <img src={lastArt} className={styles.featuredArt} alt="" draggable={false} />}
                    <div className={styles.featuredBody}>
                      <div className={styles.featuredTitleRow}>
                        <span className={styles.featuredTitle}>{lastCard.title || "(untitled card)"}</span>
                        <RouteResultButton title={lastCard.title} body={lastCard.detail ?? lastCard.title} imgSrc={lastArt} />
                      </div>
                      {lastCard.detail?.trim() && <p className={styles.featuredDetail}>{lastCard.detail}</p>}
                    </div>
                  </div>
                ) : (
                  <div className={styles.featuredEmpty}>
                    {total === 0 ? "This deck is empty. Add cards in Edit." : "Draw a card to begin."}
                  </div>
                )}

                {/* Pile controls */}
                <div className={styles.pileRow}>
                  <div className={styles.pileCount}>
                    <span className={styles.pileNum}>{remaining}</span>
                    <span className={styles.pileLabel}>in pile</span>
                  </div>
                  <button className={styles.drawBtn} onClick={handleDraw} disabled={remaining === 0}>
                    {total > 0 && remaining === 0 ? "Deck spent" : "Draw"}
                  </button>
                  <div className={styles.pileBtns}>
                    <button className={styles.pileBtn} onClick={handleShuffle} disabled={remaining < 2} title="Shuffle the cards still in the draw pile (the discard stays out)">Shuffle</button>
                    <button className={styles.pileBtn} onClick={handleReshuffle} disabled={discardPile.length === 0} title="Fold the discard back into the deck and shuffle everything">Reshuffle discard</button>
                  </div>
                </div>

                {/* Discard strip (most-recent first) */}
                <div className={styles.discardHead}>
                  <span>Discard · {discardPile.length}</span>
                </div>
                <div className={styles.discardList}>
                  {discardPile.length === 0 && <div className={styles.emptyHint}>Nothing drawn yet.</div>}
                  {[...discardPile].reverse().map((d) => {
                    const card = cardByKey(selected, d.key);
                    return (
                      <div key={d.key} className={styles.discardRow}>
                        <span className={styles.discardTitle}>{card?.title || "(missing card)"}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className={styles.editView}>
                <textarea
                  className={styles.deckDesc}
                  value={selected.description ?? ""}
                  rows={2}
                  placeholder="Describe this deck or how to use it (optional)…"
                  onChange={(e) => updateDeck(selected.id, { description: e.target.value || undefined })}
                />
                <div className={styles.cardList}>
                  {selected.cards.length === 0 && <div className={styles.emptyHint}>No cards. Add one below.</div>}
                  {selected.cards.map((card, i) => {
                    const expanded = expandedCardId === card.id;
                    const thumb = card.imagePath ? art[card.imagePath] : undefined;
                    return (
                      <div key={card.id} className={styles.cardItem}>
                        <div className={styles.cardRow}>
                          <button
                            className={styles.artBtn}
                            onClick={() => void pickCardImage(card.id)}
                            title={card.imagePath ? "Change card art" : "Add card art"}
                          >
                            {thumb ? <img src={thumb} className={styles.artThumb} alt="" draggable={false} /> : <span className={styles.artPlus}>+</span>}
                          </button>
                          <input
                            ref={(el) => { if (el) rowRefs.current.set(card.id, el); else rowRefs.current.delete(card.id); }}
                            className={styles.cardTitleInput}
                            value={card.title}
                            placeholder="Card name…"
                            onChange={(e) => updateCard(card.id, { title: e.target.value })}
                            onKeyDown={(e) => onRowKeyDown(e, i)}
                          />
                          <input
                            className={styles.cardCount}
                            type="number"
                            min={1}
                            value={card.count}
                            title="Copies of this card in the deck"
                            onChange={(e) => updateCard(card.id, { count: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
                          />
                          <div className={styles.cardBtns}>
                            <button
                              className={`${styles.rowBtn} ${card.detail?.trim() || expanded ? styles.rowBtnActive : ""}`}
                              onClick={() => setExpandedCardId(expanded ? null : card.id)}
                              title={card.detail?.trim() ? "Edit detail" : "Add detail"}
                            >≡</button>
                            <button className={styles.rowBtn} onClick={() => moveCard(i, -1)} disabled={i === 0} title="Move up">↑</button>
                            <button className={styles.rowBtn} onClick={() => moveCard(i, 1)} disabled={i === selected.cards.length - 1} title="Move down">↓</button>
                            <button className={styles.rowBtn} onClick={() => deleteCard(card.id)} title="Delete">×</button>
                          </div>
                        </div>
                        {card.imagePath && (
                          <button className={styles.clearArtBtn} onClick={() => updateCard(card.id, { imagePath: undefined })}>Remove art</button>
                        )}
                        {expanded && (
                          <textarea
                            className={styles.cardDetail}
                            value={card.detail ?? ""}
                            autoFocus
                            rows={2}
                            placeholder="Card text / rules / flavour…"
                            onChange={(e) => updateCard(card.id, { detail: e.target.value || undefined })}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
                <button className={styles.addRowBtn} onClick={addCard}>+ Add card</button>
              </div>
            )}
          </div>
        ) : (
          <div className={styles.emptyDetail}>Select a deck, or hit + to create one.</div>
        )}
      </div>

      {pendingImport && (
        <ImportConflictDialog
          title="Import Card Decks"
          noun="deck"
          totalCount={pendingImport.idConflicts.length + pendingImport.contentDuplicates.length + pendingImport.clean.length}
          idConflicts={pendingImport.idConflicts.map((d) => ({ id: d.id, label: d.name }))}
          contentDuplicates={pendingImport.contentDuplicates.map((d) => ({ id: d.id, label: d.name }))}
          onCancel={() => setPendingImport(null)}
          onSkip={() => applyImport(pendingImport, "skip")}
          onReplace={() => applyImport(pendingImport, "replace")}
        />
      )}
    </div>
  );
}
