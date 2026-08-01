// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { lazy } from "react";
import { DEFAULT_JUMPS } from "@ttcanvas/core";
import { registerWidget, type WidgetComponent } from "../registry";
import { StickyNote, type StickyNoteState } from "./StickyNote";
import {
  PartyTracker, type PartyTrackerState,
  InitiativeTracker, type InitiativeTrackerState,
  NpcGenerator, createDefaultNpcGeneratorState,
  NpcLibrary, type NpcLibraryState,
  SessionNotes, type SessionNotesState,
  DiceRoller, type DiceRollerState,
  type MapDisplayState,
  SoundBoard, type SoundBoardState,
  Almanac, type CalendarState,
  TimeTracker, type TimeTrackerState,
  Bestiary, type BestiaryState,
  SessionRecorder, type SessionRecorderState,
  RulesReference, type RulesReferenceState,
  RuleCards, type RuleCardsState,
  Items, type ItemsState,
  Merchants, type MerchantsState,
  XpTracker, type XpTrackerState,
  RollTables, type RollTablesState,
  EncounterBuilder, type EncounterBuilderState,
  CardDecks, type CardDecksState,
  ProgressClocks, type ProgressClocksState,
  HandoutGallery, type HandoutGalleryState,
  RelationshipWeb, type RelationshipWebState,
  CampaignTimeline, type CampaignTimelineState,
  Gazetteer, type GazetteerState,
} from "@ttcanvas/widgets-builtin";
import {
  parseStickyNoteState,
  parsePartyTrackerState,
  parseInitiativeTrackerState,
  parseNpcGeneratorState,
  parseNpcLibraryState,
  parseSessionNotesState,
  parseSessionRecorderState,
  parseDiceRollerState,
  parseMapDisplayState,
  parseSoundBoardState,
  parseCalendarState,
  parseTimeTrackerState,
  parseBestiaryState,
  parseRulesReferenceState,
  parseRuleCardsState,
  parseItemsState,
  parseXpTrackerState,
  parseRollTablesState,
  parseEncounterBuilderState,
  parseMerchantsState,
  parseCardDecksState,
  parseProgressClocksState,
  parseHandoutGalleryState,
  parseRelationshipWebState,
  parseCampaignTimelineState,
  parseGazetteerState,
} from "./stateSchemas";

// Map Display is the heaviest built-in widget (see CLAUDE.md) and often unused
// in a session, so it's the one split into its own chunk: `lazy()` defers the
// dynamic `import()` until a canvas actually renders this widget, instead of
// bundling it into the eagerly-loaded startup chunk with everything else here.
// `@ttcanvas/widgets-builtin/map-display` is a package.json subpath export
// pointing straight at the component file, bypassing the barrel every other
// widget above imports through - that barrel deliberately doesn't re-export
// MapDisplay, so nothing pulls its module graph back into the eager chunk.
const MapDisplay = lazy(() =>
  import("@ttcanvas/widgets-builtin/map-display").then((m) => ({ default: m.MapDisplay })),
);

registerWidget({
  type: "sticky-note",
  title: "Sticky Note",
  help: "# Sticky Note\n\nWrite any quick reminder, scene prompt or player-facing note. Its contents are saved with this canvas layout.\n\nUse separate notes when you want to move or arrange ideas independently.",
  icon: "sticky",
  category: "Utilities",
  defaultSize: { width: 240, height: 260 },
  defaultState: { content: "" } satisfies StickyNoteState,
  parseState: parseStickyNoteState,
  component: StickyNote as WidgetComponent,
});

