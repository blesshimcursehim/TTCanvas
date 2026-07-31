// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

export * from "./types";
export { VaultContext, useVault } from "./VaultContext";
export type { VaultContextValue, OtherVault } from "./VaultContext";
export { PartyContext, useParty } from "./PartyContext";
export type { PartyContextValue, SharedPartyMember, PartyMemberPatch } from "./PartyContext";
export { BestiaryContext, useBestiary } from "./BestiaryContext";
export type { BestiaryContextValue, BestiaryCreatureRef } from "./BestiaryContext";
export { NpcContext, useNpcs } from "./NpcContext";
export type { NpcContextValue, NpcRef } from "./NpcContext";
export { GazetteerContext, useGazetteerLocations } from "./GazetteerContext";
export type { GazetteerContextValue, GazetteerLocationRef } from "./GazetteerContext";
export { XpContext, useXp } from "./XpContext";
export type { XpContextValue } from "./XpContext";
export { DiceContext, useDice } from "./DiceContext";
export type { DiceContextValue } from "./DiceContext";
export { RollTablesContext, useRollTables } from "./RollTablesContext";
export type { RollTablesContextValue, RollTableRef, RollTableOutcome } from "./RollTablesContext";
export { ItemsContext, useItems } from "./ItemsContext";
export type { ItemsContextValue, CatalogueItemRef, ItemRef } from "./ItemsContext";
export { CalendarContext, useCalendar } from "./CalendarContext";
export type { CalendarContextValue } from "./CalendarContext";
export { ChronicleContext, useChronicle } from "./ChronicleContext";
export type { ChronicleContextValue, ChronicleDraft } from "./ChronicleContext";
export { SessionLogContext, useSessionLog } from "./SessionLogContext";
export type { SessionLogContextValue } from "./SessionLogContext";
export { MapPinsContext, useMapPins } from "./MapPinsContext";
export type { MapPinsContextValue } from "./MapPinsContext";
export { LinkSourcesContext, useLinkSources } from "./LinkSourcesContext";
export type { LinkSourcesContextValue, EntityLinkSource } from "./LinkSourcesContext";
export type {
  CalendarDef, MonthDef, IntercalaryPeriod, CalDate, CalEvent, CalendarState,
  TimeAdvance, TimeTrackerState, NamedJump, JumpUnit,
} from "./calendarTypes";
export { JUMP_UNIT_MINUTES, jumpMinutes, DEFAULT_JUMPS, MAX_JUMP_AMOUNT } from "./calendarTypes";
export { ollamaCheck, ollamaListModels, ollamaGenerate, openaiListModels, openaiGenerate } from "./ollama";
export type { OllamaChunk } from "./ollama";
export { pushPlayerScene, pushCharacterScene, pushTextScene, pushHandoutScene, pushLocationScene, pushShopScene, pushDateOverlay, pushInitiativeOverlay, pushMapPing, PING_LIFETIME_MS, pushClockOverlay, pushDiceOverlay, pushPlayerTextScale } from "./playerScene";
export type { MapPing, ClockOverlay, DiceOverlay } from "./playerScene";
export { GameTimeContext, useGameTime } from "./GameTimeContext";
export type { GameTimeContextValue } from "./GameTimeContext";
export { ITContext, useIT } from "./ITContext";
export type {
  ITContextValue, Combatant, CombatantKind, InitiativeTrackerState,
  StartCombatMode, CombatEncounterRef,
  InitiativeTurn, InitiativeOverlay, InitiativeGroup,
} from "./ITContext";
export { AIContext, useAI, defaultAIConfig } from "./AIContext";
export type { AIContextValue, AIConfig, AIProvider } from "./AIContext";
export { ConditionsContext, useConditions } from "./ConditionsContext";
export type { ConditionsContextValue, CustomConditionDef } from "./ConditionsContext";
export { fogModeOf, lastBrushPoint, renderFogReveals, drawFogCanvas } from "./fogRender";
export type { BrushPoint } from "./fogRender";
export { ToastContext, useToast } from "./ToastContext";
export type { ToastContextValue, ToastType } from "./ToastContext";
export { WidgetChromeContext, useWidgetChrome } from "./WidgetChromeContext";
export type { WidgetChromeContextValue } from "./WidgetChromeContext";
// Diagnostics live in core rather than `src/` so the widget packages can reach them too -
// `widgets-builtin` depends on core and can't import from the app.
export { logInfo, logWarn, logError } from "./log";
export { redact } from "./redact";
