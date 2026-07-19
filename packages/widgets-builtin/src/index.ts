// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

export { PartyTracker } from "./party-tracker/PartyTracker";
export type { PartyTrackerState, PartyMember } from "./party-tracker/types";

export { InitiativeTracker } from "./initiative-tracker/InitiativeTracker";
export type { InitiativeTrackerState, Combatant } from "./initiative-tracker/types";
// Pure turn-order logic (collapses combined groups into single entries), reused by App-level
// initiative spotlight wiring so it doesn't have to re-derive group membership itself.
export { buildTurnOrder } from "./initiative-tracker/groups";
export type { TurnEntry } from "./initiative-tracker/groups";

export { NpcGenerator } from "./npc-generator/NpcGenerator";
export type { NpcGeneratorState } from "./npc-generator/types";
export { createDefaultNpcGeneratorState } from "./npc-generator/tables";

export { NpcLibrary } from "./npc-library/NpcLibrary";
export type { NpcLibraryState, ParsedNpc } from "./npc-library/types";
export { parseNpcJson, npcMetaValue } from "./npc-library/npcFormat";

export { SessionNotes } from "./session-notes/SessionNotes";
export type { SessionNotesState } from "./session-notes/types";

export { RelationshipWeb } from "./relationship-web/RelationshipWeb";
export type { RelationshipWebState, RelNode, RelEdge, EdgeType, NodeKind } from "./relationship-web/types";
export { CampaignTimeline } from "./campaign-timeline/CampaignTimeline";
export type { CampaignTimelineState, TimelineEntry } from "./campaign-timeline/types";
export { Gazetteer } from "./gazetteer/Gazetteer";
export type { GazetteerState, GazetteerLocation, LinkedEntity, LocationKind } from "./gazetteer/types";
export { parseLocationJson } from "./gazetteer/gazetteerFormat";
export { DiceRoller } from "./dice-roller/DiceRoller";
export type { DiceRollerState, RollMacro, RollEntry } from "./dice-roller/types";
// The pure evaluator is exported so the Roll Tables engine can reuse it for count expressions.
export { parseExpression, rollExpression, evaluate, formatBreakdown } from "./dice-roller/dice";
export type { DiceExpr, RollBreakdown, RollOutcome, AdvMode } from "./dice-roller/dice";
export { buildRollEntry, MAX_HISTORY } from "./dice-roller/rollEntry";

// MapDisplay itself is deliberately not re-exported here: it's reached only
// through the "./map-display" subpath export (package.json) so the app can
// lazy() it into its own chunk instead of pulling it into this barrel's
// eagerly-imported graph. AnnotationLayer stays here for PlayerWindow, which
// needs it synchronously.
export { AnnotationLayer } from "./map-display/AnnotationLayer";
export type { MapDisplayState } from "./map-display/types";

export { SoundBoard } from "./sound-board/SoundBoard";
export type { SoundBoardState, SoundPad as SoundPadDef, SoundScene, SoundTrack } from "./sound-board/types";

export { Calendar } from "./calendar/Calendar";
export type { CalendarState } from "@ttcanvas/core";

export { TimeTracker } from "./time-tracker/TimeTracker";
export type { TimeTrackerState } from "@ttcanvas/core";
// Pure calendar time math + overlay formatting, for App-level game-time
// advances (GameTimeContext) - see calendar/utils.ts.
export { advanceTimeSeconds, formatDateOverlay, eventsStartingBetween, describeCrossedEvents } from "./calendar/utils";

export { Bestiary } from "./bestiary/Bestiary";
export type { BestiaryState } from "./bestiary/types";

export { SessionRecorder } from "./session-recorder/SessionRecorder";
export type { SessionRecorderState } from "./session-recorder/types";

export { RulesReference } from "./rules-reference/RulesReference";
export type { RulesReferenceState } from "./rules-reference/types";

export { RuleCards } from "./rule-cards/RuleCards";
export type { RuleCardsState, RuleCard } from "./rule-cards/types";


export { XpTracker } from "./xp-tracker/XpTracker";
export type { XpTrackerState } from "./xp-tracker/types";
export { applyEncounterAward } from "./xp-tracker/xpMath";

export { RollTables } from "./roll-tables/RollTables";
export type { RollTablesState, RollTable, RollTableEntry, RollHistoryItem } from "./roll-tables/types";

export { CardDecks } from "./card-decks/CardDecks";
export type { CardDecksState, Deck, DeckCard, DrawnCard, DeckDrawState } from "./card-decks/types";

export { ProgressClocks } from "./progress-clocks/ProgressClocks";
export type { ProgressClocksState, ProgressClock } from "./progress-clocks/types";
export { clockWedges } from "./progress-clocks/wedges";
export type { Wedge } from "./progress-clocks/wedges";

export { HandoutGallery } from "./handout-gallery/HandoutGallery";
export type { HandoutGalleryState } from "./handout-gallery/types";

export { mimeForImageExt } from "./shared/mime";
export { renderMarkdown } from "./shared/markdownRenderer";

// Wikilink resolution helpers (used by the app-level WikilinkResolver).
export { linkKey, basenameLabel, buildResolveIndex, resolveLink, parseLinkTarget } from "./shared/wikilinks";
export type { ResolveEntry, ResolveIndex, SourceKind } from "./shared/wikilinks";

export { EncounterBuilder } from "./encounter-builder/EncounterBuilder";
export type { EncounterBuilderState, Encounter, EncounterMember } from "./encounter-builder/types";
