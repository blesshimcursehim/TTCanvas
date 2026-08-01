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
import type { CatalogueItem, ItemsState, ItemKind, Rarity, DamagePart } from "./types";
import { ITEM_KINDS, RARITIES } from "./types";
import {
  totalQty, qtyFor, setQty, weightCarried, totalValueCp, currencyToCp, normaliseCurrency,
  splitEvenly, coinParts,
} from "./ledger";
// Descriptions are rendered by ItemCard now, so the Markdown and wikilink plumbing lives there.
import { ItemCard } from "../shared/ItemCard";
import { ConfirmDeleteButton } from "../shared/ConfirmDeleteButton";
import { ImportConflictDialog } from "../shared/ImportConflictDialog";
import { dedupe, hashContent, readBundle, buildBundle, exportCollection, type DedupeResult } from "../shared/importExport";
import { pullSingletonBundle } from "../shared/crossVaultPull";
import { CollectionIO } from "../shared/CollectionIO";
import { VaultPullControl } from "../shared/VaultPullControl";
import { WidgetSettingsCog } from "../shared/WidgetSettingsCog";
import { ModeToggle } from "../shared/ModeToggle";
import styles from "./Items.module.css";

interface Props {
  state: ItemsState;
  onChange: (state: ItemsState) => void;
}

// The on-disk discriminator, deliberately still "inventory" now that the widget is called Items:
// readBundle rejects a present-but-mismatched type, so renaming this would make every
// .inventory.json a user has already exported fail to import. Not user-visible branding, and not an
// oversight - never change it.
const BUNDLE_TYPE = "ttcanvas-inventory";
const RARITY_LABELS: Record<Rarity, string> = {
  common: "common", uncommon: "uncommon", rare: "rare",
  "very-rare": "very rare", legendary: "legendary", artifact: "artifact",
};

// Suggestions only, offered through a <datalist> so the field stays free text. Deliberately not an
// enum: an enum would make TTCanvas a 5e-only app, and a fixed vocabulary is content we would have
// to licence. A GM can ignore every one of these and type their own.
const DAMAGE_TYPES = [
  "slashing", "piercing", "bludgeoning", "acid", "cold", "fire", "force",
  "lightning", "necrotic", "poison", "psychic", "radiant", "thunder",
];

/** "light, finesse ,, thrown" -> ["light","finesse","thrown"]; nothing at all -> undefined. */
function parseProperties(raw: string): string[] | undefined {
  const list = raw.split(",").map((p) => p.trim()).filter(Boolean);
  return list.length > 0 ? list : undefined;
}

/** Drop one entry, collapsing an emptied list to undefined so the field disappears rather than
 *  persisting as `[]` and re-rendering an empty damage block forever. */
function dropAt<T>(list: readonly T[], idx: number): T[] | undefined {
  const next = list.filter((_, i) => i !== idx);
  return next.length > 0 ? next : undefined;
}

/** Whether an item carries any of the combat block's fields. Only decides whether the block starts
 *  open, so a longsword shows its numbers straight away and a rope shows a single quiet button. */
function hasCombatDetail(item: CatalogueItem): boolean {
  return (item.damage?.length ?? 0) > 0
    || item.versatileDice !== undefined
    || item.enchantment !== undefined
    || item.range !== undefined
    || item.armourClass !== undefined;
}

function itemContentKey(item: CatalogueItem): string {
  // Holdings are campaign state, not part of the item's identity - two vaults describing the same
  // Sunblade should read as duplicates even when different characters are carrying it.
  const { id: _id, holdings: _holdings, ...rest } = item;
  return hashContent(rest);
}

/**
 * A weapon's damage from a bundle. Also accepts the single-string shape damage briefly had before it
 * became a list, folding `damage: "1d8", damageType: "slashing"` into one component - the widget was
 * never released with that shape, but a vault opened by a development build could still hold it, and
 * silently dropping what a GM typed is the worse failure.
 */
