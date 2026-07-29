// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useMemo, useState } from "react";
import {
  useVault, useItems, useNpcs, useGazetteerLocations, useToast, logError,
  formatCoin, type CatalogueItemRef,
} from "@ttcanvas/core";
import type { Merchant, MerchantKind, MerchantStock, MerchantsState } from "./types";
import { MERCHANT_KINDS } from "./types";
import { askPriceCp, offerPriceCp } from "./pricing";
import { renderMarkdown } from "../shared/markdownRenderer";
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

// A merchant's description is an entity body, so like Gazetteer/NPC notes its [[links]] go through
// the cross-entity channel - [[Vex]] resolves to that NPC, [[A Note]] still opens the note.
function handleWikilinkClick(e: React.MouseEvent) {
  const link = (e.target as HTMLElement).closest("[data-wikilink]") as HTMLElement | null;
  if (!link) return;
  e.preventDefault();
  const name = link.dataset.wikilink;
  if (name) window.dispatchEvent(new CustomEvent("ttcanvas:open-entity-link", { detail: { name } }));
}

function isKind(v: unknown): v is MerchantKind {
  return typeof v === "string" && (MERCHANT_KINDS as readonly string[]).includes(v);
}

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
        return [{
          itemId,
          qty: typeof qty === "number" && Number.isInteger(qty) && qty >= 0 ? qty : null,
          ...(typeof priceCpOverride === "number" && Number.isInteger(priceCpOverride) && priceCpOverride >= 0
            ? { priceCpOverride } : {}),
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
      stock,
    }];
  });
}

export function Merchants({ state, onChange }: Props) {
  const vault = useVault();
  const { catalogue, partyStash, purseCp, grantToParty, takeFromParty } = useItems();
  const { npcs } = useNpcs();
  const { locations } = useGazetteerLocations();
  const { showToast } = useToast();

  const [editingDesc, setEditingDesc] = useState(false);
  // Keyed off nothing but the selection, which changing already unmounts the button - so unlike the
  // Items list (many rows, one confirm) a bare boolean can't leak onto a different merchant.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [addStockId, setAddStockId] = useState("");
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
    patchMerchant(selected.id, { stock: [...selected.stock, { itemId, qty: 1 }] });
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
    takeFromParty(itemId, 1, unitCp);
    const existing = selected.stock.find((s) => s.itemId === itemId);
    if (existing) {
      if (existing.qty !== null) patchStock(itemId, { qty: existing.qty + 1 });
    } else {
      patchMerchant(selected.id, { stock: [...selected.stock, { itemId, qty: 1 }] });
    }
    showToast(`Sold ${item?.name ?? "it"} for ${formatCoin(unitCp)}.`, "success");
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
                      onClick={handleWikilinkClick}
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
                </div>
                {selected.stock.length === 0 && <p className={styles.empty}>Nothing stocked yet.</p>}
                {selected.stock.map((row) => {
                  const item = itemById.get(row.itemId);
                  const unitCp = askPriceCp(row, item, selected);
                  const soldOut = row.qty !== null && row.qty <= 0;
                  return (
                    <div key={row.itemId} className={styles.stockRow} data-rarity={item?.rarity}>
                      {/* A row whose item was deleted from the catalogue stays visible and removable
                          rather than vanishing, so the GM can see and fix the dangling reference. */}
                      <span className={styles.stockName}>{item?.name ?? "Unknown item"}</span>
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
