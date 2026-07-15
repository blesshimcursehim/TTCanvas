// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useEffect, useState } from "react";
import { useCanvasTransform } from "./CanvasContext";
import styles from "./CanvasStatus.module.css";

interface Props {
  widgetCount: number;
  layoutName: string;
}

export function CanvasStatus({ widgetCount, layoutName }: Props) {
  const transformRef = useCanvasTransform();
  const [display, setDisplay] = useState({ x: 0, y: 0 });

  useEffect(() => {
    function read() {
      const { x, y, scale } = transformRef.current;
      const nx = Math.round(-x / scale);
      const ny = Math.round(-y / scale);
      setDisplay(prev => (prev.x === nx && prev.y === ny ? prev : { x: nx, y: ny }));
    }

    window.addEventListener("mouseup", read);
    window.addEventListener("wheel", read, { passive: true });
    return () => {
      window.removeEventListener("mouseup", read);
      window.removeEventListener("wheel", read);
    };
  }, [transformRef]);

  return (
    <div className={styles.root}>
      x {display.x} · y {display.y} · {widgetCount} widgets · layout · {layoutName}
    </div>
  );
}
