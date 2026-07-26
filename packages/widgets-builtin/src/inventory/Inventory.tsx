// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useMemo, useState } from "react";
import {
  useVault, useParty, useToast, useRollTables, logError,
  CURRENCY_KEYS, COIN_IN_CP, formatCoin, type PCCurrency,
} from "@ttcanvas/core";
import type { InventoryItem, InventoryState, ItemKind, Rarity } from "./types";
import { ITEM_KINDS, RARITIES } from "./types";
import {
  totalQty, qtyFor, setQty, weightCarried, totalValueCp, currencyToCp, normaliseCurrency,
  splitEvenly, coinParts,
} from "./inventory";
import { renderMarkdown } from "../shared/markdownRenderer";
import { ConfirmDeleteButton } from "../shared/ConfirmDeleteButton";
import { ImportConflictDialog } from "../shared/ImportConflictDialog";
import { dedupe, hashContent, readBundle, buildBundle, exportCollection, type DedupeResult } from "../shared/importExport";
import { pullSingletonBundle } from "../shared/crossVaultPull";
import { CollectionIO } from "../shared/CollectionIO";
import { VaultPullControl } from "../shared/VaultPullControl";
import { WidgetSettingsCog } from "../shared/WidgetSettingsCog";
import styles from "./Inventory.module.css";

interface Props {
  state: InventoryState;
  onChange: (state: InventoryState) => void;
}

const BUNDLE_TYPE = "ttcanvas-inventory";
const RARITY_LABELS: Record<Rarity, string> = {
  common: "common", uncommon: "uncommon", rare: "rare",
  "very-rare": "very rare", legendary: "legendary", artifact: "artifact",
};

// An item description is an entity body, so like Gazetteer/NPC notes its [[links]] go through the
// cross-entity channel - [[Vex]] resolves to that NPC, [[A Note]] still opens the note. Returns
// whether a link was handled, so the click-to-edit swap can stand down when one was.
function handleWikilinkClick(e: React.MouseEvent): boolean {
  const link = (e.target as HTMLElement).closest("[data-wikilink]") as HTMLElement | null;
  if (!link) return false;
  e.preventDefault();
  const name = link.dataset.wikilink;
  if (name) window.dispatchEvent(new CustomEvent("ttcanvas:open-entity-link", { detail: { name } }));
  return true;
}

function itemContentKey(item: InventoryItem): string {
  // Holdings are campaign state, not part of the item's identity - two vaults describing the same
  // Sunblade should read as duplicates even when different characters are carrying it.
  const { id: _id, holdings: _holdings, ...rest } = item;
  return hashContent(rest);
}

function isKind(v: unknown): v is ItemKind {
  return typeof v === "string" && (ITEM_KINDS as readonly string[]).includes(v);
}

function isRarity(v: unknown): v is Rarity {
  return typeof v === "string" && (RARITIES as readonly string[]).includes(v);
}

function validateInventoryBundle(parsed: unknown): InventoryItem[] | null {
  if (!parsed || typeof parsed !== "object") return null;
  const bundle = parsed as Record<string, unknown>;
  if (bundle.type !== BUNDLE_TYPE || !Array.isArray(bundle.items)) return null;
  // Normalise every field, not just id/name: a garbage `holdings` or `kind` from a hand-edited file
  // would otherwise reach the render and crash it.
  return bundle.items.flatMap((raw: unknown): InventoryItem[] => {
    if (!raw || typeof raw !== "object") return [];
    const i = raw as Record<string, unknown>;
    if (typeof i.id !== "string" || typeof i.name !== "string" || !i.name.trim()) return [];
    const holdings = Array.isArray(i.holdings)
      ? i.holdings.flatMap((h: unknown) => {
        if (!h || typeof h !== "object") return [];
        const { holderId, qty } = h as Record<string, unknown>;
        if (typeof qty !== "number" || !Number.isFinite(qty) || qty <= 0) return [];
        return [{ holderId: typeof holderId === "string" ? holderId : null, qty: Math.floor(qty) }];
      })
      : [];
    return [{
      id: i.id,
      name: i.name,
      kind: isKind(i.kind) ? i.kind : "gear",
      ...(isRarity(i.rarity) ? { rarity: i.rarity } : {}),
      ...(typeof i.valueCp === "number" && Number.isFinite(i.valueCp) ? { valueCp: i.valueCp } : {}),
      ...(typeof i.weightLb === "number" && Number.isFinite(i.weightLb) ? { weightLb: i.weightLb } : {}),
      ...(typeof i.description === "string" ? { description: i.description } : {}),
      ...(i.attuned === true ? { attuned: true } : {}),
      holdings,
    }];
  });
}

