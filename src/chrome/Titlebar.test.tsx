// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Titlebar } from "./Titlebar";

afterEach(() => cleanup());

function renderTitlebar() {
  return render(
    <Titlebar
      vaultPath="/home/gm/campaigns/curse-of-strahd"
      recentVaults={["/home/gm/campaigns/other-vault"]}
      playerWindowOpen={false}
      playerFullscreen={false}
      sessionTimer={{ startedAt: null, accumulatedMs: 0 }}
      clockFormat="24h"
      onSessionTimerChange={vi.fn()}
      onLayoutsClick={vi.fn()}
      onOpenVault={vi.fn()}
      onResumeVault={vi.fn()}
      onPlayerWindowToggle={vi.fn()}
      onClearPlayerScreen={vi.fn()}
      onPlayerFullscreenToggle={vi.fn()}
      onSettingsClick={vi.fn()}
      onSearchClick={vi.fn()}
    />,
  );
}

describe("Titlebar vault crumb dropdown", () => {
  it("closes on Escape", () => {
    renderTitlebar();
    fireEvent.click(screen.getByTitle("Switch vault"));
    expect(screen.getByText("Open new vault…")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Open new vault…")).not.toBeInTheDocument();
  });

  it("closes on a click outside", () => {
    renderTitlebar();
    fireEvent.click(screen.getByTitle("Switch vault"));
    expect(screen.getByText("Open new vault…")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText("Open new vault…")).not.toBeInTheDocument();
  });
});
