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

/// Cap on how large a single unframed response chunk may grow before we give up
/// (CR-015). Both stream parsers accumulate bytes until a newline; a server that
/// never sends one would otherwise grow the buffer without bound while the idle
/// timeout keeps resetting. 1 MiB is far above any real JSONL/SSE record.
const MAX_FRAME_BYTES: usize = 1 << 20;

/// How long to wait for a streaming request's response *headers* before giving
/// up (CR-015). Generous enough to cover a cold local model load, but bounded so
/// an unresponsive endpoint can't hang the generation forever. This caps only
/// the wait for headers - the body then streams under the per-chunk idle timeout.
const HEADER_TIMEOUT: Duration = Duration::from_secs(120);

static HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

fn http_client() -> &'static reqwest::Client {
    HTTP_CLIENT.get_or_init(reqwest::Client::new)
}

/// Appends `bytes` to the frame accumulator, erroring if it grows past `cap`
/// without being drained (CR-015). A well-behaved provider drains on every
/// newline, so this only trips on a stream that sends an unbounded, newline-free
/// chunk - the case that would otherwise grow the buffer without limit while the
/// per-chunk idle timeout keeps resetting.
fn push_bounded(buf: &mut Vec<u8>, bytes: &[u8], cap: usize) -> Result<(), CommandError> {
    buf.extend_from_slice(bytes);
    if buf.len() > cap {
        return Err(CommandError::Other(
            "AI response exceeded the maximum frame size with no line break".to_string(),
        ));
    }
    Ok(())
}

