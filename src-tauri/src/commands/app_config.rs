// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

use crate::error::CommandError;
use crate::ipc_guard::require_main_window;
use serde_json::{Value, json};
use std::fs;
use tauri::Manager;

fn config_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, CommandError> {
    let dir = app.path().app_data_dir()?;
    Ok(dir.join("config.json"))
}

fn migrate_config(raw: Value) -> Value {
    // Migrate old format { "lastVaultPath": "..." } → new format
    if raw.get("lastVaultPath").is_some() {
        let recent = match raw["lastVaultPath"].as_str() {
            Some(p) => vec![p.to_string()],
            None => vec![],
        };
        return json!({ "recentVaults": recent, "lastBrowsePath": null });
    }
    raw
}

fn default_config() -> Value {
    json!({ "recentVaults": [], "lastBrowsePath": null })
}

/// Attempts to preserve a copy of a malformed config file before it's
/// overwritten with defaults. Tries a rename first (fast, and typically the
/// only thing needed within the same directory); if that fails - e.g. a
/// cross-device rename, or the destination being briefly locked - falls back
/// to a plain copy, which only needs read+write access rather than
/// filesystem-level move support. Returns whether a backup copy now exists
/// on disk; the caller must not claim a backup succeeded unless this does.
fn backup_malformed_config(path: &std::path::Path) -> bool {
    let bak = path.with_extension("json.bak");
    fs::rename(path, &bak).is_ok() || fs::copy(path, &bak).is_ok()
}

/// Loads and parses the config file at `path`, never failing: a missing
/// file, an unreadable one, or malformed JSON (partial write, a manual edit
/// gone wrong) all fall back to safe defaults instead of leaving the whole
/// app unable to render. Malformed JSON is backed up first so the user keeps
/// a copy - the result carries `"recovered": true` whenever a reset
/// happened, and `"backedUp"` reflects whether that backup actually
/// succeeded, so the frontend never claims a copy was saved when it wasn't.
/// Mirrors `load_workspace`'s handling of corrupted `workspace.json`, but
/// stricter: workspace loads happen mid-session and can surface a toast,
/// while a config load failure happens before the UI has rendered at all.
fn load_config_file(path: &std::path::Path) -> Value {
    if !path.exists() {
        return default_config();
    }
    let content = match fs::read_to_string(path) {
        Ok(c) => c,
        Err(err) => {
            log::warn!(
                "app_config: could not read {}, starting with defaults: {err}",
                path.display()
            );
            return default_config();
        }
    };
    match serde_json::from_str::<Value>(&content) {
        Ok(raw) => migrate_config(raw),
        Err(err) => {
            let backed_up = backup_malformed_config(path);
            if backed_up {
                log::warn!(
                    "app_config: malformed JSON at {}, backed up and resetting to defaults: {err}",
                    path.display()
                );
            } else {
                log::error!(
                    "app_config: malformed JSON at {} could not be backed up - resetting to \
                     defaults anyway, but the original content may be unrecoverable: {err}",
                    path.display()
                );
            }
            let mut result = default_config();
            result["recovered"] = json!(true);
            result["backedUp"] = json!(backed_up);
            result
        }
    }
}

