// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use tokio::sync::Notify;

/// A request's cancellation flag plus a `Notify` to wake anyone `select!`ing
/// on `CancelGuard::cancelled()` - the flag alone would only be checked at
/// whatever point the generate loop happens to poll it next (up to 30s away,
/// mid-stream-read), whereas racing `cancelled()` lets `cancel()` interrupt a
/// wait that's already in progress.
struct CancelState {
    flag: AtomicBool,
    notify: Notify,
}

impl CancelState {
    fn new() -> Self {
        Self {
            flag: AtomicBool::new(false),
            notify: Notify::new(),
        }
    }
}

/// Request-id -> cancellation state, shared between a generate command's own
/// task and the `ai_cancel_generate` command a later invocation can call
/// while the first is still streaming. Both `register` and `cancel` use
/// entry-or-insert rather than assuming the other has already run, so
/// whichever happens first still leaves both sides sharing the same `Arc` -
/// otherwise a `cancel()` that wins the race against `register()` would flag
/// a state nobody holds a reference to yet, and the generate call would
/// start from a fresh, uncancelled flag right after.
type Registry = Mutex<HashMap<String, Arc<CancelState>>>;

fn registry() -> &'static Registry {
    static REGISTRY: OnceLock<Registry> = OnceLock::new();
    REGISTRY.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Holds one request's cancellation state in the registry for the lifetime
/// of the generate call that checks it. `Drop` always deregisters, so a
/// request that finishes normally (or errors out) can't leak an entry that
/// `ai_cancel_generate` would otherwise try to cancel forever.
pub(crate) struct CancelGuard {
    request_id: String,
    state: Arc<CancelState>,
}

impl CancelGuard {
    pub(crate) fn register(request_id: String) -> Self {
        let state = registry()
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .entry(request_id.clone())
            .or_insert_with(|| Arc::new(CancelState::new()))
            .clone();
        Self { request_id, state }
    }

    pub(crate) fn is_cancelled(&self) -> bool {
        self.state.flag.load(Ordering::Relaxed)
    }

    /// Resolves once this request is cancelled - immediately if it already
    /// was (covers a `cancel()` that arrived before whatever's awaiting this
    /// call started waiting), otherwise when `cancel()` next runs. Meant to
    /// be raced inside `tokio::select!` against whatever the request is
    /// currently waiting on (response headers, the next streamed chunk), so
    /// cancellation interrupts that wait instead of only being noticed once
    /// it resolves on its own.
    pub(crate) async fn cancelled(&self) {
        if self.is_cancelled() {
            return;
        }
        self.state.notify.notified().await;
    }
}

impl Drop for CancelGuard {
    fn drop(&mut self) {
        registry()
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(&self.request_id);
    }
}

/// Flags `request_id` as cancelled, creating a (pre-cancelled) entry if
/// `register` hasn't run for it yet so an early cancel isn't lost - see the
/// `Registry` type doc. A cancel that arrives after the request already
/// finished (the guard was dropped, deregistering it) similarly creates an
/// orphaned entry nothing will ever clean up; in practice this only happens
/// if a generate call never reaches `register` at all (e.g. rejected by
/// `require_main_window` first), which requires a trusted main-window caller
/// misusing its own API, not something reachable from the player webview.
pub(crate) fn cancel(request_id: &str) {
    let state = registry()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .entry(request_id.to_string())
        .or_insert_with(|| Arc::new(CancelState::new()))
        .clone();
    state.flag.store(true, Ordering::Relaxed);
    state.notify.notify_one();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cancel_flags_a_registered_request() {
        let guard = CancelGuard::register("req-1".to_string());
        assert!(!guard.is_cancelled());
        cancel("req-1");
        assert!(guard.is_cancelled());
    }

    #[test]
    fn cancel_of_unknown_id_is_a_no_op_for_is_cancelled_since_nothing_holds_that_guard() {
        cancel("no-such-request");
    }

    #[test]
    fn dropping_the_guard_deregisters_it() {
        let request_id = "req-drop".to_string();
        drop(CancelGuard::register(request_id.clone()));
        assert!(registry().lock().unwrap().get(&request_id).is_none());
    }

    #[test]
    fn cancel_after_the_guard_is_gone_creates_a_harmless_orphaned_entry() {
        // Documented residual (see `cancel`'s doc comment): once nothing
        // holds a guard for `request_id` anymore, a further `cancel()` call
        // can't reach "nobody" to flag, so it creates a fresh entry instead
        // of silently no-oping. Nothing will ever register for this exact id
        // again (each real request mints its own UUID), so it's inert, just
        // not cleaned up - asserted here so that stays a deliberate,
        // documented choice rather than an accidental regression.
        let request_id = "req-drop-then-cancel".to_string();
        drop(CancelGuard::register(request_id.clone()));
        cancel(&request_id);
        assert!(registry().lock().unwrap().get(&request_id).is_some());
    }

    #[tokio::test]
    async fn cancel_before_register_still_cancels_the_guard() {
        let request_id = "req-early-cancel".to_string();
        cancel(&request_id);
        let guard = CancelGuard::register(request_id);
        assert!(guard.is_cancelled());
    }

    #[tokio::test]
    async fn cancelled_resolves_immediately_when_already_cancelled() {
        let guard = CancelGuard::register("req-already-cancelled".to_string());
        cancel("req-already-cancelled");
        // Would hang forever (test timeout) if `cancelled()` waited for a
        // notification that already fired before this call started.
        guard.cancelled().await;
    }

    #[tokio::test]
    async fn cancelled_wakes_a_waiter_once_cancel_is_called() {
        let guard = Arc::new(CancelGuard::register("req-wakes-waiter".to_string()));
        let waiter = tokio::spawn({
            let guard = guard.clone();
            async move { guard.cancelled().await }
        });
        // Give the spawned task a chance to reach `notified().await` before
        // cancelling, so this actually exercises the wake path rather than
        // the already-cancelled short-circuit above.
        tokio::task::yield_now().await;
        cancel("req-wakes-waiter");
        tokio::time::timeout(std::time::Duration::from_secs(5), waiter)
            .await
            .expect("cancelled() should resolve once cancel() is called")
            .unwrap();
    }
}
