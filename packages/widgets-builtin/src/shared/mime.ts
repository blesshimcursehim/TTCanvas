// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

/** Image MIME type by file extension, for building a `data:` URL from a base64 read. Defaults to
 * JPEG (the common case, and a real image will still decode fine under a generic MIME sniff). */
export function mimeForImageExt(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  return ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
}