registerWidget({
  type: "party-tracker",
  title: "Party Tracker",
  help: "# Party Tracker\n\nAdd the player characters in **Manage party**, then keep their hit points, armour class, resources and conditions up to date. The shared party list is available to other widgets.\n\nOpen a character card to edit its details or portrait. On the Abilities tab, click an ability modifier, saving throw or skill to roll it in the Dice Roller - hold Shift for advantage or Alt for disadvantage.",
  icon: "users",
  category: "Combat",
  defaultSize: { width: 700, height: 540 },
  defaultState: { members: [], compact: false } satisfies PartyTrackerState,
  singleton: true,
  minWidth: 320,
  minHeight: 300,
  parseState: parsePartyTrackerState,
  component: PartyTracker as WidgetComponent,
});

registerWidget({
  type: "initiative-tracker",
  title: "Initiative Tracker",
  help: "# Initiative Tracker\n\nAdd combatants, set their initiative and use the active row to advance turns and rounds. Drag a row to adjust the order.\n\nYou can group enemies, track conditions and cast the current turn to the Player Window. Enable automatic time advance if each round should move the campaign clock forward.",
  icon: "swords",
  category: "Combat",
  defaultSize: { width: 380, height: 500 },
  defaultState: {
    combatants: [], currentId: null, round: 1, showOnPlayer: false,
    autoAdvanceTime: false, roundSeconds: 6,
  } satisfies InitiativeTrackerState,
  singleton: true,
  minWidth: 300,
  minHeight: 200,
  parseState: parseInitiativeTrackerState,
  component: InitiativeTracker as WidgetComponent,
});

// Retired: folded into NPC Library above (the "+" button there now opens this same generator).
// Kept registered - and so still renderable and state-parseable - so any NPC Generator already
// placed on a canvas keeps working, but hidden from the Add Widget picker and Command Palette so
// no new one is created. Same "leave the old identifier alone" approach as the Almanac merge
// retired the standalone Time Tracker.
registerWidget({
  type: "npc-generator",
  title: "NPC Generator",
  help: "# NPC Generator\n\nGenerate an NPC from the selected options, then edit any result before saving it to the NPC Library.\n\nGeneration changes the current draft only. Save when you want the NPC to become a vault file.\n\nThis widget has been folded into the **NPC Library**'s own \"+\" button, which opens the same generator. Add an NPC Library from the Add Widget menu to get both.",
  icon: "wand",
  category: "NPC Management",
  hidden: true,
  defaultSize: { width: 320, height: 480 },
  defaultState: createDefaultNpcGeneratorState,
  singleton: true,
  minWidth: 260,
  minHeight: 340,
  parseState: parseNpcGeneratorState,
  component: NpcGenerator as WidgetComponent,
});

registerWidget({
  type: "npc-library",
  title: "NPC Library",
  help: "# NPC Library\n\nCreate and organise NPCs stored as individual files in your vault. Select an NPC to edit its profile, notes, portrait and relationships.\n\nHit \"+\" to generate a new NPC from random tables or AI, edit any result, then save it to the library.\n\nUse `[[wikilinks]]` in NPC notes to link to notes, places or other NPCs. Prefix a target with `place:` or `npc:` when the name is ambiguous.\n\nOn a stat block's Abilities tab, click an ability modifier, saving throw or skill to roll it in the Dice Roller - hold Shift for advantage or Alt for disadvantage.",
  icon: "library",
  category: "NPC Management",
  defaultSize: { width: 500, height: 480 },
  defaultState: { selectedFile: null, generatorDraft: createDefaultNpcGeneratorState() } satisfies NpcLibraryState,
  singleton: true,
  // The left (list) pane has a 160px CSS floor (NpcLibrary.module.css .left), and the embedded NPC
  // Generator needs its own standalone minWidth (260) to lay out - below ~420 the right pane gets
  // squeezed under the Generator's own minimum.
  minWidth: 420,
  minHeight: 340,
  parseState: parseNpcLibraryState,
  component: NpcLibrary as WidgetComponent,
});