function readDamage(raw: unknown, legacyType: unknown): DamagePart[] {
  if (typeof raw === "string") {
    return raw.trim()
      ? [{ dice: raw, ...(typeof legacyType === "string" && legacyType ? { type: legacyType } : {}) }]
      : [];
  }
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((p: unknown): DamagePart[] => {
    if (!p || typeof p !== "object") return [];
    const { dice, type } = p as Record<string, unknown>;
    if (typeof dice !== "string" || !dice.trim()) return [];
    return [{ dice, ...(typeof type === "string" && type ? { type } : {}) }];
  });
}

function isKind(v: unknown): v is ItemKind {
  return typeof v === "string" && (ITEM_KINDS as readonly string[]).includes(v);
}

function isRarity(v: unknown): v is Rarity {
  return typeof v === "string" && (RARITIES as readonly string[]).includes(v);
}

function validateItemsBundle(parsed: unknown): CatalogueItem[] | null {
  if (!parsed || typeof parsed !== "object") return null;
  const bundle = parsed as Record<string, unknown>;
  if (bundle.type !== BUNDLE_TYPE || !Array.isArray(bundle.items)) return null;
  // Normalise every field, not just id/name: a garbage `holdings` or `kind` from a hand-edited file
  // would otherwise reach the render and crash it.
  return bundle.items.flatMap((raw: unknown): CatalogueItem[] => {
    if (!raw || typeof raw !== "object") return [];
    const i = raw as Record<string, unknown>;
    if (typeof i.id !== "string" || typeof i.name !== "string" || !i.name.trim()) return [];
    // A quantity must be a positive integer. Flooring 0.5 to 0 and keeping the holding would leave a
    // holder labelled as carrying something the totals say they do not, so drop it outright instead.
    const holdings = Array.isArray(i.holdings)
      ? i.holdings.flatMap((h: unknown) => {
        if (!h || typeof h !== "object") return [];
        const { holderId, qty } = h as Record<string, unknown>;
        if (typeof qty !== "number" || !Number.isInteger(qty) || qty <= 0) return [];
        return [{ holderId: typeof holderId === "string" ? holderId : null, qty }];
      })
      : [];
    const valueCp = i.valueCp;
    const weightLb = i.weightLb;
    const damage = readDamage(i.damage, i.damageType);
    return [{
      id: i.id,
      name: i.name,
      kind: isKind(i.kind) ? i.kind : "gear",
      ...(isRarity(i.rarity) ? { rarity: i.rarity } : {}),
      // Value is whole copper, weight may be fractional; neither can be negative.
      ...(typeof valueCp === "number" && Number.isInteger(valueCp) && valueCp >= 0 ? { valueCp } : {}),
      ...(typeof weightLb === "number" && Number.isFinite(weightLb) && weightLb >= 0 ? { weightLb } : {}),
      ...(typeof i.description === "string" ? { description: i.description } : {}),
      ...(i.attuned === true ? { attuned: true } : {}),
      // Weapon/armour detail: free text, so the only check is that it is text.
      ...(damage.length > 0 ? { damage } : {}),
      ...(typeof i.versatileDice === "string" ? { versatileDice: i.versatileDice } : {}),
      ...(typeof i.enchantment === "number" && Number.isInteger(i.enchantment) ? { enchantment: i.enchantment } : {}),
      ...(typeof i.range === "string" ? { range: i.range } : {}),
      ...(typeof i.armourClass === "string" ? { armourClass: i.armourClass } : {}),
      ...(Array.isArray(i.properties)
        ? { properties: i.properties.filter((p): p is string => typeof p === "string") }
        : {}),
      holdings,
    }];
  });
}

