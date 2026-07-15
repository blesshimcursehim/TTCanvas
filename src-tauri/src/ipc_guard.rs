// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

use crate::error::CommandError;

/// Rejects a command call unless it comes from the main window.
///
/// Tauri's plugin capability files only scope the *plugin* APIs available to
/// each webview - custom `#[tauri::command]`s are callable from any window
/// unless a command checks the caller itself. The player webview renders a
/// read-only display driven entirely by events pushed from the main window
/// (see `PlayerWindow.tsx`'s `listen()` calls); it has no legitimate reason
/// to reach vault files, workspace/config state, AI providers, or window
/// management directly. Call this first in every command that isn't part of
/// the player's own small self-control surface (`set_player_fullscreen`,
/// `set_player_decorations`) or shared crash-recovery UI (`log_file_path`).
pub(crate) fn require_main_window(window: &tauri::WebviewWindow) -> Result<(), CommandError> {
    if window.label() != "main" {
        return Err(CommandError::Other(
            "this command is only available from the main window".to_string(),
        ));
    }
    Ok(())
}
