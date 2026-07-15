// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import React, { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import type { PlayerScene, FogReveal, MapToken, CharacterPayload, LocationPayload, InitiativeOverlay, BrushPoint, MapPing, ClockOverlay, DiceOverlay } from "@ttcanvas/core";
import { drawFogCanvas, renderFogReveals, lastBrushPoint, fogModeOf, PING_LIFETIME_MS } from "@ttcanvas/core";
import { AnnotationLayer, clockWedges, mimeForImageExt } from "@ttcanvas/widgets-builtin";
import "./PlayerWindow.css";

interface PlayerFogProps {
  mapKey: string;
  imgW: number;
  imgH: number;
  fogReveals: FogReveal[];
}

function PlayerFogCanvas({ mapKey, imgW, imgH, fogReveals }: PlayerFogProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stampedLenRef = useRef(0);
  const lastBrushRef = useRef<BrushPoint | null>(null);

  // Full redraw on map change
  useEffect(() => {
    stampedLenRef.current = 0;
    lastBrushRef.current = null;
    if (!canvasRef.current) return;
    drawFogCanvas(canvasRef.current, imgW, imgH, fogReveals);
    stampedLenRef.current = fogReveals.length;
    lastBrushRef.current = lastBrushPoint(fogReveals);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgW, imgH, mapKey]);

  // Incremental stamp for new reveals (O(1) per stroke)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const stamped = stampedLenRef.current;
    if (fogReveals.length < stamped) {
      drawFogCanvas(canvas, imgW, imgH, fogReveals);
      stampedLenRef.current = fogReveals.length;
      lastBrushRef.current = lastBrushPoint(fogReveals);
      return;
    }
    if (fogReveals.length === stamped) return;
    const newReveals = fogReveals.slice(stamped);
    const ctx = canvas.getContext("2d")!;
    renderFogReveals(ctx, newReveals, imgW, imgH, lastBrushRef.current);
    stampedLenRef.current = fogReveals.length;
    // Only the tail's last element continues the chain - if it's a rect (or the tail is
    // somehow empty), continuity intentionally breaks rather than reaching back past it.
    const lastNew = newReveals[newReveals.length - 1];
    lastBrushRef.current = lastNew && lastNew.shape === "brush"
      ? { cx: lastNew.cx, cy: lastNew.cy, r: lastNew.r, mode: fogModeOf(lastNew) }
      : null;
  }, [fogReveals, imgW, imgH]);

  return <canvas ref={canvasRef} className="playerFog" />;
}

interface PlayerTokenProps {
  token: MapToken;
  imgW: number;
  imgH: number;
  portraitsFolder: string | undefined;
  spotlight: boolean;
}

const PLAYER_TOKEN_BASE_PX = 52;

function PlayerTokenPin({ token, imgW, imgH, portraitsFolder, spotlight }: PlayerTokenProps) {
  const px = PLAYER_TOKEN_BASE_PX * (token.size ?? 1);
  const [portraitSrc, setPortraitSrc] = useState<string | null>(null);

  useEffect(() => {
    const path = token.portraitPath;
    if (!path) { setPortraitSrc(null); return; }
    // Bestiary portraits arrive as inline data URLs (no file to read); use them as-is.
    if (path.startsWith("data:")) { setPortraitSrc(path); return; }
    if (!portraitsFolder) { setPortraitSrc(null); return; }
    const fileName = path.split("/").pop()!;
    const mime = mimeForImageExt(fileName);
    let cancelled = false;
    invoke<string>("read_player_image_base64", { folderPath: portraitsFolder, fileName })
      .then((b64) => { if (!cancelled) setPortraitSrc(`data:${mime};base64,${b64}`); })
      .catch(() => { if (!cancelled) setPortraitSrc(null); });
    return () => { cancelled = true; };
  }, [token.portraitPath, portraitsFolder]);

  return (
    <div
      className={`playerToken${spotlight ? " playerTokenSpotlight" : ""}`}
      style={{
        left: token.x * imgW,
        top: token.y * imgH,
        width: px,
        height: px,
        background: portraitSrc ? "transparent" : token.color,
      }}
    >
      {portraitSrc && (
        <img src={portraitSrc} className="playerTokenPortrait" alt={token.label} />
      )}
      <span className="playerTokenLabel">{token.label}</span>
    </div>
  );
}

