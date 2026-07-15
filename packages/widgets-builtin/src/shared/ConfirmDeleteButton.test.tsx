// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

// @vitest-environment jsdom

import { useState } from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { ConfirmDeleteButton } from "./ConfirmDeleteButton";

afterEach(() => cleanup());

// Wrapper owns `confirming` for real, matching how every call site wires the controlled props.
function Harness({ onConfirm = vi.fn() }: { onConfirm?: () => void }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <ConfirmDeleteButton
      trigger="Delete"
      confirming={confirming}
      onRequestConfirm={() => setConfirming(true)}
      onConfirm={onConfirm}
      onCancel={() => setConfirming(false)}
    />
  );
}

describe("ConfirmDeleteButton - focus management", () => {
  it("moves focus to Cancel (not Confirm) when the confirm row opens", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("Delete"));
    expect(screen.getByText("Cancel")).toHaveFocus();
  });

  it("returns focus to the trigger when cancelled", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("Delete"));
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.getByText("Delete")).toHaveFocus();
  });

  it("fires onConfirm when the confirm button is clicked", () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText("Delete")); // opens the row; trigger unmounts
    fireEvent.click(screen.getByText("Delete")); // now the confirm button (default label)
    expect(onConfirm).toHaveBeenCalled();
  });
});
