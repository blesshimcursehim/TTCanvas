// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useEffect, useRef, type ReactNode } from "react";
import styles from "./ConfirmDeleteButton.module.css";

interface ConfirmDeleteButtonProps {
  /** Trigger button content - a label ("Delete creature...") or a bare icon glyph ("🗑"). */
  trigger: ReactNode;
  /** title/aria-label for the trigger, mainly needed when `trigger` is icon-only. */
  triggerLabel?: string;
  /** Optional question shown next to the confirm/cancel pair (e.g. `Delete "${name}"?`). */
  confirmQuestion?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirming: boolean;
  onRequestConfirm: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  className?: string;
  rowClassName?: string;
  questionClassName?: string;
  confirmClassName?: string;
  cancelClassName?: string;
}

/**
 * Shared two-click delete affordance: a trigger button that swaps to a confirm/cancel pair,
 * so a destructive action can't be fired by a single accidental click. Controlled by the
 * caller (`confirming` + the three callbacks) rather than owning its own state, since most
 * call sites already need to see `confirming` themselves (e.g. to hide sibling buttons while
 * the confirm row is showing).
 */
export function ConfirmDeleteButton({
  trigger,
  triggerLabel,
  confirmQuestion,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  confirming,
  onRequestConfirm,
  onConfirm,
  onCancel,
  className,
  rowClassName,
  questionClassName,
  confirmClassName,
  cancelClassName,
}: ConfirmDeleteButtonProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(confirming);

  // The trigger and the confirm/cancel row are different DOM nodes, so a keyboard user's focus
  // would otherwise fall back to <body> on every swap. Land on Cancel (not Confirm) when opening -
  // the whole point of this component is that deleting takes two deliberate actions, so the
  // default-focused button on a destructive prompt should be the safe one, not the one Enter
  // would fire.
  useEffect(() => {
    if (confirming !== wasConfirming.current) {
      (confirming ? cancelRef : triggerRef).current?.focus();
      wasConfirming.current = confirming;
    }
  }, [confirming]);

  if (!confirming) {
    return (
      <button
        ref={triggerRef}
        className={className ?? styles.trigger}
        title={triggerLabel}
        aria-label={triggerLabel}
        onClick={onRequestConfirm}
      >
        {trigger}
      </button>
    );
  }
  return (
    <div className={rowClassName ?? styles.row}>
      {confirmQuestion !== undefined && (
        <span className={questionClassName ?? styles.question}>{confirmQuestion}</span>
      )}
      <button className={confirmClassName ?? styles.confirm} onClick={onConfirm}>{confirmLabel}</button>
      <button ref={cancelRef} className={cancelClassName ?? styles.cancel} onClick={onCancel}>{cancelLabel}</button>
    </div>
  );
}
