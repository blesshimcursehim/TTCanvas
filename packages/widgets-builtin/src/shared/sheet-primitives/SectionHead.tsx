// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import styles from "./SectionHead.module.css";

interface Props {
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function SectionHead({ children, style }: Props) {
  return <div className={styles.head} style={style}>{children}</div>;
}