registerWidget({
  type: "session-notes",
  title: "Session Notes",
  help: "# Session Notes\n\nChoose a folder of Markdown files to use as a standalone notes library. You can point it at an existing Obsidian vault, or Markdown exported from another tool such as Notion. Changes are written back to the original files.\n\nInside Session Notes, use `[[Note name]]` to open another note. These links stay within the chosen notes folder, preserving the meaning of your existing notes rather than linking into TTCanvas places or NPCs. The linked mentions panel shows notes, NPCs and places that refer to the selected note.\n\nObsidian-style Markdown is supported today. Support for other note-taking systems is planned.",
  icon: "book",
  category: "Utilities",
  defaultSize: { width: 420, height: 520 },
  defaultState: { notesFolder: null, selectedFile: null } satisfies SessionNotesState,
  minWidth: 280,
  minHeight: 200,
  parseState: parseSessionNotesState,
  component: SessionNotes as WidgetComponent,
});

registerWidget({
  type: "dice-roller",
  title: "Dice Roller",
  help: "# Dice Roller\n\nRoll standard expressions such as `2d6+4`, use `kh` or `kl` to keep high or low dice, and add `!` to explode a die. The `?` button beside the input lists the full syntax.\n\nSave often-used expressions as macros. ADV and DIS roll the whole expression twice, and Cast sends the latest result to the Player Window.",
  icon: "dice",
  category: "Utilities",
  defaultSize: { width: 340, height: 460 },
  defaultState: { macros: [], history: [], input: "", adv: null, query: "", castId: null } satisfies DiceRollerState,
  singleton: true,
  minWidth: 260,
  minHeight: 320,
  parseState: parseDiceRollerState,
  component: DiceRoller as WidgetComponent,
});

registerWidget({
  type: "relationship-web",
  title: "Relationship Web",
  help: "# Relationship Web\n\nBuild a graph of people, places, factions and other campaign elements. Add nodes, connect them with labelled edges, then drag nodes into a useful arrangement.\n\nUse **Suggest** to turn the faction and location already recorded on your NPC Library entries into proposed links - review the list and add only the ones you want. Use **Tidy** to lay out the graph automatically. The expand button opens a larger view for dense webs.",
  icon: "web",
  category: "NPC Management",
  defaultSize: { width: 480, height: 420 },
  defaultState: { nodes: [], edges: [], selectedId: null } satisfies RelationshipWebState,
  singleton: true,
  minWidth: 320,
  minHeight: 280,
  parseState: parseRelationshipWebState,
  component: RelationshipWeb as WidgetComponent,
});

registerWidget({
  type: "campaign-timeline",
  title: "Campaign Timeline",
  help: "# Campaign Timeline\n\nRecord dated campaign events and browse them in chronological order. Calendar events appear alongside timeline entries but remain read-only here.\n\nSet up the Calendar first if you want dates to use your campaign's custom calendar.",
  icon: "timeline",
  category: "World",
  defaultSize: { width: 460, height: 520 },
  defaultState: { entries: [], sortDirection: "asc" } satisfies CampaignTimelineState,
  singleton: true,
  minWidth: 320,
  minHeight: 300,
  parseState: parseCampaignTimelineState,
  component: CampaignTimeline as WidgetComponent,
});

registerWidget({
  type: "gazetteer",
  title: "Gazetteer",
  help: "# Gazetteer\n\nCreate places in your vault and arrange them into a parent and child hierarchy. Use the detail pane for the description, image and linked NPCs or factions.\n\nPlace descriptions support `[[wikilinks]]`. Use `[[place:Name]]` or `[[npc:Name]]` to choose an entity when names overlap.",
  icon: "compass",
  category: "World",
  defaultSize: { width: 560, height: 520 },
  defaultState: { selectedFile: null } satisfies GazetteerState,
  singleton: true,
  minWidth: 340,
  minHeight: 320,
  parseState: parseGazetteerState,
  component: Gazetteer as WidgetComponent,
});

