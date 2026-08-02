// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect } from "vitest";
import { renderMarkdown, applyInline } from "./markdownRenderer";

describe("renderMarkdown - headings", () => {
  it("renders H1", () => {
    expect(renderMarkdown("# Title")).toBe("<h1>Title</h1>");
  });

  it("renders H2-H4", () => {
    expect(renderMarkdown("## Two")).toBe("<h2>Two</h2>");
    expect(renderMarkdown("### Three")).toBe("<h3>Three</h3>");
    expect(renderMarkdown("#### Four")).toBe("<h4>Four</h4>");
  });

  it("does not render H5 as a heading", () => {
    const result = renderMarkdown("##### Five");
    expect(result).not.toContain("<h5>");
  });
});

describe("renderMarkdown - inline formatting", () => {
  it("renders bold", () => {
    expect(renderMarkdown("**bold**")).toContain("<strong>bold</strong>");
  });

  it("renders italic", () => {
    expect(renderMarkdown("*italic*")).toContain("<em>italic</em>");
  });

  it("renders strikethrough", () => {
    expect(renderMarkdown("~~del~~")).toContain("<del>del</del>");
  });

  it("renders inline code", () => {
    expect(renderMarkdown("`code`")).toContain("<code>code</code>");
  });

  it("keeps wikilink syntax inside code as a non-interactive example", () => {
    const result = renderMarkdown("`[[Note name]]`");
    expect(result).toContain("<code>[[Note name]]</code>");
    expect(result).not.toContain("data-wikilink");
  });
});

describe("renderMarkdown - lists", () => {
  it("renders an unordered list", () => {
    const result = renderMarkdown("- alpha\n- beta\n- gamma");
    expect(result).toContain("<ul>");
    expect(result).toContain("<li>alpha</li>");
    expect(result).toContain("<li>beta</li>");
    expect(result).toContain("</ul>");
  });

  it("renders an ordered list", () => {
    const result = renderMarkdown("1. first\n2. second");
    expect(result).toContain("<ol>");
    expect(result).toContain("<li>first</li>");
    expect(result).toContain("</ol>");
  });

  it("closes list before a heading", () => {
    const result = renderMarkdown("- item\n\n## Heading");
    expect(result.indexOf("</ul>")).toBeLessThan(result.indexOf("<h2>"));
  });
});

describe("renderMarkdown - blockquote", () => {
  it("wraps lines in blockquote", () => {
    const result = renderMarkdown("> quote line");
    expect(result).toContain("<blockquote>");
    expect(result).toContain("<p>quote line</p>");
    expect(result).toContain("</blockquote>");
  });
});

describe("renderMarkdown - code fence", () => {
  it("renders a fenced code block", () => {
    const result = renderMarkdown("```\nconst x = 1;\n```");
    expect(result).toContain("<pre><code>");
    expect(result).toContain("const x = 1;");
    expect(result).toContain("</code></pre>");
  });

  it("does not apply inline formatting inside fences", () => {
    const result = renderMarkdown("```\n**not bold**\n```");
    expect(result).not.toContain("<strong>");
    expect(result).toContain("**not bold**");
  });
});

describe("renderMarkdown - horizontal rule", () => {
  it("renders --- as hr", () => {
    expect(renderMarkdown("---")).toContain("<hr>");
  });

  it("renders *** as hr", () => {
    expect(renderMarkdown("***")).toContain("<hr>");
  });
});

describe("renderMarkdown - paragraphs and blank lines", () => {
  it("wraps plain text in a paragraph", () => {
    expect(renderMarkdown("hello world")).toBe("<p>hello world</p>");
  });

  it("blank lines produce no output", () => {
    expect(renderMarkdown("")).toBe("");
    expect(renderMarkdown("   ")).toBe("");
  });

  it("two paragraphs separated by a blank line", () => {
    const result = renderMarkdown("first\n\nsecond");
    expect(result).toContain("<p>first</p>");
    expect(result).toContain("<p>second</p>");
  });
});