/// Whether it's safe to send an API key to `base_url`. HTTPS is always fine;
/// plaintext HTTP is allowed only to a loopback host (localhost / 127.0.0.0/8 /
/// ::1) so a self-hosted local provider still works, while a remote `http://`
/// endpoint - which would put the bearer token on the wire in cleartext - is
/// refused (CR-016). Parses the URL rather than string-matching the scheme, so a
/// differently-cased `HTTP://` can't slip through.
fn key_transport_ok(base_url: &str) -> Result<(), CommandError> {
    let url = reqwest::Url::parse(base_url)
        .map_err(|e| CommandError::Other(format!("invalid AI base URL: {e}")))?;
    if url.scheme().eq_ignore_ascii_case("https") {
        return Ok(());
    }
    // host_str() brackets IPv6 literals (e.g. "[::1]"); strip them before parsing.
    let is_loopback = url.host_str().is_some_and(|host| {
        let host = host.trim_start_matches('[').trim_end_matches(']');
        host.eq_ignore_ascii_case("localhost")
            || host
                .parse::<std::net::IpAddr>()
                .is_ok_and(|ip| ip.is_loopback())
    });
    if is_loopback {
        Ok(())
    } else {
        Err(CommandError::Other(
            "refusing to send the API key over plaintext HTTP to a non-local host - \
             use an https:// endpoint (a localhost address is allowed)"
                .to_string(),
        ))
    }
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
    let send = http_client()
        .post(format!("{}/api/generate", OLLAMA_BASE))
        .json(&serde_json::json!({ "model": model, "prompt": prompt, "stream": true }))
        .send();
    let response = tokio::select! {
        res = tokio::time::timeout(HEADER_TIMEOUT, send) => {
            res.map_err(|_| CommandError::Other(
                "AI request timed out waiting for a response".to_string(),
            ))??.error_for_status()?
        }
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

    // Handles one complete JSONL record; returns true once the stream is done.
    // Shared by the in-loop path and the trailing-frame handling below.
    let handle_line = |line: &str| -> bool {
        if line.is_empty() {
            return false;
        }
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(line) {
            if let Some(token) = json["response"].as_str()
                && !token.is_empty()
            {
                let _ = on_event.send(OllamaChunk::Token {
                    text: token.to_string(),
                });
            }
            if json["done"].as_bool().unwrap_or(false) {
                return true;
            }
        }
        false
    };

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

        push_bounded(&mut buf, &bytes, MAX_FRAME_BYTES)?;

        while let Some(nl) = buf.iter().position(|&b| b == b'\n') {
            let line = String::from_utf8_lossy(&buf[..nl]).trim().to_string();
            buf.drain(..=nl);
            if handle_line(&line) {
                let _ = on_event.send(OllamaChunk::Done);
                return Ok(());
            }
        }
    }

    // A final record with no trailing newline would otherwise be dropped at EOF.
    let tail = String::from_utf8_lossy(&buf).trim().to_string();
    handle_line(&tail);
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
    if !api_key.is_empty() {
        key_transport_ok(&base_url)?;
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
    if !api_key.is_empty() {
        key_transport_ok(&base_url)?;
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
        res = tokio::time::timeout(HEADER_TIMEOUT, req.send()) => {
            res.map_err(|_| CommandError::Other(
                "AI request timed out waiting for a response".to_string(),
            ))??.error_for_status()?
        }
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

    // Handles one SSE line ("data: {json}" or "data: [DONE]"); returns true once
    // the stream is done. Shared by the in-loop path and the trailing frame.
    let handle_line = |line: &str| -> bool {
        let data = match line.strip_prefix("data: ") {
            Some(d) => d.trim(),
            None => return false,
        };
        if data == "[DONE]" {
            return true;
        }
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
            if let Some(content) = json["choices"][0]["delta"]["content"].as_str()
                && !content.is_empty()
            {
                let _ = on_event.send(OllamaChunk::Token {
                    text: content.to_string(),
                });
            }
            // finish_reason is a string when done, null while streaming
            if json["choices"][0]["finish_reason"].as_str().is_some() {
                return true;
            }
        }
        false
    };

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

        push_bounded(&mut buf, &bytes, MAX_FRAME_BYTES)?;

        while let Some(nl) = buf.iter().position(|&b| b == b'\n') {
            let line = String::from_utf8_lossy(&buf[..nl]).trim().to_string();
            buf.drain(..=nl);
            if handle_line(&line) {
                let _ = on_event.send(OllamaChunk::Done);
                return Ok(());
            }
        }
    } // end loop

    // A final "data:" record with no trailing newline would otherwise be dropped.
    let tail = String::from_utf8_lossy(&buf).trim().to_string();
    handle_line(&tail);
    let _ = on_event.send(OllamaChunk::Done);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn push_bounded_accumulates_until_the_cap_then_errors() {
        let mut buf = Vec::new();
        assert!(push_bounded(&mut buf, b"hello", 8).is_ok());
        assert!(push_bounded(&mut buf, b"!", 8).is_ok()); // 6 bytes, still under
        // Now push past the cap in one chunk with no newline drain in between.
        assert!(push_bounded(&mut buf, b"world", 8).is_err());
    }

    #[test]
    fn key_transport_ok_allows_https_anywhere() {
        assert!(key_transport_ok("https://api.openai.com/v1").is_ok());
        assert!(key_transport_ok("HTTPS://api.example.com").is_ok());
    }

    #[test]
    fn key_transport_ok_allows_plaintext_only_to_loopback() {
        assert!(key_transport_ok("http://localhost:11434").is_ok());
        assert!(key_transport_ok("http://127.0.0.1:1234").is_ok());
        assert!(key_transport_ok("http://[::1]:1234").is_ok());
    }

    #[test]
    fn key_transport_ok_rejects_plaintext_to_a_remote_host() {
        assert!(key_transport_ok("http://api.example.com/v1").is_err());
        // A differently-cased scheme must not slip through the check.
        assert!(key_transport_ok("HTTP://api.example.com").is_err());
        assert!(key_transport_ok("http://10.0.0.5:1234").is_err());
    }

    #[test]
    fn key_transport_ok_rejects_an_unparseable_url() {
        assert!(key_transport_ok("not a url").is_err());
    }
}
