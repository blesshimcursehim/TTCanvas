// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModTrustPrompt } from "./ModTrustPrompt";

afterEach(() => cleanup());

describe("ModTrustPrompt", () => {
  it("lists every unrecognised filename and pluralises the copy", () => {
    render(<ModTrustPrompt filenames={["a.js", "b.js"]} onTrust={() => {}} onSkip={() => {}} />);

    expect(screen.getByText("Unrecognised mods in this vault")).toBeInTheDocument();
    expect(screen.getByText("a.js")).toBeInTheDocument();
    expect(screen.getByText("b.js")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Trust and load 2 mods/ })).toBeInTheDocument();
  });

  it("focuses the safe Skip action on open", () => {
    render(<ModTrustPrompt filenames={["a.js"]} onTrust={() => {}} onSkip={() => {}} />);

    expect(screen.getByRole("button", { name: "Skip mods" })).toHaveFocus();
  });

  it("traps Tab so it cycles between Skip and Trust only", () => {
    render(<ModTrustPrompt filenames={["a.js"]} onTrust={() => {}} onSkip={() => {}} />);
    const dialog = screen.getByRole("alertdialog");
    const skip = screen.getByRole("button", { name: "Skip mods" });
    const trust = screen.getByRole("button", { name: /Trust and load/ });

    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(trust).toHaveFocus();

    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(skip).toHaveFocus();

    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(trust).toHaveFocus();
  });

  it("restores focus to whatever was focused before the dialog opened", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "Open vault";
    document.body.appendChild(trigger);
    trigger.focus();

    const { unmount } = render(<ModTrustPrompt filenames={["a.js"]} onTrust={() => {}} onSkip={() => {}} />);
    expect(trigger).not.toHaveFocus();

    unmount();
    expect(trigger).toHaveFocus();

    trigger.remove();
  });

  it("calls onSkip and onTrust from their respective buttons", () => {
    const onSkip = vi.fn();
    const onTrust = vi.fn();
    render(<ModTrustPrompt filenames={["a.js"]} onTrust={onTrust} onSkip={onSkip} />);

    fireEvent.click(screen.getByRole("button", { name: "Skip mods" }));
    expect(onSkip).toHaveBeenCalledOnce();
    expect(onTrust).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Trust and load/ }));
    expect(onTrust).toHaveBeenCalledOnce();
  });
});
