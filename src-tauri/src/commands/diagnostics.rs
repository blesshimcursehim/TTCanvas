// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

use crate::error::CommandError;
use crate::ipc_guard::require_main_window;
use std::fs;
use tauri::Manager;

/// Absolute path to the rotating log file written by tauri-plugin-log.
fn log_file(app: &tauri::AppHandle) -> Result<std::path::PathBuf, CommandError> {
    let dir = app.path().app_log_dir()?;
    Ok(dir.join("ttcanvas.log"))
}

/// Absolute path to the current log file, for revealing it in the file manager.
/// Deliberately left callable from both windows: the crash-fallback UI in
/// `ErrorBoundary.tsx` wraps the player window too, and a player-side crash
/// should still let the user find the log.
#[tauri::command]
pub fn log_file_path(app: tauri::AppHandle) -> Result<String, CommandError> {
    Ok(log_file(&app)?.to_string_lossy().to_string())
}

/// Return the last `lines` lines of the log file (for the in-app viewer).
/// Returns an empty string if nothing has been logged yet.
#[tauri::command]
pub fn read_log_tail(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    lines: usize,
) -> Result<String, CommandError> {
    require_main_window(&window)?;
    let path = log_file(&app)?;
    if !path.exists() {
        return Ok(String::new());
    }
    let content = fs::read_to_string(&path)?;
    let tail: Vec<&str> = content.lines().rev().take(lines).collect();
    Ok(tail.into_iter().rev().collect::<Vec<_>>().join("\n"))
}

/// Truncate the log file so the user can start fresh.
#[tauri::command]
pub fn clear_log(window: tauri::WebviewWindow, app: tauri::AppHandle) -> Result<(), CommandError> {
    require_main_window(&window)?;
    let path = log_file(&app)?;
    if path.exists() {
        fs::write(&path, "")?;
    }
    Ok(())
}