registerWidget({
  type: "map-display",
  title: "Map Display",
  help: "# Map Display\n\nCreate scenes, choose a map image and place tokens on it. Pan and zoom within the map, configure its grid, and reveal areas with fog of war.\n\nThe player controls decide what the Player Window sees. Markup tools let you draw temporary or persistent annotations over the current scene.",
  icon: "map",
  category: "World",
  defaultSize: { width: 620, height: 500 },
  defaultState: (() => {
    const sceneId = `scene-${Date.now()}`;
    return {
      mapsFolder: null,
      scenes: [{
        id: sceneId,
        name: "Scene 1",
        selectedMap: null,
        fogEnabled: false,
        fogReveals: [],
        tokens: [],
        gridEnabled: false,
        gridSize: 40,
        panX: 0,
        panY: 0,
        scale: 1,
      }],
      activeSceneId: sceneId,
    } satisfies MapDisplayState;
  }),
  singleton: true,
  minWidth: 300,
  minHeight: 240,
  parseState: parseMapDisplayState,
  component: MapDisplay as WidgetComponent,
});

registerWidget({
  type: "sound-board",
  title: "Sound Board",
  help: "# Sound Board\n\nCreate scenes (tabs) for different soundscapes, then add sound pads to the active scene. Each pad holds a playlist of one or more tracks that auto-advance with a short crossfade; turn on **Shuffle** to play them in random order instead of in sequence.\n\nTurn on a pad's **Auto-play** to have it start automatically whenever its scene becomes active - switching scenes crossfades outgoing sounds out and auto-play pads in. Use **Stop all** when you need to clear the current soundscape quickly.",
  icon: "volume",
  category: "Utilities",
  defaultSize: { width: 520, height: 420 },
  defaultState: (() => {
    const sceneId = `scene-${Date.now()}`;
    return {
      scenes: [{ id: sceneId, name: "Scene 1", pads: [] }],
      activeSceneId: sceneId,
    };
  })() satisfies SoundBoardState,
  singleton: true,
  minWidth: 280,
  minHeight: 240,
  parseState: parseSoundBoardState,
  component: SoundBoard as WidgetComponent,
});

registerWidget({
  type: "custom-calendar",
  title: "Almanac",
  help: "# Almanac\n\nYour campaign's clock and calendar in one place.\n\nThe **Clock** tab advances the shared in-game time in common increments or a custom amount, and keeps a history you can review or undo. The **Calendar** tab sets up your months, weekdays and current date, and holds dated events.\n\nCalendar events are shared data, so changing them updates every layout that uses this campaign. Cast the date and time to show them in the Player Window. When an advance crosses an event's start day, a reminder toast names it - a nudge only, it never changes the scene.",
  icon: "calendar",
  category: "World",
  defaultSize: { width: 420, height: 420 },
  defaultState: { def: null, events: [] } satisfies CalendarState,
  singleton: true,
  minWidth: 300,
  minHeight: 280,
  parseState: parseCalendarState,
  component: Almanac as WidgetComponent,
});

// Retired: folded into the Almanac (custom-calendar) above. Kept registered - and so still renderable
// and state-parseable - so any Time Tracker already placed on a canvas keeps working, but hidden from
// the Add Widget picker and Command Palette so no new one is created. Same "leave the old identifier
// alone" approach as the Session Recorder -> Session Logger rename.
registerWidget({
  type: "time-tracker",
  title: "Time Tracker",
  help: "# Time Tracker\n\nAdvance the shared campaign time in common increments or enter a custom amount. The history records each change so you can review or undo it.\n\nThis widget has been folded into the **Almanac**, which holds the same clock alongside the calendar. Add an Almanac from the Add Widget menu to get both.",
  icon: "clock",
  category: "World",
  hidden: true,
  defaultSize: { width: 280, height: 240 },
  defaultState: {
    currentDate: null,
    currentHour: 8,
    currentMinute: 0,
    currentSecond: 0,
    history: [],
    showOnPlayer: false,
    jumps: [...DEFAULT_JUMPS],
  } satisfies TimeTrackerState,
  singleton: true,
  minWidth: 220,
  minHeight: 160,
  parseState: parseTimeTrackerState,
  component: TimeTracker as WidgetComponent,
});