const IT_KIND_COLOR: Record<string, string> = {
  pc:   "oklch(0.70 0.15 60)",
  foe:  "oklch(0.60 0.20 25)",
  ally: "oklch(0.60 0.16 145)",
};

// Player-facing initiative order - current/next combatant only, no HP/AC. Fixed-position so it
// overlays any scene type (map / character / handout / idle). `data.turns` already comes
// pre-trimmed to [current, next] in that order from InitiativeTracker's overlay push - deliberately
// not the full turn order, since that's GM-facing information (and where everyone falls in the
// queue can spoil upcoming enemy actions).
function InitiativeOverlayCard({ data }: { data: InitiativeOverlay }) {
  const current = data.turns.find((t) => t.current);
  return (
    <div className="itOverlay" role="region" aria-label="Initiative order">
      <div className="itRound">Round {data.round}</div>
      <ul className="itList">
        {data.turns.map((t, i) => (
          <li
            key={`${t.name}-${i}`}
            className={`itRow${t.current ? " itCurrent" : ""}${t.next ? " itNext" : ""}`}
            aria-current={t.current ? "true" : undefined}
          >
            <span className="itDot" style={{ background: IT_KIND_COLOR[t.kind] ?? IT_KIND_COLOR.foe }} />
            <span className="itName">{t.name}</span>
            {t.current && <span className="itTag">NOW</span>}
            {t.next && !t.current && <span className="itTag itTagNext">NEXT</span>}
          </li>
        ))}
      </ul>
      <span className="visuallyHidden" aria-live="polite">
        {current ? `Current turn: ${current.name}, round ${data.round}` : ""}
      </span>
    </div>
  );
}

const CLOCK_CARD_RADIUS = 22;

// Player-facing Progress Clock overlay (bottom-right, opposite the initiative order's top-right
// corner) - mirrors InitiativeOverlayCard: a separate fixed-position channel over any scene type,
// live-updated as the GM fills the clock in rather than needing to be recast each time.
function ClockOverlayCard({ data }: { data: ClockOverlay }) {
  return (
    <div className="clockOverlay" role="region" aria-label={`Clock: ${data.name}`}>
      <svg width={CLOCK_CARD_RADIUS * 2} height={CLOCK_CARD_RADIUS * 2} viewBox={`0 0 ${CLOCK_CARD_RADIUS * 2} ${CLOCK_CARD_RADIUS * 2}`}>
        {clockWedges(data.segments, data.filled, CLOCK_CARD_RADIUS).map((w, i) => (
          <path key={i} d={w.d} className={w.filled ? "clockOverlayWedgeFilled" : "clockOverlayWedgeEmpty"} />
        ))}
      </svg>
      <div className="clockOverlayText">
        <div className="clockOverlayName">{data.name}</div>
        <div className="clockOverlayCount">{data.filled} / {data.segments}</div>
      </div>
    </div>
  );
}

// Player-facing dice result (lower-middle) - mirrors ClockOverlayCard: a separate fixed-position
// channel over any scene type. Shows the label + total; a crit/fumble tints the total.
function DiceOverlayCard({ data }: { data: DiceOverlay }) {
  const tone = data.crit ? " diceOverlayCrit" : data.fumble ? " diceOverlayFumble" : "";
  return (
    <div className="diceOverlay" role="region" aria-label={`Roll: ${data.label}`}>
      <div className="diceOverlayLabel">{data.label}</div>
      <div className={`diceOverlayTotal${tone}`}>{data.total}</div>
      <div className="diceOverlayBreakdown">{data.breakdown}</div>
      {(data.crit || data.fumble) && (
        <div className={`diceOverlayFlag${tone}`}>{data.crit ? "CRIT" : "FUMBLE"}</div>
      )}
    </div>
  );
}

