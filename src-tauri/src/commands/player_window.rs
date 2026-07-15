// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

use crate::error::CommandError;
use crate::ipc_guard::require_main_window;
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub struct CloseConfirmed(pub AtomicBool);
/// Set to true when the first CloseRequested is received. A second CloseRequested
/// while this is true means the renderer never responded - force-close instead of
/// preventing again so a wedged renderer can't trap the app open.
pub struct ClosePending(pub AtomicBool);

#[derive(Clone, Serialize)]
pub struct PlayerWindowBounds {
    pub x: i32,
    pub y: i32,
    pub w: u32,
    pub h: u32,
}

#[tauri::command]
pub async fn open_player_window(
    window: WebviewWindow,
    app: AppHandle,
    saved_x: Option<i32>,
    saved_y: Option<i32>,
    saved_w: Option<u32>,
    saved_h: Option<u32>,
) -> Result<(), CommandError> {
    require_main_window(&window)?;
    if let Some(win) = app.get_webview_window("player") {
        win.set_focus()?;
        return Ok(());
    }

    let w = saved_w.unwrap_or(1280) as f64;
    let h = saved_h.unwrap_or(720) as f64;

    let builder = WebviewWindowBuilder::new(&app, "player", WebviewUrl::App("index.html".into()))
        .title("TTCanvas - Player View")
        .inner_size(w, h)
        .decorations(false)
        .resizable(true);

    let builder = if let (Some(x), Some(y)) = (saved_x, saved_y) {
        // Only restore position if it falls within an available monitor.
        // Positions saved on a since-disconnected display would open the window off-screen.
        let on_screen = app
            .available_monitors()
            .map(|monitors| {
                monitors.iter().any(|m| {
                    let pos = m.position();
                    let size = m.size();
                    x >= pos.x
                        && y >= pos.y
                        && x < pos.x + size.width as i32
                        && y < pos.y + size.height as i32
                })
            })
            .unwrap_or(false);
        if on_screen {
            builder.position(x as f64, y as f64)
        } else {
            builder
        }
    } else {
        builder
    };

    let win = builder.build()?;

    // On close, emit bounds to main so the frontend can persist them; then emit closed on destroy
    let app_handle = app.clone();
    let win_handle = win.clone();
    win.on_window_event(move |event| match event {
        tauri::WindowEvent::CloseRequested { .. } => {
            if let Some(main) = app_handle.get_webview_window("main") {
                if let (Ok(pos), Ok(size)) = (win_handle.outer_position(), win_handle.outer_size())
                {
                    main.emit(
                        "player-window-bounds",
                        PlayerWindowBounds {
                            x: pos.x,
                            y: pos.y,
                            w: size.width,
                            h: size.height,
                        },
                    )
                    .ok();
                }
            }
        }
        tauri::WindowEvent::Destroyed => {
            if let Some(main) = app_handle.get_webview_window("main") {
                main.emit("player-window-closed", ()).ok();
            }
        }
        _ => {}
    });

    Ok(())
}

#[tauri::command]
pub async fn get_player_window_bounds(
    window: WebviewWindow,
    app: AppHandle,
) -> Result<Option<PlayerWindowBounds>, CommandError> {
    require_main_window(&window)?;
    let Some(win) = app.get_webview_window("player") else {
        return Ok(None);
    };
    let (Ok(pos), Ok(size)) = (win.outer_position(), win.outer_size()) else {
        return Ok(None);
    };
    Ok(Some(PlayerWindowBounds {
        x: pos.x,
        y: pos.y,
        w: size.width,
        h: size.height,
    }))
}

#[tauri::command]
pub async fn close_player_window(
    window: WebviewWindow,
    app: AppHandle,
) -> Result<(), CommandError> {
    require_main_window(&window)?;
    if let Some(win) = app.get_webview_window("player") {
        win.close()?;
    }
    Ok(())
}

#[tauri::command]
pub fn player_window_exists(window: WebviewWindow, app: AppHandle) -> Result<bool, CommandError> {
    require_main_window(&window)?;
    Ok(app.get_webview_window("player").is_some())
}

#[tauri::command]
pub async fn set_player_fullscreen(app: AppHandle, fullscreen: bool) -> Result<(), CommandError> {
    let win = app
        .get_webview_window("player")
        .ok_or_else(|| CommandError::Other("Player window not open".to_string()))?;
    win.set_fullscreen(fullscreen)?;
    // Notify both windows so each can sync its own local fullscreen state.
    app.emit("player-fullscreen-changed", fullscreen).ok();
    Ok(())
}

#[tauri::command]
pub async fn set_player_decorations(app: AppHandle, decorations: bool) -> Result<(), CommandError> {
    let win = app
        .get_webview_window("player")
        .ok_or_else(|| CommandError::Other("Player window not open".to_string()))?;
    // Toggle the OS frame (title bar + resize borders) on demand so a frameless,
    // immersive player view can still be moved/resized/closed when needed.
    win.set_decorations(decorations)?;
    Ok(())
}

#[tauri::command]
pub async fn confirm_close(window: WebviewWindow, app: AppHandle) -> Result<(), CommandError> {
    require_main_window(&window)?;
    app.state::<CloseConfirmed>()
        .0
        .store(true, Ordering::SeqCst);
    if let Some(win) = app.get_webview_window("main") {
        win.close()?;
    }
    Ok(())
}
