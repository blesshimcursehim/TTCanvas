// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect, vi, afterEach } from "vitest";
import { StrictMode } from "react";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { ModalDialog } from "./ModalDialog";

// These portal to document.body, so without this each test would find the previous one's dialog.
afterEach(cleanup);

// The native `close` event is queued as a task, not dispatched synchronously (see the <dialog>
// polyfill in src/test-setup.ts), so every assertion about a dismissal has to let that task run.
// Wrapped in act() because the handler it reaches calls onClose, which sets React state.
async function flushCloseEvent() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

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

  it("closes on a backdrop click", async () => {
    const { onClose, dialog } = renderDialog();
    fireEvent.mouseDown(dialog);
    await flushCloseEvent();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores a click on its own content", async () => {
    const { onClose } = renderDialog();
    fireEvent.mouseDown(screen.getByText("Body"));
    await flushCloseEvent();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps the backdrop inert when backdropClose is off", async () => {
    const { onClose, dialog } = renderDialog({ backdropClose: false });
    fireEvent.mouseDown(dialog);
    await flushCloseEvent();
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

  it("does not report a close when it unmounts", async () => {
    const { onClose, view } = renderDialog();
    view.unmount();
    await flushCloseEvent();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("stays open after StrictMode's double-mount instead of dismissing itself", async () => {
    // The regression that made every modal in the app unusable in dev. StrictMode runs the effect
    // setup/cleanup/setup; the cleanup calls close(), which *queues* a close event rather than
    // firing it synchronously, and by the time that task runs the second setup has attached a fresh
    // listener and reset the unmounting flag. So the stale event was read as a real user dismissal
    // and instantly closed the just-reopened dialog - modals appeared, then vanished within a second.
    const onClose = vi.fn();
    render(
      <StrictMode>
        <ModalDialog label="Test dialog" onClose={onClose}>
          <p>Body</p>
        </ModalDialog>
      </StrictMode>,
    );
    const dialog = document.querySelector("dialog");
    if (!dialog) throw new Error("no <dialog> rendered");

    await flushCloseEvent();

    expect(onClose).not.toHaveBeenCalled();
    expect(dialog.open).toBe(true);
  });

  it("still reports a close after StrictMode's double-mount", async () => {
    // The flip side of the test above: suppressing the stale event must not also swallow real
    // dismissals, or the dialog becomes impossible to close.
    const onClose = vi.fn();
    render(
      <StrictMode>
        <ModalDialog label="Test dialog" onClose={onClose}>
          <p>Body</p>
        </ModalDialog>
      </StrictMode>,
    );
    const dialog = document.querySelector("dialog");
    if (!dialog) throw new Error("no <dialog> rendered");
    await flushCloseEvent();

    fireEvent.mouseDown(dialog);
    await flushCloseEvent();

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
