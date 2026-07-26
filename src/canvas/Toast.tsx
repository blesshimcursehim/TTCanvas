// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useState, useCallback } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { ToastContext } from "@ttcanvas/core";
import type { ToastType } from "@ttcanvas/core";
import styles from "./Toast.module.css";

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

function uid() { return `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`; }

function ToastStack({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: string) => void }) {
  // The container stays mounted even with nothing in it: a live region has to be in the DOM
  // before content lands inside it, or screen readers announce nothing.
  return createPortal(
    <div className={styles.stack} aria-live="polite" aria-atomic="false">
      {toasts.map((t) => (
        // An error interrupts; the rest wait their turn.
        <div key={t.id} className={`${styles.toast} ${styles[t.type]}`} role={t.type === "error" ? "alert" : undefined}>
          <span className={styles.msg}>{t.message}</span>
          <button className={styles.dismiss} onClick={() => onDismiss(t.id)} aria-label="Dismiss">×</button>
        </div>
      ))}
    </div>,
    document.body,
  );
}

interface ProviderProps { children: ReactNode }

export function ToastProvider({ children }: ProviderProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, type: ToastType = "error") => {
    const id = uid();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}
