// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

// Pure dice-expression parser + evaluator, unit-tested with an injectable rng (the
// same pattern as roll-tables/engine.ts and npc-generator/tables.ts). It stays free
// of React so the Roll Tables engine can reuse it later for count expressions.
//
// Grammar (whitespace-insensitive), a sum of signed terms:
//   expr   = term ( ('+'|'-') term )*
//   term   = dice | integer
//   dice   = [count] 'd' sides modifier*
//   modifier = 'kh'<n> | 'kl'<n> | '!'      (keep-highest / keep-lowest / explode)
// e.g. "2d6 + 1d8 + 4", "4d6kh3", "d6!", "1d20+7".

/** +1 or -1: a term's sign, factored out of the number so "-1d8" drops the whole term. */
type Sign = 1 | -1;

interface DiceTermSpec {
  kind: "dice";
  sign: Sign;
  count: number;
  sides: number;
  /** Keep the n highest (`kh`) or lowest (`kl`) dice; undefined keeps them all. */
  keep?: { mode: "kh" | "kl"; n: number };
  /** Explode: a die showing its max face rolls again and adds, repeatedly. */
  explode: boolean;
}

interface ConstTermSpec {
  kind: "const";
  sign: Sign;
  value: number;
}

// Discriminated union on `kind` - the evaluator narrows on it instead of a nullable soup.
type TermSpec = DiceTermSpec | ConstTermSpec;

export interface DiceExpr {
  terms: TermSpec[];
}

export type AdvMode = "advantage" | "disadvantage" | null;

export interface RolledTerm {
  spec: TermSpec;
  /** Every die face rolled, in order, including exploded extras and dropped dice. */
  rolls: number[];
  /** The subset that counted toward the total (all of `rolls` unless kh/kl dropped some). */
  kept: number[];
  /** Signed contribution to the grand total. */
  subtotal: number;
}

export interface RollBreakdown {
  total: number;
  terms: RolledTerm[];
  /** Natural 20 on a lone, unmodified d20 (a to-hit roll). */
  crit: boolean;
  /** Natural 1 on a lone, unmodified d20. */
  fumble: boolean;
}

export interface RollOutcome {
  /** The breakdown that counted. With advantage this is the higher/lower total of the two. */
  breakdown: RollBreakdown;
  /** The discarded roll when adv/dis was in play - kept for an "adv 17/12" style display. */
  alt?: RollBreakdown;
  adv: AdvMode;
}

/** Guard against a runaway explosion (a die stuck rolling its own max forever). */
const MAX_EXPLOSIONS = 100;

// One signed term: a leading +/- (default +), then either dice notation or a plain integer.
// The modifier group is validated further in parseModifiers so an unknown flag rejects cleanly.
const TERM_RE = /^([+-]?)(?:(\d*)d(\d+)((?:kh\d+|kl\d+|!)*)|(\d+))$/i;

function parseModifiers(raw: string): Pick<DiceTermSpec, "keep" | "explode"> | null {
  let keep: DiceTermSpec["keep"];
  let explode = false;
  // Walk the modifier run token by token so a repeated/garbage flag is caught.
  const re = /kh(\d+)|kl(\d+)|!/gi;
  let consumed = 0;
  for (let m = re.exec(raw); m; m = re.exec(raw)) {
    consumed += m[0].length;
    if (m[0] === "!") explode = true;
    else if (m[1] !== undefined) keep = { mode: "kh", n: parseInt(m[1], 10) };
    else if (m[2] !== undefined) keep = { mode: "kl", n: parseInt(m[2], 10) };
  }
  return consumed === raw.length ? { keep, explode } : null;
}

/**
 * Parses a dice expression into a spec, or returns null if it is not valid notation (so the
 * widget can grey out the Roll button). Splits on +/- while keeping each sign attached to its term.
 */
export function parseExpression(input: string): DiceExpr | null {
  const compact = input.replace(/\s+/g, "");
  if (!compact) return null;
  // Split before every +/- (keeping it) so "2d6-1d4+3" -> ["2d6", "-1d4", "+3"].
  const chunks = compact.split(/(?=[+-])/);
  const terms: TermSpec[] = [];
  for (const chunk of chunks) {
    const m = TERM_RE.exec(chunk);
    if (!m) return null;
    const sign: Sign = m[1] === "-" ? -1 : 1;
    if (m[5] !== undefined) {
      terms.push({ kind: "const", sign, value: parseInt(m[5], 10) });
      continue;
    }
    const count = m[2] ? parseInt(m[2], 10) : 1;
    const sides = parseInt(m[3], 10);
    if (count < 1 || count > 1000 || sides < 1) return null;
    const mods = parseModifiers(m[4] ?? "");
    if (!mods) return null;
    if (mods.keep && (mods.keep.n < 1 || mods.keep.n > count)) return null;
    terms.push({ kind: "dice", sign, count, sides, keep: mods.keep, explode: mods.explode });
  }
  return { terms };
}

