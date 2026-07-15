// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import styles from "./CropModal.module.css";

const MAX_DISPLAY_W = 520;
const MAX_DISPLAY_H = 420;
const OUTPUT_SIZE = 400;

interface CropBox { x: number; y: number; size: number; }
type DragMode = "move" | "tl" | "tr" | "br" | "bl";
interface DragState {
  mode: DragMode;
  startX: number;
  startY: number;
  startCrop: CropBox;
}

function clampCrop(x: number, y: number, size: number, dw: number, dh: number): CropBox {
  const s = Math.max(20, Math.min(size, Math.min(dw, dh)));
  return {
    x: Math.max(0, Math.min(x, dw - s)),
    y: Math.max(0, Math.min(y, dh - s)),
    size: s,
  };
}

function applyDrag(d: DragState, dx: number, dy: number, dw: number, dh: number): CropBox {
  const s = d.startCrop;
  switch (d.mode) {
    case "move":
      return clampCrop(s.x + dx, s.y + dy, s.size, dw, dh);
    case "br": {
      const delta = (dx + dy) / 2;
      return clampCrop(s.x, s.y, s.size + delta, dw, dh);
    }
    case "tl": {
      const rawSize = s.size + (-dx - dy) / 2;
      const ns = clampCrop(0, 0, rawSize, dw, dh).size;
      return clampCrop(s.x + s.size - ns, s.y + s.size - ns, ns, dw, dh);
    }
    case "tr": {
      const rawSize = s.size + (dx - dy) / 2;
      const ns = clampCrop(0, 0, rawSize, dw, dh).size;
      return clampCrop(s.x, s.y + s.size - ns, ns, dw, dh);
    }
    case "bl": {
      const rawSize = s.size + (-dx + dy) / 2;
      const ns = clampCrop(0, 0, rawSize, dw, dh).size;
      return clampCrop(s.x + s.size - ns, s.y, ns, dw, dh);
    }
  }
}

const FULL_MAX_PX = 1920;

interface Props {
  imgDataUrl: string;
  onConfirm: (croppedDataUrl: string, fullDataUrl: string) => void;
  onCancel: () => void;
}

export function CropModal({ imgDataUrl, onConfirm, onCancel }: Props) {
  const [display, setDisplay] = useState({ w: 0, h: 0 });
  const [crop, setCrop] = useState<CropBox>({ x: 0, y: 0, size: 100 });
  const imgRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(MAX_DISPLAY_W / img.naturalWidth, MAX_DISPLAY_H / img.naturalHeight, 1);
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      setDisplay({ w, h });
      const size = Math.round(Math.min(w, h) * 0.82);
      setCrop({ x: Math.round((w - size) / 2), y: Math.round((h - size) / 2), size });
    };
    img.src = imgDataUrl;
  }, [imgDataUrl]);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const d = dragRef.current;
      if (!d) return;
      setCrop(applyDrag(d, e.clientX - d.startX, e.clientY - d.startY, display.w, display.h));
    }
    function onUp() { dragRef.current = null; }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [display.w, display.h]);

  function startDrag(e: React.MouseEvent, mode: DragMode) {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { mode, startX: e.clientX, startY: e.clientY, startCrop: { ...crop } };
  }

  function handleConfirm() {
    const img = imgRef.current;
    if (!img || !display.w) return;

    // 400×400 square crop
    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = OUTPUT_SIZE;
    cropCanvas.height = OUTPUT_SIZE;
    const cropCtx = cropCanvas.getContext("2d")!;
    const scaleX = img.naturalWidth / display.w;
    const scaleY = img.naturalHeight / display.h;
    cropCtx.drawImage(
      img,
      crop.x * scaleX, crop.y * scaleY,
      crop.size * scaleX, crop.size * scaleY,
      0, 0, OUTPUT_SIZE, OUTPUT_SIZE,
    );

    // Full image, long-edge capped at FULL_MAX_PX
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    const longEdge = Math.max(nw, nh);
    const fullScale = longEdge > FULL_MAX_PX ? FULL_MAX_PX / longEdge : 1;
    const fullW = Math.round(nw * fullScale);
    const fullH = Math.round(nh * fullScale);
    const fullCanvas = document.createElement("canvas");
    fullCanvas.width = fullW;
    fullCanvas.height = fullH;
    fullCanvas.getContext("2d")!.drawImage(img, 0, 0, fullW, fullH);

    onConfirm(cropCanvas.toDataURL("image/jpeg", 0.92), fullCanvas.toDataURL("image/jpeg", 0.9));
  }

  const { x, y, size } = crop;
  const { w, h } = display;

  return createPortal(
    <div className={styles.overlay} onMouseDown={(e) => e.stopPropagation()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.title}>Crop Portrait</span>
          <button className={styles.closeBtn} onClick={onCancel}>×</button>
        </div>

        <div className={styles.body}>
          {w > 0 && (
            <div className={styles.imgContainer} style={{ width: w, height: h }}>
              <img
                ref={imgRef}
                src={imgDataUrl}
                className={styles.img}
                draggable={false}
                alt="Portrait source"
              />

              {/* Dark overlay panels outside the crop area */}
              <div className={styles.panel} style={{ top: 0, left: 0, right: 0, height: y }} />
              <div className={styles.panel} style={{ top: y + size, left: 0, right: 0, bottom: 0 }} />
              <div className={styles.panel} style={{ top: y, left: 0, width: x, height: size }} />
              <div className={styles.panel} style={{ top: y, left: x + size, right: 0, height: size }} />

              {/* Crop box */}
              <div
                className={styles.cropBox}
                style={{ left: x, top: y, width: size, height: size }}
                onMouseDown={(e) => startDrag(e, "move")}
              >
                {/* Circle preview border */}
                <div className={styles.circleRing} />

                {/* Resize handles */}
                <div className={`${styles.handle} ${styles.handleTL}`} onMouseDown={(e) => startDrag(e, "tl")} />
                <div className={`${styles.handle} ${styles.handleTR}`} onMouseDown={(e) => startDrag(e, "tr")} />
                <div className={`${styles.handle} ${styles.handleBL}`} onMouseDown={(e) => startDrag(e, "bl")} />
                <div className={`${styles.handle} ${styles.handleBR}`} onMouseDown={(e) => startDrag(e, "br")} />
              </div>
            </div>
          )}
        </div>

        <p className={styles.hint}>Drag to reposition · Drag corners to resize</p>

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <button className={styles.confirmBtn} onClick={handleConfirm}>Crop & Save</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
