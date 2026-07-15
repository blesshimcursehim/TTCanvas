// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import type { WorkspaceState, WidgetInstance } from "@ttcanvas/core";
import { logWarn } from "./diagnostics/log";

export type { WorkspaceState, WidgetInstance, Layout } from "@ttcanvas/core";

// ---------------------------------------------------------------------------
// Zod schemas - validated on every workspace load so corrupted or
// hand-edited files degrade gracefully (bad field → per-field default)
// rather than crashing vault load.
// ---------------------------------------------------------------------------

const WidgetInstanceSchema = z.object({
  id: z.string(),
  type: z.string(),
  x: z.number().catch(0),
  y: z.number().catch(0),
  width: z.number().catch(300),
  height: z.number().catch(200),
  state: z.unknown(),
  hidden: z.boolean().optional().catch(undefined),
});

// Filters out widgets that are unrecoverable (missing id or type) rather
// than dropping the entire array.
const WidgetArraySchema = z
  .array(z.unknown())
  .transform((arr): z.infer<typeof WidgetInstanceSchema>[] =>
    arr.flatMap((item) => {
      const r = WidgetInstanceSchema.safeParse(item);
      return r.success ? [r.data] : [];
    })
  )
  .catch([]);

const LayoutSchema = z.object({
  widgets: WidgetArraySchema,
  backgroundImage: z.string().optional().catch(undefined),
});

const WorkspaceV2Schema = z.object({
  version: z.literal(2),
  activeLayout: z.string().catch("Default"),
  layouts: z
    .record(z.string(), LayoutSchema.catch({ widgets: [] }))
    .catch({ Default: { widgets: [] } }),
  showGrid: z.boolean().catch(true),
  showVignette: z.boolean().catch(false),
  singletonStates: z.record(z.string(), z.unknown()).catch({}),
  disabledWidgetTypes: z.array(z.string()).catch([]),
});

// ---------------------------------------------------------------------------

const DEFAULT_WS: WorkspaceState = {
  version: 2,
  activeLayout: "Default",
  layouts: { Default: { widgets: [] } },
  showGrid: true,
  showVignette: false,
  singletonStates: {},
  disabledWidgetTypes: [],
};

export function migrateWorkspace(raw: unknown): WorkspaceState {
  if (!raw) {
    return { ...DEFAULT_WS };
  }
  const obj = raw as { version?: number; widgets?: WidgetInstance[] };
  if (obj.version === 1) {
    return {
      ...DEFAULT_WS,
      layouts: { Default: { widgets: obj.widgets ?? [] } },
    };
  }
  const result = WorkspaceV2Schema.safeParse(raw);
  if (result.success) return result.data;
  // Only reached when version is not the literal 2 (unknown future version
  // or a completely malformed file that escaped all per-field .catch() guards).
  logWarn(`workspace: unrecognised or malformed workspace (version=${String((obj as Record<string, unknown>).version)}), opening with defaults`);
  return { ...DEFAULT_WS };
}

export async function loadWorkspace(vaultPath: string): Promise<WorkspaceState> {
  const raw = await invoke<unknown>("load_workspace", { vaultPath });
  return migrateWorkspace(raw);
}

export function saveWorkspace(vaultPath: string, state: WorkspaceState): Promise<void> {
  return invoke("save_workspace", { vaultPath, state });
}
