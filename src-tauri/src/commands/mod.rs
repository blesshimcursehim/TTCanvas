// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

pub mod app_config;
pub mod diagnostics;
pub mod ollama;
pub mod player_window;
pub mod vault;
pub mod workspace;

/// Preserves a copy of `path` at `backup` before the caller overwrites the
/// original with recovered defaults. Tries a rename first (fast, and usually
/// all that's needed within one directory); if that fails - e.g. a cross-device
/// rename, or the destination being briefly locked - falls back to a plain
/// copy, which only needs read+write access rather than filesystem-level move
/// support. Returns whether a backup copy now exists on disk; a caller must not
/// claim a backup succeeded (or overwrite un-preserved data) unless this does.
pub(crate) fn backup_file(path: &std::path::Path, backup: &std::path::Path) -> bool {
    std::fs::rename(path, backup).is_ok() || std::fs::copy(path, backup).is_ok()
}
