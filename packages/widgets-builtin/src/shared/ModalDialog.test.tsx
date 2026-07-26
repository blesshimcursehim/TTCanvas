// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ModalDialog } from "./ModalDialog";

// These portal to document.body, so without this each test would find the previous one's dialog.
afterEach(cleanup);

function renderDialog(props: Partial<React.ComponentProps<typeof ModalDialog>> = {}) {
  const onClose = vi.fn();
  const view = render(
    <ModalDialog label="Test dialog" onClose={onClose} {...props}>
      <p>Body</p>
    </ModalDialog>,
  );
  const dialog = document.querySelector("dialog");
  if (!dialog) throw new Error("no <dialog> rendered");
  return { onClose, dialog, view };
}

describe("ModalDialog", () => {
  it("opens as a modal with an accessible name", () => {
    const { dialog } = renderDialog();
    // showModal() is what gives the native modal semantics, so `open` proves it was called
    // rather than the `open` attribute being set directly.
    expect(dialog.open).toBe(true);
    expect(screen.getByRole("dialog", { name: "Test dialog" })).toBe(dialog);
  });

  it("closes on a backdrop click", () => {
    const { onClose, dialog } = renderDialog();
    fireEvent.mouseDown(dialog);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores a click on its own content", () => {
    const { onClose } = renderDialog();
    fireEvent.mouseDown(screen.getByText("Body"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps the backdrop inert when backdropClose is off", () => {
    const { onClose, dialog } = renderDialog({ backdropClose: false });
    fireEvent.mouseDown(dialog);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("blocks Escape when not dismissible", () => {
    const { dialog } = renderDialog({ dismissible: false });
    // Escape fires `cancel` first; the handler preventing it is what stops the close.
    const cancel = new Event("cancel", { cancelable: true });
    dialog.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
  });

  it("lets Escape through by default", () => {
    const { dialog } = renderDialog();
    const cancel = new Event("cancel", { cancelable: true });
    dialog.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(false);
  });

  it("does not report a close when it unmounts", () => {
    const { onClose, view } = renderDialog();
    view.unmount();
    expect(onClose).not.toHaveBeenCalled();
  });
});
