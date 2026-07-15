// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import type { SVGProps } from "react";

const PATHS: Record<string, string> = {
  canvas:
    "M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z",
  notes:
    "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
  fullscreen:
    "M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3",
  "exit-full":
    "M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3",
  search:
    "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35",
  users:
    "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  swords:
    "M14.5 17.5 3 6V3h3l11.5 11.5M13 19l1.5-1.5M21 3l-3.5 3.5L21 10 20 11l-5-5 1-1 3.5 3.5M3 21l3.5-3.5",
  book:
    "M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z",
  sticky:
    "M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3zM15 3v6h6",
  wand:
    "M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8 19 13M17.8 6.2 19 5M3 21l9-9M12.2 6.2 11 5M4.5 4.5l15 15",
  library:
    "M2 3h4v18H2zM10 3h4v18h-4zM18 3h4v18h-4z",
  web:
    "M8 12a2 2 0 1 0-4 0 2 2 0 1 0 4 0M20 5a2 2 0 1 0-4 0 2 2 0 1 0 4 0M20 19a2 2 0 1 0-4 0 2 2 0 1 0 4 0M8 11l8-5M8 13l8 5",
  timeline:
    "M6 4v16M6 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4M6 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4M6 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4M11 5h9M11 12h9M11 19h9",
  plus:
    "M12 5v14M5 12h14",
  close:
    "M18 6 6 18M6 6l12 12",
  minus:
    "M5 12h14",
  check:
    "M20 6 9 17l-5-5",
  "chev-d":
    "M6 9l6 6 6-6",
  "chev-r":
    "M9 18l6-6-6-6",
  "chev-l":
    "M15 18l-6-6 6-6",
  play:
    "M5 3l14 9-14 9V3z",
  skip:
    "M5 3l10 9-10 9V3zM19 3v18",
  rewind:
    "M19 3 5 12l14 9V3zM5 3v18",
  spark:
    "M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z",
  drag:
    "M9 5a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM15 5a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM9 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM15 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM9 19a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM15 19a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  more:
    "M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  layouts:
    "M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z",
  dice:
    "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.29 7 12 12l8.71-5M12 22V12M9 9.5h.01M15 9.5h.01M12 14h.01",
  shield:
    "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  heart:
    "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z",
  folder:
    "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z",
  leaf:
    "M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10zM2 21c0-3 1-7 6.5-9",
  moon:
    "M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z",
  map:
    "M3 7l6-4 6 4 6-4v14l-6 4-6-4-6 4V7zM9 3v14M15 7v14",
  music:
    "M9 18V5l12-2v13M9 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm12-2a2 2 0 1 1-4 0 2 2 0 0 1 4 0z",
  volume:
    "M11 5 6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07",
  image:
    "M21 3H3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8.5 10a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zM21 15l-5-5L5 21",
  monitor:
    "M2 3h20v14H2zM8 21h8M12 17v4",
  calendar:
    "M3 4h18v18H3V4zM16 2v4M8 2v4M3 10h18",
  clock:
    "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2",
  skull:
    "M9 3C6 3 3 6 3 9c0 4 3 6 3 9h12c0-3 3-5 3-9 0-3-3-6-6-6H9zM6 18h12M9 21h6M9 15v3M15 15v3",
  recorder:
    "M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v3M8 22h8",
  sliders:
    "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6",
  scroll:
    "M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14zM9 7h6M9 11h6M9 15h4",
  cards:
    "M2 6h14v14H2V6zM8 2h14v14H8V2zM11 6h8M11 10h5",
  stopwatch:
    "M10 2h4M12 2v3M12 14l3-3M4 14a8 8 0 1 0 16 0 8 8 0 1 0-16 0",
  table:
    "M3 4h18v16H3zM3 9h18M3 14h18M9 9v11",
  flag:
    "M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7",
  deck:
    "M8 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM12 8l3 4-3 4-3-4z",
  pie:
    "M12 3a9 9 0 1 0 0.01 0zM12 12L12 3M12 12L19.8 16.5M12 12L4.2 16.5",
  eye:
    "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  compass:
    "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36z",
};

interface IconProps extends Omit<SVGProps<SVGSVGElement>, "stroke"> {
  name: keyof typeof PATHS;
  size?: number;
  stroke?: number;
}

export function Icon({ name, size = 16, stroke = 1.6, ...rest }: IconProps) {
  const d = PATHS[name];
  if (!d) return null;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <path d={d} />
    </svg>
  );
}
