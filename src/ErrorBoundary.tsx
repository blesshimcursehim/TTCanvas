// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { Component, type ReactNode } from "react";
import { logError } from "./diagnostics/log";
import { revealLogFile } from "./diagnostics/diagnostics";

interface State { error: Error | null }
interface Props { children: ReactNode }

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error) {
    logError("React render crash", error);
  }

  override render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, color: "#f88", fontFamily: "monospace", fontSize: 13, whiteSpace: "pre-wrap", background: "#111", minHeight: "100vh" }}>
          <strong style={{ color: "#faa" }}>Render error - please report this:</strong>
          {"\n\n"}{this.state.error.message}
          {"\n\n"}{this.state.error.stack}
          {"\n\n"}
          <button
            onClick={() => { void revealLogFile(); }}
            style={{ font: "inherit", color: "#111", background: "#faa", border: "none", borderRadius: 4, padding: "4px 10px", cursor: "pointer" }}
          >
            Reveal log file
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