registerWidget({
  type: "bestiary",
  title: "Bestiary",
  help: "# Bestiary\n\nCreate, import and organise creature stat blocks for your campaign. Select an entry to edit it or open its formatted creature sheet.\n\nImport accepts TTCanvas bestiary exports. Use folders to keep a large collection manageable.\n\nOn the creature sheet's Abilities tab, click an ability modifier, saving throw or skill to roll it in the Dice Roller - hold Shift for advantage or Alt for disadvantage.",
  icon: "skull",
  category: "Combat",
  defaultSize: { width: 520, height: 420 },
  defaultState: { entries: [], folders: [] } satisfies BestiaryState,
  singleton: true,
  minWidth: 300,
  minHeight: 240,
  parseState: parseBestiaryState,
  component: Bestiary as WidgetComponent,
});

registerWidget({
  type: "session-recorder",
  title: "Session Logger",
  help: "# Session Logger\n\nLog events as they happen, with wall-clock and campaign-time context. Edit or remove entries before exporting the session record.\n\nIf AI is configured in Settings, **AI Summary** writes a GM-facing narrative of the log. **Previously On…** writes a short, dramatic player-facing recap - edit it before you save or cast it, so you can redact anything the players shouldn't hear yet.",
  icon: "recorder",
  category: "Utilities",
  defaultSize: { width: 380, height: 520 },
  defaultState: { entries: [], exportFolder: null } satisfies SessionRecorderState,
  singleton: true,
  minWidth: 280,
  minHeight: 300,
  parseState: parseSessionRecorderState,
  component: SessionRecorder as WidgetComponent,
});

registerWidget({
  type: "rules-reference",
  title: "Rules Reference",
  help: "# Rules Reference\n\nChoose a folder of your own Markdown rules files, then browse and search them during play. TTCanvas reads the files from that folder and does not include any rulebook text.\n\nUse `[[wikilinks]]` within those files to move between related rules notes.",
  icon: "scroll",
  category: "Rules & Reference",
  defaultSize: { width: 480, height: 540 },
  defaultState: { rulesFolder: null, selectedFile: null } satisfies RulesReferenceState,
  singleton: true,
  minWidth: 300,
  minHeight: 240,
  parseState: parseRulesReferenceState,
  component: RulesReference as WidgetComponent,
});

registerWidget({
  type: "rule-cards",
  title: "Rule Cards",
  help: "# Rule Cards\n\nCreate short, searchable rules reminders and organise them by category. Select a card to read or edit its Markdown body.\n\nUse import and export to share a set of cards between campaigns.",
  icon: "cards",
  category: "Rules & Reference",
  defaultSize: { width: 480, height: 480 },
  defaultState: { cards: [], selectedId: null, query: "" } satisfies RuleCardsState,
  singleton: true,
  minWidth: 300,
  minHeight: 240,
  parseState: parseRuleCardsState,
  component: RuleCards as WidgetComponent,
});

