// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

use crate::ai_cancel::CancelGuard;
use crate::error::CommandError;
use crate::ipc_guard::require_main_window;
use futures_util::StreamExt;
use std::sync::OnceLock;
use std::time::Duration;
use tauri::ipc::Channel;

const OLLAMA_BASE: &str = "http://localhost:11434";

static HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

fn http_client() -> &'static reqwest::Client {
    HTTP_CLIENT.get_or_init(reqwest::Client::new)
}

#[derive(Clone, serde::Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum OllamaChunk {
    Token { text: String },
    Done,
}

// ── Ollama (native API) ───────────────────────────────────────────────────────

#[tauri::command]
pub async fn ollama_check(window: tauri::WebviewWindow) -> Result<bool, CommandError> {
    require_main_window(&window)?;
    Ok(http_client()
        .get(format!("{}/api/tags", OLLAMA_BASE))
        .timeout(std::time::Duration::from_secs(2))
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false))
}

#[tauri::command]
pub async fn ollama_list_models(window: tauri::WebviewWindow) -> Result<Vec<String>, CommandError> {
    require_main_window(&window)?;
    let res = http_client()
        .get(format!("{}/api/tags", OLLAMA_BASE))
        .timeout(Duration::from_secs(10))
        .send()
        .await?
        .error_for_status()?
        .json::<serde_json::Value>()
        .await?;

    Ok(res["models"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m["name"].as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default())
}

#[tauri::command]
pub async fn ollama_generate(
    window: tauri::WebviewWindow,
    model: String,
    prompt: String,
    on_event: Channel<OllamaChunk>,
    request_id: String,
) -> Result<(), CommandError> {
    require_main_window(&window)?;
    let guard = CancelGuard::register(request_id);
    let response = tokio::select! {
        res = http_client()
            .post(format!("{}/api/generate", OLLAMA_BASE))
            .json(&serde_json::json!({ "model": model, "prompt": prompt, "stream": true }))
            .send() => res?.error_for_status()?,
        _ = guard.cancelled() => return Ok(()),
    };

    stream_ollama_response(response, on_event, &guard).await
}

/// Cancels a still-running `ollama_generate`/`openai_generate` call. Each of
/// those races its `send()` and every stream read against
/// `CancelGuard::cancelled()` via `tokio::select!`, so this interrupts
/// whichever of those is currently in progress (rather than only being
/// noticed once it resolves on its own) and drops the response/stream, which
/// closes the underlying connection so the provider stops being asked for
/// more tokens instead of just having them discarded on the frontend.
#[tauri::command]
pub fn ai_cancel_generate(
    window: tauri::WebviewWindow,
    request_id: String,
) -> Result<(), CommandError> {
    require_main_window(&window)?;
    crate::ai_cancel::cancel(&request_id);
    Ok(())
}

async fn stream_ollama_response(
    response: reqwest::Response,
    on_event: Channel<OllamaChunk>,
    guard: &CancelGuard,
) -> Result<(), CommandError> {
    let mut stream = response.bytes_stream();
    let mut buf = Vec::<u8>::new();

    loop {
        let bytes = tokio::select! {
            maybe = tokio::time::timeout(Duration::from_secs(30), stream.next()) => {
                match maybe.map_err(|_| {
                    CommandError::Other("AI timed out: no data received for 30 s".to_string())
                })? {
                    None => break,
                    Some(res) => res?,
                }
            }
            _ = guard.cancelled() => return Ok(()),
        };

        buf.extend_from_slice(&bytes);

        while let Some(nl) = buf.iter().position(|&b| b == b'\n') {
            let line = String::from_utf8_lossy(&buf[..nl]).trim().to_string();
            buf.drain(..=nl);
            if line.is_empty() {
                continue;
            }
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&line) {
                if let Some(token) = json["response"].as_str() {
                    if !token.is_empty() {
                        let _ = on_event.send(OllamaChunk::Token {
                            text: token.to_string(),
                        });
                    }
                }
                if json["done"].as_bool().unwrap_or(false) {
                    let _ = on_event.send(OllamaChunk::Done);
                    return Ok(());
                }
            }
        }
    }

    let _ = on_event.send(OllamaChunk::Done);
    Ok(())
}