describe("renderMarkdown - wikilinks", () => {
  it("renders [[Name]] as a wikilink anchor", () => {
    const result = renderMarkdown("[[Goblin King]]");
    expect(result).toContain('data-wikilink="Goblin King"');
    expect(result).toContain("Goblin King");
    expect(result).toContain('class="wikilink"');
  });

  it("renders wikilink inside a paragraph", () => {
    const result = renderMarkdown("See [[Tavern]] for details");
    expect(result).toContain("<p>");
    expect(result).toContain('data-wikilink="Tavern"');
  });

  it("renders multiple wikilinks on one line", () => {
    const result = renderMarkdown("[[Alice]] and [[Bob]]");
    expect(result).toContain('data-wikilink="Alice"');
    expect(result).toContain('data-wikilink="Bob"');
  });

  it("escapes & in wikilink display text", () => {
    const result = renderMarkdown("[[Dragon & Kobold]]");
    expect(result).not.toContain(">Dragon & Kobold<");
    expect(result).toContain("Dragon &amp; Kobold");
  });

  it("does not inject raw HTML from wikilink display text (SHEET-1)", () => {
    const result = renderMarkdown("[[<img src=x onerror=alert(1)>]]");
    expect(result).not.toContain("<img");
    expect(result).toContain("&lt;img");
  });

  it("does not inject raw HTML via wikilink attribute (SHEET-1)", () => {
    const result = renderMarkdown('[[x" onmouseover="alert(1)]]');
    expect(result).not.toContain('onmouseover="alert(1)"');
  });

  it("renders [[Target|Alias]] with alias as display text and target in data attribute", () => {
    const result = renderMarkdown("[[Conditions|exhaustion]]");
    expect(result).toContain('data-wikilink="Conditions"');
    expect(result).toContain(">exhaustion<");
    expect(result).not.toContain("Conditions|exhaustion");
  });

  it("drops a kind prefix from the display text but keeps it on the target", () => {
    const result = renderMarkdown("[[npc:Agnes Holk]] and [[place:The Gilded Keel]]");
    expect(result).toContain('data-wikilink="npc:Agnes Holk"');
    expect(result).toContain(">Agnes Holk<");
    expect(result).not.toContain(">npc:Agnes Holk<");
    expect(result).toContain('data-wikilink="place:The Gilded Keel"');
    expect(result).toContain(">The Gilded Keel<");
  });

  it("keeps an explicit alias even when the target has a kind prefix", () => {
    const result = renderMarkdown("[[npc:Agnes Holk|the clerk]]");
    expect(result).toContain('data-wikilink="npc:Agnes Holk"');
    expect(result).toContain(">the clerk<");
  });
});

describe("applyInline - one-line meta fields (Last Seen, custom fields)", () => {
  it("renders a wikilink with no block wrapper, unlike renderMarkdown", () => {
    const result = applyInline("Last seen in [[place:The Gilded Keel]]");
    expect(result).toContain('data-wikilink="place:The Gilded Keel"');
    expect(result).toContain(">The Gilded Keel<");
    expect(result).not.toContain("<p>");
  });

  it("still renders bold/italic/code inline", () => {
    expect(applyInline("**bold**")).toContain("<strong>bold</strong>");
    expect(applyInline("*italic*")).toContain("<em>italic</em>");
    expect(applyInline("`code`")).toContain("<code>code</code>");
  });

  it("escapes plain text safely", () => {
    expect(applyInline("Tom & Jerry")).toContain("Tom &amp; Jerry");
  });
});

describe("renderMarkdown - GFM tables", () => {
  it("renders a simple two-column table", () => {
    const md = "| Name | HP |\n| --- | --- |\n| Goblin | 7 |\n| Orc | 15 |";
    const html = renderMarkdown(md);
    expect(html).toContain("<table>");
    expect(html).toContain("<thead>");
    expect(html).toContain("<th>Name</th>");
    expect(html).toContain("<th>HP</th>");
    expect(html).toContain("<tbody>");
    expect(html).toContain("<td>Goblin</td>");
    expect(html).toContain("<td>7</td>");
    expect(html).toContain("<td>Orc</td>");
    expect(html).toContain("</table>");
  });

  it("applies inline formatting inside cells", () => {
    const md = "| Name | Notes |\n| --- | --- |\n| **Bold** | *italic* |";
    const html = renderMarkdown(md);
    expect(html).toContain("<strong>Bold</strong>");
    expect(html).toContain("<em>italic</em>");
  });

  it("renders a table followed by a paragraph", () => {
    const md = "| A | B |\n| --- | --- |\n| 1 | 2 |\n\nAfter table";
    const html = renderMarkdown(md);
    expect(html).toContain("</table>");
    expect(html).toContain("<p>After table</p>");
    expect(html.indexOf("</table>")).toBeLessThan(html.indexOf("<p>After table</p>"));
  });

  it("renders a table preceded by a paragraph", () => {
    const md = "Before table\n\n| A | B |\n| --- | --- |\n| 1 | 2 |";
    const html = renderMarkdown(md);
    expect(html).toContain("<p>Before table</p>");
    expect(html).toContain("<table>");
  });

  it("escapes HTML in table cells (XSS safety)", () => {
    const md = "| Name | Script |\n| --- | --- |\n| Goblin | <script>alert(1)</script> |";
    const html = renderMarkdown(md);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("treats a lone pipe row without separator as a paragraph", () => {
    const md = "| not a table |\nNext line";
    const html = renderMarkdown(md);
    expect(html).not.toContain("<table>");
    expect(html).toContain("<p>");
  });
});

describe("renderMarkdown - XSS safety", () => {
  it("escapes < and > in plain text", () => {
    const result = renderMarkdown("<script>alert(1)</script>");
    expect(result).not.toContain("<script>");
    expect(result).toContain("&lt;script&gt;");
  });

  it("escapes & in plain text", () => {
    const result = renderMarkdown("fish & chips");
    expect(result).toContain("fish &amp; chips");
  });

  it("escapes HTML inside a code fence", () => {
    const result = renderMarkdown("```\n<b>raw</b>\n```");
    expect(result).not.toContain("<b>");
    expect(result).toContain("&lt;b&gt;raw&lt;/b&gt;");
  });

  it("escapes quotes in text", () => {
    const result = renderMarkdown(`say "hello"`);
    expect(result).toContain("&quot;hello&quot;");
  });
});
