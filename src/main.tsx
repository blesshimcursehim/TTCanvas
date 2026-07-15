// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import "./widgets/register";
import App from "./App";
import { PlayerWindow } from "./player/PlayerWindow";
import { ToastProvider } from "./canvas/Toast";
import { ErrorBoundary } from "./ErrorBoundary";
import { logError } from "./diagnostics/log";

const label = getCurrentWebviewWindow().label;

// Catch async failures that React error boundaries cannot see.
window.addEventListener("error", (e) => {
  logError(`[${label}] uncaught error`, e.error ?? e.message);
});
window.addEventListener("unhandledrejection", (e) => {
  logError(`[${label}] unhandled promise rejection`, e.reason);
});

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        {label === "player" ? <PlayerWindow /> : <App />}
      </ToastProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
