// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useState, useEffect } from "react";
import type { PartyMember } from "./types";
import { useVault, pushCharacterScene } from "@ttcanvas/core";
import { currencyOf, withCurrency } from "./currency";
import { CropModal } from "./CropModal";
import { setActiveTokenDrag, clearActiveTokenDrag } from "../shared/tokenDrag";
import { mimeForImageExt } from "../shared/mime";
import styles from "./CharacterCard.module.css";

export const PORTRAIT_COLORS = [
  "oklch(0.45 0.18 290)",
  "oklch(0.50 0.14 60)",
  "oklch(0.48 0.13 195)",
  "oklch(0.50 0.16 22)",
  "oklch(0.45 0.16 240)",
  "oklch(0.50 0.15 145)",
  "oklch(0.52 0.17 350)",
  "oklch(0.46 0.16 270)",
];

export function portraitColor(id: string): string {
  const hash = id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return PORTRAIT_COLORS[hash % PORTRAIT_COLORS.length];
}

export function usePortraitDataUrl(portraitPath: string | null | undefined): string | null {
  const vault = useVault();
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!portraitPath || !vault.vaultPath) { setDataUrl(null); return; }
    const fileName = portraitPath.split("/").pop()!;
    const ext = fileName.split(".").pop()?.toLowerCase() ?? "png";
    const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`;
    vault
      .readFileBase64(`${vault.vaultPath}/portraits`, fileName)
      .then((b64) => setDataUrl(`data:${mime};base64,${b64}`))
      .catch(() => setDataUrl(null));
    // vault's context value is a fresh object every render (tracked in
    // tracking/phase6-fixes.md) - depending on the whole object instead of
    // its stable fields would re-run this on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portraitPath, vault.vaultPath, vault.vaultVersion]);
  return dataUrl;
}


interface StatBoxProps {
  label: string;
  value: number;
  max?: number;
  color: string;
  borderColor: string;
  onChange: (v: number) => void;
}

function StatBox({ label, value, max, color, borderColor, onChange }: StatBoxProps) {
  const pct =
    max != null && max > 0 ? Math.max(0, Math.min(1, value / max)) * 100 : null;
  return (
    <div className={styles.statBox} style={{ borderColor }}>
      <span className={styles.statLabel} style={{ color }}>
        {label}
      </span>
      <div className={styles.statValueRow}>
        <input
          type="number"
          className={styles.statValue}
          style={{ color }}
          value={value}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
          onClick={(e) => (e.target as HTMLInputElement).select()}
        />
        {max != null && <span className={styles.statMax}>/{max}</span>}
      </div>
      {pct !== null && (
        <div className={styles.statBar}>
          <div
            className={styles.statBarFill}
            style={{ width: `${pct}%`, background: color }}
          />
        </div>
      )}
    </div>
  );
}

interface DeathSavesProps {
  member: PartyMember;
  onChange: (m: PartyMember) => void;
}

function DeathSavePips({ member, onChange }: DeathSavesProps) {
  const saves = member.deathSaves ?? { successes: 0, failures: 0 };
  const { successes, failures } = saves;

  function toggle(type: "successes" | "failures", idx: number) {
    const current = saves[type];
    const next = current > idx ? idx : idx + 1;
    onChange({ ...member, deathSaves: { ...saves, [type]: Math.min(3, next) } });
  }

  if (failures >= 3) {
    return (
      <div className={styles.deathSaves}>
        <span className={styles.fallenLabel}>💀 Fallen</span>
        <button
          className={styles.stabiliseBtn}
          onClick={() => onChange({ ...member, hp: 1, deathSaves: { successes: 0, failures: 0 } })}
        >
          Reset
        </button>
      </div>
    );
  }

  return (
    <div className={styles.deathSaves}>
      <div className={styles.pipRow}>
        <span className={styles.pipGroupLabel}>Saves</span>
        {Array.from({ length: 3 }).map((_, i) => (
          <button
            key={i}
            className={`${styles.pip} ${styles.successPip} ${i < successes ? styles.pipFilled : ""}`}
            onClick={() => toggle("successes", i)}
            title={`Success ${i + 1}`}
          />
        ))}
        <span className={styles.pipSep}>·</span>
        {Array.from({ length: 3 }).map((_, i) => (
          <button
            key={i}
            className={`${styles.pip} ${styles.failurePip} ${i < failures ? styles.pipFilled : ""}`}
            onClick={() => toggle("failures", i)}
            title={`Failure ${i + 1}`}
          />
        ))}
      </div>
      {successes >= 3 && (
        <button
          className={styles.stabiliseBtn}
          onClick={() => onChange({ ...member, hp: 1, deathSaves: { successes: 0, failures: 0 } })}
        >
          Stabilised →
        </button>
      )}
    </div>
  );
}

interface Props {
  member: PartyMember;
  onChange: (member: PartyMember) => void;
  onOpenSheet?: () => void;
}

export function CharacterCard({ member, onChange, onOpenSheet }: Props) {
  const patch = (fields: Partial<PartyMember>) => onChange({ ...member, ...fields });
  const color = portraitColor(member.id);
  const vault = useVault();

  const portraitDataUrl = usePortraitDataUrl(member.portraitPath);
  const [cropDataUrl, setCropDataUrl] = useState<string | null>(null);

  async function handleAvatarDoubleClick() {
    const src = await vault.pickImageFile();
    if (!src) return;
    const b64 = await vault.readBinaryFile(src);
    const mime = mimeForImageExt(src);
    setCropDataUrl(`data:${mime};base64,${b64}`);
  }

  async function handleCropConfirm(croppedDataUrl: string, fullDataUrl: string) {
    setCropDataUrl(null);
    if (!vault.vaultPath) return;
    await vault.writeFileBase64(`portraits/${member.id}.jpg`, croppedDataUrl.split(",")[1]);
    await vault.writeFileBase64(`portraits/${member.id}-full.jpg`, fullDataUrl.split(",")[1]);
    patch({ portraitPath: `portraits/${member.id}.jpg`, portraitFullPath: `portraits/${member.id}-full.jpg` });
  }

  const subtitle = [member.race, member.cls, member.level ? `Lv ${member.level}` : ""]
    .filter(Boolean)
    .join(" · ");

  async function handleCastToPlayers() {
    let portraitSrc: string | undefined;
    let portraitFullSrc: string | undefined;
    if (member.portraitPath && vault.vaultPath) {
      const fileName = member.portraitPath.split("/").pop()!;
      portraitSrc = await vault.readFileBase64(`${vault.vaultPath}/portraits`, fileName)
        .then((b64) => `data:image/jpeg;base64,${b64}`)
        .catch(() => undefined);
    }
    if (member.portraitFullPath && vault.vaultPath) {
      const fileName = member.portraitFullPath.split("/").pop()!;
      portraitFullSrc = await vault.readFileBase64(`${vault.vaultPath}/portraits`, fileName)
        .then((b64) => `data:image/jpeg;base64,${b64}`)
        .catch(() => undefined);
    }
    await pushCharacterScene({
      kind: "pc",
      name: member.name,
      subtitle: subtitle || undefined,
      portraitSrc,
      portraitFullSrc,
      accentColor: portraitColor(member.id),
    });
  }

  function handleDragStart(e: React.DragEvent) {
    setActiveTokenDrag({ sourceId: member.id, label: member.name, color, portraitPath: member.portraitPath ?? undefined, kind: "player" });
    e.dataTransfer.setData("text/plain", "ttcanvas-token");
    e.dataTransfer.effectAllowed = "copy";
  }

  const showDeathSaves = member.hp === 0;
  const customFields = member.customFields ?? [];

  function patchCustomField(idx: number, value: string) {
    const next = customFields.map((f, i) => i === idx ? { ...f, value } : f);
    patch({ customFields: next });
  }

  return (
    <>
    {cropDataUrl && (
      <CropModal
        imgDataUrl={cropDataUrl}
        onConfirm={handleCropConfirm}
        onCancel={() => setCropDataUrl(null)}
      />
    )}
    <div className={styles.card}>
      {/* Header: avatar + name/subtitle + AC */}
      <div className={styles.header}>
        <div
          className={styles.avatar}
          style={portraitDataUrl ? undefined : { background: color }}
          draggable
          title="Double-click to change portrait · Drag onto map"
          onDragStart={handleDragStart}
          onDragEnd={clearActiveTokenDrag}
          onDoubleClick={handleAvatarDoubleClick}
        >
          {portraitDataUrl ? (
            <img src={portraitDataUrl} className={styles.avatarImg} alt={member.name} draggable={false} />
          ) : (
            member.name.charAt(0).toUpperCase()
          )}
          <div className={styles.avatarDragHint} aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <circle cx="2" cy="2" r="1.2" /><circle cx="6" cy="2" r="1.2" /><circle cx="10" cy="2" r="1.2" />
              <circle cx="2" cy="6" r="1.2" /><circle cx="6" cy="6" r="1.2" /><circle cx="10" cy="6" r="1.2" />
              <circle cx="2" cy="10" r="1.2" /><circle cx="6" cy="10" r="1.2" /><circle cx="10" cy="10" r="1.2" />
            </svg>
            map
          </div>
        </div>
        <div className={styles.nameGroup}>
          <div className={styles.name}>{member.name}</div>
          {subtitle && <div className={styles.subtitle}>{subtitle}</div>}
        </div>
        <button
          className={styles.castBtn}
          onClick={handleCastToPlayers}
          title="Show to players"
        >▶</button>
        {onOpenSheet && (
          <button
            className={styles.sheetBtn}
            onClick={onOpenSheet}
            title="Open full character sheet"
          >↗</button>
        )}
        <div className={styles.acGroup}>
          <svg className={styles.shieldIcon} width="13" height="15" viewBox="0 0 13 15" fill="none">
            <path
              d="M6.5 0.75L1 3.25v4.5C1 10.75 3.5 13.25 6.5 14.25c3-1 5.5-3.5 5.5-6.5V3.25L6.5 0.75z"
              fill="currentColor"
              opacity="0.18"
              stroke="currentColor"
              strokeWidth="1.1"
              strokeLinejoin="round"
            />
          </svg>
          <input
            type="number"
            className={styles.acValue}
            value={member.ac}
            onChange={(e) => patch({ ac: Number(e.target.value) || 0 })}
            onClick={(e) => (e.target as HTMLInputElement).select()}
          />
        </div>
      </div>

      {/* Four stat boxes */}
      <div className={styles.stats}>
        <StatBox
          label="HP"
          value={member.hp}
          max={member.maxHp}
          color="var(--hp)"
          borderColor="oklch(0.70 0.13 22 / 0.28)"
          onChange={(hp) => patch({ hp })}
        />
        <StatBox
          label="SP"
          value={member.sp}
          max={member.maxSp > 0 ? member.maxSp : undefined}
          color="var(--sp)"
          borderColor="oklch(0.74 0.10 200 / 0.28)"
          onChange={(sp) => patch({ sp })}
        />
        <StatBox
          label="PP"
          value={member.pp}
          color="var(--pp)"
          borderColor="oklch(0.74 0.11 305 / 0.28)"
          onChange={(pp) => patch({ pp })}
        />
        {/* The same gold as the sheet's purse, not a second tally - see ./currency.ts. */}
        <StatBox
          label="GP"
          value={currencyOf(member).gp}
          color="var(--gp)"
          borderColor="oklch(0.82 0.11 90 / 0.28)"
          onChange={(gp) => patch(withCurrency(member, { ...currencyOf(member), gp }))}
        />
      </div>

      {/* Death saves - shown when HP = 0 */}
      {showDeathSaves && <DeathSavePips member={member} onChange={onChange} />}

      {/* Custom fields */}
      {customFields.length > 0 && (
        <div className={styles.customFields}>
          {customFields.map((f, i) => (
            <div key={i} className={styles.customFieldRow}>
              <span className={styles.customFieldLabel}>{f.label}</span>
              <input
                className={styles.customFieldInput}
                value={f.value}
                onChange={(e) => patchCustomField(i, e.target.value)}
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
            </div>
          ))}
        </div>
      )}

      {/* Notes */}
      <div className={styles.notesSection}>
        <span className={styles.notesLabel}>NOTES</span>
        <textarea
          className={styles.notes}
          value={member.notes}
          onChange={(e) => patch({ notes: e.target.value })}
        />
      </div>

      {/* Inspiration */}
      <button
        className={`${styles.inspiration} ${member.inspiration ? styles.inspired : ""}`}
        onClick={() => patch({ inspiration: !member.inspiration })}
      >
        <svg
          width="12" height="12" viewBox="0 0 24 24"
          fill={member.inspiration ? "currentColor" : "none"}
          stroke="currentColor" strokeWidth="1.6"
          strokeLinecap="round" strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
        </svg>
        <span>Inspiration</span>
        <span className={styles.inspirationStatus}>
          {member.inspiration ? "GRANTED" : "OFF"}
        </span>
      </button>
    </div>
    </>
  );
}
