// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

// Strip secrets and personally-identifying paths from text before it is logged
// to disk or exported as a diagnostics bundle. This is intentionally
// conservative: it favours over-redacting noise over leaking a real API key or
// a user's name embedded in a home-directory path.

const REDACTIONS: { pattern: RegExp; replace: string }[] = [
  // OpenAI / Anthropic-style keys: sk-..., sk-proj-..., etc.
  { pattern: /\bsk-[A-Za-z0-9_-]{16,}\b/g, replace: "<redacted-key>" },
  // Bearer tokens in headers / log lines.
  { pattern: /\bBearer\s+[A-Za-z0-9._-]{12,}/gi, replace: "Bearer <redacted-key>" },
  // Generic "apiKey": "..." / api_key=... assignments. The value must be at
  // least 6 chars so ordinary prose (e.g. "unexpected token = in") is left alone.
  {
    pattern: /("?(?:api[_-]?key|token|secret|password)"?\s*[:=]\s*"?)[^"\s,}]{6,}/gi,
    replace: "$1<redacted>",
  },
  // Unix home directories: /home/<user>/ and /Users/<user>/ → keep structure, drop the name.
  { pattern: /(\/(?:home|Users)\/)[^/\s"]+/g, replace: "$1<user>" },
  // Windows user profiles: C:\Users\<user>\
  { pattern: /([A-Za-z]:\\Users\\)[^\\\s"]+/g, replace: "$1<user>" },
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Remove API keys, tokens and home-directory usernames from arbitrary text.
 *
 * `extraSecrets` are literal values known to be sensitive (e.g. the configured
 * API key). Each is stripped verbatim regardless of shape, which is more
 * reliable than the heuristic patterns. Values shorter than 6 chars are ignored
 * to avoid redacting common substrings out of the whole report.
 */
export function redact(text: string, extraSecrets: string[] = []): string {
  let out = text;
  for (const secret of extraSecrets) {
    if (secret && secret.length >= 6) {
      out = out.replace(new RegExp(escapeRegExp(secret), "g"), "<redacted>");
    }
  }
  return REDACTIONS.reduce((acc, { pattern, replace }) => acc.replace(pattern, replace), out);
}
