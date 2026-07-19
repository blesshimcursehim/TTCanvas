// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

export * from "./types";
export { VaultContext, useVault } from "./VaultContext";
export type { VaultContextValue } from "./VaultContext";
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
export { CalendarContext, useCalendar } from "./CalendarContext";
export type { CalendarContextValue } from "./CalendarContext";
export type {
  CalendarDef, MonthDef, IntercalaryPeriod, CalDate, CalEvent, CalendarState,
  TimeAdvance, TimeTrackerState,
} from "./calendarTypes";
export { ollamaCheck, ollamaListModels, ollamaGenerate, openaiListModels, openaiGenerate } from "./ollama";
export type { OllamaChunk } from "./ollama";
export { pushPlayerScene, pushCharacterScene, pushTextScene, pushHandoutScene, pushLocationScene, pushDateOverlay, pushInitiativeOverlay, pushMapPing, PING_LIFETIME_MS, pushClockOverlay, pushDiceOverlay } from "./playerScene";
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