/** Rolls one die, exploding on a max face if asked. Returns the summed value for that die. */
function rollOneDie(sides: number, explode: boolean, rng: () => number): number {
  let value = Math.floor(rng() * sides) + 1;
  if (!explode) return value;
  let face = value;
  for (let i = 0; face === sides && i < MAX_EXPLOSIONS; i++) {
    face = Math.floor(rng() * sides) + 1;
    value += face;
  }
  return value;
}

function rollDiceTerm(spec: DiceTermSpec, rng: () => number): RolledTerm {
  // Each die yields a value (with explosions folded in); kh/kl then selects among those values.
  const rolls = Array.from({ length: spec.count }, () => rollOneDie(spec.sides, spec.explode, rng));
  let kept = rolls;
  if (spec.keep) {
    const sorted = [...rolls].sort((a, b) => b - a); // highest first
    kept = spec.keep.mode === "kh" ? sorted.slice(0, spec.keep.n) : sorted.slice(-spec.keep.n);
  }
  const sum = kept.reduce((s, n) => s + n, 0);
  return { spec, rolls, kept, subtotal: spec.sign * sum };
}

/** True when the whole expression is a single, unmodified `d20` - the only place a crit/fumble reads. */
function isLoneD20(expr: DiceExpr): boolean {
  if (expr.terms.length !== 1) return false;
  const t = expr.terms[0];
  return t.kind === "dice" && t.count === 1 && t.sides === 20 && !t.keep && !t.explode && t.sign === 1;
}

/** Rolls a parsed expression once. `rng` returns a float in [0,1); injectable for tests. */
export function rollExpression(expr: DiceExpr, rng: () => number = Math.random): RollBreakdown {
  const terms = expr.terms.map((spec) =>
    spec.kind === "const" ? { spec, rolls: [], kept: [], subtotal: spec.sign * spec.value } : rollDiceTerm(spec, rng),
  );
  const total = terms.reduce((s, t) => s + t.subtotal, 0);
  const lone = isLoneD20(expr) ? terms[0].rolls[0] : null;
  return { total, terms, crit: lone === 20, fumble: lone === 1 };
}

/**
 * Parses and rolls an expression, applying generalised advantage/disadvantage: the whole
 * expression is rolled twice and the higher (advantage) or lower (disadvantage) total is kept,
 * with the other returned as `alt`. Returns null for invalid notation.
 */
export function evaluate(input: string, adv: AdvMode, rng: () => number = Math.random): RollOutcome | null {
  const expr = parseExpression(input);
  if (!expr) return null;
  if (!adv) return { breakdown: rollExpression(expr, rng), adv };
  const a = rollExpression(expr, rng);
  const b = rollExpression(expr, rng);
  const [keptRoll, altRoll] =
    adv === "advantage"
      ? a.total >= b.total ? [a, b] : [b, a]
      : a.total <= b.total ? [a, b] : [b, a];
  return { breakdown: keptRoll, alt: altRoll, adv };
}

/** Renders a single term's dice for the breakdown, e.g. `(5,6)` or, with drops, `(5,6,~2)`. */
function formatTerm(t: RolledTerm): string {
  if (t.spec.kind === "const") return String(t.spec.value);
  if (t.rolls.length === 0) return "";
  if (!t.spec.keep) return `(${t.rolls.join(",")})`;
  // Mark dropped dice with a leading ~ so a "4d6kh3" reads (5,6,4,~2).
  const dropped = countDropped(t.rolls, t.kept);
  const parts = [...t.kept.map(String), ...dropped.map((n) => `~${n}`)];
  return `(${parts.join(",")})`;
}

/** The dice that were rolled but not kept (kh/kl), as a multiset difference. */
function countDropped(rolls: number[], kept: number[]): number[] {
  const remaining = [...kept];
  const dropped: number[] = [];
  for (const r of rolls) {
    const i = remaining.indexOf(r);
    if (i >= 0) remaining.splice(i, 1);
    else dropped.push(r);
  }
  return dropped;
}

/**
 * A compact human breakdown of a roll, e.g. `2d6+1d8+4: (5,6)+(8)+4`. Signs sit between terms;
 * a lone constant or single die stays readable. Used in the widget result, history, and cast card.
 */
export function formatBreakdown(breakdown: RollBreakdown): string {
  return breakdown.terms
    .map((t, i) => {
      const sign = t.spec.sign < 0 ? "-" : i === 0 ? "" : "+";
      return `${sign}${formatTerm(t)}`;
    })
    .join("");
}
