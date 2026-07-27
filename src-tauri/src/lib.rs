// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

mod ai_cancel;
mod commands;
mod error;
mod ipc_guard;
mod vault_safety;

use commands::app_config::{load_app_config, save_app_config};
use commands::diagnostics::{clear_log, log_file_path, read_log_tail};
use commands::ollama::{
    ai_cancel_generate, ollama_check, ollama_generate, ollama_list_models, openai_generate,
    openai_list_models,
};
use commands::player_window::{
    CloseConfirmed, ClosePending, close_player_window, confirm_close, get_player_window_bounds,
    open_player_window, player_window_exists, set_player_decorations, set_player_fullscreen,
};
use commands::vault::{
    CurrentVaultPath, VaultWatcherState, copy_to_vault_maps, copy_to_vault_portraits,
    delete_vault_file, list_folder_images, list_mod_files, list_vault_files, open_vault,
    pick_audio_file, pick_image_file, read_file_base64, read_player_image_base64, read_vault_file,
    save_text_file, watch_vault, write_file_base64, write_vault_file,
};
use commands::workspace::{load_workspace, save_workspace};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Log unexpected Rust panics to the same rotating file before the process dies,
    // while preserving the default (stderr) hook for local debugging.
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        log::error!("PANIC: {info}");
        default_hook(info);
    }));

    let log_level = if cfg!(debug_assertions) {
        log::LevelFilter::Info
    } else {
        log::LevelFilter::Warn
    };

    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::LogDir {
                        file_name: Some("ttcanvas".into()),
                    },
                ))
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::Stdout,
                ))
                .level(log_level)
                .max_file_size(2_000_000) // ~2 MB per file
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepOne)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(VaultWatcherState(std::sync::Mutex::new(None)))
        .manage(CurrentVaultPath(std::sync::Mutex::new(None)))
        .manage(CloseConfirmed(AtomicBool::new(false)))
        .manage(ClosePending(AtomicBool::new(false)))
        .setup(|app| {
            let app_handle = app.handle().clone();
            let main_window = app
                .get_webview_window("main")
                .expect("main window must exist at setup");
            main_window.on_window_event(move |event| match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    let confirmed = app_handle.state::<CloseConfirmed>();
                    if confirmed.0.load(Ordering::SeqCst) {
                        return; // confirm_close() already called - let it through
                    }
                    let pending = app_handle.state::<ClosePending>();
                    if pending.0.swap(true, Ordering::SeqCst) {
                        // Already pending and renderer never responded - force close
                        return;
                    }
                    api.prevent_close();
                    app_handle.emit("main-close-requested", ()).ok();
                }
                tauri::WindowEvent::Destroyed => {
                    // Main is gone one way or another - normal quit (the frontend already closed
                    // the player window, so this is a no-op), the force-close path above (which
                    // returns without ever giving the frontend a chance to), or a stale
                    // frontend playerWindowOpen ref after a main-webview reload. None of those
                    // should leave the player window behind, so close it here regardless of
                    // whether the frontend handler ran.
                    if let Some(player) = app_handle.get_webview_window("player") {
                        player.close().ok();
                    }
                }
                _ => {}
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_app_config,
            save_app_config,
            load_workspace,
            save_workspace,
            open_vault,
            read_vault_file,
            write_vault_file,
            delete_vault_file,
            list_vault_files,
            list_folder_images,
            read_file_base64,
            read_player_image_base64,
            pick_image_file,
            pick_audio_file,
            copy_to_vault_maps,
            copy_to_vault_portraits,
            write_file_base64,
            watch_vault,
            save_text_file,
            list_mod_files,
            ollama_check,
            ollama_list_models,
            ollama_generate,
            openai_list_models,
            openai_generate,
            ai_cancel_generate,
            open_player_window,
            close_player_window,
            player_window_exists,
            get_player_window_bounds,
            set_player_fullscreen,
            set_player_decorations,
            confirm_close,
            log_file_path,
            read_log_tail,
            clear_log,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