registerWidget({
  type: "items",
  title: "Items",
  help: "# Items\n\nYour catalogue of everything that exists in the campaign, and who happens to be carrying it. Type a name in the footer to define an item, then click its row to set kind, rarity, value, weight and a Markdown description.\n\nDefining an item does **not** mean the party owns one. A new item starts as a definition with no holders, which is what lets Merchants stock something the party has never had. Expand an item and use the steppers to say who has some, moving copies between the party stash and each character. Assigned items also appear on that character's sheet, with all their fields intact.\n\nThe **All / Held / Catalogue** toggle filters by that distinction: Held is what somebody is actually carrying, Catalogue is everything nobody has yet.\n\nThe purse along the bottom is the shared party coin, and it is what Merchants buys and sells against. **Split coin** divides it evenly between everyone in the Party Tracker and adds their share to their own purse, leaving anything indivisible behind. Electrum counts towards a share but nobody is paid in it. **Tidy** rolls loose copper up into larger denominations.\n\n**Roll loot** runs one of your Roll Tables and drops the results in as items the party now holds; the roll is recorded in that widget's history. No tables ship with the app, so make your own first.\n\nUse the cog to track weight, set a carry limit, import and export, or pull a catalogue from another vault (item definitions come across, holders do not).",
  icon: "chest",
  category: "Utilities",
  defaultSize: { width: 420, height: 480 },
  defaultState: {
    items: [],
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    query: "",
    kindFilter: null,
    heldFilter: "all",
    showWeight: false,
    carryLimitLb: null,
  } satisfies ItemsState,
  singleton: true,
  minWidth: 320,
  minHeight: 260,
  parseState: parseItemsState,
  component: Items as WidgetComponent,
});

registerWidget({
  type: "xp-tracker",
  title: "XP Tracker",
  help: "# XP Tracker\n\nTrack experience as a single party pool or separately for each character. Add awards with a short reason, then review the award history.\n\nThe per-character mode uses the shared Party Tracker roster.",
  icon: "spark",
  category: "Combat",
  defaultSize: { width: 280, height: 380 },
  defaultState: { mode: "party", partyXp: 0, perPc: {} } satisfies XpTrackerState,
  singleton: true,
  minWidth: 220,
  minHeight: 260,
  parseState: parseXpTrackerState,
  component: XpTracker as WidgetComponent,
});

registerWidget({
  type: "roll-tables",
  title: "Roll Tables",
  help: "# Roll Tables\n\nCreate tables with weighted entries, then roll to draw a result. Roll mode keeps every entry available. Draw mode removes a result until you reshuffle the table.\n\nA count expression can use dice notation, such as `2d4`, to draw several results at once.",
  icon: "table",
  category: "Utilities",
  defaultSize: { width: 460, height: 460 },
  defaultState: { tables: [], selectedId: null, mode: "roll", history: [] } satisfies RollTablesState,
  singleton: true,
  minWidth: 320,
  minHeight: 260,
  parseState: parseRollTablesState,
  component: RollTables as WidgetComponent,
});

registerWidget({
  type: "encounter-builder",
  title: "Encounter Builder",
  help: "# Encounter Builder\n\nBuild saved encounters from Bestiary creatures, party members and NPC Library entries. Every row gets the same controls: how many, whether the stack shares one initiative roll, and whether it joins the fight at all.\n\nUntick a row to leave it out without deleting it. NPCs can join as a foe or an ally.\n\nGive an encounter a Reward XP amount and the end-combat review will offer to split it across the party.\n\nSend an encounter to the Initiative Tracker when you are ready to run it.",
  icon: "flag",
  category: "Combat",
  defaultSize: { width: 480, height: 480 },
  defaultState: { encounters: [], selectedId: null } satisfies EncounterBuilderState,
  singleton: true,
  minWidth: 340,
  minHeight: 300,
  parseState: parseEncounterBuilderState,
  component: EncounterBuilder as WidgetComponent,
});

registerWidget({
  type: "card-decks",
  title: "Card Decks",
  help: "# Card Decks\n\nCreate decks with custom card text and art, then draw without replacement. Discarded cards stay out of the deck until you shuffle or reshuffle the discard pile.\n\nCast a draw to reveal the card in the Player Window.",
  icon: "deck",
  category: "Utilities",
  defaultSize: { width: 460, height: 500 },
  defaultState: { decks: [], selectedId: null, mode: "play", draw: {} } satisfies CardDecksState,
  singleton: true,
  minWidth: 340,
  minHeight: 300,
  parseState: parseCardDecksState,
  component: CardDecks as WidgetComponent,
});