// A cast Gazetteer location: the establishing image (if any) over the name, a kind/parent locator,
// and a player-safe blurb. Mirrors the text-reveal card's dark ground and gold hairline so the
// player sees a consistent "reveal" treatment across generators, handouts and places.
function LocationScene({ location, dragRegion }: { location: LocationPayload; dragRegion: React.ReactNode }) {
  const { name, subtitle, blurb, imgSrc } = location;
  return (
    <div className="root locationRoot">
      {dragRegion}
      <div className={`locationCard${imgSrc ? "" : " locationCardNoArt"}`}>
        {imgSrc && <img src={imgSrc} className="locationArt" alt={name} draggable={false} />}
        <div className="locationBody">
          {subtitle && <div className="locationEyebrow">{subtitle}</div>}
          <div className="locationName">{name}</div>
          {blurb && <div className="locationBlurb">{blurb}</div>}
        </div>
      </div>
    </div>
  );
}

function IdleScreen({ children }: { children?: React.ReactNode }) {
  return (
    <div className="root idleRoot">
      <div className="wordmark">ttcanvas</div>
      <div className="dot" />
      {children}
    </div>
  );
}

function CharacterScene({ character, dragRegion, inWorldDate }: { character: CharacterPayload; dragRegion: React.ReactNode; inWorldDate: string | null }) {
  const { name, subtitle, portraitSrc, portraitFullSrc, accentColor, tags } = character;
  const hasFullPortrait = !!portraitFullSrc;
  const accent = accentColor ?? "oklch(0.65 0.16 60)";

  if (hasFullPortrait) {
    return (
      <div className="root characterRoot twoCol">
        {dragRegion}
        <div className="charPortraitCol">
          <img src={portraitFullSrc} className="charPortraitFull" alt={name} draggable={false} />
          <div className="charVignette" />
        </div>
        <div className="charInfoCol">
          <div className="charName" style={{ color: "#e8e0d0" }}>{name}</div>
          {subtitle && <div className="charSubtitle">{subtitle}</div>}
          {tags && tags.length > 0 && (
            <div className="charTags">
              {tags.map((t) => (
                <span key={t} className="charTag" style={{ borderColor: accent, color: accent }}>{t}</span>
              ))}
            </div>
          )}
          {inWorldDate && <div className="charDate">{inWorldDate}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="root characterRoot centred">
      {dragRegion}
      {portraitSrc
        ? <img src={portraitSrc} className="charPortraitCrop" alt={name} draggable={false} />
        : <div className="charPortraitInitial" style={{ background: accent }}>{name.charAt(0).toUpperCase()}</div>
      }
      <div className="charName centredName" style={{ color: "#e8e0d0" }}>{name}</div>
      {subtitle && <div className="charSubtitle centredSubtitle">{subtitle}</div>}
      {tags && tags.length > 0 && (
        <div className="charTags">
          {tags.map((t) => (
            <span key={t} className="charTag" style={{ borderColor: accent, color: accent }}>{t}</span>
          ))}
        </div>
      )}
      {inWorldDate && <div className="dateOverlay">{inWorldDate}</div>}
    </div>
  );
}

export function PlayerWindow() {
  const [scene, setScene] = useState<PlayerScene>({ type: "idle" });
  const [inWorldDate, setInWorldDate] = useState<string | null>(null);
  const [itOverlay, setItOverlay] = useState<InitiativeOverlay | null>(null);
  const [clockOverlay, setClockOverlay] = useState<ClockOverlay | null>(null);
  const [diceOverlay, setDiceOverlay] = useState<DiceOverlay | null>(null);
  const [pings, setPings] = useState<(MapPing & { id: string })[]>([]);
  const [localTransform, setLocalTransform] = useState({ panX: 0, panY: 0, scale: 1 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [decorated, setDecorated] = useState(false);
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const prevImgKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const unlisten = listen<PlayerScene>("player-update", (event) => {
      setScene(event.payload);
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  useEffect(() => {
    const unlisten = listen<string | null>("date-update", (event) => {
      setInWorldDate(event.payload);
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  useEffect(() => {
    const unlisten = listen<InitiativeOverlay | null>("it-update", (event) => {
      setItOverlay(event.payload);
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  useEffect(() => {
    const unlisten = listen<ClockOverlay | null>("clock-update", (event) => {
      setClockOverlay(event.payload);
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  useEffect(() => {
    const unlisten = listen<DiceOverlay | null>("dice-update", (event) => {
      setDiceOverlay(event.payload);
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  useEffect(() => {
    const unlisten = listen<MapPing>("map-ping", (event) => {
      const id = `${event.payload.at}`;
      setPings((ps) => [...ps, { ...event.payload, id }]);
      setTimeout(() => setPings((ps) => ps.filter((p) => p.id !== id)), PING_LIFETIME_MS);
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  useEffect(() => {
    const unlisten = listen<boolean>("player-fullscreen-changed", (e) => setIsFullscreen(e.payload));
    return () => { unlisten.then(fn => fn()); };
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "F11") {
        e.preventDefault();
        const next = !isFullscreen;
        setIsFullscreen(next);
        invoke("set_player_fullscreen", { fullscreen: next }).catch(() => undefined);
      } else if (e.key === "Escape" && isFullscreen) {
        setIsFullscreen(false);
        invoke("set_player_fullscreen", { fullscreen: false }).catch(() => undefined);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isFullscreen]);

  // Load map image in the player window to avoid sending large base64 over IPC events
  const mapFolder = scene.type === "map" ? scene.map?.mapFolder ?? null : null;
  const mapFile = scene.type === "map" ? scene.map?.mapFile ?? null : null;
  useEffect(() => {
    if (!mapFolder || !mapFile) {
      setImgSrc(null);
      return;
    }
    // Clear immediately so the old map is never shown under the new scene's fog/tokens.
    setImgSrc(null);
    let cancelled = false;
    invoke<string>("read_player_image_base64", { folderPath: mapFolder, fileName: mapFile })
      .then((b64) => {
        if (cancelled) return;
        const ext = mapFile.split(".").pop()?.toLowerCase() ?? "png";
        const mime =
          ext === "jpg" || ext === "jpeg" ? "image/jpeg" :
          ext === "webp" ? "image/webp" : "image/png";
        setImgSrc(`data:${mime};base64,${b64}`);
      })
      .catch(() => { if (!cancelled) setImgSrc(null); });
    return () => { cancelled = true; };
  }, [mapFolder, mapFile]);

  // Fit to screen on new map; mirror GM framing on subsequent pushes of the same map
  useEffect(() => {
    if (scene.type !== "map" || !scene.map) return;
    const { mapFolder, mapFile, imgW, imgH, panX, panY, scale, gmViewW, gmViewH } = scene.map;
    const playerFitScale = Math.min(window.innerWidth / imgW, window.innerHeight / imgH);
    const key = `${mapFolder}/${mapFile}`;
    if (key !== prevImgKeyRef.current) {
      setLocalTransform({ panX: 0, panY: 0, scale: playerFitScale });
      prevImgKeyRef.current = key;
    } else if (scale > 0 && gmViewW > 0 && gmViewH > 0) {
      // Normalize: compute the GM's zoom ratio relative to its own fit scale, then
      // apply that ratio against the player's fit scale so the same region is visible.
      const gmFitScale = Math.min(gmViewW / imgW, gmViewH / imgH);
      const playerScale = (scale / gmFitScale) * playerFitScale;
      setLocalTransform({
        panX: panX * playerScale / scale,
        panY: panY * playerScale / scale,
        scale: playerScale,
      });
    } else {
      setLocalTransform({ panX, panY, scale });
    }
  }, [scene]);

  function toggleDecorations() {
    const next = !decorated;
    setDecorated(next);
    // Toggle the OS frame in Rust (no window-mutation capability needed on the JS side).
    invoke("set_player_decorations", { decorations: next }).catch(() => undefined);
  }

  // The invisible top drag-strip plus a hover-revealed control to toggle the OS window frame
  // (so this otherwise frameless, immersive window can be moved / resized / closed on demand).
  const dragRegion = !isFullscreen ? (
    <>
      <div className="dragRegion" data-tauri-drag-region />
      <button
        className="windowControlsToggle"
        onClick={toggleDecorations}
        title={decorated ? "Hide window controls" : "Show window controls (move / resize)"}
        aria-label={decorated ? "Hide window controls" : "Show window controls"}
        aria-pressed={decorated}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 3h20v14H2zM8 21h8M12 17v4" />
        </svg>
      </button>
    </>
  ) : null;
  const itCard = itOverlay ? <InitiativeOverlayCard data={itOverlay} /> : null;
  const clockCard = clockOverlay ? <ClockOverlayCard data={clockOverlay} /> : null;
  const diceCard = diceOverlay ? <DiceOverlayCard data={diceOverlay} /> : null;

  if (scene.type === "character" && scene.character) {
    return (
      <>
        <CharacterScene character={scene.character} dragRegion={dragRegion} inWorldDate={inWorldDate} />
        {itCard}
        {clockCard}
        {diceCard}
      </>
    );
  }

  if (scene.type === "handout" && scene.handout) {
    return (
      <div className="root">
        {dragRegion}
        <img
          src={scene.handout.imgSrc}
          className="handoutImg"
          alt="Handout"
          draggable={false}
        />
        {inWorldDate && <div className="dateOverlay">{inWorldDate}</div>}
        {itCard}
        {clockCard}
        {diceCard}
      </div>
    );
  }

  if (scene.type === "location" && scene.location) {
    return (
      <>
        <LocationScene location={scene.location} dragRegion={dragRegion} />
        {inWorldDate && <div className="dateOverlay">{inWorldDate}</div>}
        {itCard}
        {clockCard}
        {diceCard}
      </>
    );
  }

  if (scene.type === "text" && scene.text) {
    return (
      <div className="root textRevealRoot">
        {dragRegion}
        <div className="textRevealCard">
          {scene.text.title && <div className="textRevealTitle">{scene.text.title}</div>}
          <div className="textRevealBody">{scene.text.body}</div>
        </div>
        {inWorldDate && <div className="dateOverlay">{inWorldDate}</div>}
        {itCard}
        {clockCard}
        {diceCard}
      </div>
    );
  }

  if (scene.type !== "map" || !scene.map) {
    return (
      <IdleScreen>
        {dragRegion}
        {inWorldDate && <div className="dateOverlay">{inWorldDate}</div>}
        {itCard}
        {clockCard}
        {diceCard}
      </IdleScreen>
    );
  }

  const { imgW, imgH, fogEnabled, fogReveals, tokens } = scene.map;
  const annotations = scene.map.annotations ?? [];
  const markupPreset = scene.map.markupPreset ?? "cartographer";
  const mapKey = `${scene.map.mapFolder}/${scene.map.mapFile}`;

  return (
    <div className="root">
      {dragRegion}
      <div className="playerViewport">
        <div
          className="playerMapWrapper"
          style={{ transform: `translate(${localTransform.panX}px, ${localTransform.panY}px) scale(${localTransform.scale})` }}
        >
          {imgSrc && <img src={imgSrc} className="playerMapImg" alt="Map" draggable={false} />}
          {fogEnabled && imgSrc && (
            <PlayerFogCanvas mapKey={mapKey} imgW={imgW} imgH={imgH} fogReveals={fogReveals} />
          )}
          {imgSrc && annotations.length > 0 && (
            <AnnotationLayer annotations={annotations} imgW={imgW} imgH={imgH} preset={markupPreset} scale={localTransform.scale} />
          )}
          {tokens.map((t) => (
            <PlayerTokenPin
              key={t.id}
              token={t}
              imgW={imgW}
              imgH={imgH}
              portraitsFolder={scene.map?.portraitsFolder}
              spotlight={!!t.sourceId && (itOverlay?.activeSourceIds ?? []).includes(t.sourceId)}
            />
          ))}
          {pings.map((p) => (
            <div key={p.id} className="playerPing" style={{ left: p.x * imgW, top: p.y * imgH }} />
          ))}
        </div>
      </div>
      {inWorldDate && <div className="dateOverlay">{inWorldDate}</div>}
      {itCard}
      {clockCard}
        {diceCard}
    </div>
  );
}
