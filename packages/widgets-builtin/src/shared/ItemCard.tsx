// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useDice, formatCoin, type CatalogueItemRef } from "@ttcanvas/core";
import { renderMarkdown } from "./markdownRenderer";
import { handleEntityWikilinkClick } from "./wikilinks";
import { damageExpression, totalDamageRange } from "./damageRange";
import styles from "./ItemCard.module.css";

interface Props {
  item: CatalogueItemRef;
  /** How many the viewer has, when the card is shown from a ledger rather than a catalogue. */
  qty?: number;
}

/** Modifier-key convention shared with RollableStat: Shift = advantage, Alt = disadvantage. */
function advFromEvent(e: { shiftKey: boolean; altKey: boolean }): "advantage" | "disadvantage" | null {
  if (e.shiftKey) return "advantage";
  if (e.altKey) return "disadvantage";
  return null;
}

/**
 * One item read in full: what it hits for, what it is made of, what it is worth. Shown by the Items
 * ledger, a merchant's shelf and a character's own kit, so it lives in shared/ like the sheet modals
 * do - the alternative was three drifting copies of the same stat block.
 *
 * Every block disappears when its field is empty, so a plain rope reads as a name and a price rather
 * than a form full of blanks. It is presentational only: nothing here writes, which is what lets the
 * Merchants and PC-sheet copies stay read-only without a second component.
 */
export function ItemCard({ item, qty }: Props) {
  const { roll } = useDice();
  const damage = item.damage?.filter((p) => p.dice.trim()) ?? [];
  const range = totalDamageRange(damage);
  const expr = damageExpression(damage);
  const properties = item.properties?.filter((p) => p.trim()) ?? [];
  const rollLabel = `${item.name} damage`;
  const rollHint = `Roll ${expr} for ${item.name}. Shift for advantage, Alt for disadvantage.`;

  return (
    <div className={styles.card} data-rarity={item.rarity ?? "none"}>
      <div className={styles.head}>
        <span className={styles.name} data-rarity={item.rarity ?? "none"}>{item.name}</span>
        {qty !== undefined && <span className={styles.qty}>×{qty}</span>}
      </div>
      <div className={styles.sub}>
        {item.kind}{item.rarity ? ` · ${item.rarity.replace("-", " ")}` : ""}
      </div>

      {(damage.length > 0 || item.armourClass || item.range || item.enchantment) && (
        <div className={styles.stats}>
          {/* The headline BG3 puts above the notation: what this actually does to someone, totalled
              across every component, before you have to read dice. Absent when any part is prose
              ("1d6 per level"), which the lines below still show as written. */}
          {range && (
            <div className={styles.headline}>{range.min}~{range.max} Damage</div>
          )}
          {damage.map((part, i) => (
            <div key={i} className={styles.statLine}>
              {/* Only the first component reads as the weapon's own dice; the rest are additions and
                  are signed, so a stack of three reads the way it would be spoken. */}
              {i === 0 ? (
                // Rollable only when the whole stack parses: a dead button that silently does
                // nothing is worse than plain text, and `roll` would no-op anyway. One click rolls
                // every component together, since that is the number the GM needs.
                range ? (
                  <button
                    type="button"
                    className={styles.diceBtn}
                    title={rollHint}
                    aria-label={rollHint}
                    onClick={(e) => roll(expr, advFromEvent(e), rollLabel)}
                  >{part.dice}</button>
                ) : (
                  <span className={styles.dice}>{part.dice}</span>
                )
              ) : (
                <span className={styles.diceExtra}>
                  {part.dice.startsWith("+") || part.dice.startsWith("-") ? part.dice : `+${part.dice}`}
                </span>
              )}
              {i === 0 && item.versatileDice && (
                <span className={styles.versatile} title="Two-handed or thrown">({item.versatileDice})</span>
              )}
              {part.type && <span className={styles.damageType}>{part.type}</span>}
            </div>
          ))}
          {item.enchantment !== undefined && item.enchantment !== 0 && (
            <div className={styles.statLine}>
              <span className={styles.statKey}>Enchantment</span>
              {item.enchantment > 0 ? `+${item.enchantment}` : item.enchantment}
            </div>
          )}
          {item.armourClass && (
            <div className={styles.statLine}><span className={styles.statKey}>AC</span> {item.armourClass}</div>
          )}
          {item.range && (
            <div className={styles.statLine}><span className={styles.statKey}>Range</span> {item.range}</div>
          )}
        </div>
      )}

      {properties.length > 0 && (
        <div className={styles.props}>
          {properties.map((p) => <span key={p} className={styles.prop}>{p}</span>)}
        </div>
      )}

      {item.description && (
        <div
          className={styles.prose}
          onClick={handleEntityWikilinkClick}
          dangerouslySetInnerHTML={{ __html: renderMarkdown(item.description) }}
        />
      )}

      {(item.weightLb !== undefined || item.valueCp !== undefined) && (
        <div className={styles.foot}>
          <span>{item.weightLb !== undefined ? `${item.weightLb} lb` : ""}</span>
          <span>{item.valueCp !== undefined ? formatCoin(item.valueCp) : ""}</span>
        </div>
      )}
    </div>
  );
}
