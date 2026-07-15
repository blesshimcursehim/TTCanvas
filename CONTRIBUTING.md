# Contributing to TTCanvas

Thanks for your interest in helping out! TTCanvas is a small, local-first open-source project and
outside contributions are very welcome, whether that's a bug report, a docs fix, or a whole new
widget.

This guide gets you from a fresh clone to a passing build. If anything here is unclear or out of date,
please open an issue or say hello in [Discord](https://discord.gg/ADvK4HEwFE).

---

## Before you start: what TTCanvas is (and is not)

TTCanvas is a **GM screen** for tabletop RPGs: a freeform canvas of widgets plus a separate
player-facing window. It runs locally and stores everything in a plain folder the user owns.

It is deliberately **not** a virtual tabletop. To keep pull requests aligned with the project's
direction, please keep these non-goals in mind:

- **Not a VTT** - no multiplayer netcode, no grid-based combat automation, no rules engine. Widgets
  are reference / display / GM-workflow tools, not game logic.
- **Offline-first** - no cloud services, accounts, telemetry, or analytics. The frontend never makes
  direct network calls; anything that needs the network goes through a Rust command.
- **User owns their data** - everything is plain Markdown / JSON in a local vault folder.

If you have an idea that pushes on these lines, open an issue to discuss it first - it'll save you
time before you write code.

---

## Tech stack

Tauri 2 (Rust backend) + React 19 + TypeScript (strict) + Vite, in a pnpm monorepo.

- `src/` - the app shell: canvas, widget registry, and `App.tsx` (the central state owner).
- `packages/core/` - shared React contexts + types, published internally as `@ttcanvas/core`.
- `packages/widgets-builtin/` - the built-in widgets, as `@ttcanvas/widgets-builtin`.
- `src-tauri/` - the Rust backend (commands and capabilities).
- `site/` - the Astro landing page.

---

## Getting set up

**Prerequisites**

- **Node.js** LTS (20 or newer) and **pnpm 10** (`npm install -g pnpm`).
- **Rust** stable, via [rustup](https://rustup.rs/) - needed for the Tauri backend.
- **Linux only** - system libraries for building Tauri:

  ```bash
  sudo apt-get install -y \
    libwebkit2gtk-4.1-dev \
    libssl-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    patchelf
  ```

  (See the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for other distros, macOS,
  and Windows.)

**Clone and run**

```bash
git clone https://github.com/blesshimcursehim/TTCanvas.git
cd TTCanvas
pnpm install
pnpm tauri dev      # launches the desktop app with hot reload
```

---

## Checks to run before opening a PR

These are exactly what CI runs on every pull request, so run them locally first:

```bash
npx tsc --noEmit                 # TypeScript typecheck (strict)
npx vitest run                   # frontend + unit tests (alias: pnpm test)
cd src-tauri && cargo check      # Rust compiles
```

A production build (optional, slower) is `pnpm tauri build`.

There is no linter or code formatter configured - just **match the style of the surrounding code**.

---

## Code conventions

- **License header on every new `.ts` / `.tsx` / `.rs` file.** Copy it verbatim from any existing
  source file:

  ```ts
  // SPDX-License-Identifier: GPL-3.0-or-later
  // Copyright (C) 2026 blesshimcursehim
  //
  // Plugins loaded via the official Plugin SDK are not considered
  // derivative works; see the Plugin Exception in LICENSE.
  ```

- **TypeScript strict, no `any`.** Use functional React components and prefer named exports.
- **CSS Modules only** (`Component.module.css`) - no CSS-in-JS. Use the design tokens in
  `src/styles/tokens.css` (colours, spacing, radii) rather than hardcoded values, so themes work.
- **Logging:** for anything that should persist to the app log, use the structured logger in
  `src/diagnostics/log.ts`, not `console.log`.
- **Widget contract:** a widget component receives only `{ state, onChange }`. Cross-widget data
  (party, calendar, initiative, etc.) flows through `@ttcanvas/core` React contexts - don't reach
  across widgets directly.
- **Stay offline:** no `fetch` / network calls from the frontend. Route anything networked through a
  Rust command in `src-tauri/`.
- **Text style:** use plain hyphens (`-`) in code, UI strings, and docs - not the longer em or en
  dashes, which look inconsistent in tooltips and labels.

---

## Adding a widget

The built-in widgets follow a consistent registration pattern. To add one:

1. Create `packages/widgets-builtin/src/<name>/` with `<Name>.tsx`, `<Name>.module.css`, and
   `types.ts` (start by copying an existing simple widget as a template).
2. Export the component and its state type from `packages/widgets-builtin/src/index.ts`.
3. Add a Zod state parser in `src/widgets/stateSchemas.ts`, plus a case in its test file. Use
   `.catch(...)` defaults for every field so old saved vaults keep loading.
4. Register the widget in `src/widgets/register.ts` (type id, title, category, default size, default
   state, icon, and whether it's a singleton).
5. Add an icon in `src/icons/Icon.tsx`.
6. Add tests for any non-trivial logic and run the checks above.

**A note on saved state:** widget state is validated on load. When you add or change a field, always
give it a `.catch(...)` default so a vault saved by an older version still opens cleanly. Never make a
change that hard-breaks an existing workspace.

---

## Commits and pull requests

- Branch off `main`; keep each PR focused on one feature or fix.
- Reference the issue it addresses (e.g. `Fixes #123`) in the PR description.
- Make sure the three checks above pass.
- Explain **what** changed and **why**. For UI changes, a screenshot or short screen recording is very
  much appreciated.
- If your change is user-facing, add a line to `CHANGELOG.md` under the `## Unreleased` heading.

Good first issues are labelled [`good first issue`](https://github.com/blesshimcursehim/TTCanvas/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
- those are self-contained and a friendly place to start.

---

## Licensing of contributions

TTCanvas is licensed under **GPL-3.0-or-later**, with a Plugin Exception for plugins loaded through the
official Plugin SDK (see [LICENSE](LICENSE)). By submitting a contribution, you agree that it is
licensed under the same terms.

---

## Community

Questions, ideas, or just want to say hi? Join the [Discord](https://discord.gg/ADvK4HEwFE), or open an
issue. Please be respectful and constructive - we want this to be a welcoming project for GMs and
developers of all experience levels.
