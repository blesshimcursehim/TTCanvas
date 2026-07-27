import "@testing-library/jest-dom/vitest";

// jsdom does not implement ResizeObserver
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as Record<string, unknown>).ResizeObserver = MockResizeObserver;

// jsdom does not implement HTMLCanvasElement.getContext - mock it so fog-of-war
// effects don't crash when the canvas API is exercised during tests.
if (typeof HTMLCanvasElement !== "undefined") {
  const ctx2d = {
    fillStyle: "" as string | CanvasGradient | CanvasPattern,
    strokeStyle: "" as string | CanvasGradient | CanvasPattern,
    lineCap: "butt" as CanvasLineCap,
    lineJoin: "miter" as CanvasLineJoin,
    lineWidth: 1,
    globalCompositeOperation: "source-over" as GlobalCompositeOperation,
    fillRect: () => {},
    clearRect: () => {},
    beginPath: () => {},
    arc: () => {},
    fill: () => {},
    stroke: () => {},
    moveTo: () => {},
    lineTo: () => {},
  };
  (HTMLCanvasElement.prototype as { getContext: unknown }).getContext = function () {
    return ctx2d as unknown as CanvasRenderingContext2D;
  };
}

// jsdom does not implement <dialog> showModal/close (used by Map Display's full-screen expand and
// by every ModalDialog) - the `open` property is already implemented and reflects the attribute,
// so toggling it is enough. close() also fires the `close` event, since that is the single exit
// path ModalDialog listens on.
if (typeof HTMLDialogElement !== "undefined") {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () {
    if (!this.open) return;
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
}
