// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import type { PartyMember, CustomField } from "./types";
import { useVault } from "@ttcanvas/core";
import { portraitColor } from "./CharacterCard";
import { CropModal } from "./CropModal";
import { mimeForImageExt } from "../shared/mime";
import { CollectionIO } from "../shared/CollectionIO";
import { VaultPullControl } from "../shared/VaultPullControl";
import { ImportConflictDialog } from "../shared/ImportConflictDialog";
import { dedupe, readBundle, buildBundle, exportCollection, type DedupeResult } from "../shared/importExport";
import { copyPulledAssets, type PullAssets } from "../shared/crossVaultPull";
import { validatePartyBundle, partyMemberContentKey } from "./partyImport";
import styles from "./ManagePartyModal.module.css";

function useModalPortraitDataUrl(portraitPath: string | null | undefined): string | null {
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
  }, [portraitPath, vault.vaultPath]);
  return dataUrl;
}

interface PortraitCellProps {
  member: PartyMember;
  onSet: () => void;
  onRemove: () => void;
}

function PortraitCell({ member, onSet, onRemove }: PortraitCellProps) {
  const dataUrl = useModalPortraitDataUrl(member.portraitPath);
  const color = portraitColor(member.id);
  return (
    <div className={styles.portraitRow}>
      <div
        className={styles.portraitCircle}
        style={dataUrl ? undefined : { background: color }}
      >
        {dataUrl ? (
          <img src={dataUrl} className={styles.portraitImg} alt={member.name} draggable={false} />
        ) : (
          member.name.charAt(0).toUpperCase()
        )}
      </div>
      <div className={styles.portraitActions}>
        <button className={styles.portraitSetBtn} onClick={onSet}>
          {member.portraitPath ? "Change" : "Set portrait"}
        </button>
        {member.portraitPath && (
          <button className={styles.portraitRemoveBtn} onClick={onRemove}>
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

interface Props {
  members: PartyMember[];
  onChange: (members: PartyMember[]) => void;
  onClose: () => void;
}

function newMember(): PartyMember {
  return {
    id: crypto.randomUUID(),
    name: "New Character",
    race: "",
    cls: "",
    level: 1,
    hp: 10,
    maxHp: 10,
    ac: 10,
    initiative: 0,
    sp: 0,
    maxSp: 0,
    pp: 10,
    gp: 0,
    notes: "",
    inspiration: false,
    customFields: [],
  };
}

export function ManagePartyModal({ members, onChange, onClose }: Props) {
  const [draft, setDraft] = useState<PartyMember[]>(members);
  const [cropState, setCropState] = useState<{ dataUrl: string; memberId: string } | null>(null);
  const [pendingImport, setPendingImport] = useState<DedupeResult<PartyMember> | null>(null);
  // Held with pendingImport so the conflict dialog copies portraits only for the members
  // the user accepts; null for a plain file import (no cross-vault assets to copy).
  const [pendingPull, setPendingPull] = useState<PullAssets<PartyMember> | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const vault = useVault();

  async function handleExportAll() {
    // Export the working draft, so what you see in the manager is what you get.
    await exportCollection(vault.saveTextFile, buildBundle("ttcanvas-party", { members: draft }), "party.json");
  }

  async function handleImportFile(file: File) {
    setImportError(null);
    let text: string;
    try {
      text = await file.text();
    } catch {
      setImportError("Failed to read import file.");
      return;
    }
    handleImportText(text);
  }

  // Pull party members from another vault: merge through the file import path. Portraits
  // (paths are member-id-based, so they stay valid) are copied by applyImport for the
  // accepted members only, so a skipped/cancelled conflict never clobbers current art.
  async function handlePull(sourceVault: string): Promise<boolean> {
    setImportError(null);
    const foreign = (await vault.readForeignSingleton(sourceVault, "party-tracker")) as
      | { members?: PartyMember[] }
      | undefined;
    if (!foreign?.members?.length) return false;
    await handleImportText(JSON.stringify(buildBundle("ttcanvas-party", { members: foreign.members })), {
      sourceVault,
      assetsOf: (m) => [m.portraitPath, m.portraitFullPath],
    });
    return true;
  }

  async function handleImportText(text: string, pull?: PullAssets<PartyMember>) {
    setImportError(null);
    const incoming = readBundle(text, "ttcanvas-party", validatePartyBundle);
    if (!incoming) {
      setImportError("Not a valid party file.");
      return;
    }
    if (incoming.length === 0) {
      setImportError("That file has no valid party members to import.");
      return;
    }
    const result = dedupe(incoming, draft, { idOf: (m) => m.id, contentKeyOf: partyMemberContentKey });
    if (result.idConflicts.length > 0 || result.contentDuplicates.length > 0) {
      setPendingImport(result);
      setPendingPull(pull ?? null);
    } else {
      await applyImport(result, "skip", pull);
    }
  }

  async function applyImport(result: DedupeResult<PartyMember>, mode: "skip" | "replace", pull?: PullAssets<PartyMember> | null) {
    setPendingImport(null);
    setPendingPull(null);
    // Portraits are vault files, not part of the JSON export. On a cross-vault pull we
    // copy them here for the accepted members so their portraitPath resolves; on a plain
    // file import the path resolves only if that file already exists in this vault,
    // otherwise the card falls back to its colour avatar.
    if (pull) await copyPulledAssets(pull, result, mode, vault.readFileBase64, vault.writeFileBase64);
    let next = draft;
    if (mode === "replace") {
      const byId = new Map(result.idConflicts.map((m) => [m.id, m]));
      next = next.map((m) => byId.get(m.id) ?? m);
    }
    setDraft([...next, ...result.clean]);
  }

  const update = (id: string, patch: Partial<PartyMember>) =>
    setDraft((d) => d.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  const remove = (id: string) => setDraft((d) => d.filter((m) => m.id !== id));

  const add = () => setDraft((d) => [...d, newMember()]);

  const save = () => { onChange(draft); onClose(); };

  async function handleSetPortrait(memberId: string) {
    const src = await vault.pickImageFile();
    if (!src) return;
    const b64 = await vault.readBinaryFile(src);
    const mime = mimeForImageExt(src);
    setCropState({ dataUrl: `data:${mime};base64,${b64}`, memberId });
  }

  async function handleCropConfirm(croppedDataUrl: string) {
    if (!cropState || !vault.vaultPath) return;
    setCropState(null);
    const base64 = croppedDataUrl.split(",")[1];
    await vault.writeFileBase64(`portraits/${cropState.memberId}.jpg`, base64);
    update(cropState.memberId, { portraitPath: `portraits/${cropState.memberId}.jpg` });
  }

  async function handleRemovePortrait(member: PartyMember) {
    if (!member.portraitPath) return;
    // Deliberately unlogged: an already-missing portrait is the expected case here, not a fault.
    try { await vault.deleteFile(member.portraitPath); } catch { /* ignore missing file */ }
    update(member.id, { portraitPath: null });
  }

  function addCustomField(memberId: string) {
    const m = draft.find((d) => d.id === memberId);
    if (!m) return;
    const newField: CustomField = { label: "Field", value: "" };
    update(memberId, { customFields: [...(m.customFields ?? []), newField] });
  }

  function updateCustomField(memberId: string, idx: number, patch: Partial<CustomField>) {
    const m = draft.find((d) => d.id === memberId);
    if (!m) return;
    const fields = (m.customFields ?? []).map((f, i) => i === idx ? { ...f, ...patch } : f);
    update(memberId, { customFields: fields });
  }

  function removeCustomField(memberId: string, idx: number) {
    const m = draft.find((d) => d.id === memberId);
    if (!m) return;
    update(memberId, { customFields: (m.customFields ?? []).filter((_, i) => i !== idx) });
  }

  const modal = createPortal(
    <div className={styles.overlay} onMouseDown={(e) => e.stopPropagation()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.title}>Manage Party</span>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        <div className={styles.list}>
          {draft.map((m) => (
            <div key={m.id} className={styles.card}>
              {/* Portrait */}
              <PortraitCell
                member={m}
                onSet={() => handleSetPortrait(m.id)}
                onRemove={() => handleRemovePortrait(m)}
              />

              {/* Row 1: name + delete */}
              <div className={styles.nameRow}>
                <input
                  className={styles.nameInput}
                  value={m.name}
                  onChange={(e) => update(m.id, { name: e.target.value })}
                  placeholder="Character name"
                />
                <button
                  className={styles.deleteBtn}
                  onClick={() => remove(m.id)}
                  title="Remove"
                >
                  🗑
                </button>
              </div>

              {/* Row 2: race / class / level */}
              <div className={styles.fieldRow}>
                <label className={styles.fieldGroup}>
                  <span className={styles.fieldLabel}>Race</span>
                  <input
                    className={styles.fieldInput}
                    value={m.race}
                    onChange={(e) => update(m.id, { race: e.target.value })}
                    placeholder="-"
                  />
                </label>
                <label className={styles.fieldGroup}>
                  <span className={styles.fieldLabel}>Class</span>
                  <input
                    className={styles.fieldInput}
                    value={m.cls}
                    onChange={(e) => update(m.id, { cls: e.target.value })}
                    placeholder="-"
                  />
                </label>
                <label className={styles.fieldGroupNarrow}>
                  <span className={styles.fieldLabel}>Lv</span>
                  <input
                    type="number"
                    className={styles.numInput}
                    value={m.level}
                    onChange={(e) => update(m.id, { level: Number(e.target.value) || 1 })}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                </label>
              </div>

              {/* Row 3: max HP / max SP / PP */}
              <div className={styles.fieldRow}>
                <label className={styles.fieldGroupNarrow}>
                  <span className={styles.fieldLabel} style={{ color: "var(--hp)" }}>Max HP</span>
                  <input
                    type="number"
                    className={styles.numInput}
                    value={m.maxHp}
                    onChange={(e) => {
                      const maxHp = Number(e.target.value) || 1;
                      update(m.id, { maxHp, hp: Math.min(m.hp, maxHp) });
                    }}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                </label>
                <label className={styles.fieldGroupNarrow}>
                  <span className={styles.fieldLabel} style={{ color: "var(--sp)" }}>Max SP</span>
                  <input
                    type="number"
                    className={styles.numInput}
                    value={m.maxSp}
                    onChange={(e) => {
                      const maxSp = Number(e.target.value) || 0;
                      update(m.id, { maxSp, sp: Math.min(m.sp, maxSp) });
                    }}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                </label>
                <label className={styles.fieldGroupNarrow}>
                  <span className={styles.fieldLabel} style={{ color: "var(--pp)" }}>PP</span>
                  <input
                    type="number"
                    className={styles.numInput}
                    value={m.pp}
                    onChange={(e) => update(m.id, { pp: Number(e.target.value) || 0 })}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                </label>
              </div>

              {/* Custom fields */}
              {(m.customFields ?? []).length > 0 && (
                <div className={styles.customFieldsSection}>
                  <span className={styles.customFieldsSectionLabel}>Custom fields</span>
                  {(m.customFields ?? []).map((f, i) => (
                    <div key={i} className={styles.customFieldEditRow}>
                      <input
                        className={styles.customFieldLabelInput}
                        value={f.label}
                        onChange={(e) => updateCustomField(m.id, i, { label: e.target.value })}
                        placeholder="Label"
                      />
                      <input
                        className={styles.customFieldValueInput}
                        value={f.value}
                        onChange={(e) => updateCustomField(m.id, i, { value: e.target.value })}
                        placeholder="Value"
                      />
                      <button
                        className={styles.customFieldRemoveBtn}
                        onClick={() => removeCustomField(m.id, i)}
                        title="Remove field"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button className={styles.addFieldBtn} onClick={() => addCustomField(m.id)}>
                + Add field
              </button>
            </div>
          ))}
        </div>

        <div className={styles.addRow}>
          <button className={styles.addBtn} onClick={add}>+ Add member</button>
          <CollectionIO onImportFile={handleImportFile} onExportAll={handleExportAll} exportDisabled={draft.length === 0} onError={setImportError} />
          <VaultPullControl otherVaults={vault.otherVaults} onPull={handlePull} onError={setImportError} />
        </div>
        {importError && (
          <div className={styles.importError} onClick={() => setImportError(null)}>{importError}</div>
        )}

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button className={styles.saveBtn} onClick={save}>Save</button>
        </div>

        {pendingImport && (
          <ImportConflictDialog
            title="Import party"
            noun="member"
            totalCount={pendingImport.idConflicts.length + pendingImport.contentDuplicates.length + pendingImport.clean.length}
            idConflicts={pendingImport.idConflicts.map((m) => ({ id: m.id, label: m.name }))}
            contentDuplicates={pendingImport.contentDuplicates.map((m) => ({ id: m.id, label: m.name }))}
            onCancel={() => { setPendingImport(null); setPendingPull(null); }}
            onSkip={() => applyImport(pendingImport, "skip", pendingPull)}
            onReplace={() => applyImport(pendingImport, "replace", pendingPull)}
          />
        )}
      </div>
    </div>,
    document.body,
  );

  return (
    <>
      {modal}
      {cropState && (
        <CropModal
          imgDataUrl={cropState.dataUrl}
          onConfirm={handleCropConfirm}
          onCancel={() => setCropState(null)}
        />
      )}
    </>
  );
}
