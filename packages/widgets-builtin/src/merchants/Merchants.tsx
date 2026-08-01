// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useEffect, useMemo, useState } from "react";
import {
  useVault, useItems, useNpcs, useGazetteerLocations, useRollTables, useToast, useSessionLog,
  logError, pushShopScene, formatCoin, type CatalogueItemRef,
} from "@ttcanvas/core";
import type { Merchant, MerchantKind, MerchantStock, MerchantsState } from "./types";
import { MERCHANT_KINDS, RARITY_PRESETS, KINDS_BY_MERCHANT } from "./types";
import type { ItemKind, Rarity } from "../items/types";
import { RARITIES, ITEM_KINDS } from "../items/types";
import { askPriceCp, offerPriceCp, buildShopPayload } from "./pricing";
import { generateStock, matchByName, mergeStock } from "./generate";
import { renderMarkdown } from "../shared/markdownRenderer";
import { handleEntityWikilinkClick } from "../shared/wikilinks";
import { ItemCard } from "../shared/ItemCard";
import { ConfirmDeleteButton } from "../shared/ConfirmDeleteButton";
import { ImportConflictDialog } from "../shared/ImportConflictDialog";
import { dedupe, hashContent, readBundle, buildBundle, exportCollection, type DedupeResult } from "../shared/importExport";
import { pullSingletonBundle } from "../shared/crossVaultPull";
import { CollectionIO } from "../shared/CollectionIO";
import { VaultPullControl } from "../shared/VaultPullControl";
import { WidgetSettingsCog } from "../shared/WidgetSettingsCog";
import styles from "./Merchants.module.css";

interface Props {
  state: MerchantsState;
  onChange: (state: MerchantsState) => void;
}

const BUNDLE_TYPE = "ttcanvas-merchants";

function isKind(v: unknown): v is MerchantKind {
  return typeof v === "string" && (MERCHANT_KINDS as readonly string[]).includes(v);
}

function isRarity(v: unknown): v is Rarity {
  return typeof v === "string" && (RARITIES as readonly string[]).includes(v);
}

const DEFAULT_RARITIES: Rarity[] = ["common", "uncommon"];

function merchantContentKey(m: Merchant): string {
  // Stock is part of a merchant's identity - two vaults describing "Dorn's Forge" with different
  // shelves are genuinely different merchants, unlike an item whose holdings are campaign state.
  const { id: _id, ...rest } = m;
  return hashContent(rest);
}

function validateMerchantsBundle(parsed: unknown): Merchant[] | null {
  if (!parsed || typeof parsed !== "object") return null;
  const bundle = parsed as Record<string, unknown>;
  if (bundle.type !== BUNDLE_TYPE || !Array.isArray(bundle.merchants)) return null;
  // Normalise every field: a garbage modifier or stock row from a hand-edited file would otherwise
  // reach the render and price the whole shelf at NaN.
  return bundle.merchants.flatMap((raw: unknown): Merchant[] => {
    if (!raw || typeof raw !== "object") return [];
    const m = raw as Record<string, unknown>;
    if (typeof m.id !== "string" || typeof m.name !== "string" || !m.name.trim()) return [];
    const stock = Array.isArray(m.stock)
      ? m.stock.flatMap((s: unknown): MerchantStock[] => {
        if (!s || typeof s !== "object") return [];
        const { itemId, qty, priceCpOverride } = s as Record<string, unknown>;
        if (typeof itemId !== "string") return [];
        const { name } = s as Record<string, unknown>;
        return [{
          itemId,
          qty: typeof qty === "number" && Number.isInteger(qty) && qty >= 0 ? qty : null,
          ...(typeof priceCpOverride === "number" && Number.isInteger(priceCpOverride) && priceCpOverride >= 0
            ? { priceCpOverride } : {}),
          ...(typeof name === "string" ? { name } : {}),
        }];
      })
      : [];
    const price = m.priceModifier;
    const buyback = m.buybackModifier;
    return [{
      id: m.id,
      name: m.name,
      kind: isKind(m.kind) ? m.kind : "general",
      ...(typeof m.owner === "string" ? { owner: m.owner } : {}),
      ...(typeof m.ownerRef === "string" ? { ownerRef: m.ownerRef } : {}),
      ...(typeof m.location === "string" ? { location: m.location } : {}),
      ...(typeof m.locationRef === "string" ? { locationRef: m.locationRef } : {}),
      ...(typeof m.description === "string" ? { description: m.description } : {}),
      // A zero, negative or non-finite modifier would price the whole shelf at 0 or NaN.
      priceModifier: typeof price === "number" && Number.isFinite(price) && price > 0 ? price : 1,
      buybackModifier: typeof buyback === "number" && Number.isFinite(buyback) && buyback >= 0 ? buyback : 0.5,
      // A file written before rarities existed falls back to the Modest preset rather than an empty
      // list, which would read as "this merchant can never generate anything".
      rarities: Array.isArray(m.rarities) ? m.rarities.filter(isRarity) : [...DEFAULT_RARITIES],
      stock,
    }];
  });
}

