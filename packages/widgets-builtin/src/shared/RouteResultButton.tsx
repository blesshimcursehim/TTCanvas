// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { pushTextScene, pushHandoutScene } from "@ttcanvas/core";
import styles from "./RouteResultButton.module.css";

interface Props {
  /** Optional heading shown above the body on the player card (e.g. the table name). */
  title?: string;
  /** The result text cast to players. */
  body: string;
  /** Optional image (data URL) - when present the cast reveals the art full-bleed instead of text. */
  imgSrc?: string;
  className?: string;
}

/**
 * Shared "cast this result to the player window" affordance for generator widgets.
 * With `imgSrc` it casts a full-bleed handout (e.g. a drawn card's art); otherwise it
 * casts the text reveal. It is the seam where a destination menu will grow when Session
 * Notes / Sticky Note routing land.
 */
export function RouteResultButton({ title, body, imgSrc, className }: Props) {
  if (!imgSrc && !body.trim()) return null;
  return (
    <button
      type="button"
      className={`${styles.btn}${className ? ` ${className}` : ""}`}
      title="Cast to player window"
      aria-label="Cast to player window"
      onClick={() => void (imgSrc ? pushHandoutScene(imgSrc) : pushTextScene({ title, body }))}
    >
      {/* Same cast/airplay glyph the Map Display cast button uses, for a consistent "send to player" idiom. */}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 16.1A5 5 0 0 1 5.9 20M2 12.05A9 9 0 0 1 9.95 20M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6" />
        <line x1="2" y1="20" x2="2.01" y2="20" />
      </svg>
    </button>
  );
}
