// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import styles from "./ModTrustPrompt.module.css";

interface Props {
  filenames: string[];
  onTrust: () => void;
  onSkip: () => void;
}

// Deliberately no backdrop-click or Escape dismissal: this is a trust
// decision, not a passive panel, so it fails closed to "Skip" via an
// explicit button rather than an accidental click-outside defaulting to load.
export function ModTrustPrompt({ filenames, onTrust, onSkip }: Props) {
  const skipRef = useRef<HTMLButtonElement>(null);
  const trustRef = useRef<HTMLButtonElement>(null);

  // Move focus into the dialog on the safe action, and give it back to
  // whatever had focus before the dialog opened once it closes - a keyboard
  // user shouldn't lose their place in the app over a trust prompt.
  useEffect(() => {
    const previouslyFocused = document.activeElement;
    skipRef.current?.focus();
    return () => {
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, []);

  // Only two focusable elements here, so the trap is just a two-way cycle
  // between them rather than a general focusable-element query.
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Tab") return;
    e.preventDefault();
    const next = e.shiftKey
      ? (document.activeElement === skipRef.current ? trustRef : skipRef)
      : (document.activeElement === trustRef.current ? skipRef : trustRef);
    next.current?.focus();
  }

  return createPortal(
    <div className={styles.overlay}>
      <div
        className={styles.modal}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="mod-trust-title"
        onKeyDown={handleKeyDown}
      >
        <div className={styles.header}>
          <span id="mod-trust-title" className={styles.title}>Unrecognised mod{filenames.length > 1 ? "s" : ""} in this vault</span>
        </div>
        <div className={styles.body}>
          <p>
            This vault has {filenames.length === 1 ? "a custom widget file" : `${filenames.length} custom widget files`} that
            haven't been approved on this device yet. Mods run inside TTCanvas itself - the same window, the same local
            file and network access - so only load them if you trust whoever wrote this vault's mods.
          </p>
          <ul className={styles.fileList}>
            {filenames.map((f) => <li key={f}>{f}</li>)}
          </ul>
        </div>
        <div className={styles.actions}>
          <button ref={skipRef} className={styles.skipBtn} onClick={onSkip}>Skip mods</button>
          <button ref={trustRef} className={styles.trustBtn} onClick={onTrust}>
            Trust and load {filenames.length > 1 ? `${filenames.length} mods` : "mod"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