export function Merchants({ state, onChange }: Props) {
  const vault = useVault();
  const { catalogue, partyStash, purseCp, grantToParty, takeFromParty } = useItems();
  const { tables, rollOn } = useRollTables();
  const { npcs } = useNpcs();
  const { locations } = useGazetteerLocations();
  const { showToast } = useToast();
  const { logSessionEntry } = useSessionLog();

  const [editingDesc, setEditingDesc] = useState(false);
  // Keyed off nothing but the selection, which changing already unmounts the button - so unlike the
  // Items list (many rows, one confirm) a bare boolean can't leak onto a different merchant.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [addStockId, setAddStockId] = useState("");
  // Which shelf row has its item card open. Local, not persisted: which item the GM last peered at
  // is a glance, not a setting, and saving it would reopen a card on every workspace load.
  const [openStockId, setOpenStockId] = useState<string | null>(null);
  const [genCount, setGenCount] = useState(6);
  const [genTableId, setGenTableId] = useState("");
  // Kinds the GM has overridden for this session; null means "follow the merchant's own kind".
  const [genKindsOverride, setGenKindsOverride] = useState<ItemKind[] | null>(null);
  // Durable rather than a toast: unmatched names are something to read and act on (add them to
  // Items, run again), and a toast is gone before the GM can do either. Same call Encounter Builder
  // makes for missing sources.
  const [lastGenerate, setLastGenerate] = useState<{ added: number; unmatched: string[] } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<DedupeResult<Merchant> | null>(null);

  const merchants = state.merchants;
  const selected = merchants.find((m) => m.id === state.selectedId) ?? null;

  const itemById = useMemo(
    () => new Map<string, CatalogueItemRef>(catalogue.map((i) => [i.id, i])),
    [catalogue],
  );

  const visible = useMemo(() => {
    const q = state.query.trim().toLowerCase();
    return merchants.filter((m) =>
      (state.kindFilter === null || m.kind === state.kindFilter)
      && (q === "" || m.name.toLowerCase().includes(q) || (m.owner ?? "").toLowerCase().includes(q)));
  }, [merchants, state.query, state.kindFilter]);

  function patchMerchant(id: string, patch: Partial<Merchant>) {
    onChange({ ...state, merchants: merchants.map((m) => (m.id === id ? { ...m, ...patch } : m)) });
  }

  function handleAdd() {
    const merchant: Merchant = {
      id: crypto.randomUUID(),
      name: "New merchant",
      kind: "general",
      priceModifier: 1,
      buybackModifier: 0.5,
      rarities: [...DEFAULT_RARITIES],
      stock: [],
    };
    onChange({ ...state, merchants: [merchant, ...merchants], selectedId: merchant.id });
  }

  function handleDelete(id: string) {
    onChange({
      ...state,
      merchants: merchants.filter((m) => m.id !== id),
      selectedId: state.selectedId === id ? null : state.selectedId,
    });
  }

  // ── Stock ─────────────────────────────────────────────────
  function addStock(itemId: string) {
    if (!selected || !itemId) return;
    if (selected.stock.some((s) => s.itemId === itemId)) return;
    // Snapshot the name like the generated and rolled paths do, so a row whose catalogue item is
    // later deleted still reads as what it was instead of "Unknown item".
    const name = itemById.get(itemId)?.name;
    patchMerchant(selected.id, { stock: [...selected.stock, { itemId, qty: 1, ...(name ? { name } : {}) }] });
    setAddStockId("");
  }

  function patchStock(itemId: string, patch: Partial<MerchantStock>) {
    if (!selected) return;
    patchMerchant(selected.id, {
      stock: selected.stock.map((s) => (s.itemId === itemId ? { ...s, ...patch } : s)),
    });
  }

  function removeStock(itemId: string) {
    if (!selected) return;
    patchMerchant(selected.id, { stock: selected.stock.filter((s) => s.itemId !== itemId) });
  }

  // ── Generation ────────────────────────────────────────────
  function toggleRarity(rarity: Rarity) {
    if (!selected) return;
    const has = selected.rarities.includes(rarity);
    patchMerchant(selected.id, {
      rarities: has ? selected.rarities.filter((r) => r !== rarity) : [...selected.rarities, rarity],
    });
  }

  function handleGenerate() {
    if (!selected) return;
    if (selected.rarities.length === 0) {
      showToast("Tick at least one rarity for this merchant to stock.", "info");
      return;
    }
    const added = generateStock(catalogue, {
      rarities: selected.rarities,
      kinds: genKinds,
      count: genCount,
      existing: selected.stock,
    });
    if (added.length === 0) {
      showToast("Nothing left in your Items catalogue matches this merchant.", "info");
      return;
    }
    setLastGenerate({ added: added.length, unmatched: [] });
    patchMerchant(selected.id, { stock: mergeStock(selected.stock, added) });
    showToast(`Stocked ${added.length} line${added.length !== 1 ? "s" : ""}.`, "success");
  }

  function handleGenerateFromTable() {
    if (!selected || !genTableId) return;
    // One rollOn per generate, never one per line: every call writes to the Roll Tables history,
    // which is capped, so a per-line loop would bury the GM's own audit trail.
    const outcomes = rollOn(genTableId);
    if (!outcomes || outcomes.length === 0) {
      showToast("That table produced nothing to stock.", "info");
      return;
    }
    const { matched, unmatched } = matchByName(outcomes, catalogue);
    setLastGenerate({ added: matched.length, unmatched });
    if (matched.length > 0) patchMerchant(selected.id, { stock: mergeStock(selected.stock, matched) });
    showToast(
      matched.length > 0
        ? `Stocked ${matched.length} line${matched.length !== 1 ? "s" : ""} from the table.`
        : "Nothing the table rolled matches an item in your catalogue.",
      matched.length > 0 ? "success" : "info",
    );
  }

  // ── Casting to the players ────────────────────────────────
  function castShop() {
    if (!selected) return;
    void pushShopScene(buildShopPayload(selected, itemById));
  }

  // Live sync: while it is on, the selected merchant's shelf is the player scene, so a purchase or a
  // price edit reaches the table without the GM re-casting. Debounced like Map Display's own live
  // sync, for the same reason - typing in a price field would otherwise emit on every keystroke.
  const autoCast = state.autoCast ?? false;
  useEffect(() => {
    if (!autoCast || !selected) return;
    const timer = setTimeout(() => pushShopScene(buildShopPayload(selected, itemById)), 400);
    return () => clearTimeout(timer);
  }, [autoCast, selected, itemById]);

  // ── Transactions ──────────────────────────────────────────
  function handleBuy(row: MerchantStock) {
    if (!selected) return;
    const item = itemById.get(row.itemId);
    const unitCp = askPriceCp(row, item, selected);
    const name = item?.name ?? "that";

    // Two writes to two different owners (the party ledger lives in the Items widget, the shelf
    // here), unavoidable given widgets only get { state, onChange }. Both are React updates inside
    // one handler so they batch into a single render, and nothing between them can throw - keep
    // them adjacent.
    grantToParty(row.itemId, 1, unitCp);
    if (row.qty !== null) patchStock(row.itemId, { qty: Math.max(0, row.qty - 1) });

    // The toast is gone in seconds; the log is what the GM reads back at the end of the night when
    // someone asks where the money went. Both, not one or the other.
    logSessionEntry(`Bought ${name} from ${selected.name} for ${formatCoin(unitCp)}.`);

    // Warn, never block: the GM overrules the ledger, so an unaffordable purchase still completes.
    if (unitCp > purseCp) {
      showToast(`Bought ${name} for ${formatCoin(unitCp)} - ${formatCoin(unitCp - purseCp)} more than the party had.`, "info");
    } else {
      showToast(`Bought ${name} for ${formatCoin(unitCp)}.`, "success");
    }
  }

  function handleSell(itemId: string) {
    if (!selected) return;
    const item = itemById.get(itemId);
    const unitCp = offerPriceCp(item, selected);
    const name = item?.name ?? "it";
    takeFromParty(itemId, 1, unitCp);
    const existing = selected.stock.find((s) => s.itemId === itemId);
    if (existing) {
      if (existing.qty !== null) patchStock(itemId, { qty: existing.qty + 1 });
    } else {
      patchMerchant(selected.id, { stock: [...selected.stock, { itemId, qty: 1 }] });
    }
    logSessionEntry(`Sold ${name} to ${selected.name} for ${formatCoin(unitCp)}.`);
    showToast(`Sold ${name} for ${formatCoin(unitCp)}.`, "success");
  }

  // ── Import / export / pull ────────────────────────────────
  async function handleExportAll() {
    await exportCollection(vault.saveTextFile, buildBundle(BUNDLE_TYPE, { merchants }), "merchants.merchants.json");
  }

  async function handleImportFile(file: File) {
    setImportError(null);
    try {
      handleImportText(await file.text());
    } catch (err) {
      logError("Merchants: could not read the import file", err);
      setImportError("Failed to read import file.");
    }
  }

  // Pull merchants from another vault. Stock and the entity links are dropped: those ids belong to
  // the vault you pulled from and would dangle here. The cached owner/location strings survive, so
  // a pulled merchant still reads correctly, just unlinked - the same trade Items makes for holdings.
  async function handlePull(sourceVault: string): Promise<boolean> {
    setImportError(null);
    return pullSingletonBundle(
      vault.readForeignSingleton,
      sourceVault,
      "merchants",
      BUNDLE_TYPE,
      (foreign) => {
        const s = foreign as MerchantsState | undefined;
        if (!s?.merchants?.length) return null;
        return {
          merchants: s.merchants.map((m) => {
            const { ownerRef: _o, locationRef: _l, ...rest } = m;
            return { ...rest, stock: [] };
          }),
        };
      },
      handleImportText,
    );
  }

  function handleImportText(text: string) {
    setImportError(null);
    const incoming = readBundle(text, BUNDLE_TYPE, validateMerchantsBundle);
    if (!incoming) {
      setImportError("Not a valid Merchants file.");
      return;
    }
    const result = dedupe(incoming, merchants, { idOf: (m) => m.id, contentKeyOf: merchantContentKey });
    if (result.idConflicts.length > 0 || result.contentDuplicates.length > 0) {
      setPendingImport(result);
    } else {
      applyImport(result, "skip");
    }
  }

  function applyImport(result: DedupeResult<Merchant>, mode: "skip" | "replace") {
    const conflicting = new Set(result.idConflicts.map((m) => m.id));
    const kept = mode === "replace"
      ? [...merchants.filter((m) => !conflicting.has(m.id)), ...result.clean, ...result.idConflicts]
      : [...merchants, ...result.clean];
    onChange({ ...state, merchants: kept });
    setPendingImport(null);
    const added = result.clean.length + (mode === "replace" ? result.idConflicts.length : 0);
    showToast(`Imported ${added} merchant${added !== 1 ? "s" : ""}.`, "success");
  }

  const stockable = useMemo(
    () => catalogue.filter((i) => !selected?.stock.some((s) => s.itemId === i.id)),
    [catalogue, selected],
  );

  // The merchant's own kind is the opening offer for what it sells, so a blacksmith generates
  // weapons and armour without the GM configuring anything. Overridable per session.
  const genKinds = genKindsOverride ?? (selected ? KINDS_BY_MERCHANT[selected.kind] : []);

  return (
    <div className={styles.root}>
      <div className={styles.panes}>
        {/* ── List pane ──────────────────────────── */}
        <div className={styles.listPane}>
          <div className={styles.searchRow}>
            <input
              className={styles.search}
              type="search"
              value={state.query}
              placeholder="Search merchants…"
              aria-label="Search merchants"
              onChange={(e) => onChange({ ...state, query: e.target.value })}
            />
            <button className={styles.addBtn} onClick={handleAdd} title="New merchant">+</button>
          </div>

          <div className={styles.chips}>
            <button
              className={styles.chip}
              aria-pressed={state.kindFilter === null}
              onClick={() => onChange({ ...state, kindFilter: null })}
            >All</button>
            {MERCHANT_KINDS.map((k) => (
              <button
                key={k}
                className={styles.chip}
                aria-pressed={state.kindFilter === k}
                onClick={() => onChange({ ...state, kindFilter: state.kindFilter === k ? null : k })}
              >{k}</button>
            ))}
          </div>

          <div className={styles.list}>
            {visible.length === 0 && (
              <p className={styles.empty}>
                {merchants.length === 0
                  ? "No merchants yet. Add one, then stock it from your Items catalogue."
                  : "No merchants match."}
              </p>
            )}
            {visible.map((m) => (
              <button
                key={m.id}
                className={`${styles.listRow} ${m.id === state.selectedId ? styles.listRowActive : ""}`}
                aria-pressed={m.id === state.selectedId}
                onClick={() => onChange({ ...state, selectedId: m.id })}
              >
                <span className={styles.listName}>{m.name}</span>
                <span className={styles.listMeta}>{m.kind} · {m.stock.length} line{m.stock.length !== 1 ? "s" : ""}</span>
              </button>
            ))}
          </div>

          <div className={styles.listFooter}>
            <WidgetSettingsCog label="Merchants settings">
              <CollectionIO
                onImportFile={handleImportFile}
                onExportAll={handleExportAll}
                exportDisabled={merchants.length === 0}
                onError={setImportError}
              />
              <VaultPullControl otherVaults={vault.otherVaults} onPull={handlePull} onError={setImportError} />
            </WidgetSettingsCog>
          </div>
          {importError && <p className={styles.error} role="alert">{importError}</p>}
        </div>

        {/* ── Detail pane ────────────────────────── */}
        <div className={styles.detailPane}>
          {!selected ? (
            <p className={styles.empty}>Pick a merchant to see their shelves.</p>
          ) : (
            <>
              <div className={styles.head}>
                <input
                  className={styles.nameInput}
                  value={selected.name}
                  aria-label="Merchant name"
                  onChange={(e) => patchMerchant(selected.id, { name: e.target.value })}
                />
                <select
                  className={styles.input}
                  value={selected.kind}
                  aria-label="Merchant kind"
                  onChange={(e) => patchMerchant(selected.id, { kind: e.target.value as MerchantKind })}
                >
                  {MERCHANT_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
                <ConfirmDeleteButton
                  trigger="Delete"
                  triggerLabel={`Delete ${selected.name}`}
                  confirmQuestion={`Delete "${selected.name}"?`}
                  confirming={confirmingDelete}
                  onRequestConfirm={() => setConfirmingDelete(true)}
                  onConfirm={() => { handleDelete(selected.id); setConfirmingDelete(false); }}
                  onCancel={() => setConfirmingDelete(false)}
                />
              </div>

              <div className={styles.linkRow}>
                <label className={styles.linkLabel}>Owner
                  <select
                    className={styles.input}
                    value={selected.ownerRef ?? ""}
                    aria-label="Linked NPC"
                    onChange={(e) => {
                      const ref = e.target.value;
                      const npc = npcs.find((n) => n.filename === ref);
                      // Cache the name alongside the ref so a pulled or orphaned merchant still reads.
                      patchMerchant(selected.id, ref
                        ? { ownerRef: ref, owner: npc?.name ?? selected.owner }
                        : { ownerRef: undefined });
                    }}
                  >
                    <option value="">{npcs.length === 0 ? "no NPCs" : "unlinked"}</option>
                    {npcs.map((n) => <option key={n.filename} value={n.filename}>{n.name}</option>)}
                  </select>
                </label>
                {selected.ownerRef && (
                  <button
                    className={styles.linkBtn}
                    onClick={() => window.dispatchEvent(new CustomEvent("ttcanvas:open-entity-link", {
                      detail: { name: `npc:${selected.owner ?? ""}` },
                    }))}
                  >Open {selected.owner}</button>
                )}

                <label className={styles.linkLabel}>Place
                  <select
                    className={styles.input}
                    value={selected.locationRef ?? ""}
                    aria-label="Linked place"
                    onChange={(e) => {
                      const ref = e.target.value;
                      const place = locations.find((l) => l.filename === ref);
                      patchMerchant(selected.id, ref
                        ? { locationRef: ref, location: place?.name ?? selected.location }
                        : { locationRef: undefined });
                    }}
                  >
                    <option value="">{locations.length === 0 ? "no places" : "unlinked"}</option>
                    {locations.map((l) => <option key={l.filename} value={l.filename}>{l.name}</option>)}
                  </select>
                </label>
                {selected.locationRef && (
                  <button
                    className={styles.linkBtn}
                    onClick={() => window.dispatchEvent(new CustomEvent("ttcanvas:open-location", {
                      detail: { filename: selected.locationRef },
                    }))}
                  >Open {selected.location}</button>
                )}
              </div>

              {/* Description */}
              <div className={styles.descBlock}>
                {editingDesc ? (
                  <textarea
                    className={styles.textarea}
                    value={selected.description ?? ""}
                    placeholder="Supports Markdown and [[wikilinks]]"
                    aria-label="Merchant description"
                    onChange={(e) => patchMerchant(selected.id, { description: e.target.value })}
                    onBlur={() => setEditingDesc(false)}
                    autoFocus
                  />
                ) : (
                  <>
                    {/* The rendered block is not itself a button: it contains wikilinks that need
                        their own clicks, and nesting interactive content inside a button is invalid. */}
                    <div
                      className={styles.prose}
                      onClick={handleEntityWikilinkClick}
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(selected.description ?? "_No description._") }}
                    />
                    <button className={styles.editBtn} onClick={() => setEditingDesc(true)}>Edit description</button>
                  </>
                )}
              </div>

              {/* Price list */}
              <div className={styles.section}>
                <div className={styles.sectionHead}>
                  <span>For sale</span>
                  <span className={styles.purse}>Party purse: {formatCoin(purseCp)}</span>
                  {/* Same live-sync-then-cast pair, in the same order, as Map Display's toolbar. */}
                  <button
                    className={`${styles.castBtn} ${autoCast ? styles.castBtnActive : ""}`}
                    aria-pressed={autoCast}
                    onClick={() => onChange({ ...state, autoCast: !autoCast })}
                    title={autoCast
                      ? "Live sync ON - the players' price list follows this merchant. Click to turn off"
                      : "Live sync OFF - click to keep the players' price list in step with this merchant"}
                    aria-label="Live sync price list to player window"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="23 4 23 10 17 10" />
                      <polyline points="1 20 1 14 7 14" />
                      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                    </svg>
                  </button>
                  <button
                    className={styles.castBtn}
                    onClick={castShop}
                    title="Cast this price list to the player window"
                    aria-label="Cast price list to player window"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M2 16.1A5 5 0 0 1 5.9 20M2 12.05A9 9 0 0 1 9.95 20M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6" />
                      <line x1="2" y1="20" x2="2.01" y2="20" />
                    </svg>
                  </button>
                </div>
                {selected.stock.length === 0 && <p className={styles.empty}>Nothing stocked yet.</p>}
                {selected.stock.map((row) => {
                  const item = itemById.get(row.itemId);
                  const unitCp = askPriceCp(row, item, selected);
                  const soldOut = row.qty !== null && row.qty <= 0;
                  const open = openStockId === row.itemId;
                  return (
                    <div key={row.itemId}>
                    <div className={styles.stockRow} data-rarity={item?.rarity}>
                      {/* A row whose item was deleted from the catalogue stays visible and removable
                          rather than vanishing, so the GM can see and fix the dangling reference.
                          The live lookup always wins; row.name is the snapshot taken when the line
                          was created, so a deleted item still reads by name instead of as an id.

                          Only the name toggles the card. Wrapping the whole row in a button would
                          nest the qty input and Buy inside it, and the GM selling to a queue wants
                          those under the cursor without a card opening every time. */}
                      <button
                        className={styles.stockName}
                        aria-expanded={open}
                        disabled={!item}
                        onClick={() => setOpenStockId(open ? null : row.itemId)}
                      >
                        {item?.name ?? row.name ?? "Unknown item"}
                        {!item && <span className={styles.missingTag}> · missing from Items</span>}
                      </button>
                      <input
                        className={styles.qtyInput}
                        type="number"
                        min={0}
                        value={row.qty ?? ""}
                        placeholder="∞"
                        aria-label={`Stock of ${item?.name ?? "unknown item"}`}
                        onChange={(e) => patchStock(row.itemId, {
                          qty: e.target.value === "" ? null : Math.max(0, Math.floor(Number(e.target.value) || 0)),
                        })}
                      />
                      <span className={styles.price}>{formatCoin(unitCp)}</span>
                      {unitCp > purseCp && <span className={styles.short} title="More than the party purse holds">short</span>}
                      <button
                        className={styles.buyBtn}
                        disabled={soldOut || !item}
                        onClick={() => handleBuy(row)}
                      >Buy</button>
                      <button
                        className={styles.removeBtn}
                        aria-label={`Remove ${item?.name ?? "unknown item"} from stock`}
                        onClick={() => removeStock(row.itemId)}
                      >×</button>
                    </div>
                    {open && item && (
                      <div className={styles.stockCard}><ItemCard item={item} /></div>
                    )}
                    </div>
                  );
                })}
                <div className={styles.addStockRow}>
                  <select
                    className={styles.input}
                    value={addStockId}
                    aria-label="Add item to stock"
                    onChange={(e) => { setAddStockId(e.target.value); addStock(e.target.value); }}
                  >
                    <option value="">{stockable.length === 0 ? "nothing left to stock" : "Stock an item…"}</option>
                    {stockable.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                </div>
              </div>

              {/* ── Generate ─────────────────────────── */}
              <div className={styles.section}>
                <div className={styles.sectionHead}><span>Restock</span></div>

                {/* Availability is this merchant's own business, not its settlement's: a slum in a
                    major city is still a slum, and a fence with a legendary blade under the counter
                    is the GM's call. So these are plain ticks with no cap behind them. */}
                <div className={styles.rarityRow}>
                  {RARITIES.map((r) => (
                    <button
                      key={r}
                      className={styles.rarityChip}
                      data-rarity={r}
                      aria-pressed={selected.rarities.includes(r)}
                      onClick={() => toggleRarity(r)}
                    >{r.replace("-", " ")}</button>
                  ))}
                </div>
                <div className={styles.presetRow}>
                  <span className={styles.presetLabel}>Presets</span>
                  {RARITY_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      className={styles.preset}
                      onClick={() => patchMerchant(selected.id, { rarities: [...p.rarities] })}
                    >{p.label}</button>
                  ))}
                </div>

                <div className={styles.genRow}>
                  <select
                    className={styles.input}
                    value={genKinds.length === 1 ? genKinds[0] : ""}
                    aria-label="Item kinds to generate"
                    onChange={(e) => setGenKindsOverride(e.target.value === "" ? [] : [e.target.value as ItemKind])}
                  >
                    <option value="">any kind</option>
                    {ITEM_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                  <input
                    className={styles.modInput}
                    type="number"
                    min={1}
                    max={30}
                    value={genCount}
                    aria-label="How many lines to generate"
                    onChange={(e) => setGenCount(Math.max(1, Math.min(30, Math.floor(Number(e.target.value) || 1))))}
                  />
                  <button className={styles.genBtn} onClick={handleGenerate}>Generate</button>
                </div>

                <div className={styles.genRow}>
                  <select
                    className={styles.input}
                    value={genTableId}
                    aria-label="Roll table to stock from"
                    onChange={(e) => setGenTableId(e.target.value)}
                  >
                    <option value="">{tables.length === 0 ? "no roll tables" : "Stock from a table…"}</option>
                    {tables.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <button className={styles.genBtn} disabled={!genTableId} onClick={handleGenerateFromTable}>Roll</button>
                </div>

                {lastGenerate && lastGenerate.unmatched.length > 0 && (
                  <div className={styles.unmatched}>
                    <span className={styles.unmatchedHead}>
                      {lastGenerate.unmatched.length} rolled result{lastGenerate.unmatched.length !== 1 ? "s" : ""} had
                      no matching item in your catalogue, so {lastGenerate.unmatched.length !== 1 ? "they were" : "it was"} skipped.
                      Add {lastGenerate.unmatched.length !== 1 ? "them" : "it"} to Items and roll again.
                    </span>
                    <ul className={styles.unmatchedList}>
                      {lastGenerate.unmatched.map((name) => <li key={name}>{name}</li>)}
                    </ul>
                  </div>
                )}
              </div>

              {/* Buy from party */}
              <div className={styles.section}>
                <div className={styles.sectionHead}><span>Buying from the party</span></div>
                {partyStash.length === 0 && <p className={styles.empty}>The party stash is empty.</p>}
                {partyStash.map((held) => (
                  <div key={held.id} className={styles.stockRow} data-rarity={held.rarity}>
                    <span className={styles.stockName}>{held.name}</span>
                    <span className={styles.qtyHeld}>×{held.qty}</span>
                    <span className={styles.price}>{formatCoin(offerPriceCp(held, selected))}</span>
                    <button className={styles.sellBtn} onClick={() => handleSell(held.id)}>Sell</button>
                  </div>
                ))}
              </div>

              {/* Modifiers: per-merchant data, so they live here rather than in the widget cog. */}
              <div className={styles.modRow}>
                <label className={styles.linkLabel}>Price ×
                  <input
                    className={styles.modInput}
                    type="number" min={0.1} step={0.1}
                    value={selected.priceModifier}
                    aria-label="Price modifier"
                    onChange={(e) => patchMerchant(selected.id, { priceModifier: Math.max(0.1, Number(e.target.value) || 1) })}
                  />
                </label>
                <label className={styles.linkLabel}>Buyback ×
                  <input
                    className={styles.modInput}
                    type="number" min={0} step={0.1}
                    value={selected.buybackModifier}
                    aria-label="Buyback modifier"
                    onChange={(e) => patchMerchant(selected.id, { buybackModifier: Math.max(0, Number(e.target.value) || 0) })}
                  />
                </label>
              </div>
            </>
          )}
        </div>
      </div>

      {pendingImport && (
        <ImportConflictDialog
          title="Import Merchants"
          noun="merchant"
          totalCount={pendingImport.idConflicts.length + pendingImport.contentDuplicates.length + pendingImport.clean.length}
          idConflicts={pendingImport.idConflicts.map((m) => ({ id: m.id, label: m.name }))}
          contentDuplicates={pendingImport.contentDuplicates.map((m) => ({ id: m.id, label: m.name }))}
          onCancel={() => setPendingImport(null)}
          onSkip={() => applyImport(pendingImport, "skip")}
          onReplace={() => applyImport(pendingImport, "replace")}
        />
      )}
    </div>
  );
}
