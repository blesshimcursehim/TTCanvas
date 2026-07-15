// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

use thiserror::Error;

/// Typed error enum for all Tauri commands.
/// Serializes as the human-readable message string so the TypeScript side sees
/// the same error strings as before.
#[derive(Debug, Error)]
pub enum CommandError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("base64 error: {0}")]
    Base64(#[from] base64::DecodeError),

    #[error("task error: {0}")]
    Task(#[from] tokio::task::JoinError),

    #[error("Tauri error: {0}")]
    Tauri(#[from] tauri::Error),

    #[error("{0}")]
    Other(String),
}

impl serde::Serialize for CommandError {
    fn serialize<S: serde::Serializer>(&self, ser: S) -> Result<S::Ok, S::Error> {
        ser.serialize_str(&self.to_string())
    }
}
