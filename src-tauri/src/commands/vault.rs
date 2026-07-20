// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

use crate::error::CommandError;
use crate::ipc_guard::require_main_window;
use crate::vault_safety::{
    ensure_contained_dir, is_allowed_player_image_dir, reject_symlink, safe_join,
    validate_component,
};
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{Emitter, Manager};

pub struct VaultWatcherState(pub Mutex<Option<RecommendedWatcher>>);

/// The main window's currently open vault, as last reported through
/// `watch_vault` (a main-only command called once per vault open/switch).
/// The only consumer today is `read_player_image_base64`, which needs some
/// server-side notion of "the real vault" to check a player-supplied folder
/// path against - the player webview has no vault-open flow of its own and
/// is never trusted to assert its own vault path.
pub struct CurrentVaultPath(pub Mutex<Option<PathBuf>>);

#[tauri::command]
pub async fn open_vault(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    default_path: Option<String>,
) -> Result<Option<String>, CommandError> {
    require_main_window(&window)?;
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = tokio::sync::oneshot::channel();
    let mut dialog = app.dialog().file();
    if let Some(path) = default_path {
        dialog = dialog.set_directory(path);
    }
    dialog.pick_folder(move |result| {
        let _ = tx.send(result);
    });
    match rx.await {
        Ok(Some(path)) => Ok(Some(path.to_string())),
        _ => Ok(None),
    }
}

#[tauri::command]
pub async fn read_vault_file(
    window: tauri::WebviewWindow,
    vault_path: String,
    relative_path: String,
) -> Result<String, CommandError> {
    require_main_window(&window)?;
    let path = safe_join(&vault_path, &relative_path)?;
    tokio::task::spawn_blocking(move || fs::read_to_string(&path).map_err(CommandError::from))
        .await
        .map_err(CommandError::from)
        .and_then(|r| r)
}

#[tauri::command]
pub async fn write_vault_file(
    window: tauri::WebviewWindow,
    vault_path: String,
    relative_path: String,
    content: String,
) -> Result<(), CommandError> {
    require_main_window(&window)?;
    let path = safe_join(&vault_path, &relative_path)?;
    tokio::task::spawn_blocking(move || -> Result<(), CommandError> {
        if let Some(dir) = path.parent() {
            fs::create_dir_all(dir)?;
        }
        // Guard the final component right before writing: safe_join verified the
        // containing dirs, but a dangling symlink planted at this exact name
        // would still be followed by fs::write out of the vault (CR-011).
        reject_symlink(&path)?;
        fs::write(&path, content)?;
        Ok(())
    })
    .await
    .map_err(CommandError::from)
    .and_then(|r| r)
}

#[tauri::command]
pub async fn list_vault_files(
    window: tauri::WebviewWindow,
    vault_path: String,
    extension: String,
) -> Result<Vec<String>, CommandError> {
    require_main_window(&window)?;
    tokio::task::spawn_blocking(move || -> Result<Vec<String>, CommandError> {
        let base = PathBuf::from(&vault_path);
        if !base.is_dir() {
            return Ok(vec![]);
        }
        let ext = extension.trim_start_matches('.').to_string();
        let mut results = Vec::new();
        collect_files(&base, &base, &ext, &mut results)?;
        Ok(results)
    })
    .await
    .map_err(CommandError::from)
    .and_then(|r| r)
}

fn collect_files(
    base: &Path,
    dir: &Path,
    extension: &str,
    results: &mut Vec<String>,
) -> Result<(), CommandError> {
    let entries = fs::read_dir(dir)?;
    for entry in entries.flatten() {
        let path = entry.path();
        // Use file_type() (does not follow symlinks) so symlinked dirs don't cause loops.
        if entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
            collect_files(base, &path, extension, results)?;
        } else if path.extension().and_then(|e| e.to_str()) == Some(extension)
            && let Ok(rel) = path.strip_prefix(base)
        {
            results.push(rel.to_string_lossy().replace('\\', "/"));
        }
    }
    Ok(())
}

