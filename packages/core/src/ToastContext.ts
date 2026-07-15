// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { createContext, useContext } from "react";

export type ToastType = "error" | "success" | "info";

export interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const defaultValue: ToastContextValue = { showToast: () => {} };

export const ToastContext = createContext<ToastContextValue>(defaultValue);
export function useToast(): ToastContextValue { return useContext(ToastContext); }
