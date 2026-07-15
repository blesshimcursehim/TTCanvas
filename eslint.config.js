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
    },
    rules: {
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