#[derive(serde::Serialize)]
pub struct SavedImage {
    pub maps_folder: String,
    pub file_name: String,
}

#[tauri::command]
pub async fn pick_image_file(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
) -> Result<Option<String>, CommandError> {
    require_main_window(&window)?;
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .add_filter("Images", &["png", "jpg", "jpeg", "webp"])
        .pick_file(move |result| {
            let _ = tx.send(result);
        });
    match rx.await {
        Ok(Some(path)) => Ok(Some(path.to_string())),
        _ => Ok(None),
    }
}

#[tauri::command]
pub async fn pick_audio_file(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
) -> Result<Option<String>, CommandError> {
    require_main_window(&window)?;
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .add_filter("Audio", &["mp3", "ogg", "wav", "flac", "m4a", "aac"])
        .pick_file(move |result| {
            let _ = tx.send(result);
        });
    match rx.await {
        Ok(Some(path)) => Ok(Some(path.to_string())),
        _ => Ok(None),
    }
}

#[tauri::command]
pub async fn copy_to_vault_maps(
    window: tauri::WebviewWindow,
    vault_path: String,
    source_path: String,
) -> Result<SavedImage, CommandError> {
    require_main_window(&window)?;
    let source = PathBuf::from(&source_path);
    let stem = source
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or_else(|| CommandError::Other("Invalid source path".to_string()))?
        .to_string();
    let ext = source
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_string();

    tokio::task::spawn_blocking(move || -> Result<SavedImage, CommandError> {
        let maps_dir = ensure_contained_dir(&vault_path, "maps")?;

        let mut file_name = format!("{}.{}", stem, ext);
        let mut counter = 2u32;
        while maps_dir.join(&file_name).exists() {
            file_name = format!("{}-{}.{}", stem, counter, ext);
            counter += 1;
        }

        // The collision loop above uses .exists() (follows symlinks), so a
        // dangling symlink planted at file_name reads as a free name; reject it
        // before fs::copy would follow it out of the vault (CR-011).
        let dest = maps_dir.join(&file_name);
        reject_symlink(&dest)?;
        fs::copy(Path::new(&source_path), &dest)?;

        Ok(SavedImage {
            maps_folder: maps_dir.to_string_lossy().to_string(),
            file_name,
        })
    })
    .await
    .map_err(CommandError::from)
    .and_then(|r| r)
}

#[derive(serde::Serialize)]
pub struct SavedPortrait {
    pub portraits_folder: String,
    pub file_name: String,
}

#[tauri::command]
pub async fn copy_to_vault_portraits(
    window: tauri::WebviewWindow,
    vault_path: String,
    member_id: String,
    source_path: String,
) -> Result<SavedPortrait, CommandError> {
    require_main_window(&window)?;
    validate_component(&member_id)?;
    let source = PathBuf::from(&source_path);
    let ext = source
        .extension()
        .and_then(|e| e.to_str())
        .ok_or_else(|| CommandError::Other("Source file has no extension".to_string()))?
        .to_lowercase();

    tokio::task::spawn_blocking(move || -> Result<SavedPortrait, CommandError> {
        let portraits_dir = ensure_contained_dir(&vault_path, "portraits")?;

        // ensure_contained_dir verified `portraits/` itself, but not this final
        // {member_id}.{ext} component - a symlink pre-planted at that name would
        // otherwise be followed by fs::copy out of the vault (CR-011).
        let file_name = format!("{}.{}", member_id, ext);
        let dest = portraits_dir.join(&file_name);
        reject_symlink(&dest)?;
        fs::copy(Path::new(&source_path), &dest)?;

        Ok(SavedPortrait {
            portraits_folder: portraits_dir.to_string_lossy().to_string(),
            file_name,
        })
    })
    .await
    .map_err(CommandError::from)
    .and_then(|r| r)
}

fn is_image_path(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| {
            let lower = e.to_lowercase();
            matches!(lower.as_str(), "png" | "jpg" | "jpeg" | "webp")
        })
        .unwrap_or(false)
}

