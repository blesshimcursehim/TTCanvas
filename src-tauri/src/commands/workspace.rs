// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

use crate::error::CommandError;
use crate::ipc_guard::require_main_window;
use crate::vault_safety::{ensure_contained_dir, verify_contained};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn workspace_path_is_inside_ttcanvas_dir() {
        let path = workspace_path("/home/user/MyVault");
        assert!(path.starts_with("/home/user/MyVault/.ttcanvas"));
        assert!(path.ends_with("workspace.json"));
    }

    #[test]
    fn workspace_path_hidden_dir_name() {
        let path = workspace_path("/vault");
        let parent = path.parent().unwrap();
        assert_eq!(parent.file_name().unwrap(), ".ttcanvas");
    }

    #[test]
    fn workspace_path_different_vaults_do_not_share_path() {
        let a = workspace_path("/vaults/Campaign1");
        let b = workspace_path("/vaults/Campaign2");
        assert_ne!(a, b);
    }

    #[test]
    fn load_workspace_returns_none_when_vault_does_not_exist() {
        let result = load_workspace_impl("/nonexistent_ttcanvas_vault_path_xyz/");
        assert!(matches!(result, Ok(None)));
    }

    #[test]
    fn save_and_load_workspace_round_trip() {
        let tmp = std::env::temp_dir().join(format!("ttcanvas_ws_rt_{}", std::process::id()));
        let vault_path = tmp.to_string_lossy().to_string();

        let state = json!({
            "version": 2,
            "activeLayout": "Default",
            "layouts": { "Default": { "widgets": [] } },
            "showGrid": true,
            "showVignette": false
        });

        save_workspace_impl(&vault_path, state.clone()).unwrap();
        let loaded = load_workspace_impl(&vault_path).unwrap().unwrap();
        assert_eq!(loaded, state);

        fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn load_workspace_returns_none_for_malformed_json_and_backs_up() {
        let tmp = std::env::temp_dir().join(format!("ttcanvas_ws_bad_{}", std::process::id()));
        let ttcanvas_dir = tmp.join(".ttcanvas");
        fs::create_dir_all(&ttcanvas_dir).unwrap();
        fs::write(ttcanvas_dir.join("workspace.json"), b"not { valid json!!").unwrap();

        let result = load_workspace_impl(&tmp.to_string_lossy());
        assert!(matches!(result, Ok(None)));
        assert!(ttcanvas_dir.join("workspace.json.bak").exists());

        fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    #[cfg(unix)]
    fn save_workspace_rejects_a_symlinked_ttcanvas_dir_pointing_outside_vault() {
        let tmp =
            std::env::temp_dir().join(format!("ttcanvas_ws_symlink_vault_{}", std::process::id()));
        let outside = std::env::temp_dir().join(format!(
            "ttcanvas_ws_symlink_outside_{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&tmp);
        let _ = fs::remove_dir_all(&outside);
        fs::create_dir_all(&tmp).unwrap();
        fs::create_dir_all(&outside).unwrap();
        std::os::unix::fs::symlink(&outside, tmp.join(".ttcanvas")).unwrap();

        let state = json!({ "version": 2 });
        let result = save_workspace_impl(&tmp.to_string_lossy(), state);

        assert!(result.is_err());
        assert!(!outside.join("workspace.json").exists());

        fs::remove_dir_all(&tmp).ok();
        fs::remove_dir_all(&outside).ok();
    }

    #[test]
    #[cfg(unix)]
    fn load_workspace_rejects_a_symlinked_ttcanvas_dir_pointing_outside_vault() {
        let tmp = std::env::temp_dir().join(format!(
            "ttcanvas_ws_load_symlink_vault_{}",
            std::process::id()
        ));
        let outside = std::env::temp_dir().join(format!(
            "ttcanvas_ws_load_symlink_outside_{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&tmp);
        let _ = fs::remove_dir_all(&outside);
        fs::create_dir_all(&tmp).unwrap();
        fs::create_dir_all(&outside).unwrap();
        fs::write(outside.join("workspace.json"), b"{\"version\":2}").unwrap();
        std::os::unix::fs::symlink(&outside, tmp.join(".ttcanvas")).unwrap();

        let result = load_workspace_impl(&tmp.to_string_lossy());

        assert!(result.is_err());

        fs::remove_dir_all(&tmp).ok();
        fs::remove_dir_all(&outside).ok();
    }
}

fn workspace_path(vault_path: &str) -> PathBuf {
    PathBuf::from(vault_path)
        .join(".ttcanvas")
        .join("workspace.json")
}

fn load_workspace_impl(vault_path: &str) -> Result<Option<Value>, CommandError> {
    let path = workspace_path(vault_path);
    if !path.exists() {
        return Ok(None);
    }
    // The vault root is trusted (chosen via a native folder dialog) but its
    // contents aren't - verify .ttcanvas hasn't been replaced with a symlink
    // pointing outside the vault before reading through it.
    verify_contained(vault_path, &path)?;
    let content = fs::read_to_string(&path)?;
    match serde_json::from_str::<Value>(&content) {
        Ok(state) => Ok(Some(state)),
        Err(_) => {
            // Corrupted JSON - back it up so the user keeps a copy, then start fresh.
            let bak = path.with_extension("json.bak");
            let _ = fs::rename(&path, &bak);
            Ok(None)
        }
    }
}

fn save_workspace_impl(vault_path: &str, state: Value) -> Result<(), CommandError> {
    ensure_contained_dir(vault_path, ".ttcanvas")?;
    let path = workspace_path(vault_path);
    let content = serde_json::to_string_pretty(&state)?;
    // Atomic write: write to a temp file then rename to avoid corruption on crash.
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, content)?;
    fs::rename(&tmp, &path)?;
    Ok(())
}

#[tauri::command]
pub fn load_workspace(
    window: tauri::WebviewWindow,
    vault_path: String,
) -> Result<Option<Value>, CommandError> {
    require_main_window(&window)?;
    load_workspace_impl(&vault_path)
}

#[tauri::command]
pub fn save_workspace(
    window: tauri::WebviewWindow,
    vault_path: String,
    state: Value,
) -> Result<(), CommandError> {
    require_main_window(&window)?;
    save_workspace_impl(&vault_path, state)
}