export function Items({ state, onChange }: Props) {
  const vault = useVault();
  const { members, patchMembers } = useParty();
  const { showToast } = useToast();
  const { tables, rollOn } = useRollTables();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [editingDescId, setEditingDescId] = useState<string | null>(null);
  // Per item, and only once the GM has actually pressed the toggle: `?? hasCombatDetail(item)` below
  // keeps the default derived from the item, so an imported weapon opens without anyone touching it.
  const [combatOpen, setCombatOpen] = useState<Record<string, boolean>>({});
  const [newName, setNewName] = useState("");
  const [rollTableId, setRollTableId] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<DedupeResult<CatalogueItem> | null>(null);

  const items = state.items;
  const currency = state.currency;

  const holderName = useMemo(() => {
    const byId = new Map(members.map((m) => [m.id, m.name]));
    return (id: string | null): string => (id === null ? "party" : byId.get(id) ?? "missing PC");
  }, [members]);

  const visible = useMemo(() => {
    const q = state.query.trim().toLowerCase();
    return items.filter((i) => {
      // "held" and "catalogue" are exact complements, so one comparison covers both.
      const held = totalQty(i) > 0;
      return (state.kindFilter === null || i.kind === state.kindFilter)
        && (state.heldFilter === "all" || (state.heldFilter === "held") === held)
        && (q === "" || i.name.toLowerCase().includes(q) || (i.description ?? "").toLowerCase().includes(q));
    });
  }, [items, state.query, state.kindFilter, state.heldFilter]);

  function patchItem(id: string, patch: Partial<CatalogueItem>) {
    onChange({ ...state, items: items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
  }

  /** Edit one component of a weapon's damage, leaving the others alone. */
  function patchDamage(item: CatalogueItem, idx: number, patch: Partial<DamagePart>) {
    const damage = (item.damage ?? []).map((p, i) => (i === idx ? { ...p, ...patch } : p));
    patchItem(item.id, { damage });
  }

  // An item is a *definition* first: a longsword can exist in the catalogue without anybody owning
  // one, which is what lets Merchants stock something the party has never had. Callers that really
  // do mean "the party has one of these" (rolled loot) pass the stash holding explicitly.
  function addItem(name: string, extra: Partial<CatalogueItem> = {}): CatalogueItem {
    return {
      id: crypto.randomUUID(),
      name,
      kind: "gear",
      holdings: [],
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
        // Explicit stash holding: unlike a hand-added catalogue entry, rolled loot is something the
        // party has just been given, so it starts owned rather than as a bare definition.
        next = [addItem(name, {
          kind: "treasure",
          holdings: [{ holderId: null, qty: 1 }],
          ...(o.note ? { description: o.note } : {}),
        }), ...next];
      }
    }
    onChange({ ...state, items: next });
    const chain = outcomes.find((o) => o.chain)?.chain;
    showToast(`Added ${outcomes.length} item${outcomes.length !== 1 ? "s" : ""}${chain ? ` (via ${chain})` : ""}.`, "success");
  }

  // ── Import / export / pull ────────────────────────────────
  async function handleExportAll() {
    // "items" names the widget, ".inventory.json" is the format suffix, which stays put alongside
    // BUNDLE_TYPE so a new export sits next to older ones as an obvious sibling.
    await exportCollection(vault.saveTextFile, buildBundle(BUNDLE_TYPE, { items }), "items.inventory.json");
  }

  async function handleImportFile(file: File) {
    setImportError(null);
    try {
      handleImportText(await file.text());
    } catch (err) {
      logError("Items: could not read the import file", err);
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
      // The new key, with no "inventory" fallback needed even for a vault last saved before the
      // rename: readForeignSingleton goes through loadWorkspace, which runs migrateWorkspace on the
      // way, so a foreign workspace arrives already migrated in memory.
      "items",
      BUNDLE_TYPE,
      (foreign) => {
        const s = foreign as ItemsState | undefined;
        if (!s?.items?.length) return null;
        return { items: s.items.map((i) => ({ ...i, holdings: [] })) };
      },
      handleImportText,
    );
  }

  function handleImportText(text: string) {
    setImportError(null);
    const incoming = readBundle(text, BUNDLE_TYPE, validateItemsBundle);
    if (!incoming) {
      setImportError("Not a valid Items file.");
      return;
    }
    const result = dedupe(incoming, items, { idOf: (i) => i.id, contentKeyOf: itemContentKey });
    if (result.idConflicts.length > 0 || result.contentDuplicates.length > 0) {
      setPendingImport(result);
    } else {
      applyImport(result, "skip");
    }
  }

  function applyImport(result: DedupeResult<CatalogueItem>, conflictMode: "skip" | "replace") {
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
        <ModeToggle
          value={state.heldFilter}
          onChange={(heldFilter) => onChange({ ...state, heldFilter })}
          options={[
            { value: "all", label: "All" },
            { value: "held", label: "Held" },
            { value: "catalogue", label: "Catalogue" },
          ]}
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
            {items.length === 0
              ? "No items yet. Add one to define it, then say who has some."
              : state.heldFilter === "held"
                ? "Nobody is carrying anything that matches."
                : state.heldFilter === "catalogue"
                  ? "Every item that matches is held by somebody."
                  : "No items match."}
          </p>
        )}
        {visible.map((item) => {
          const open = expandedId === item.id;
          const showCombat = combatOpen[item.id] ?? hasCombatDetail(item);
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
                        <option value="">None</option>
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

                  {/* Comma-separated rather than a chip-entry control, and with no datalist: a
                      datalist offers replacements for the whole field, so picking one would wipe the
                      properties already typed. The placeholder carries the vocabulary. This is also
                      where a resistance goes ("resist fire"): it is a label the card prints, not a
                      rule anything computes, so it needs no field of its own. */}
                  <div className={styles.fields}>
                    <label className={`${styles.field} ${styles.fieldWide}`}>Properties
                      <input
                        className={styles.input}
                        value={item.properties?.join(", ") ?? ""}
                        placeholder="light, finesse, resist fire"
                        onChange={(e) => patchItem(item.id, { properties: parseProperties(e.target.value) })}
                      />
                    </label>
                  </div>

                  {/* Offered on every kind, not just weapons and armour. A wand deals damage, a ring
                      grants an armour class, and any list of kinds we picked would still be wrong for
                      somebody's game. The disclosure is what keeps a rope's editor short: the fields
                      are always available, they are just not always in the way. */}
                  <button
                    className={styles.combatToggle}
                    aria-expanded={showCombat}
                    onClick={() => setCombatOpen({ ...combatOpen, [item.id]: !showCombat })}
                  >{showCombat ? "−" : "+"} Damage and defence</button>

                  {showCombat && (
                    <>
                      {/* Damage is a list, not two boxes: a magic weapon routinely deals several kinds
                          at once, and one type field could only ever label the first of them. The
                          first row is the base, the rest stack on top. */}
                      <div className={styles.damageRows}>
                        <span className={styles.damageHead}>Damage</span>
                        {(item.damage ?? []).map((part, i) => (
                          <div key={i} className={styles.damageRow}>
                            <input
                              className={styles.input}
                              value={part.dice}
                              placeholder={i === 0 ? "1d8+1" : "1d6"}
                              aria-label={i === 0 ? "Base damage dice" : `Extra damage ${i} dice`}
                              onChange={(e) => patchDamage(item, i, { dice: e.target.value })}
                            />
                            {/* A datalist, not a select: these are suggestions, and a GM running a
                                game that has no "radiant" must be able to type "entropy" instead. */}
                            <input
                              className={styles.input}
                              list="ttc-damage-types"
                              value={part.type ?? ""}
                              placeholder="slashing"
                              aria-label={i === 0 ? "Base damage type" : `Extra damage ${i} type`}
                              onChange={(e) => patchDamage(item, i, { type: e.target.value || undefined })}
                            />
                            <button
                              className={styles.damageRemove}
                              aria-label={i === 0 ? "Remove base damage" : `Remove extra damage ${i}`}
                              onClick={() => patchItem(item.id, { damage: dropAt(item.damage ?? [], i) })}
                            >×</button>
                          </div>
                        ))}
                        <button
                          className={styles.descEditBtn}
                          onClick={() => patchItem(item.id, { damage: [...(item.damage ?? []), { dice: "" }] })}
                        >+ Add damage</button>
                      </div>

                      <div className={styles.fields}>
                        <label className={styles.field}>Versatile dice
                          <input
                            className={styles.input}
                            value={item.versatileDice ?? ""}
                            placeholder="1d10"
                            onChange={(e) => patchItem(item.id, { versatileDice: e.target.value || undefined })}
                          />
                        </label>
                        <label className={styles.field}>Enchantment
                          <input
                            className={styles.input}
                            type="number"
                            value={item.enchantment ?? ""}
                            placeholder="+3"
                            onChange={(e) => patchItem(item.id, {
                              enchantment: e.target.value === "" ? undefined : Math.trunc(Number(e.target.value) || 0),
                            })}
                          />
                        </label>
                        <label className={styles.field}>Range
                          <input
                            className={styles.input}
                            value={item.range ?? ""}
                            placeholder="20/60 ft"
                            onChange={(e) => patchItem(item.id, { range: e.target.value || undefined })}
                          />
                        </label>
                        <label className={styles.field}>Armour class
                          <input
                            className={styles.input}
                            value={item.armourClass ?? ""}
                            placeholder="14 + Dex (max 2)"
                            onChange={(e) => patchItem(item.id, { armourClass: e.target.value || undefined })}
                          />
                        </label>
                      </div>
                    </>
                  )}

                  {/* A real button toggles the editor rather than the rendered block being one: the
                      block contains its own links, so making it a button would nest interactive
                      elements, swallow Space, and leave no sensible focus ring. */}
                  <div className={styles.descHead}>
                    <span>Description</span>
                    <button
                      className={styles.descEditBtn}
                      onClick={() => setEditingDescId(editingDescId === item.id ? null : item.id)}
                    >{editingDescId === item.id ? "Done" : "Edit"}</button>
                  </div>
                  {editingDescId === item.id && (
                    <textarea
                      className={styles.desc}
                      value={item.description ?? ""}
                      autoFocus
                      aria-label={`Description of ${item.name}`}
                      placeholder="Supports Markdown and [[wikilinks]]"
                      onChange={(e) => patchItem(item.id, { description: e.target.value })}
                    />
                  )}

                  {/* Exactly what the merchant's shelf and the character's kit will show, so the GM
                      writes the fields above and reads the result without hopping to Merchants to
                      check. It is also the only place the description is *rendered*: the block above
                      is the editor, and showing the prose twice on one card was just noise. */}
                  <ItemCard item={item} />
                  {!item.description && editingDescId !== item.id && (
                    <span className={styles.descEmpty}>No description yet.</span>
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
                      trigger="Remove"
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
          title="Import Items"
          noun="item"
          totalCount={pendingImport.idConflicts.length + pendingImport.contentDuplicates.length + pendingImport.clean.length}
          idConflicts={pendingImport.idConflicts.map((i) => ({ id: i.id, label: i.name }))}
          contentDuplicates={pendingImport.contentDuplicates.map((i) => ({ id: i.id, label: i.name }))}
          onCancel={() => setPendingImport(null)}
          onSkip={() => applyImport(pendingImport, "skip")}
          onReplace={() => applyImport(pendingImport, "replace")}
        />
      )}

      {/* Once for the whole widget, not once per expanded item: a <datalist> is referenced by id, so
          every Damage type field can share these two without duplicating the options in the DOM. */}
      <datalist id="ttc-damage-types">
        {DAMAGE_TYPES.map((d) => <option key={d} value={d} />)}
      </datalist>
    </div>
  );
}