registerWidget({
  type: "progress-clocks",
  title: "Progress Clocks",
  help: "# Progress Clocks\n\nAdd a clock, choose its number of segments and click segments to fill or clear progress. Rename clocks to track threats, projects or countdowns.\n\nUse the player control on a clock to show it in the Player Window.",
  icon: "pie",
  category: "Utilities",
  defaultSize: { width: 300, height: 340 },
  defaultState: { clocks: [] } satisfies ProgressClocksState,
  singleton: true,
  minWidth: 240,
  minHeight: 200,
  parseState: parseProgressClocksState,
  component: ProgressClocks as WidgetComponent,
});

registerWidget({
  type: "handout-gallery",
  title: "Handouts",
  help: "# Handouts\n\nChoose a vault folder containing images, then preview its files as a gallery. Select a handout to inspect it at a larger size.\n\nCast a handout to show it in the Player Window.",
  icon: "image",
  category: "Utilities",
  defaultSize: { width: 380, height: 420 },
  defaultState: { folder: null } satisfies HandoutGalleryState,
  singleton: true,
  minWidth: 260,
  minHeight: 220,
  parseState: parseHandoutGalleryState,
  component: HandoutGallery as WidgetComponent,
});

registerWidget({
  type: "merchants",
  title: "Merchants",
  help: "# Merchants\n\nThe shops, traders and fences your party keeps going back to. Add one, give it an owner and a place, then stock its shelves from your **Items** catalogue.\n\nStock is held **by reference**, so a longsword here is the same longsword as in Items: reprice it there and every merchant selling one follows. Leave a stock count blank for unlimited (a general store never runs out of rope).\n\n**Buy** moves an item into the party stash and pays for it out of the shared purse. **Sell** does the reverse at the buyback rate. If the party cannot afford something you get a warning, not a refusal, because the ledger does not overrule you.\n\n**Price ×** and **Buyback ×** set this merchant's markup: 1.0 is list price, 1.2 is a gouging port town, and buyback defaults to half.\n\n## Restocking\n\n**Generate** fills the shelves from your Items catalogue. Two things steer it. The merchant's **kind** decides what it deals in, so a blacksmith reaches for weapons and armour and an apothecary for consumables. The **rarity ticks** decide how good it gets, and they are entirely yours to set: a slum in a great city is still a slum, so nothing caps them for you. Tick legendary on a back-alley fence if that fence really does have something under the counter. The **presets** are one-click fills, not rules. Within whatever you allow, commoner things still turn up more often, so a shelf does not read as all treasure.\n\nGenerating **adds** to the shelves rather than replacing them, so a merchant the party keeps revisiting keeps its character and any prices you set by hand.\n\nYou can also stock from a **Roll Table**. Results are matched to your catalogue by name, and anything with no match is listed so you can add it to Items and roll again, rather than being invented for you.\n\n## Showing the players\n\nThe **cast** button beside the purse puts this merchant's price list on the player window: names, prices and rarity, and nothing else. Your markup, the buyback rate, the party purse and your notes on the shopkeeper all stay on this screen. Next to it, **live sync** keeps that list following the selected merchant, so a purchase updates the shelf the table is reading without you casting again.\n\nEvery purchase and sale is written to the **Session Logger** with the merchant and the price, so at the end of the night you can see where the money went.\n\nNo merchants or items ship with the app, so build your catalogue in Items first. Use the cog to import, export, or pull merchants from another vault (their shelves and entity links do not come across, since those ids belong to the other vault).",
  icon: "scales",
  category: "World",
  defaultSize: { width: 640, height: 520 },
  defaultState: {
    merchants: [],
    selectedId: null,
    query: "",
    kindFilter: null,
  } satisfies MerchantsState,
  singleton: true,
  minWidth: 420,
  minHeight: 320,
  parseState: parseMerchantsState,
  component: Merchants as WidgetComponent,
});