#[tauri::command]
pub fn load_app_config(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
) -> Result<Value, CommandError> {
    require_main_window(&window)?;
    let path = config_path(&app)?;
    Ok(load_config_file(&path))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrate_config_preserves_new_format() {
        let raw = json!({ "recentVaults": ["/vault/a"], "lastBrowsePath": null });
        let migrated = migrate_config(raw.clone());
        assert_eq!(migrated, raw);
    }

    #[test]
    fn migrate_config_converts_last_vault_path_to_recent_vaults() {
        let raw = json!({ "lastVaultPath": "/vault/old" });
        let migrated = migrate_config(raw);
        assert_eq!(migrated["recentVaults"], json!(["/vault/old"]));
        assert_eq!(migrated["lastBrowsePath"], json!(null));
        assert!(migrated.get("lastVaultPath").is_none());
    }

    #[test]
    fn migrate_config_null_last_vault_path_gives_empty_recent_vaults() {
        let raw = json!({ "lastVaultPath": null });
        let migrated = migrate_config(raw);
        assert_eq!(migrated["recentVaults"], json!([]));
    }

    fn temp_config_path(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "ttcanvas_test_appcfg_{name}_{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir.join("config.json")
    }

    #[test]
    fn load_config_file_returns_defaults_when_missing() {
        let path = temp_config_path("missing");
        let result = load_config_file(&path);
        assert_eq!(result["recentVaults"], json!([]));
        assert_eq!(result["lastBrowsePath"], json!(null));
        assert!(result.get("recovered").is_none());
    }

    #[test]
    fn load_config_file_passes_through_valid_json() {
        let path = temp_config_path("valid");
        fs::write(
            &path,
            r#"{"recentVaults":["/vault/a"],"lastBrowsePath":null}"#,
        )
        .unwrap();
        let result = load_config_file(&path);
        assert_eq!(result["recentVaults"], json!(["/vault/a"]));
        assert!(result.get("recovered").is_none());
    }

    #[test]
    fn load_config_file_backs_up_and_recovers_from_malformed_json() {
        let path = temp_config_path("malformed");
        fs::write(&path, b"not { valid json!!").unwrap();

        let result = load_config_file(&path);

        assert_eq!(result["recentVaults"], json!([]));
        assert_eq!(result["recovered"], json!(true));
        assert_eq!(result["backedUp"], json!(true));
        let bak = path.with_extension("json.bak");
        assert!(bak.exists());
        assert!(!path.exists());
    }

    #[test]
    fn load_config_file_reports_backup_failure_honestly() {
        let path = temp_config_path("malformed_backup_fails");
        fs::write(&path, b"not { valid json!!").unwrap();
        // Block both the rename and the copy fallback by occupying the backup
        // path with a directory - neither can write a file over it.
        fs::create_dir_all(path.with_extension("json.bak")).unwrap();

        let result = load_config_file(&path);

        assert_eq!(result["recentVaults"], json!([]));
        assert_eq!(result["recovered"], json!(true));
        assert_eq!(result["backedUp"], json!(false));
        // Nothing could move or copy the source, so it's still there - not
        // silently discarded just because the backup failed.
        assert!(path.exists());
    }

    #[test]
    fn app_config_input_deserializes_the_frontend_s_camel_case_shape() {
        let raw = json!({
            "recentVaults": ["/vault/a"],
            "lastBrowsePath": null,
            "aiProvider": "openai",
            "aiBaseUrl": "http://x",
            "aiApiKey": "key",
            "aiModel": "gpt",
            "playerWindowX": 10,
            "playerWindowY": 20,
            "playerWindowW": 800,
            "playerWindowH": 600,
            "customConditions": [],
            "theme": "dark-amber",
            "accent": "plum",
            "density": "compact",
            "reduceMotion": true,
            "trustedModHashes": ["abc"],
        });
        let input: AppConfigInput = serde_json::from_value(raw).unwrap();
        assert_eq!(input.recent_vaults, vec!["/vault/a".to_string()]);
        assert_eq!(input.ai_provider.as_deref(), Some("openai"));
        assert_eq!(input.player_window_w, Some(800));
        assert_eq!(input.trusted_mod_hashes, Some(vec!["abc".to_string()]));
    }

    #[test]
    fn app_config_input_allows_missing_optional_fields() {
        let raw = json!({ "recentVaults": [] });
        let input: AppConfigInput = serde_json::from_value(raw).unwrap();
        assert!(input.last_browse_path.is_none());
        assert!(input.ai_provider.is_none());
        assert!(input.trusted_mod_hashes.is_none());
    }
}

/// Mirrors the frontend's `AppConfig` shape (`src/appConfig.ts`) as one
/// deserialisation target, so `save_app_config` takes a single struct
/// argument across IPC instead of one Rust parameter per preference field -
/// every field added to `AppConfig` over time had been adding another
/// argument to that command (clippy's `too_many_arguments`, CR-010). Fields
/// stay `Option`al with the same per-field fallback `save_app_config` already
/// had, so a caller sending a partial object still gets sane defaults instead
/// of a deserialisation error.
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfigInput {
    recent_vaults: Vec<String>,
    last_browse_path: Option<String>,
    ai_provider: Option<String>,
    ai_base_url: Option<String>,
    ai_api_key: Option<String>,
    ai_model: Option<String>,
    player_window_x: Option<i32>,
    player_window_y: Option<i32>,
    player_window_w: Option<u32>,
    player_window_h: Option<u32>,
    custom_conditions: Option<Vec<Value>>,
    theme: Option<String>,
    accent: Option<String>,
    density: Option<String>,
    reduce_motion: Option<bool>,
    clock_format: Option<String>,
    trusted_mod_hashes: Option<Vec<String>>,
}

#[tauri::command]
pub fn save_app_config(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    config: AppConfigInput,
) -> Result<(), CommandError> {
    require_main_window(&window)?;
    let path = config_path(&app)?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let content = serde_json::to_string_pretty(&json!({
        "recentVaults": config.recent_vaults,
        "lastBrowsePath": config.last_browse_path,
        "aiProvider": config.ai_provider.unwrap_or_else(|| "ollama".to_string()),
        "aiBaseUrl": config.ai_base_url.unwrap_or_default(),
        "aiApiKey": config.ai_api_key.unwrap_or_default(),
        "aiModel": config.ai_model,
        "playerWindowX": config.player_window_x,
        "playerWindowY": config.player_window_y,
        "playerWindowW": config.player_window_w,
        "playerWindowH": config.player_window_h,
        "customConditions": config.custom_conditions.unwrap_or_default(),
        "theme": config.theme.unwrap_or_else(|| "dark-vellum".to_string()),
        "accent": config.accent.unwrap_or_else(|| "amber".to_string()),
        "density": config.density.unwrap_or_else(|| "comfortable".to_string()),
        "reduceMotion": config.reduce_motion.unwrap_or(false),
        "clockFormat": config.clock_format.unwrap_or_else(|| "system".to_string()),
        "trustedModHashes": config.trusted_mod_hashes.unwrap_or_default(),
    }))?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, content)?;
    fs::rename(&tmp, &path)?;
    Ok(())
}
