// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { parseLinkTarget } from "./wikilinks";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Inline markup only - bold/italic/strikethrough, inline code and `[[wikilinks]]` - with no block
 * wrapper. Exported for one-line meta fields (an NPC's Last Seen, a custom field) that want
 * wikilinks to resolve/click the same way Notes does, but shouldn't get `renderMarkdown`'s block-
 * level `<p>`/`<ul>`/table handling, which is the wrong fit for a single short line.
 */
export function applyInline(text: string): string {
  // Protect inline code first so literal wikilink examples cannot become anchors.
  const codePlaceholders: string[] = [];
  const withCodePlaceholders = text.replace(/`(.+?)`/g, (_, code: string) => {
    const idx = codePlaceholders.length;
    codePlaceholders.push(`<code>${escapeHtml(code)}</code>`);
    return `\x00code${idx}\x00`;
  });

  // Protect [[wikilinks]] from HTML escaping by processing them first.
  const wikiPlaceholders: string[] = [];
  const withPlaceholders = withCodePlaceholders.replace(/\[\[([^\]]+)\]\]/g, (_, name: string) => {
    const idx = wikiPlaceholders.length;
    const pipeIdx = name.indexOf("|");
    const target = pipeIdx >= 0 ? name.slice(0, pipeIdx) : name;
    // No explicit alias: show the bare name, dropping any `note:`/`place:`/`npc:` kind prefix
    // (the prefix stays on the target so resolution still knows which entity was meant).
    const display = pipeIdx >= 0 ? name.slice(pipeIdx + 1) : parseLinkTarget(name).name;
    const safeTarget = escapeHtml(target);
    const safeDisplay = escapeHtml(display);
    wikiPlaceholders.push(`<a data-wikilink="${safeTarget}" class="wikilink" href="#">${safeDisplay}</a>`);
    return `\x00wiki${idx}\x00`;
  });
  return escapeHtml(withPlaceholders)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/~~(.+?)~~/g, "<del>$1</del>")
    // \x00 is a deliberate sentinel byte marking a protected region (a wikilink or code
    // span already rendered above) so later passes can't match inside it - not a stray
    // control character.
    // eslint-disable-next-line no-control-regex
    .replace(/\x00wiki(\d+)\x00/g, (_, i: string) => wikiPlaceholders[Number(i)])
    // eslint-disable-next-line no-control-regex
    .replace(/\x00code(\d+)\x00/g, (_, i: string) => codePlaceholders[Number(i)]);
}

export function renderMarkdown(markdown: string): string {
  const lines = markdown.split("\n");
  const parts: string[] = [];
  let inFence = false;
  let fenceLines: string[] = [];
  let inUl = false;
  let inOl = false;
  let inBlockquote = false;
  let tableState: "none" | "header" | "body" = "none";
  let tablePendingLine = "";
  let tableHeader: string[] = [];
  let tableRows: string[][] = [];

  const closeUl = () => { if (inUl) { parts.push("</ul>"); inUl = false; } };
  const closeOl = () => { if (inOl) { parts.push("</ol>"); inOl = false; } };
  const closeBq = () => { if (inBlockquote) { parts.push("</blockquote>"); inBlockquote = false; } };
  const closeLists = () => { closeUl(); closeOl(); };

  const flushTable = () => {
    if (tableState === "none") return;
    if (tableState === "body") {
      const ths = tableHeader.map((h) => `<th>${applyInline(h)}</th>`).join("");
      const trs = tableRows
        .map((cells) => `<tr>${cells.map((c) => `<td>${applyInline(c)}</td>`).join("")}</tr>`)
        .join("");
      parts.push(`<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`);
    } else {
      // header row buffered but separator never came - emit as paragraph
      parts.push(`<p>${applyInline(tablePendingLine)}</p>`);
    }
    tableState = "none";
    tablePendingLine = "";
    tableHeader = [];
    tableRows = [];
  };

  const closeAll = () => { closeLists(); closeBq(); flushTable(); };

  for (const line of lines) {
    if (line.trimStart().startsWith("```")) {
      if (inFence) {
        parts.push(`<pre><code>${escapeHtml(fenceLines.join("\n"))}</code></pre>`);
        fenceLines = [];
        inFence = false;
      } else {
        closeAll();
        inFence = true;
      }
      continue;
    }
    if (inFence) { fenceLines.push(line); continue; }

    const trimmed = line.trim();

    // GFM table rows
    if (trimmed.startsWith("|")) {
      const cells = trimmed.split("|").slice(1, -1).map((c) => c.trim());
      if (tableState === "none") {
        closeLists(); closeBq();
        tableState = "header";
        tablePendingLine = trimmed;
        tableHeader = cells;
      } else if (tableState === "header") {
        if (cells.every((c) => /^[-:\s]+$/.test(c))) {
          tableState = "body";
        } else {
          // Two data rows with no separator - first was not a table header
          parts.push(`<p>${applyInline(tablePendingLine)}</p>`);
          tablePendingLine = trimmed;
          tableHeader = cells;
        }
      } else {
        tableRows.push(cells);
      }
      continue;
    }

    // Non-pipe line: flush any in-progress table
    flushTable();

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      closeAll();
      parts.push("<hr>");
      continue;
    }

    const headerMatch = trimmed.match(/^(#{1,4})\s+(.+)/);
    if (headerMatch) {
      closeAll();
      const level = headerMatch[1].length;
      parts.push(`<h${level}>${applyInline(headerMatch[2])}</h${level}>`);
      continue;
    }

    if (trimmed.startsWith("> ")) {
      closeLists();
      if (!inBlockquote) { parts.push("<blockquote>"); inBlockquote = true; }
      parts.push(`<p>${applyInline(trimmed.slice(2))}</p>`);
      continue;
    }

    const ulMatch = trimmed.match(/^[-*+]\s+(.+)/);
    if (ulMatch) {
      closeBq(); closeOl();
      if (!inUl) { parts.push("<ul>"); inUl = true; }
      parts.push(`<li>${applyInline(ulMatch[1])}</li>`);
      continue;
    }

    const olMatch = trimmed.match(/^\d+\.\s+(.+)/);
    if (olMatch) {
      closeBq(); closeUl();
      if (!inOl) { parts.push("<ol>"); inOl = true; }
      parts.push(`<li>${applyInline(olMatch[1])}</li>`);
      continue;
    }

    if (trimmed === "") { closeAll(); continue; }

    closeAll();
    parts.push(`<p>${applyInline(trimmed)}</p>`);
  }

  closeAll();
  if (inFence) parts.push(`<pre><code>${escapeHtml(fenceLines.join("\n"))}</code></pre>`);

  return parts.join("\n");
}
