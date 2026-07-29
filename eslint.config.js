// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

// Narrowly scoped on purpose (see tracking/code-review-findings.md CR-007):
// TypeScript's own `strict`/`noUnusedLocals`/`noUnusedParameters` already
// catch most correctness issues, so this only adds what tsc can't see -
// React hooks correctness (rules-of-hooks, exhaustive-deps) plus
// typescript-eslint's non-type-checked "recommended" set. Deliberately not
// pulling in stylistic or type-checked rule sets, which would create
// low-value churn rather than catching real bugs.

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist", "site/dist", "src-tauri/target", "**/*.config.js", "**/*.config.ts"] },
  {
    files: ["src/**/*.{ts,tsx}", "packages/*/src/**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "jsx-a11y": jsxA11y,
    },
    rules: {
      // Added with the accessibility audit (roadmap-deferred item 57). This is a deliberate
      // widening of the narrow policy above: these rules catch real defects a screen-reader or
      // keyboard user hits, which neither tsc nor a human reviewer reliably sees. The recommended
      // set found 113 violations on the day it went in; 14 were real and were fixed, and the four
      // rules below account for the other 99. They are off rather than warn because a warning
      // nobody can action is just noise - what they are really reporting is tracked as work.
      // The plugin's declared peer range stops at ESLint 9 and this repo is on 10. It runs fine
      // (the flat-config API it uses is unchanged), so the mismatch is allowed deliberately via
      // pnpm.peerDependencyRules in package.json rather than silently ignored.
      ...jsxA11y.flatConfigs.recommended.rules,
      // A pannable canvas of draggable widgets: map surfaces, drag handles, widget frames and
      // clickable rows are pointer-first by design, and no role fits them. Giving this app
      // keyboard equivalents is a feature, not a lint fix - see roadmap-deferred item 57.
      "jsx-a11y/no-static-element-interactions": "off",
      "jsx-a11y/click-events-have-key-events": "off",
      "jsx-a11y/no-noninteractive-element-interactions": "off",
      // Same reasoning, one rule over: the canvas container itself is now Tab-reachable so arrow
      // keys can pan it (item 57's "keyboard alternatives for pointer-only surfaces"), but it isn't
      // any existing ARIA widget - "pannable 2D surface" has no interactive role to give it, the
      // same gap that made the three rules above the wrong fit for this app.
      "jsx-a11y/no-noninteractive-tabindex": "off",
      // autoFocus is used inside modals, which are now native <dialog>s that move focus on open
      // anyway. The rule can't tell that case from a page-load focus steal, which is what it's
      // actually guarding against.
      "jsx-a11y/no-autofocus": "off",
      // Only the two classic hooks-correctness rules - eslint-plugin-react-hooks's
      // "recommended" preset also bundles ~14 newer React Compiler-oriented rules
      // (set-state-in-effect, purity, immutability, ...) that encode architectural
      // opinions well beyond this fix's scope and would need their own review.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // This codebase uses a leading underscore to mark a destructured binding as
      // deliberately unused (e.g. excluding a key via `{ id: _id, ...rest }`) -
      // recognise that convention instead of flagging every occurrence.
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // `cond ? doA() : doB()` as a statement (a toggle-in-a-Set idiom used
      // throughout the widget set) is a deliberate, correct pattern here, not
      // an accidentally-unused expression. typescript-eslint's recommended
      // config swaps in its own version of this rule for .ts/.tsx files, so
      // both need the same override.
      "no-unused-expressions": ["error", { allowTernary: true }],
      "@typescript-eslint/no-unused-expressions": ["error", { allowTernary: true }],
    },
  },
);