// ── OpenAI-compatible API ─────────────────────────────────────────────────────

#[tauri::command]
pub async fn openai_list_models(
    window: tauri::WebviewWindow,
    base_url: String,
    api_key: String,
) -> Result<Vec<String>, CommandError> {
    require_main_window(&window)?;
    if !api_key.is_empty() && base_url.starts_with("http://") {
        log::warn!("openai_list_models: sending API key over plaintext HTTP to {base_url}");
    }
    let url = format!("{}/v1/models", base_url.trim_end_matches('/'));
    let mut req = http_client().get(&url);
    if !api_key.is_empty() {
        req = req.header("Authorization", format!("Bearer {}", api_key));
    }
    let res = req
        .timeout(Duration::from_secs(10))
        .send()
        .await?
        .error_for_status()?
        .json::<serde_json::Value>()
        .await?;

    Ok(res["data"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m["id"].as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default())
}

#[tauri::command]
pub async fn openai_generate(
    window: tauri::WebviewWindow,
    base_url: String,
    api_key: String,
    model: String,
    prompt: String,
    on_event: Channel<OllamaChunk>,
    request_id: String,
) -> Result<(), CommandError> {
    require_main_window(&window)?;
    let guard = CancelGuard::register(request_id);
    if !api_key.is_empty() && base_url.starts_with("http://") {
        log::warn!("openai_generate: sending API key over plaintext HTTP to {base_url}");
    }
    let url = format!("{}/v1/chat/completions", base_url.trim_end_matches('/'));
    let mut req = http_client().post(&url).json(&serde_json::json!({
        "model": model,
        "messages": [{ "role": "user", "content": prompt }],
        "stream": true
    }));
    if !api_key.is_empty() {
        req = req.header("Authorization", format!("Bearer {}", api_key));
    }

    let response = tokio::select! {
        res = req.send() => res?.error_for_status()?,
        _ = guard.cancelled() => return Ok(()),
    };
    stream_openai_response(response, on_event, &guard).await
}

async fn stream_openai_response(
    response: reqwest::Response,
    on_event: Channel<OllamaChunk>,
    guard: &CancelGuard,
) -> Result<(), CommandError> {
    let mut stream = response.bytes_stream();
    let mut buf = Vec::<u8>::new();

    loop {
        let bytes = tokio::select! {
            maybe = tokio::time::timeout(Duration::from_secs(30), stream.next()) => {
                match maybe.map_err(|_| {
                    CommandError::Other("AI timed out: no data received for 30 s".to_string())
                })? {
                    None => break,
                    Some(res) => res?,
                }
            }
            _ = guard.cancelled() => return Ok(()),
        };

        buf.extend_from_slice(&bytes);

        // SSE lines: "data: {json}" or "data: [DONE]", separated by \n
        while let Some(nl) = buf.iter().position(|&b| b == b'\n') {
            let line = String::from_utf8_lossy(&buf[..nl]).trim().to_string();
            buf.drain(..=nl);

            let data = match line.strip_prefix("data: ") {
                Some(d) => d.trim(),
                None => continue,
            };

            if data == "[DONE]" {
                let _ = on_event.send(OllamaChunk::Done);
                return Ok(());
            }

            if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                if let Some(content) = json["choices"][0]["delta"]["content"].as_str() {
                    if !content.is_empty() {
                        let _ = on_event.send(OllamaChunk::Token {
                            text: content.to_string(),
                        });
                    }
                }
                // finish_reason is a string when done, null while streaming
                if json["choices"][0]["finish_reason"].as_str().is_some() {
                    let _ = on_event.send(OllamaChunk::Done);
                    return Ok(());
                }
            }
        }
    } // end loop

    let _ = on_event.send(OllamaChunk::Done);
    Ok(())
}