fn collect_image_files(
    base: &Path,
    dir: &Path,
    results: &mut Vec<String>,
) -> Result<(), CommandError> {
    let entries = fs::read_dir(dir)?;
    for entry in entries.flatten() {
        let path = entry.path();
        if entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
            collect_image_files(base, &path, results)?;
        } else if is_image_path(&path)
            && let Ok(rel) = path.strip_prefix(base)
        {
            results.push(rel.to_string_lossy().replace('\\', "/"));
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn list_folder_images(
    window: tauri::WebviewWindow,
    folder_path: String,
) -> Result<Vec<String>, CommandError> {
    require_main_window(&window)?;
    tokio::task::spawn_blocking(move || -> Result<Vec<String>, CommandError> {
        let base = PathBuf::from(&folder_path);
        if !base.is_dir() {
            return Ok(vec![]);
        }
        let mut results = Vec::new();
        collect_image_files(&base, &base, &mut results)?;
        results.sort();
        Ok(results)
    })
    .await
    .map_err(CommandError::from)
    .and_then(|r| r)
}

async fn read_base64(folder_path: String, file_name: String) -> Result<String, CommandError> {
    use base64::{Engine as _, engine::general_purpose};
    validate_component(&file_name)?;
    let path = PathBuf::from(&folder_path).join(&file_name);
    tokio::task::spawn_blocking(move || -> Result<String, CommandError> {
        // validate_component only checks the filename syntax; a symlink at that
        // name (e.g. maps/portrait.png -> ~/.ssh/id_rsa) would still be followed
        // by fs::read. Reject it before reading (CR-012). Legitimate map/portrait
        // images are always real files, so this never blocks a valid read.
        reject_symlink(&path)?;
        let bytes = fs::read(&path)?;
        Ok(general_purpose::STANDARD.encode(&bytes))
    })
    .await
    .map_err(CommandError::from)
    .and_then(|r| r)
}

#[tauri::command]
pub async fn read_file_base64(
    window: tauri::WebviewWindow,
    folder_path: String,
    file_name: String,
) -> Result<String, CommandError> {
    require_main_window(&window)?;
    read_base64(folder_path, file_name).await
}

/// Player-allowed counterpart to `read_file_base64`, narrowed to image files
/// only. The player webview needs this for map and portrait images pushed by
/// the main window's scene state (folder path + filename only, not the image
/// bytes, to avoid sending large base64 over an IPC event) - everything else
/// still goes through the main-only `read_file_base64`. Unlike that command,
/// this one isn't `require_main_window`-gated by design, so `folder_path` is
/// attacker-controlled input from a less-trusted caller: it's checked against
/// `CurrentVaultPath` (set by the main window's own `watch_vault` call) and
/// must resolve to exactly that vault's `maps` or `portraits` directory, not
/// merely end in an image extension.
#[tauri::command]
pub async fn read_player_image_base64(
    app: tauri::AppHandle,
    folder_path: String,
    file_name: String,
) -> Result<String, CommandError> {
    if !is_image_path(Path::new(&file_name)) {
        return Err(CommandError::Other(
            "only image files can be read this way".to_string(),
        ));
    }
    let vault_path = app
        .state::<CurrentVaultPath>()
        .0
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone()
        .ok_or_else(|| CommandError::Other("no vault is open".to_string()))?;
    if !is_allowed_player_image_dir(&vault_path, Path::new(&folder_path)) {
        return Err(CommandError::Other(
            "folder is not an approved player image folder".to_string(),
        ));
    }
    read_base64(folder_path, file_name).await
}

/// Writes decoded base64 bytes to `vault_path`/`relative_path`. Takes a vault
/// root plus a vault-relative path (rather than an arbitrary folder) so the
/// destination is contained by `safe_join` - previously this trusted an
/// arbitrary `folder_path` with only a filename-syntax check, letting a caller
/// (or a mod in the main webview) write anywhere the process could
/// (CR-011). Used for portraits, e.g. `relative_path = "portraits/<id>.jpg"`.
#[tauri::command]
pub async fn write_file_base64(
    window: tauri::WebviewWindow,
    vault_path: String,
    relative_path: String,
    base64_content: String,
) -> Result<(), CommandError> {
    use base64::{Engine as _, engine::general_purpose};
    require_main_window(&window)?;
    let path = safe_join(&vault_path, &relative_path)?;
    let bytes = general_purpose::STANDARD
        .decode(&base64_content)
        .map_err(CommandError::from)?;
    tokio::task::spawn_blocking(move || -> Result<(), CommandError> {
        if let Some(dir) = path.parent() {
            fs::create_dir_all(dir)?;
        }
        // Guard the final component against a planted symlink before writing,
        // as with write_vault_file (CR-011).
        reject_symlink(&path)?;
        fs::write(&path, bytes)?;
        Ok(())
    })
    .await
    .map_err(CommandError::from)
    .and_then(|r| r)
}

#[tauri::command]
pub async fn delete_vault_file(
    window: tauri::WebviewWindow,
    vault_path: String,
    relative_path: String,
) -> Result<(), CommandError> {
    require_main_window(&window)?;
    let path = safe_join(&vault_path, &relative_path)?;
    tokio::task::spawn_blocking(move || -> Result<(), CommandError> {
        if path.exists() {
            fs::remove_file(&path)?;
        }
        Ok(())
    })
    .await
    .map_err(CommandError::from)
    .and_then(|r| r)
}

#[tauri::command]
pub fn watch_vault(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    state: tauri::State<'_, VaultWatcherState>,
    current_vault: tauri::State<'_, CurrentVaultPath>,
    vault_path: String,
) -> Result<(), CommandError> {
    require_main_window(&window)?;
    *current_vault.0.lock().unwrap_or_else(|e| e.into_inner()) = Some(PathBuf::from(&vault_path));
    let app_handle = app.clone();
    let ttcanvas_dir = PathBuf::from(&vault_path).join(".ttcanvas");
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(event) = res {
            let paths: Vec<String> = event
                .paths
                .iter()
                .filter(|p| !p.starts_with(&ttcanvas_dir))
                .map(|p| p.to_string_lossy().to_string())
                .collect();
            if !paths.is_empty() {
                let _ = app_handle.emit("vault-changed", paths);
            }
        }
    })
    .map_err(|e| CommandError::Other(e.to_string()))?;

    watcher
        .watch(Path::new(&vault_path), RecursiveMode::Recursive)
        .map_err(|e| CommandError::Other(e.to_string()))?;

    let mut guard = state.0.lock().unwrap_or_else(|e| e.into_inner());
    *guard = Some(watcher);
    Ok(())
}

#[tauri::command]
pub async fn save_text_file(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    content: String,
    default_name: String,
) -> Result<bool, CommandError> {
    require_main_window(&window)?;
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_file_name(&default_name)
        .save_file(move |result| {
            let _ = tx.send(result);
        });
    match rx.await {
        Ok(Some(path)) => {
            let path_str = path.to_string();
            tokio::task::spawn_blocking(move || {
                fs::write(&path_str, content).map_err(CommandError::from)
            })
            .await
            .map_err(CommandError::from)
            .and_then(|r| r)?;
            Ok(true)
        }
        _ => Ok(false),
    }
}

#[tauri::command]
pub fn list_mod_files(
    window: tauri::WebviewWindow,
    vault_path: String,
) -> Result<Vec<String>, CommandError> {
    require_main_window(&window)?;
    let mods_dir = std::path::Path::new(&vault_path).join("mods");
    let Ok(entries) = std::fs::read_dir(&mods_dir) else {
        return Ok(vec![]);
    };
    let mut files: Vec<String> = entries
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().is_some_and(|ext| ext == "js"))
        .filter_map(|e| e.file_name().into_string().ok())
        .collect();
    files.sort();
    Ok(files)
}
