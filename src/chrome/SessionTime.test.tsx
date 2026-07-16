// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionTimerState } from "@ttcanvas/core";
import { SessionTime } from "./SessionTime";

const NOW = new Date("2026-07-16T14:32:00Z").getTime();
const TWO_H_15 = 8_100_000;

const STOPPED: SessionTimerState = { startedAt: null, accumulatedMs: 0 };
const RUNNING: SessionTimerState = { startedAt: NOW - TWO_H_15, accumulatedMs: 0 };
const PAUSED: SessionTimerState = { startedAt: null, accumulatedMs: TWO_H_15 };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

function renderTimer(state: SessionTimerState) {
  const onChange = vi.fn();
  render(<SessionTime state={state} onChange={onChange} />);
  return { onChange };
}

// Queried by title, not by accessible name: the pill's name is its own text content (the
// times), which is the point - a screen reader should read the clock, not a label over it.
const pill = () => screen.getByTitle("Session timer");

describe("SessionTime readout", () => {
  it("shows the wall clock alone when stopped", () => {
    renderTimer(STOPPED);
    expect(screen.queryByText("2:15")).not.toBeInTheDocument();
    expect(pill().textContent).toMatch(/^\d{1,2}:\d{2}(\s?[AP]M)?$/);
  });

  it("shows the elapsed time alongside the clock when running", () => {
    renderTimer(RUNNING);
    expect(screen.getByText("2:15")).toBeInTheDocument();
  });

  it("shows the banked time when paused", () => {
    renderTimer(PAUSED);
    expect(screen.getByText("2:15")).toBeInTheDocument();
  });
});

describe("SessionTime menu", () => {
  it("opens on click and reports expanded state", () => {
    renderTimer(STOPPED);
    expect(pill()).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(pill());
    expect(pill()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Start session" })).toBeInTheDocument();
  });

  it("labels the toggle by state rather than cycling silently", () => {
    const { unmount } = render(<SessionTime state={RUNNING} onChange={vi.fn()} />);
    fireEvent.click(pill());
    expect(screen.getByRole("button", { name: "Pause session" })).toBeInTheDocument();
    unmount();

    render(<SessionTime state={PAUSED} onChange={vi.fn()} />);
    fireEvent.click(pill());
    expect(screen.getByRole("button", { name: "Resume session" })).toBeInTheDocument();
  });

  it("banks the elapsed time on pause", () => {
    const { onChange } = renderTimer(RUNNING);
    fireEvent.click(pill());
    fireEvent.click(screen.getByRole("button", { name: "Pause session" }));
    expect(onChange).toHaveBeenCalledWith({ startedAt: null, accumulatedMs: TWO_H_15 });
  });

  it("resets to stopped", () => {
    const { onChange } = renderTimer(PAUSED);
    fireEvent.click(pill());
    fireEvent.click(screen.getByRole("button", { name: "Reset session" }));
    expect(onChange).toHaveBeenCalledWith({ startedAt: null, accumulatedMs: 0 });
  });

  it("disables reset when already stopped", () => {
    renderTimer(STOPPED);
    fireEvent.click(pill());
    expect(screen.getByRole("button", { name: "Reset session" })).toBeDisabled();
  });

  it("closes on a click outside", () => {
    renderTimer(RUNNING);
    fireEvent.click(pill());
    expect(screen.getByRole("button", { name: "Pause session" })).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("button", { name: "Pause session" })).not.toBeInTheDocument();
  });
});

describe("SessionTime ticking", () => {
  it("never persists on a tick", () => {
    // Load-bearing: the readouts are recomputed from stored timestamps, so the 1s tick must
    // stay local. If it ever called onChange it would rewrite the whole workspace file every
    // second for the life of the app.
    const { onChange } = renderTimer(RUNNING);
    act(() => void vi.advanceTimersByTime(5000));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("advances the displayed elapsed time without being told", () => {
    renderTimer(RUNNING);
    expect(screen.getByText("2:15")).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(60_000));
    expect(screen.getByText("2:16")).toBeInTheDocument();
  });
});
