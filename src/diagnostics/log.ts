// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { warn as tauriWarn, error as tauriError, info as tauriInfo } from "@tauri-apps/plugin-log";
import { redact } from "./redact";

// Thin wrapper around tauri-plugin-log that redacts secrets/paths before any
// message reaches the on-disk log file. Everything written here is also echoed
// to the dev console. All persistence is local - nothing leaves the machine.

function describe(err: unknown): string {
  if (err instanceof Error) {
    return err.stack ? `${err.message}\n${err.stack}` : err.message;
  }
  if (err === undefined) return "";
  try {
    return typeof err === "string" ? err : JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function compose(message: string, err?: unknown): string {
  const detail = describe(err);
  return redact(detail ? `${message} - ${detail}` : message);
}

export function logInfo(message: string): void {
  void tauriInfo(redact(message)).catch(() => {});
  console.info(message);
}

export function logWarn(message: string, err?: unknown): void {
  void tauriWarn(compose(message, err)).catch(() => {});
  console.warn(message, err ?? "");
}

export function logError(message: string, err?: unknown): void {
  void tauriError(compose(message, err)).catch(() => {});
  console.error(message, err ?? "");
}