export function Inventory({ state, onChange }: Props) {
  const vault = useVault();
  const { members, patchMembers } = useParty();
  const { showToast } = useToast();
  const { tables, rollOn } = useRollTables();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [editingDescId, setEditingDescId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [rollTableId, setRollTableId] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<DedupeResult<InventoryItem> | null>(null);

  const items = state.items;
  const currency = state.currency;

  const holderName = useMemo(() => {
    const byId = new Map(members.map((m) => [m.id, m.name]));
    return (id: string | null): string => (id === null ? "party" : byId.get(id) ?? "missing PC");
  }, [members]);

  const visible = useMemo(() => {
    const q = state.query.trim().toLowerCase();
    return items.filter((i) =>
      (state.kindFilter === null || i.kind === state.kindFilter)
      && (q === "" || i.name.toLowerCase().includes(q) || (i.description ?? "").toLowerCase().includes(q)));
  }, [items, state.query, state.kindFilter]);

  function patchItem(id: string, patch: Partial<InventoryItem>) {
    onChange({ ...state, items: items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
  }

  function addItem(name: string, extra: Partial<InventoryItem> = {}): InventoryItem {
    return {
      id: crypto.randomUUID(),
      name,
      kind: "gear",
      holdings: [{ holderId: null, qty: 1 }],
      ...extra,
    };
  }

  function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    const item = addItem(name);
    onChange({ ...state, items: [item, ...items] });
    setNewName("");
    setExpandedId(item.id);
  }

  function handleDelete(id: string) {
    onChange({ ...state, items: items.filter((i) => i.id !== id) });
    setConfirmingId(null);
    if (expandedId === id) setExpandedId(null);
  }

  // ── Coin ──────────────────────────────────────────────────
  function setCoin(key: keyof PCCurrency, raw: string) {
    const n = Math.max(0, Math.floor(Number(raw) || 0));
    onChange({ ...state, currency: { ...currency, [key]: n } });
  }

  function handleSplit() {
    if (members.length === 0) {
      showToast("No party members to split between.", "info");
      return;
    }
    const { shares, remainder } = splitEvenly(currency, members.map((m) => m.id));
    if (shares.length === 0) {
      showToast("Nothing in the purse to split.", "info");
      return;
    }
    patchMembers(shares.map((s) => ({ id: s.memberId, currencyDelta: s.delta })));
    onChange({ ...state, currency: remainder });
    showToast(`Split ${formatCoin(currencyToCp(shares[0].delta))} to each of ${shares.length}.`, "success");
  }

  // ── Loot rolling ──────────────────────────────────────────
  function handleRollLoot() {
    const outcomes = rollOn(rollTableId);
    if (!outcomes || outcomes.length === 0) {
      showToast("That table produced nothing to add.", "info");
      return;
    }
    // Fold a repeat result into the existing stash entry rather than adding a second identical row -
    // rolling "Rations" twice should read as 2 rations, not two lines saying 1.
    let next = items;
    for (const o of outcomes) {
      const name = o.text.trim() || "(empty entry)";
      const existing = next.find((i) => i.name.toLowerCase() === name.toLowerCase());
      if (existing) {
        next = next.map((i) => (i.id === existing.id
          ? { ...i, holdings: setQty(i.holdings, null, qtyFor(i, null) + 1) }
          : i));
      } else {
        next = [addItem(name, { kind: "treasure", ...(o.note ? { description: o.note } : {}) }), ...next];
      }
    }
    onChange({ ...state, items: next });
    const chain = outcomes.find((o) => o.chain)?.chain;
    showToast(`Added ${outcomes.length} item${outcomes.length !== 1 ? "s" : ""}${chain ? ` (via ${chain})` : ""}.`, "success");
  }

  // ── Import / export / pull ────────────────────────────────
  async function handleExportAll() {
    await exportCollection(vault.saveTextFile, buildBundle(BUNDLE_TYPE, { items }), "inventory.inventory.json");
  }

  async function handleImportFile(file: File) {
    setImportError(null);
    try {
      handleImportText(await file.text());
    } catch (err) {
      logError("Inventory: could not read the import file", err);
      setImportError("Failed to read import file.");
    }
  }

  // Pull item definitions from another vault. Holdings are dropped: who is carrying what belongs to
  // the campaign you pulled from, and the holder ids would not match this vault's party anyway.
  async function handlePull(sourceVault: string): Promise<boolean> {
    setImportError(null);
    return pullSingletonBundle(
      vault.readForeignSingleton,
      sourceVault,
      "inventory",
      BUNDLE_TYPE,
      (foreign) => {
        const s = foreign as InventoryState | undefined;
        if (!s?.items?.length) return null;
        return { items: s.items.map((i) => ({ ...i, holdings: [] })) };
      },
      handleImportText,
    );
  }

  function handleImportText(text: string) {
    setImportError(null);
    const incoming = readBundle(text, BUNDLE_TYPE, validateInventoryBundle);
    if (!incoming) {
      setImportError("Not a valid Inventory file.");
      return;
    }
    const result = dedupe(incoming, items, { idOf: (i) => i.id, contentKeyOf: itemContentKey });
    if (result.idConflicts.length > 0 || result.contentDuplicates.length > 0) {
      setPendingImport(result);
    } else {
      applyImport(result, "skip");
    }
  }

  function applyImport(result: DedupeResult<InventoryItem>, conflictMode: "skip" | "replace") {
    setPendingImport(null);
    setExpandedId(null);
    setEditingDescId(null);
    const replacedIds = conflictMode === "replace" ? new Set(result.idConflicts.map((i) => i.id)) : new Set<string>();
    const kept = items.filter((i) => !replacedIds.has(i.id));
    const added = conflictMode === "replace"
      ? [...result.clean, ...result.idConflicts]
      : result.clean;
    onChange({ ...state, items: [...kept, ...added] });
  }

  const ledgerValue = totalValueCp(items) + currencyToCp(currency);

  return (
    <div className={styles.root}>
      {/* ── Search ─────────────────────────────── */}
      <div className={styles.searchRow}>
        <input
          className={styles.search}
          type="search"
          value={state.query}
          placeholder="Search items…"
          aria-label="Search items"
          onChange={(e) => onChange({ ...state, query: e.target.value })}
        />
        <span className={styles.count}>{visible.length} item{visible.length !== 1 ? "s" : ""}</span>
      </div>

      {/* ── Kind filter chips ──────────────────── */}
      <div className={styles.chips}>
        <button
          className={styles.chip}
          aria-pressed={state.kindFilter === null}
          onClick={() => onChange({ ...state, kindFilter: null })}
        >All</button>
        {ITEM_KINDS.map((k) => (
          <button
            key={k}
            className={styles.chip}
            aria-pressed={state.kindFilter === k}
            onClick={() => onChange({ ...state, kindFilter: state.kindFilter === k ? null : k })}
          >{k}</button>
        ))}
      </div>

      {/* ── Ledger ─────────────────────────────── */}
      <div className={styles.list}>
        {visible.length === 0 && (
          <p className={styles.empty}>
            {items.length === 0 ? "The party owns nothing yet." : "No items match."}
          </p>
        )}
        {visible.map((item) => {
          const open = expandedId === item.id;
          const holders = item.holdings.map((h) => holderName(h.holderId));
          return (
            <div key={item.id} className={styles.item}>
              <button
                className={styles.row}
                aria-expanded={open}
                onClick={() => setExpandedId(open ? null : item.id)}
              >
                <span className={styles.qty}>{totalQty(item)}</span>
                <span className={styles.id}>
                  <span className={styles.name}>{item.name}</span>
                  {/* Rarity drives the left bar through a data attribute rather than a dynamic
                      styles[] lookup, so a new rarity is a CSS-only change. */}
                  <span className={styles.meta} data-rarity={item.rarity ?? "none"}>
                    <span>{item.kind}{item.rarity ? ` · ${RARITY_LABELS[item.rarity]}` : ""}</span>
                    <span className={styles.holder}>
                      {holders.length === 0 ? "unheld" : holders.length === 1 ? holders[0] : `${holders.length} holders`}
                    </span>
                  </span>
                </span>
                <span className={styles.value}>{item.valueCp ? formatCoin(item.valueCp) : ""}</span>
                <span className={styles.chev} aria-hidden="true">{open ? "⌃" : "⌄"}</span>
              </button>

              {open && (
                <div className={styles.detail}>
                  <div className={styles.fields}>
                    <label className={styles.field}>Name
                      <input className={styles.input} value={item.name} onChange={(e) => patchItem(item.id, { name: e.target.value })} />
                    </label>
                    <label className={styles.field}>Kind
                      <select className={styles.input} value={item.kind} onChange={(e) => patchItem(item.id, { kind: e.target.value as ItemKind })}>
                        {ITEM_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                      </select>
                    </label>
                    <label className={styles.field}>Rarity
                      <select
                        className={styles.input}
                        value={item.rarity ?? ""}
                        onChange={(e) => patchItem(item.id, { rarity: isRarity(e.target.value) ? e.target.value : undefined })}
                      >
                        <option value="">—</option>
                        {RARITIES.map((r) => <option key={r} value={r}>{RARITY_LABELS[r]}</option>)}
                      </select>
                    </label>
                    <label className={styles.field}>Value
                      <span className={styles.valueEdit}>
                        <input
                          className={styles.input}
                          type="number"
                          min={0}
                          value={coinParts(item.valueCp ?? 0).amount || ""}
                          onChange={(e) => {
                            const amount = Math.max(0, Number(e.target.value) || 0);
                            const unit = coinParts(item.valueCp ?? 0).unit;
                            patchItem(item.id, { valueCp: amount === 0 ? undefined : Math.round(amount * COIN_IN_CP[unit]) });
                          }}
                        />
                        <select
                          className={styles.input}
                          aria-label="Coin"
                          value={coinParts(item.valueCp ?? 0).unit}
                          onChange={(e) => {
                            const amount = coinParts(item.valueCp ?? 0).amount;
                            patchItem(item.id, { valueCp: amount === 0 ? undefined : Math.round(amount * COIN_IN_CP[e.target.value as keyof PCCurrency]) });
                          }}
                        >
                          {CURRENCY_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
                        </select>
                      </span>
                    </label>
                    {state.showWeight && (
                      <label className={styles.field}>Weight (lb)
                        <input
                          className={styles.input}
                          type="number"
                          min={0}
                          step={0.1}
                          value={item.weightLb ?? ""}
                          onChange={(e) => patchItem(item.id, { weightLb: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value) || 0) })}
                        />
                      </label>
                    )}
                    <label className={styles.checkField}>
                      <input type="checkbox" checked={item.attuned ?? false} onChange={(e) => patchItem(item.id, { attuned: e.target.checked || undefined })} />
                      Attuned
                    </label>
                  </div>

                  {/* Click-to-edit: the description reads as rendered Markdown until you click it. */}
                  {editingDescId === item.id ? (
                    <textarea
                      className={styles.desc}
                      value={item.description ?? ""}
                      autoFocus
                      placeholder="Description… supports Markdown and [[wikilinks]]"
                      onBlur={() => setEditingDescId(null)}
                      onChange={(e) => patchItem(item.id, { description: e.target.value })}
                    />
                  ) : (
                    <div
                      className={styles.descView}
                      role="button"
                      tabIndex={0}
                      title="Click to edit"
                      // Follow a [[wikilink]] rather than swapping in the textarea - otherwise the
                      // click-to-edit would make every link in a description unreachable.
                      onClick={(e) => {
                        if (!handleWikilinkClick(e)) setEditingDescId(item.id);
                      }}
                      onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) setEditingDescId(item.id); }}
                      {...(item.description
                        ? { dangerouslySetInnerHTML: { __html: renderMarkdown(item.description) } }
                        : { children: <span className={styles.descEmpty}>Add a description…</span> })}
                    />
                  )}

                  {/* ── Holdings ─────────────────── */}
                  <div className={styles.holdings}>
                    {[null, ...members.map((m) => m.id)].map((hid) => {
                      const n = qtyFor(item, hid);
                      const carried = state.showWeight ? weightCarried(items, hid) : 0;
                      const over = state.carryLimitLb !== null && carried > state.carryLimitLb;
                      return (
                        <div key={hid ?? "party"} className={styles.holdRow}>
                          <span className={styles.holdName}>{holderName(hid)}</span>
                          {state.showWeight && (
                            <span className={`${styles.holdWeight} ${over ? styles.over : ""}`}>
                              {carried.toFixed(carried % 1 === 0 ? 0 : 1)}{state.carryLimitLb !== null ? ` / ${state.carryLimitLb}` : ""} lb
                            </span>
                          )}
                          <span className={styles.stepper}>
                            <button aria-label={`Remove one from ${holderName(hid)}`} disabled={n === 0} onClick={() => patchItem(item.id, { holdings: setQty(item.holdings, hid, n - 1) })}>−</button>
                            <span className={styles.stepQty}>{n}</span>
                            <button aria-label={`Add one to ${holderName(hid)}`} onClick={() => patchItem(item.id, { holdings: setQty(item.holdings, hid, n + 1) })}>+</button>
                          </span>
                        </div>
                      );
                    })}
                    {/* Holdings pointing at a deleted PC surface rather than vanishing silently. */}
                    {item.holdings
                      .filter((h) => h.holderId !== null && !members.some((m) => m.id === h.holderId))
                      .map((h) => (
                        <div key={h.holderId} className={styles.holdRow}>
                          <span className={styles.orphan}>Unassigned ({h.qty}) · missing PC</span>
                          <button className={styles.reassign} onClick={() => patchItem(item.id, { holdings: setQty(setQty(item.holdings, h.holderId, 0), null, qtyFor(item, null) + h.qty) })}>
                            Move to party
                          </button>
                        </div>
                      ))}
                  </div>

                  <div className={styles.detailFoot}>
                    <ConfirmDeleteButton
                      trigger="🗑 Remove"
                      triggerLabel={`Remove ${item.name}`}
                      confirmQuestion={`Remove "${item.name}"?`}
                      confirming={confirmingId === item.id}
                      onRequestConfirm={() => setConfirmingId(item.id)}
                      onConfirm={() => handleDelete(item.id)}
                      onCancel={() => setConfirmingId(null)}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Party purse ────────────────────────── */}
      <div className={styles.purse}>
        {CURRENCY_KEYS.map((k) => (
          <label key={k} className={styles.coin}>
            <span className={styles.coinKey}>{k}</span>
            <input
              className={styles.coinInput}
              type="number"
              min={0}
              value={currency[k] ?? 0}
              aria-label={`Party ${k}`}
              onChange={(e) => setCoin(k, e.target.value)}
            />
          </label>
        ))}
        <button className={styles.tidyBtn} title="Roll loose coin up into larger denominations" onClick={() => onChange({ ...state, currency: normaliseCurrency(currency) })}>Tidy</button>
      </div>

      {/* ── Footer ─────────────────────────────── */}
      <div className={styles.foot}>
        <input
          className={styles.addInput}
          value={newName}
          placeholder="Add item…"
          aria-label="New item name"
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
        />
        <button className={styles.addBtn} onClick={handleAdd} disabled={!newName.trim()}>+</button>
        <select
          className={styles.tableSelect}
          value={rollTableId}
          aria-label="Loot table"
          disabled={tables.length === 0}
          onChange={(e) => setRollTableId(e.target.value)}
        >
          <option value="">{tables.length === 0 ? "no tables" : "Roll loot from…"}</option>
          {tables.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <button className={styles.rollBtn} disabled={!rollTableId} onClick={handleRollLoot}>Roll</button>
        <button className={styles.splitBtn} onClick={handleSplit}>Split coin</button>
        <span className={styles.total} title="Items plus the party purse">≈ {formatCoin(ledgerValue)}</span>
      </div>

      <WidgetSettingsCog>
        <label className={styles.setting}>
          <input type="checkbox" checked={state.showWeight} onChange={(e) => onChange({ ...state, showWeight: e.target.checked })} />
          Track weight
        </label>
        {state.showWeight && (
          <label className={styles.setting}>
            Carry limit (lb)
            <input
              className={styles.input}
              type="number"
              min={0}
              value={state.carryLimitLb ?? ""}
              placeholder="none"
              onChange={(e) => onChange({ ...state, carryLimitLb: e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0) })}
            />
          </label>
        )}
        <CollectionIO onImportFile={handleImportFile} onExportAll={handleExportAll} exportDisabled={items.length === 0} onError={setImportError} />
        <VaultPullControl otherVaults={vault.otherVaults} onPull={handlePull} onError={setImportError} />
        {importError && (
          <div className={styles.importError} onClick={() => setImportError(null)}>{importError}</div>
        )}
      </WidgetSettingsCog>

      {pendingImport && (
        <ImportConflictDialog
          title="Import Inventory"
          noun="item"
          totalCount={pendingImport.idConflicts.length + pendingImport.contentDuplicates.length + pendingImport.clean.length}
          idConflicts={pendingImport.idConflicts.map((i) => ({ id: i.id, label: i.name }))}
          contentDuplicates={pendingImport.contentDuplicates.map((i) => ({ id: i.id, label: i.name }))}
          onCancel={() => setPendingImport(null)}
          onSkip={() => applyImport(pendingImport, "skip")}
          onReplace={() => applyImport(pendingImport, "replace")}
        />
      )}
    </div>
  );
}
