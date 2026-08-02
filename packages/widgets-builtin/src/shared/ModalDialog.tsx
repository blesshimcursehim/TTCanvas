// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import styles from "./ModalDialog.module.css";

interface Props {
  /** Accessible name for the dialog, announced when it opens. */
  label: string;
  onClose: () => void;
  /** Set false for a dialog that must be answered with a button (Escape stops working). */
  dismissible?: boolean;
  /** Set false where a stray click outside shouldn't discard a half-filled form. */
  backdropClose?: boolean;
  children: ReactNode;
}

/**
 * The app's one modal shell, wrapping the native <dialog>.
 *
 * `showModal()` (rather than the `open` attribute) is what buys the accessibility: the browser
 * gives us `role="dialog"` with modal semantics, a focus trap, initial focus, focus restoration on
 * close, the rest of the page marked inert, and Escape-to-close - all of it native, none of it
 * hand-rolled. It also renders in the top layer, so modals stack in the order they were opened and
 * no longer need z-index juggling. Same idiom MapDisplay already uses for its expanded view.
 */
export function ModalDialog({
  label, onClose, dismissible = true, backdropClose = true, children,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  // Distinguishes "the dialog closed because the component is going away" from a real user
  // dismissal, so unmounting doesn't call onClose a second time.
  const unmounting = useRef(false);
  // The effect below runs once, on mount, so it reads these through refs rather than closing over
  // props that change on every render - reopening the dialog mid-life would lose focus and scroll.
  const latest = useRef({ onClose, dismissible });
  latest.current = { onClose, dismissible };

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    // Cleared on every setup, not just the first: StrictMode runs setup/cleanup/setup in dev, and
    // the cleanup in between sets this. Leaving it set would make the remounted dialog ignore
    // every later Escape and backdrop click.
    unmounting.current = false;
    // `cancel` and `close` don't bubble, and React doesn't deliver them through its synthetic
    // system here, so they go on the element itself.
    const onCancel = (e: Event) => { if (!latest.current.dismissible) e.preventDefault(); };
    // `close()` *queues* the close event rather than firing it synchronously, so an event can
    // outlive the setup that caused it: StrictMode's cleanup closes the dialog, then the next setup
    // reopens it, and the queued event lands here with `unmounting` already reset to false. The
    // element's own state settles it - a stale event arrives after showModal() has reopened the
    // dialog, while a real dismissal arrives with it closed. Without this, every modal in the app
    // dismissed itself within a second of opening in dev.
    const onNativeClose = () => {
      if (!unmounting.current && !dialog.open) latest.current.onClose();
    };
    dialog.addEventListener("cancel", onCancel);
    dialog.addEventListener("close", onNativeClose);
    dialog.showModal();
    return () => {
      unmounting.current = true;
      dialog.removeEventListener("cancel", onCancel);
      dialog.removeEventListener("close", onNativeClose);
      if (dialog.open) dialog.close();
    };
  }, []);

  return createPortal(
    <dialog
      ref={ref}
      aria-label={label}
      className={styles.dialog}
      // A click on the backdrop reports the <dialog> itself as the target, since the backdrop is
      // its ::backdrop pseudo-element rather than a child. Closing here (rather than calling
      // onClose) keeps every dismissal on the one native `close` path.
      onMouseDown={(e) => { if (backdropClose && e.target === e.currentTarget) ref.current?.close(); }}
    >
      {children}
    </dialog>,
    document.body,
  );
}
