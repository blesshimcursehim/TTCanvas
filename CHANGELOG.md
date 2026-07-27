# Changelog

All notable changes are documented here.

## Unreleased

### Features

- **Inventory.** A new widget holding one ledger of everything the party owns. Each item carries a
  kind, rarity, value, weight and a Markdown description, and quantities are tracked per holder, so a
  stack of rations split between three characters is still one row rather than three. Items you assign
  to a character also show up on that character's sheet with all of those fields intact, which the old
  equipment list couldn't do because it stored bare strings. That list is untouched and still works.
  Along the bottom sits the shared party purse: **Split coin** divides it evenly between everyone in
  the Party Tracker and adds each share to their sheet, leaving anything that won't divide behind, and
  **Tidy** rolls loose copper up into larger coins. **Roll loot** runs one of your own Roll Tables and
  drops the results straight in, recording the pull in that widget's history so you can read it back.
  Weight and a carry limit are off by default, under the cog. Item libraries export, import and pull
  across vaults like the other collection widgets, though holders stay behind since they belong to the
  campaign you pulled from. No item or loot tables ship with the app.

- **Pull a widget's content from another vault.** If you run the same campaign for two groups, you keep
  two vaults, and there was no way to copy world data from one into the other without re-typing it.
  Seven collection widgets - Bestiary, NPC Library, Gazetteer, Card Decks, Roll Tables, Rule Cards and
  Party Tracker - now have a "Pull from <vault>" control in their settings cog (Party's is in its
  Manage-party window). Pick another vault you've opened recently and it brings that widget's contents
  in, reusing the same duplicate detection and conflict prompt as importing a file, so re-pulling never
  makes duplicates. Referenced art comes across too: card art, character and NPC portraits, and place
  images. It's entirely local - nothing leaves your machine, and each vault stays a self-contained
  folder you can still copy elsewhere. (Calendar sharing is not in yet.)

- **Mods can write to the diagnostics log.** A mod widget now gets `window.ttcanvas.log`, with
  `info`, `warn` and `error`, going to the same local redacted log as everything else, so a mod's
  failures show up in Preferences → Diagnostics instead of vanishing. Crashes and uncaught errors
  from mods were already logged; this covers the common case of a mod catching its own error and
  quietly degrading. Lines from mods are tagged so a bug report shows what came from third-party
  code. TypeScript authors can copy `src/mods/ttcanvas-mod-api.d.ts` for the types, and the README's
  mod-authoring section documents the conventions. This grants a mod nothing it didn't already have:
  mods run unsandboxed with full access, as the trust prompt says.

- **Creatures, rule cards and rules files now show up in backlinks and the link graph.** Session Notes
  could already see `[[links]]` written in notes, NPC notes and Gazetteer places, but anything you
  wrote in a Bestiary creature's notes, a Rule Card or a Rules Reference file was invisible to it. All
  three now count as sources, so a note's Linked mentions shows everything that actually points at it,
  and clicking one opens the creature, card or rules file it came from. A creature contributes only its
  notes field, not its stat block, so you don't get backlinks from ability scores and skill names.
- **Gazetteer tells you when a place is already pinned.** The "Pin this place on a map" button now
  reads "Pinned on a map - show me" when the place already has a pin on any scene, so you can tell at a
  glance instead of clicking to find out. Pressing it still jumps to the existing pin as before.
- **Unlink a map pin from the map side.** A pin linked to a Gazetteer place used to be unlinkable only
  from Gazetteer. Its row in the Visibility panel now has a chain button that names the linked place on
  hover and unlinks it on click, leaving the pin itself where it is. The name is looked up live, so a
  place you renamed in Gazetteer shows its current name.
- **Roll Tables count expressions understand the full dice notation.** A table's "how many results per
  roll" box used to run on its own small parser that only handled forms like `3`, `2d6` and `1d6+2`. It
  now uses the same engine as the Dice Roller, so keep-highest, exploding dice and multi-term
  expressions (`4d6kh3`, `d6!`, `2d6-1d4+3`) all work there too, and the app has one dice grammar
  instead of two.
- **Send an AI session summary straight to the Chronicle.** The Session Logger's AI Summary now has an
  "Add to Chronicle" button that drops the summary into the Campaign Timeline as a dated entry, using
  the current in-game date, so a session's record lands on the timeline without retyping it. It needs
  an in-game date to pin to, and the entry is yours to rename or edit in the Timeline afterwards.
- **Multi-day events read as multi-day on the Campaign Timeline.** A festival or siege that runs
  several days on the Calendar used to appear on the Timeline as if it lasted a single day. Its card
  now carries a small "4d" badge, and hovering it spells out the last day, so a span reads at a glance
  without cluttering the stream with a copy for every day it covers.
- **Pin a Chronicle entry to a festival or intercalary day.** The entry editor's date picker only
  offered the ordinary months, so a plot beat could never land on one of your calendar's intercalary
  days. Those days now show up in the picker alongside the months, including leap-style ones that only
  occur in some years, and the day count follows whichever you pick.
- **Send a Chronicle entry to the Calendar.** An entry you have written can now push a one-way copy of
  itself into the Calendar widget as a dated event, so a plot beat you noted in the Chronicle can also
  sit on the calendar. The copy is independent once made, so editing or deleting one leaves the other
  alone.
- **Campaign Timeline can sort newest-first.** The Chronicle only ever read oldest-first, which gets
  awkward once a campaign's timeline is long and the entries you care about are the recent ones, not
  January. A direction control in the widget's settings cog flips between oldest-first and
  newest-first, and your choice is remembered.

- **Party members and NPCs can be added to an encounter properly.** Encounter Builder used to be a
  Bestiary-only tool, with the whole party riding along on a single "Also add party" checkbox and NPC
  Library entries not available at all. Now all three go in as rows with live name, HP and AC that
  follow the original record. An NPC can join as a foe or an ally, since NPCs are sometimes on your
  side. Only Bestiary creatures stack, with a count and a shared-initiative option, because they are
  templates: party members and NPCs are named individuals, so they show a fixed count of 1 rather than
  a stepper (no "Agnes Holk 2").
- **Leave a row out without deleting it.** Each row has a tickbox, so the ogres asleep in the next
  room can stay in the encounter as prep and stay out of the fight. The tick is saved with the
  encounter rather than reset each session, so it survives a reload.
- **Roll a creature's HP instead of using the average.** A Bestiary creature with a hit-dice formula
  gets a "Roll HP" tick on its encounter row, so a stack of four goblins lands in the Initiative
  Tracker with four different totals rather than four identical ones. Each copy rolls its own by
  default, or tick "shared" to roll once for the whole stack. It reuses the Dice Roller's own
  evaluator, and falls back to the static average if a formula is missing or not valid dice notation.
  Party HP is left alone, since that is real and already tracked; an NPC only offers the roll when its
  HP has not already been decided on its sheet, since a named individual's HP is specific, not an
  average to re-roll.
- **"Start combat" is now safe to press twice.** It used to pile a fresh copy of the whole encounter
  onto whatever was already in the Initiative Tracker every time, and never brought the tracker into
  view. Now, with a fight already running, it asks first: replace it, append, or cancel. Replace wipes
  the current combat and starts clean at round 1, append merges without duplicating any party member or
  named NPC already in the fight (repeated monsters still stack, since those are reinforcements). Either
  way it reveals and raises the Initiative Tracker, so the combatants never land offscreen. There is
  also a separate "Add to current combat" button for when appending is what you actually meant.
- **End a combat and hand the damage back to the party.** The Initiative Tracker's old "Clear" button
  is now "End combat", and instead of just wiping the fight it opens a review first. It lists each
  party member's HP change ("Aria: 24 to 9"), leaves the unchanged ones unticked, and shows any
  conditions still on them so you can note them down before they're gone. Tick the ones you want and
  the new HP is written straight back to the Party Tracker, so the damage from the fight sticks. Only
  party members come back this way, since foes and NPCs live elsewhere. Conditions are shown for your
  reference but not applied, since party sheets don't track them. Cancel closes the review and leaves
  the combat exactly as it was.
- **Give an encounter an XP reward and hand it to the XP Tracker.** An encounter now has a Reward XP
  field. Start that encounter and, when you end the combat, the review offers to split the reward
  across the party (you pick who was in on it), routing it through the XP Tracker exactly as a manual
  award would, undo history and all. The amount is always yours to type, never guessed from a
  creature's challenge rating. When an award pushes a character past a level threshold, the XP Tracker
  shows a banner offering to bump their sheet level on the Party Tracker to match. This replaces the
  old level-up flash, which vanished after a few seconds and couldn't actually change the sheet.

- **Pick a 12-hour or 24-hour clock** - Preferences, under Appearance, now has a Clock setting with
  System, 24-hour and 12-hour. System follows this app's locale, which is what the title bar has
  always done, so nothing changes unless you choose otherwise. On Linux, System can land on a
  different format than your desktop's own 24-hour toggle, since that's a separate setting the
  app has no reliable way to read - pick 24-hour or 12-hour directly if that happens.
- **NPC Generator now offers to open what you just saved, or roll another.** Saving used to just
  flash "Saved" and stop there. It now also offers "Open in NPC Library" and "Generate another", the
  second re-rolling the same way "Re-roll all" does, so anything you've locked (race, class, and so
  on) carries over if you're rolling a few similar NPCs in a row. Either option disappears the moment
  you touch the form again.
- **Relationship Web's link suggestions now also come from Gazetteer and NPC notes.** "Suggest"
  already proposed links from an NPC's own faction and location fields. It now also reads a Gazetteer
  place's linked NPCs, and any `[[wikilink]]` in an NPC's notes that points at another NPC or place,
  offering that pair as a "mentions" link. Everything still goes through the same review step,
  nothing is added to the graph until you tick it and confirm.
- **An NPC's Location can now link to a real Gazetteer place.** It's always been free text. You can
  now search for an actual entry and link it instead, and the name shown on the sheet stays live from
  there, so renaming the place in Gazetteer updates every NPC linked to it. Unlink at any point to go
  back to plain text.
- **Name your own time jumps, and rewind as well as advance.** The clock's fixed +1h / +8h / +1d / +1w
  buttons are now a set you own. Hit Edit to rename them, change the amount and unit, reorder them, or
  add your own, so a "Long Rest" that jumps eight hours, or a "Rewind a day" that goes back one, is a
  button you make rather than a fixed choice. Any jump can run backwards, and so can the custom amount,
  with a +/- toggle beside it. Your existing four carry over as the starting set, so nothing changes
  unless you want it to.
- **Your party roster can now be exported and imported.** Party Tracker gained Import and Export all in
  Manage Party, so a party can be moved between vaults or shared, the same as the Bestiary, NPC Library
  and the rest. Portraits aren't bundled in the file, so an imported character keeps a colour avatar
  until you set a portrait (or shows straight away if that portrait file already exists in the target
  vault). The Bestiary also gained an "Export all" for the whole library, alongside its existing
  per-creature and per-folder exports.

### Features

- **Interface size, and a separate size for the player window.** Appearance had no way to make the
  type bigger. Density only ever changed spacing, so a GM reading a dense screen at arm's length was
  stuck with 12px text. There are now two controls. **Interface size** (Normal, Large, Larger) scales
  the whole GM window the way a browser's zoom does, text, spacing and icons together. **Player window
  text** sizes that window separately, since it gets read from across a table or off a projector, and
  it scales text only so cast maps and handouts keep their full size. Both are per machine rather than
  per campaign, because your eyes don't change between vaults.

### Changes

- **Muted text is easier to read.** The two faintest text shades failed the WCAG AA contrast minimum
  against the lighter panel backgrounds, some of them badly, which covered most of the app's small
  print: toolbar titles, hints, timestamps and field labels. All four text shades were re-spread so
  every one of them now clears the minimum on every surface in both themes. Muted text is noticeably
  brighter than before, and the contrast between the boldest and faintest text is gentler. The accent
  colours were measured too and all four already passed everywhere, so they are unchanged.

- **Keyboard focus is always visible now.** Tabbing through the app showed whatever the system chose,
  and on a couple of dozen fields (the command palette's search, sticky notes, most inline rename and
  stat boxes) it showed nothing at all, so you could type into a box with no idea it was selected.
  Every focusable thing now gets the same accent ring, and only when you are navigating by keyboard,
  so nothing changes for mouse users.

- **Escape closes windows, and a screen reader can follow them.** Every panel that opens over the
  canvas - Preferences, the keyboard shortcuts card, character and creature sheets, Manage Party,
  calendar setup, the portrait cropper and the add-creature form - is now a real dialog rather than a
  panel painted on top. Escape closes it, keyboard focus moves into it when it opens and returns to
  where you were when it shuts, Tab stays inside it instead of wandering off into the canvas behind,
  and a screen reader announces it by name and ignores the page underneath. Sheet tabs move with the
  arrow keys. Forms with something half-typed in them still ignore a stray click outside, as before.
  Notifications are announced when they appear, and errors interrupt rather than queue. The Initiative
  Tracker announces whose turn it is, which until now was shown only by a highlighted row, and the
  condition picker closes on Escape, takes keyboard focus when it opens, hands it back when it shuts,
  and reads out full condition names rather than the abbreviations on its chips.

- **A character's gold is now one number.** The GP box on a character's card and the Gold field in
  their sheet's Inventory tab were separate values that nothing kept in step, so the same character
  could show 10 gold on the card and 50 on the sheet. They are now the same number, read and written
  in one place. If yours currently disagree, the sheet's figure is the one that survives, and if a
  character has never had a sheet purse the card's gold carries into it rather than resetting.

- **Widget failures now leave a trace in the log.** Until now every log entry came from the app shell,
  and the widgets themselves wrote nothing at all, so a map that wouldn't load, a sound pad that
  wouldn't play, an AI summary that failed or a whole NPC library that came back empty all just looked
  like nothing had happened. Those failures are now recorded in the local log with the widget and the
  file that caused them, so Preferences > Diagnostics can actually tell you why. Nothing changes on
  screen, nothing new is collected, and it all stays on your machine as before. Things that fail
  routinely, like checking for Ollama when it isn't running, stay quiet on purpose. The diagnostics
  report also now names the workspace schema version and says when a workspace opened read-only,
  which is the state behind "my changes aren't saving".

- **Encounters you saved before this release start with no party.** The old "Also add party" tickbox
  was never saved, it just defaulted to on every time, so there's nothing to carry over into the new
  party rows. Your existing encounters keep their creatures and counts, but the party has to be added
  once per encounter. Encounter Builder says so and offers an "+ Add party" button when an encounter
  has no party in it, so it should be a single click rather than a puzzle. Worth doing before a
  session rather than during one.

- **The session timer moved into the title bar, and the Session Clock widget is gone.** The title bar
  now shows the real-world clock and, once you start a session, how long you've been playing, both at
  the same time rather than one or the other. Click it for Start, Pause and Reset, plus the elapsed
  time down to the second. This replaces the Session Clock widget, which did the same job on the
  canvas and is no longer available. Any Session Clock you had open is removed cleanly the next time
  the vault opens, and you don't need to do anything. Its count doesn't come with it, so the new timer
  starts fresh.

- **The Calendar and Time Tracker are now one widget, the Almanac.** They already shared the same
  dates and events, so they've been folded into a single widget with a Clock tab and a Calendar tab,
  still in the World category. Anything you already have on the canvas keeps working, and a Time
  Tracker on its own still runs as it did, you just add the Almanac now instead of the two separately.
  Searching a calendar event in the Command Palette opens the Almanac straight to that month on the
  Calendar tab.
- **Import and Export look and behave the same across every widget now.** The collection widgets used
  to each hand-roll their own import and export buttons, so the labels had drifted ("Export" in one
  place, "Export all" in another). They now share one control, so the buttons, labels and file handling
  match across the Bestiary, NPC Library, Gazetteer, Card Decks, Roll Tables, Rule Cards and Party
  Tracker. Files exported by older versions still import.
- **Per-widget setup controls moved into a settings cog.** A gear now sits in the widget's title bar,
  next to the help (i). The collection widgets' Import and Export buttons live behind it, as do the
  Initiative Tracker's round-timing options (advance the clock when a round completes, seconds per
  round, and the lair-action reminder). These are things you set once and forget, so moving them out of
  the widget body keeps it focused on what you actually touch during play. Nothing changed about what
  they do.
- **The settings-cog panel now opens next to the gear, not in the middle of the screen.** Clicking a
  widget's settings cog used to pop its panel up centred over the canvas, away from the button you just
  pressed. It now opens anchored just under the gear (flipping above it near the bottom edge), so the
  controls appear where you're looking. The Pull-from-another-vault control in that panel also got a
  tidy-up: it sits on its own line under a divider, with a clearer, labelled Pull button.

### Fixes

- **Bestiary's "Add to Initiative" now brings the tracker into view.** Adding a creature straight from
  the Bestiary dropped it into the Initiative Tracker without surfacing the widget, so it looked like
  nothing had happened if the tracker was hidden or buried. It now reveals and raises the tracker, the
  same as starting a combat does.

- **The title bar's session timer now survives quitting the app.** It kept its count in memory only,
  so quitting, or even tapping the peek toggle, silently reset it to zero. It also had no way to reset
  on purpose, and no way back to a stopped state once started. All of that is fixed by the move above:
  quit normally and the timer comes back paused with its full time. The one case that still loses the
  current stretch is a crash or a force-quit, because there's then no way to tell how long the app was
  gone (it would otherwise count an overnight close as play time). Pause before closing if you want to
  be certain.
- **NPC Generator no longer overwrites an existing NPC with the same name** - saving used to write straight to a name-derived filename, so a second NPC sharing a name silently clobbered the first one's file. Saving now checks the library first and, on a collision, offers "Save as new copy" or "Cancel" instead of overwriting.
- **NPC Library - deleting an NPC now asks for confirmation** - the Remove button used to delete on a single click. It now behaves like every other delete action in the app, needing a second "Yes, delete" click before anything is removed.
- **A disabled widget now stays off the canvas everywhere, not just the Add Widget picker.**
  Unchecking a widget in Preferences → Canvas used to only remove it from that one picker. The
  Command Palette would still offer it, and things like Bestiary's "Add to Initiative" or Encounter
  Builder's "Start combat" would silently put it back the moment you used them. Both now respect the
  setting. An instance already on the canvas keeps working, and anything sent to a disabled widget
  while it's hidden is still recorded, waiting for you to re-enable it.

### Security

- **Local-security hardening across the vault, player window and AI paths.** Vault reads and writes now
  reject a symlink planted at the exact destination name, so a shared or synced vault can no longer
  redirect them to a file outside the vault. The player window's permissions were narrowed to only what
  it needs, so a compromised player view can no longer emit privileged events back to the main window.
  Recovery paths that fall back to defaults, such as an unreadable config or a workspace written by a
  newer build, no longer autosave over the original, so a transient read error or opening a vault in an
  older build can't quietly discard your data. The AI stream reader is now bounded and gives up on an
  endpoint that never responds.
- **An AI API key is no longer sent over plaintext HTTP to a remote provider.** Pointing an
  OpenAI-compatible endpoint at a plain `http://` address that isn't local now refuses to send the key
  rather than sending it after only a warning. An `https://` endpoint, or a local one such as
  `http://localhost`, still works exactly as before.

## v0.15.0 - 2026-07-15

### Features

- **Map Display - full-screen expand** - a new Expand button in the toolbar blows the map up to fill the screen, the same full-screen view Relationship Web already has. Handy for close inspection or laying out a big battle map. Your current pan and zoom carry over exactly. Click outside the map, press Escape, or hit the button again (now reading Exit) to come back.
- **In-app licences and attribution** - Preferences has a new About tab showing the version, the GPL-3.0 licence, the SRD 5.2.1 attribution, and the open-source components TTCanvas is built from. This used to live only in the README, which people installing the app never saw.

### Changes

- **Auto-update removed** - the in-app updater and its Preferences toggle are gone. New releases are announced on [Discord](https://discord.gg/ADvK4HEwFE) and published to GitHub Releases, so star the repo to get notified there.
- **Session Recorder is now Session Logger** - the widget keeps a written event log rather than capturing audio, so the clearer name. Existing widgets and saved layouts carry over untouched.
- **Tidier Add Widget menu** - Map Display now sits under World and Encounter Builder under Combat, and Rules Reference and Rule Cards have their own Rules & Reference group instead of everything piling into Utilities.
- **Faster startup** - Map Display, the heaviest built-in widget, now loads in its own chunk instead of the eager startup bundle.
- **SRD 5.2.1 NPC generation and attribution** - the NPC Generator now offers only the classes and species included in SRD 5.2.1, uses the 2024 species rules for ability scores and movement, and draws names from an original neutral pool. The README now includes the prescribed CC BY 4.0 attribution, an adaptation statement, and a clear unofficial-content notice.
- **Neutral calendar presets** - the bundled Forgotten Realms and Warhammer Imperial calendars have been removed. Calendar setup now offers Gregorian and Blank / Custom presets, while custom calendar import and export remain available.

### Fixes

- **Initiative spotlight and player overlay** - the map's active-turn spotlight now lights up foes and combined-turn groups too, not just combatants with their own record. The player-facing overlay also now shows just the current and next turn, in the right order, instead of the whole list, and no longer shows an empty card when nothing's active.
- **Vault folder access is properly contained** - reading, writing, or copying vault files (maps, portraits, mods) could previously be redirected outside your vault folder by a crafted path or a symlink. Every vault-relative file operation is now checked to make sure it stays inside the vault.
- **Mods now ask before running** - JavaScript files in `{vault}/mods` used to load automatically with full access to the app, with only a README mention of the risk. An unrecognised mod now shows a plain-language warning dialog and needs an explicit "Trust and load" before it runs, with "Skip" as the safe default. Trust follows the file's content, so renaming a trusted mod keeps it trusted and editing one asks again.
- **Config and workspace saves no longer race with closing the app** - closing TTCanvas during a save could previously lose that write, or silently swallow a save failure. Saves are now queued properly, the app waits for the current one to finish before closing, and a failed save now shows a toast instead of disappearing.
- **A broken app config no longer blanks the whole app** - a corrupted or hand-edited config file used to leave TTCanvas rendering nothing. It now recovers with safe defaults, backs up the broken file first, and tells you when that happened instead of getting stuck.
- **The player window is properly sandboxed from the rest of the app** - most backend commands are now restricted to the main window. The player window can only do what it actually needs: control its own fullscreen/decorations, log a crash, and read map/portrait images from your vault.
- **Cancelling an AI generation now actually stops it** - Cancel used to just hide further output while the request kept running underneath. It now genuinely interrupts the request, even a stalled one.

## v0.14.0 - 2026-07-13

### Features

- **Initiative Tracker - lair-action reminders** - a new toggle reminds you at the start of each round, the classic "lair actions act at the top of the round" cue. Turn it on and completing a round pops a quick toast so it's not forgotten mid-combat - purely a nudge, nothing is rolled or applied automatically.
- **Initiative Tracker - DEX-modified initiative rolls** - rolling initiative now adds a DEX modifier when one's available, instead of always being a flat, unmodified d20. Fill in DEX on a party member's or Bestiary creature's ability scores and it's applied automatically on auto-roll, both from Encounter Builder and the Initiative Tracker's "From party" button - leave it unset and nothing changes. Encounter Builder's creature list shows a "DEX +3 init" hint next to any creature carrying a modifier, so it's visible before you roll rather than hidden inside the total.
- **Initiative Tracker - Concentrating condition** - "Concentrating" is now a built-in condition alongside the others, with its own violet pill so a concentrating combatant stands out at a glance in both the condition picker and the row itself.
- **Initiative Tracker - group initiative** - two or more combatants can now share a single initiative roll instead of everyone rolling separately. Select rows in the tracker and hit "Group selected", or turn on Encounter Builder's new "Roll as group" checkbox next to a stack of identical monsters to roll once for the whole lot. Each group is independently combined (one collapsed turn, so Next turn skips the whole group at once) or separate (everyone keeps their own turn, just clustered under the shared roll), a toggle you can flip per group at any time. A combined group gets its own row with an editable label, the shared initiative, and an Ungroup button. A separate group's members carry a small badge instead, click it to recombine or the × to ungroup.
- **Sound Board - scenes, playlists and crossfade** - Sound Board now has its own scene tabs, so a tavern's ambience and a boss fight's don't have to share the same set of pads. Each pad holds a playlist of one or more tracks instead of a single file, and works through them in order or shuffled, crossfading between tracks so a looping rain sound doesn't snap back to its start every time. Mark a pad Auto-play and it starts on its own the moment its scene becomes active, fading in as whatever was playing in the outgoing scene fades out.
- **Session Recorder - "Previously On…" player recap** - a second AI button alongside AI Summary, this one writes a short, dramatic recap of the session log in the style of a TV show's "previously on" - the kind of thing you'd read aloud before play starts. It only draws on what the log says happened, and the text sits in an editable box before you save or cast it, so you can trim anything the players shouldn't hear yet. Cast it straight to the player window with the same button Roll Tables and Card Decks use.
- **Per-widget help cards** - every widget frame now has an (i) button with short, relevant guidance, including syntax and behaviour that is easy to forget during play. The cards support safe Markdown, and examples such as `[[wikilinks]]` are highlighted but do not act as links. Session Notes explains its standalone Markdown-folder workflow, including existing Obsidian vaults and Markdown exports from tools such as Notion.
- **Session Notes - backlinks and a link graph** - wikilinks now work both ways. Open a note and a "Linked mentions" panel at the bottom shows everything that links to it (with the line the link sits on), click to jump straight there. A new graph button in the toolbar opens a full-screen web of your notes and the `[[links]]` between them - drag nodes around, Tidy to auto-arrange, and click any node to open it. The graph reuses the Relationship Web's canvas, so it feels the same to pan, zoom, and drag.
- **Backlinks reach across the vault** - a `[[Note]]` written in an NPC's notes or a Gazetteer place's body now counts too, not just links between session notes. The Linked mentions panel tags each source (Note / NPC / Place) and clicking one opens that NPC or place in its own widget; the graph shows them as coloured nodes with a legend. So opening a location note can show you every NPC and place that references it, and the whole campaign starts to connect.
- **Places and NPCs link to each other** - inside a Gazetteer place's notes or an NPC's notes, a `[[wikilink]]` now opens whatever it names: `[[The Gilded Cage]]` jumps to the place, `[[Vex]]` to the NPC, `[[Session 12]]` to the note. When a name is shared, a note wins by default; add a prefix to force it - `[[place:The Gilded Cage]]` or `[[npc:Vex]]`. The Gazetteer's linked-NPC chips are clickable now, and NPC notes render Markdown so their links work. Session Notes deliberately stay note-to-note, so if you point them at an Obsidian vault your own `[[links]]` keep their meaning.
- **Link to creatures, rules, and cards** - the same `[[wikilink]]` reach now extends to three more widgets. From a place or NPC body, `[[creature:Goblin]]` pops the Goblin's statblock in the Bestiary, `[[rule:Grappling]]` opens that file in the Rules Reference, and `[[card:Fireball]]` brings up the Rule Card. Bare names work too when there's no clash (a lone creature called Goblin resolves to `[[Goblin]]`), and the note-first precedence still means your own notes always win a shared name. So a monster's tactics note can point straight at the grappling rules, and a location can link the creatures that lurk there.
- **Pin a Gazetteer place on the map** - every place now has a "Pin this place on a map" button. The first time, it switches to Map Display and arms the next click to drop a pin there; after that, it jumps straight to the existing pin, switching scene and panning to it with a quick flash so you don't lose it. The pin itself is clickable too - click a linked pin to jump straight back to that place in the Gazetteer. Linked pins get their own "Locations" group in the Visibility manager and a small badge so you can tell them apart from NPC and enemy tokens at a glance.
- **Gazetteer widget** - a browsable library of the places in your world. Each location is a first-class entry (a region, settlement, landmark, dungeon, wilderness, point of interest, or your own kind) with a stable identity, so renaming or re-parenting never breaks anything. Places nest into a tree (a tavern sits inside a citadel inside a region) via a parent you pick from a dropdown rather than by shuffling folders, with breadcrumbs and a "within this place" list to move around. Link the NPCs who live there (pulled live from your NPC Library, so their names stay current) and the factions who hold sway, write GM notes in Markdown with `[[wikilinks]]` back to your Session Notes, and set an establishing image. A Cast button reveals the location on the player window as a dramatic card - the establishing image over the name, a "Tavern - Citadel of Thorns" locator, and a player-safe blurb you write (never your GM notes). Singleton, World category, ships empty; places share the same import/export as the other collection widgets, and the whole hierarchy travels with the export.
- **Campaign Timeline widget** - a GM Chronicle that keeps your story beats and your in-game calendar in one place. Add dated entries (plot beats, foreshadowing, session recaps, lore, or your own custom label) and they merge with the Calendar widget's events into a single timeline, sorted by in-game date. Calendar events show up here automatically and read-only (you still edit those in the Calendar widget), a "Now" marker sits at the current in-game date with past entries solid and future ones dimmed, and you can flip between a timeline and a grouped-by-date view. Singleton, World category, GM screen only; needs a calendar set up first.
- **Relationship Web widget** - a GM-only node graph for tracking who's tied to whom. Add nodes from your NPC Library, your party, or as free-standing factions, then link them with typed relationships (ally, enemy, family, member of, owes a debt, or a custom label), with an arrowhead on the directional ones. Drag nodes to arrange them, pan and zoom the board, or hit Tidy to auto-arrange, and open the whole thing full screen when a web gets busy. Nodes linked to an NPC or party member show that character's portrait (free-standing factions fall back to initials). Linked nodes follow their source, so renaming an NPC in the Library updates the node, and deleting the NPC leaves the node with its last-known name rather than dropping it. Deleting a node or link asks for confirmation first. Singleton, ships empty, GM screen only (nothing is cast to players).
- **Dice Roller - real expression evaluator** - the roller now understands proper dice notation instead of a single `NdM+K` term. You can roll multi-term expressions like `2d6 + 1d8 + 4`, keep the highest or lowest dice (`4d6kh3`, `4d6kl1`), and explode dice on a max face (`d6!`). The widget has been rebuilt result-first, and a "?" button next to the expression field opens a short syntax reference so you don't have to remember what `kh` stands for.
- **Dice Roller - saved macros** - save any expression as a labelled button (for example "Longsword +7" or "Fireball 8d6") and roll it in one click. There's a search box for when the list grows and a Manage mode to rename, reorder, or delete them.
- **Dice Roller - generalised advantage/disadvantage** - ADV/DIS now applies to any expression, not just a lone d20. It rolls the whole expression twice and keeps the higher (or lower) total, showing both so you can see what was dropped. A lone d20 still flags a natural 20 as a crit and a natural 1 as a fumble, tinted on both the result and the history.
- **Dice Roller - cast a roll to the player window** - the result card has a Cast button that reveals the roll in the lower middle of the player screen, alongside the Progress Clock and initiative overlays. Players see the label, the total, and any crit/fumble flag whilst the raw dice stay on your screen. Click Cast again to clear it.

### Changes

- **Dice Roller - clear roll history** - the history is capped at the last 30 rolls and now has a Clear button under a History header. Clearing also removes any roll still showing on the player window.
- **Cleaner link labels** - a `[[npc:Agnes Holk]]` or `[[place:The Gilded Keel]]` link now reads as just "Agnes Holk" or "The Gilded Keel" outside edit mode, instead of showing the `npc:`/`place:` prefix. The prefix is only there to say which entity you mean, so it no longer clutters the text.

### Fixes

- **Opening an NPC from a link is reliable** - clicking an NPC in a Gazetteer place, a `[[npc:...]]` link, or a backlink now always brings up that NPC in the Library, including when you re-open the same one after browsing away.

## v0.13.0 - 2026-07-11

### Features

- **Roll Tables widget** - build weighted random tables and either roll on them or read them as a plain reference. Each table is bound to a die (d4/d6/d8/d10/d12/d20/d100 or a custom size); you add entries one at a time and tab through them, and an entry's Span is simply how many consecutive values it covers (so a d100 table can collapse a `01-05` range into one row). **Roll** mode gives a roll button, the padded result, and a scrollable history; **Browse** mode shows the whole table with its value/range column for looking things up without rolling, the table itself can carry a description / how-to-use blurb, and each entry can carry an optional note (shown under the result when you roll) for the extra detail these tables often need. A table can't be filled past its die. The table list is searchable by name or description. Ships empty, and tables can be shared via the same import/export + duplicate detection as NPC Library, Bestiary, and Rule Cards.
- **Roll Tables: nested tables and multi-rolls** - an entry can point at another table instead of plain text (pick it via the 🔗 button on the row), so a "Loot" result can roll straight through to an Items table; the roll view and history show the chain it took (`Table A → Table B`), and a link to a deleted table degrades to a clear "(missing table)" instead of breaking. A table can also carry an optional Count expression (`3`, `2d6`, `1d4+1`) so one Roll click produces several collated results at once, capped at 20 per click.
- **Roll Tables: cast a result to the player window** - each roll result and history row has a cast button that pushes just the entry text to the player-facing window as a clean reveal card (titled with the table's name). The GM-only detail (the raw number and any nested-table chain) stays on your screen.
- **Encounter Builder widget** - pre-build named encounters from your Bestiary and drop the whole fight into the Initiative Tracker in one click. Each encounter is a list of Bestiary creatures with a per-creature count and optional setup notes; "Start combat" adds every creature as a foe (numbered `Goblin 1`, `Goblin 2`, … when there's more than one), with a checkbox to also pull in the party as PCs and a checkbox to auto-roll everyone's initiative. Creatures pull live stats (HP/AC) from the Bestiary, and a creature you've since deleted is shown as missing and simply skipped on start. Singleton, ships empty.
- **Card Decks widget** - build custom decks and draw from them without replacement. Each card carries a name, optional detail text, optional art, and a copy count (so a deck can hold four of the same card); **Play** mode draws off the top of a shuffled pile into a discard, and shows the drawn card large. **Shuffle** re-randomises the cards still in the draw pile (the discard stays spent), while **Reshuffle discard** folds the discarded cards back into the deck and shuffles everything; an exhausted pile reads as "Deck spent" rather than silently recycling. **Edit** mode is a simple card list with per-card art, detail, and count. The featured card has a cast button that reveals it on the player window (the art as a full-bleed handout, or the text if there's no art). Good for Deck of Many Things, Tarokka, critical-hit or inspiration decks, or drawing NPCs/encounters without repeats. Singleton, ships empty; decks share the same import/export + duplicate detection as the other collection widgets.
- **Full-screen background image + Peek** - each layout can now have its own background image behind the canvas (set it from Canvas tweaks), and a new eye-icon button next to Add Widget hides every widget's chrome for a moment so just the background shows - handy for a mood-setting image or a "the screen is clear, look up" beat. The image always fits in full (a portrait image fits to height, landscape fits to width) rather than cropping. Click again or press Esc to bring your widgets back; nothing about the layout itself changes while peeking.

### Improvements

- **Add Widget menu - collapsible categories** - each category header (Utilities, Combat, NPC Management, World) now collapses and expands with a chevron, so the growing widget list stays manageable. Your collapsed/expanded choices are remembered while the app is open.
- **Popovers close when you click away** - the Add Widget and Canvas tweaks panels now close on a left-click outside them (on the canvas or a widget), while staying open while you pan, scroll, or zoom the canvas.
- **No more stray middle-click paste (Linux)** - on Linux, middle-clicking to pan no longer dumps your last selection into whatever text field is under the cursor (the X11 "primary selection" paste). Panning still works and Ctrl+V is unaffected.
- **Encounter Builder has its own icon** - it no longer shares the crossed-swords glyph with the Initiative Tracker, so the two are easy to tell apart in the active-widgets rail. Encounter Builder now shows a flag; Initiative Tracker keeps the swords.
- **Player window can be moved and resized** - the player window is frameless for clean screen-sharing, which left it stuck in place. Hovering over it now reveals a small control that toggles the OS window frame on, so you can move, resize, or close it, then toggle it back off for an unbroken view.
- **Bestiary portraits can be added again** - the crop dialog opened *behind* the creature sheet (a z-index bug), so it looked like nothing happened and no portrait was ever saved. The crop window now sits on top, so you can add and see creature portraits in the Bestiary as expected.
- **Portraits follow characters onto map tokens** - a token now shows its character's portrait whether it's dragged from the Party Tracker, the NPC Library, or the Bestiary, or placed from the Initiative Tracker (including a fight dropped in from the Encounter Builder). Previously NPC and Bestiary tokens, and anything placed via the Initiative Tracker, came out blank. Placing a character that's already on the map now moves the existing token instead of dropping a second, portraitless copy. Works on both your map and the player window.
- **Initiative Tracker - Clear button** - a new Clear action in the bottom bar wipes every combatant and resets to round 1, behind a Yes/Cancel confirm so it can't fire by accident. Handy for starting a fresh fight, especially after dropping one in from the Encounter Builder.
- **Roll Tables - confirm before deleting a table** - the 🗑 button no longer deletes immediately; it swaps to a "Delete “Table Name”?" prompt with Yes/Cancel so an accidental click can't wipe out a table.
- **Map Display - drawing tools moved to a left-hand rail** - the drawing, fog, and measure tools now sit on a vertical rail down the left edge of the map, and the top bar keeps only the view and output controls (folder, grid, zoom, live sync, cast). Tool settings appear in a small collapsible panel that floats over the map's right edge rather than pushing the map around.
- **Map Display - player-safe markup** - draw rings, arrows, boxes, and freehand highlights on a map to point things out during play, with two looks to pick from per scene: Cartographer (a soft, map-like ink style) or Ink (bold high-contrast strokes for busy art). Switch to the Select tool to move, resize, recolour, or delete a mark; the editing handles only ever show on your screen, never to players. Everything mirrors to the player window.
- **Map Display - token & markup visibility manager** - a new Visibility panel (opened from the tool rail) lists a scene's tokens (grouped Players / NPCs / Enemies) and markup, each with two toggles: whether it's on the board at all, and whether players can see it. This lets you stage a whole encounter in advance, keep enemies GM-only (they show on your map as a dashed "GM" ghost, invisible to players), and reveal a token or a whole group with a single click. Tokens are grouped automatically by where they were dragged from.
- **Map Display - reclassify a token's kind** - a small letter button on each Visibility-panel token row (P/N/E) cycles it between Player, NPC, and Enemy, so a hand-placed token isn't stuck in the group its drag source implied.
- **Map Display - adaptive inspector height** - the tool drawer now sizes to its own content instead of always spanning the full map height, so a short panel doesn't leave a tall empty box.
- **Map Display - numbered / auto-labelled markup** - rings and boxes now auto-tag with the next unused letter (A, B, C, ... Z, AA, ...) when you draw them, and any shape's tag is editable in the inspector - handy for calling out "Ring A" or "the trap" without hunting for it on the map.
- **Map Display - measure snapshot to arrow** - a "Save as arrow" button turns your last measured line into a persistent, labellable arrow, so a distance check can double as a callout. The measured line stays put (and its two ends stay draggable to adjust it) after you move the mouse off the map to reach the drawer, and clears automatically once you leave the Measure tool.
- **Map Display - alt-click ping** - alt-click anywhere on the map (any tool) drops a ~1s pulse on both your view and the player window - a quick "look here" that isn't saved to the scene.
- **Initiative Tracker - active-token spotlight** - the map token linked to whichever combatant currently has the turn now pulses gently, on both your map and the player window.
- **Progress Clocks widget** - track named Blades-in-the-Dark-style segmented clocks (any size - 4/6/8/10/12 or custom), each with a tap-to-fill/-empty dial. A clock's cast button shows it as a small corner overlay on the player window (like the initiative order), and stays live as you fill it in - no need to recast after each tick. Add as many clocks as you like in one widget; singleton, ships empty.
- **Handouts widget** - point it at any folder of images (art, letters, maps) and browse them as a thumbnail grid; click a thumbnail to preview it larger, or hit the cast icon on a thumbnail (or in the preview) to reveal it on the player window in one click. Singleton, no folder selected by default.

### Fixes

- **Session Clock - a running timer no longer counts time while the app is closed** - leaving the timer running and closing the app used to show the full real-world elapsed time on reopen (close overnight and it read ~8 hours). On reopen the timer is now paused, keeping its banked value. Note the flip side: the stretch since you last pressed Start isn't carried across a restart, so pause the timer before closing if you want to keep it running.
- **Initiative Tracker - stepping back over a round no longer drifts the in-game clock** - with "Round advances time" on, clicking Prev back over a round boundary now undoes the exact number of seconds that round's Next actually added, instead of assuming the auto-advance toggle and seconds-per-round are unchanged since. This fixes two drift cases: turning auto-advance on after a round already passed without it, and changing the seconds-per-round value mid-combat.
- **Repeated creatures no longer share one map-token identity** - adding the same creature to combat more than once (from the Bestiary, or via Encounter Builder's "Start combat" with a count > 1, e.g. "Goblin 1"/"Goblin 2") tagged every copy with the same underlying id. Dragging the second one onto the map wrongly warned it was "already in scene", and only one of them could ever get the initiative spotlight regardless of whose turn it actually was. Each combatant now gets its own identity, matching the party-member case which already worked correctly.

## v0.12.0 - 2026-07-04

### Features

- **Rule Cards widget** - a new JSON-backed quick-reference widget alongside the Markdown Rules Reference, for GMs who'd rather keep compact structured entries (title, category, body) than a folder of `.md` files. Category-grouped searchable list on the left, rendered Markdown on the right (tables included). Ships empty, no bundled rules text. Import/export and duplicate detection work the same way as NPC Library and Bestiary.
- **Session Clock widget** - a real-world clock for the table, distinct from the in-game Time Tracker. Switches between a live wall-clock display and a start/pause/reset session timer, with an optional seconds readout. The timer keeps counting correctly across an app restart.
- **XP Tracker widget** - track a shared party total or individual per-PC totals, with a progress bar to the next level (editable threshold table, defaults to the standard D&D 5e values). Award XP directly, **Split** an encounter total evenly across the party, or give the same amount to **Each** ticked PC. Every award is logged with an undo button and a hover timestamp. XP lives entirely in the widget's own state - no changes to Party Tracker's character data.

### Fixes

- **Bestiary - import no longer silently duplicates re-imported creatures** - Bestiary's importer previously had no duplicate detection at all: every import (including re-importing the exact same file) minted a fresh id per entry, so the same pack could pile up multiple times with only a `(2)`-style name suffix to show for it. It now runs through the same shared duplicate check as NPC Library.
- **Bestiary / NPC Library - Tags field rejected commas, Skills field rejected all input** - both were controlled text inputs whose displayed value was rebuilt from a parsed/filtered copy of what you'd typed, so an in-progress keystroke (a trailing comma, an unfinished skill name) got silently stripped before it could render. Typing now behaves normally in Bestiary's Tags and Skills fields and NPC Library's Tags field.

### Improvements

- **NPC Library / Bestiary - content-aware import duplicate detection** - both widgets now share one import/export helper. Re-importing the same file is flagged as "already in vault"; importing the same content under a different id (e.g. a pack shared by two people, or re-exported after ids were regenerated) is now also caught and flagged as a duplicate, not just added as a copy. Choosing **Replace** overwrites the existing entry's content but keeps it in its current folder/filename rather than moving it.
- **Sticky Note redesign** - retired the hardcoded near-white yellow that clashed with the dark theme. Notes now pick from 5 muted tints (amber, slate, sage, rose, lilac) via a small colour-dot picker in a new header strip; legacy notes with no colour saved default to the first tint.
- **Map Display - fog can be painted back on, not just revealed** - the fog Brush and Rectangle tools now have a Reveal / Hide toggle. Painting Hide over an already-revealed area re-covers it; painting Reveal back over a hidden area re-opens it, and touch-ups layer correctly in whichever order they're painted. The Player Window mirrors it exactly. Maps saved before this existed are unaffected and keep behaving as pure-reveal.
- **Initiative Tracker - combat rounds can advance the in-game clock** - a new "Round advances time" toggle (off by default) moves the Time Tracker's clock forward each time a round completes, by an adjustable length (default 6s). Stepping back across a round boundary rewinds it, so a misclicked Next turn doesn't leave stray time behind. The Time Tracker now understands seconds - they only show while nonzero and roll up into minutes (ten 6-second rounds = one minute) - and it all works even while the Time Tracker widget is closed, including the player window's date overlay staying current. Without a calendar set up the toggle simply does nothing.

## v0.11.2 - 2026-06-30

### Improvements

- **Map Display - Measure tool UX rehaul** - the scale configuration is no longer hidden behind a gear icon. While the Measure tool is active a contextual strip appears below the toolbar stating the current scale in plain language (`1 square = 5 ft`, `Measuring in m`, `No scale set - counting grid squares`). A **Change scale** / **Set scale** button on the strip is always available, so the scale can be updated at any time and the editor auto-collapses after saving. The calibration flow now uses plain language throughout: **Measure a known length** → drag prompt → `That's [N] [unit]` - no more "Arm" jargon. The strip disappears when leaving the Measure tool.
- **Map Display - on-map distance label** - the label never shows raw pixel counts. With no scale set it now reads in grid squares (e.g. `2.5 sq`); with no scale and no grid it shows `-`.
- **Map Display - toolbar grouping** - related buttons now sit on shared rounded trays (grid / fog / measure / zoom / output) with clear gaps between groups, replacing the barely-visible hairline dividers. The grid toggle and its size input are one tray, so they read as a single control. Tool groups are left-aligned so toggling the grid expands its tray in place rather than shifting the whole toolbar sideways.

---

## v0.11.1 - 2026-06-29

### Fixes

- **Rules Reference** - clicking a `[[wikilink]]` in the rendered document now navigates to the
  linked file. `[[Target|Alias]]` syntax correctly shows the alias as link text rather than the raw
  `Target|Alias` string.
- **Rules Reference** - the right panel now scrolls back to the top when a different file is
  selected from the tree.
- **Rules Reference** - file tree now appears directly under the search bar (flex layout fix).
- **Rules Reference** - removed the new-file button, which served no purpose in a read-only widget.

---

## v0.11.0 - 2026-06-29

### Features

- **Rules Reference** - new widget pointed at any vault folder of Markdown (`.md`) files. Left panel shows a searchable file tree; right panel renders the selected file with full Markdown support including tables. The search bar filters files by name or body content. Import/export is inherent: the files live in any folder you choose and open natively in Obsidian or any text editor. No bundled copyrighted text; the GM supplies the rule files.
- **Markdown tables** - GFM pipe-table syntax (`| Col | Col |` / `| --- | --- |`) now renders in the Rules Reference, Session Notes, and Bestiary wherever Markdown is displayed.

---

## v0.10.2 - 2026-06-29

### Features

- **Map Display** - new **Measure tool** (ruler icon in the toolbar). Drag on the map to draw a ruler between two points; the distance is shown at the midpoint as a live label that tracks pan and zoom. Scale is configured via a gear-icon panel:
  - *Grid* - set "1 cell = N [unit]" (available when the grid overlay is on); the ruler immediately reads in those units.
  - *Calibrate* - arm the calibration mode, drag across a known object on the map, then type its real-world length and unit to derive the scale.
  - *Grid offset* - nudge the grid overlay in X and Y so it aligns with a pre-printed grid on the map image, then use grid-based scale accurately.

---

## v0.10.1 - 2026-06-29

### Features

- **Initiative Tracker** - new eye-icon toggle in the toolbar sends the turn order to the player window as a live overlay. Players see only names, turn position, and who is up now/next - no HP, AC, or initiative numbers. The overlay appears in the top-right corner on top of whichever scene is active (map, handout, character cast, or idle screen) and updates automatically as the GM advances turns. Turning the toggle off (or closing the widget) clears the overlay immediately.

---

## v0.10.0 - 2026-06-24

### Features

- **Map Display** - maps now auto-fit to the viewport when loaded or when scenes are switched. Toolbar zoom controls added: **Fit**, **1:1**, **−**, and **+** (×1.25 steps). Scroll-wheel zoom is preserved and clamped so the map can never be zoomed out smaller than the fit size. The player window independently fits the map to screen on first display, then mirrors GM framing on subsequent pushes.
- **Player Window** - "Clear screen" button (`×`) appears next to the LIVE button while the player window is open; blanks the player display instantly without closing the window.
- **Bestiary** - creatures can now be dragged from the card and list views onto the Map Display to place as a token. Portrait image is used if set.
- **NPC Library** - NPCs can now be dragged from the list onto the Map Display to place as a token. Hover the portrait to see the drag hint.
- **NPC Generator** - optional D&D 5e combat stat generation. Toggle "Combat stats" to fill in HP, AC, CR, speed, ability scores, and signature actions based on class + level + race. Saved to the NPC JSON when enabled.
- **NPC Generator** - per-widget Campaign context textarea. When set, the text is prepended to every AI prompt so generated traits/hooks/voices reflect the campaign's world, tone, and factions.
- **Session timer** - no longer starts automatically on launch. Click the SESSION pill to start, click again to pause, click once more to resume. Time accumulates correctly across pause/resume cycles.
- **NPC Library** - portrait upload: click the avatar in the detail header to pick and crop a portrait, saved to `vault/portraits/`. Portrait shown in both the list row and detail header; falls back to initials if none set.
- **NPC Library** - export: export a single NPC or all NPCs as a `.npc-library.json` bundle via native save dialog.
- **NPC Library** - import: import a `.npc-library.json` bundle with conflict detection; choose to skip or replace existing NPCs by ID.
- **Session Recorder** - "AI Summary" button in the toolbar sends the full session log to the configured AI and streams a clean narrative summary into a collapsible panel. Save the result as a `.md` file via the native save dialog.
- **Player Window** - now opens borderless (no OS window chrome). Drag the top edge to move it. Press **F11** to enter fullscreen, **Esc** to exit. GM titlebar gains a fullscreen toggle button (lit amber when active) next to the Clear button.
- **Portrait pipeline** - uploading a portrait now saves two files: the usual 400×400 square crop and a full-resolution version (long edge capped at 1920 px). Party Tracker, NPC Library, and Bestiary all write both files on re-upload.
- **NPC Library** - "Show to players" now sends a cinematic character card to the player window instead of a baked text PNG. Two-column layout (full portrait left, name + subtitle + tags right) when a full portrait is available; centred circular crop fallback otherwise.
- **Bestiary** - "Show to players" (▶) button on each card, list row, and creature sheet sends a cinematic creature card to the player window.
- **Party Tracker** - "Show to players" (▶) button on each character card sends a cinematic PC card to the player window. The button also appears in the full character sheet modal footer.
- **Diagnostics** - new Preferences pane for troubleshooting. Errors and crashes are now written to a rotating local log file (capped at ~2 MB, kept on this machine only - nothing is sent automatically). The pane offers **Open log folder**, an in-app recent-log viewer with **Refresh** / **Clear**, and **Export diagnostics…** which saves a redacted report (app version, OS, enabled widgets/mods, recent log) for attaching to a bug report. The configured API key and home-directory usernames are stripped from both the in-app viewer and the exported report.

### Fixes

- **Player Window** - pressing F11 in the player window updated the player's local fullscreen state but never told the GM side, so the GM's fullscreen toggle button showed the wrong state and could toggle the window into the wrong mode. `set_player_fullscreen` now emits a `player-fullscreen-changed` event that both windows listen to; either side pressing the toggle always puts the indicator in the correct state.
- **Player Window** - a saved window position from a monitor that has since been disconnected opened the player window off-screen with no way to recover it without deleting the config. The saved position is now checked against available monitors; if it falls outside all of them the window opens in its default centered position instead.
- **Player Window** - "Push to player" mirrored the GM's `panX`/`panY`/`scale` values directly. Because `scale` is relative to the GM widget's pixel size, a large player display at the same scale showed the map smaller than it should be, and panning was off-centre relative to what the GM had framed. The push payload now includes the GM viewport dimensions (`gmViewW`/`gmViewH`); the player computes its own fit scale and derives a zoom ratio from the GM's values so both displays show the same region of the map at the appropriate zoom level for their screen size.

- **Bestiary** - importing a malformed or incompatible file silently did nothing (the `catch` was empty). Import now validates that each entry has a non-empty `name` and a `creatureType`; malformed entries are skipped with a count shown in a dismissible banner. A file that contains no valid entries, or that fails to parse as JSON, shows a clear error message.
- **AI (Ollama / OpenAI)** - streaming responses decoded each raw network chunk to UTF-8 independently before appending it to the line buffer. A multi-byte character (accented letter, emoji) split across a chunk boundary was decoded to U+FFFD replacement characters, corrupting accented or emoji output and potentially breaking the JSON line parser. The buffer is now `Vec<u8>`; bytes are accumulated and complete lines are decoded at once.
- **Vault** - `read_file_base64` did not reject `..` or path-separator characters in `file_name`, unlike the companion `write_file_base64` which already did. The same guard is now applied to reads.
- **Vault** - the recursive file walks (`list_vault_files`, `list_folder_images`) used `path.is_dir()` which follows symlinks. A symlink pointing back into a parent directory caused infinite recursion and a stack-overflow panic. The walks now use `entry.file_type().is_dir()` (no symlink follow) so symlinked directories are simply skipped.

### Fixes

- **NPC Generator** - the per-widget Ollama model dropdown was storing a separate model selection in widget state rather than using the globally-configured AI model from Preferences. This caused inconsistency where NPC generation used a different model than every other AI widget (Session Recorder, Session Notes), and the dropdown was a redundant UI surface that could silently fall out of sync. The per-widget `ollamaModel` field is removed; all AI widgets now use `aiConfig.model` from the global config for both Ollama and OpenAI.

- **NPC Library** - `parseNpcJson` accepted any valid-JSON object as a `ParsedNpc` with no field validation, so a file containing a JSON array, a bare number, or an object with a missing `name` would flow into the UI causing garbled renders or "undefined" display names. Files that parse as JSON but lack a non-empty string `name` now fall back to a blank NPC derived from the filename. Missing `id` fields are filled with a freshly generated UUID so older files remain usable.

### Internal

- **Bestiary** - import folder deduplication only matched top-level folders (`parentId === null`), so a nested imported folder named "Monsters" could silently collide with an existing top-level "Monsters" folder and merge creatures into the wrong place. Dedup now matches each folder by both name and mapped parent, so nesting is respected.
- **Bestiary / Session Notes** - `renderMarkdown` was in `session-notes/` but imported directly by `bestiary/CreatureSheetModal` and `BestiaryDetail`. Moved to `shared/markdownRenderer.ts` so the dependency flows through shared infrastructure rather than across widget boundaries.
- **AI (Ollama / OpenAI)** - all Rust AI commands now share a single `reqwest::Client` (via `OnceLock`) instead of allocating a new one per call, enabling HTTP connection pooling. The two OpenAI commands log a `WARN` when an API key is sent to an `http://` base URL.

### Fixes

- **Map Display** - dropping a token onto the map when that character already has a token placed used a blocking `window.confirm` dialog, which stole focus from the canvas and was untestable. The choice is now an inline prompt bar that appears at the top of the viewport with **Move here** and **Add second** buttons, plus a dismiss ×.
- **Vault** - importing a map image whose filename already existed in the vault's `maps/` folder silently overwrote the previous file. Copies are now deduplicated: `dungeon.jpg` → `dungeon-2.jpg` → `dungeon-3.jpg` and so on.

### Internal

- **AI (Ollama / OpenAI)** - the `OllamaChunk` TypeScript type declared a `{ type: "error"; message }` variant that the Rust enum never emits; errors surface as a rejected promise instead. The dead variant is removed.
- **Rust / security** - `write_vault_file`, `delete_vault_file`, `write_file_base64`, `ollama_generate`, and `openai_generate` now verify that the calling window is `main` and return an error if invoked from any other window (e.g. the player window). Tauri 2 custom commands are ungated by the capabilities system, so this closes the implicit player-window access to write/delete/AI commands.
- **Mod system** - `registerModWidget` now accepts the source filename and stores it in a `type → filename` map inside the registry. `handleModUninstall` reads that map directly instead of guessing `type.js` / `type_with_underscores.js`; if a mod was loaded from `fancy-widget-v2.js` it is now deleted correctly.
- **Calendar** - added `validateCalendarDef` to `utils.ts`, which checks `weekDayNames.length === weekLength`, `startWeekday ∈ [0, weekLength)`, at least one month, all months and intercalary periods having `days ≥ 1`, and each intercalary `afterMonth` in range. The Calendar View now shows a structured error banner instead of crashing when an invalid def reaches the renderer. The import handler in Calendar Setup now rejects a file that fails any of these checks before adding it as a preset.
- **Rust / performance** - `read_vault_file`, `write_vault_file`, `list_vault_files`, `list_folder_images`, `read_file_base64`, `write_file_base64`, `delete_vault_file`, `copy_to_vault_maps`, `copy_to_vault_portraits`, and `save_text_file` were synchronous Tauri commands running blocking I/O on the command dispatch thread. All are now `async` with the I/O wrapped in `tokio::task::spawn_blocking`, so large vault scans and base64-encoded map image reads no longer risk stalling the runtime.
- **Rust / errors** - all Tauri commands were returning `Result<_, String>` with `.map_err(|e| e.to_string())` scattered everywhere. Introduced a shared `CommandError` enum in `src/error.rs` (backed by `thiserror`) with typed variants for I/O, JSON, HTTP, base64, task join, and Tauri errors. All six command modules now use `CommandError`; `?` replaces most explicit `.map_err` calls. The error serializes as its human-readable message string so the TypeScript side is unchanged.
- **TypeScript / sheet modals** - pervasive `as any` for dynamic field access in `NPCSheetModal`, `PCSheetModal`, and `NpcLibrary` replaced with a typed generic helper `set<K extends keyof T>(key, val)` in each component. Mixed-type key groups (e.g. `cr: string` vs `hp: number`) use control-flow narrowing instead of a single unsafe cast. Two missing fields - `subclass` and `faction` - added to `ParsedNpc`. Zero `as any` remaining in the sheet/modal layer.
- **AI (Ollama / OpenAI)** - `ollamaGenerate` and `openaiGenerate` now return `{ promise, cancel }` instead of a bare `Promise`. Each widget that calls them (NPC Generator, Session Recorder, Session Notes) stores the cancel function in a ref, cancels any in-flight generation before starting a new one, and cancels on unmount. This prevents concurrent generations from writing interleaved output into the same buffer and stops stale chunks from updating state after the widget is gone.
- **App** - `focusedIdRef.current` was assigned during render (side-effect during render, a footgun under concurrent rendering). Moved to `useLayoutEffect`.
- **App** - widget focus clicks triggered a debounced workspace save even though only the z-order changed, not content. The save is now skipped for pure z-order reorders; any genuinely pending content save is re-scheduled so no data is lost.
- **Map Display** - scene IDs now use `crypto.randomUUID()` instead of `Date.now()` + 4 random chars (collision-prone in tight loops).
- **Map Display** - `migrateState` treated an empty `scenes: []` array as legacy data and would silently reset to "Scene 1", discarding `activeSceneId`. It now branches on `Array.isArray(r.scenes)` regardless of length and only synthesises a default scene when the field is absent entirely.
- **Core** - removed dead `MapSettingsContext` / `useMapSettings` export from `@ttcanvas/core`; it was never provided or consumed anywhere in the codebase.
- **Core** - `PartyMember` now `extends SharedPartyMember` so the shared fields (`id`, `name`, `hp`, `maxHp`, `ac`, `initiative`) are derived from the canonical context type and cannot silently drift.
- **App** - the five React context value objects (AI, Calendar, Conditions, IT, Party) were recreated as new object literals every render, causing every context consumer to re-render on any `App` state change regardless of relevance. Each is now wrapped in `useMemo`. The three `DEFAULT_*` state objects were also recreated every render; hoisted to module scope.
- **Rust / vault** - `watch_vault` mutex lock now uses `unwrap_or_else(|e| e.into_inner())` instead of `unwrap()`, recovering the guard instead of panicking if a prior thread panicked while holding it.
- **Testing** - added 3 tests for mod/built-in collision guard (`registry.test.ts`). Total: 181 → 184 TS tests.
- **Logging** - `loadMods.ts` and `VaultProvider.tsx` were using `console.warn` for failures, bypassing the structured diagnostics logger. Both now use `logWarn` so mod-load errors and vault-watcher failures appear in the diagnostics log.
- **Testing** - added 8 new tests: wikilink rendering (happy path, multiple links, `&` encoding, HTML injection via element body and attribute) in `markdownRenderer.test.ts`; missing-field defaults for `migrateWorkspace` in `workspace.test.ts`; corrupt-file backup behaviour in Rust `workspace.rs` tests. Total: 175 → 181 TS tests, 13 → 14 Rust tests.

- **Map Display / Player Window** - fog of war rendering is now incremental: only newly-added reveals are stamped onto the bitmap each stroke (O(1) per dab). A full redraw is still triggered on scene switch, fog toggle, or undo/clear.
- **Map Display** - scene-switch transition shield: an opaque overlay covers the viewport while a new map is loading, preventing the previous scene's map from ever showing at the new scene's transform or fog state. The shield is driven by a derived `showShield` flag (`loadedMap !== selectedMap`), which updates synchronously at render time; `loadedMap` only advances once `onLoad` fires (or the load fails), so the shield is guaranteed to be present for the entire loading window. Replaces the earlier `visibility: hidden` approach, which was not consistently honoured by the compositor.
- **Testing** - RTL component test suite updated for Map Display scene-switching behaviour (9 tests, now asserting transition shield presence/absence). Test infrastructure: vitest jsdom environment, `@testing-library/react`, canvas API stub, `ResizeObserver` mock.
- Removed the GitDoc VS Code extension from the project; it was auto-committing on every save with timestamp-only messages, producing noise in git history.
- **Diagnostics / logging** - integrated `tauri-plugin-log` (LogDir + Stdout targets, size-based rotation, Warn level in release / Info in dev) and a Rust panic hook that captures unexpected panics to the same file. The previously-unused `ErrorBoundary` is now wrapped around the app, global `error` / `unhandledrejection` handlers were added, and both error boundaries log on catch. A pure, unit-tested `redact()` helper strips secrets and home paths; it also takes a list of literal known secrets (the configured API key) so the key is removed regardless of its shape. Redaction runs at log write-time, on the in-app log viewer, and as a final sweep over exported reports. New Rust commands: `log_file_path`, `read_log_tail`, `clear_log`; export reuses the existing `save_text_file` command.
- **Preferences** - the version shown in Preferences (and the diagnostics report) now comes from `getVersion()` instead of a hardcoded string, so it stays in sync with `tauri.conf.json` across releases.

### Fixes

- **Preferences** - theme, accent colour, density, reduce-motion, auto-update, and custom conditions were not saved when changed in the Preferences modal; they were lost on restart unless an unrelated action (AI config, vault switch) happened to flush the config. All preference changes are now persisted immediately.
- **Session Notes / vault widgets** - the vault file watcher was triggering on the app's own workspace autosaves (files inside `.ttcanvas/`), causing every vault-backed widget to reload on every save tick. This could interrupt an in-progress Session Notes edit by reloading the file mid-type. The watcher now ignores `.ttcanvas/` writes, and the frontend handler is debounced to absorb rapid external bursts.
- **Vault / workspace** - workspace.json (and app config) were written with a destructive truncate-then-write. A crash mid-write left the file corrupted and the vault unable to open. Writes are now atomic (write to a `.tmp` file, then rename into place). If a corrupted workspace.json is found on load, it is backed up as `workspace.json.bak` and the vault opens with a clean default state instead of refusing to load.
- **Vault / workspace** - a hand-edited, partially-written, or future-version workspace.json that lacked the `activeLayout` or `layouts` fields caused a TypeError that silently aborted vault load. These fields are now always defaulted during migration.
- **Map Display / Player Window** - token portraits were stored as base64 data URLs inside `MapToken.imgSrc`, bloating `workspace.json` and every IPC push-to-player payload. Portraits are now stored as vault-relative paths (`portraitPath`, e.g. `"portraits/uuid.jpg"`) and loaded on demand - in the GM view via the vault hook and in the player window via `read_file_base64`. A migration pass on load strips legacy base64 data URLs (unrecoverable) and re-paths any vault-relative `imgSrc` values to `portraitPath`. A canvas thumbnail that was generated solely for drag use is also removed; drag sources now carry the vault-relative path directly.
- **App** - widget re-renders on every canvas interaction because `removeWidget` captured the full `widgets` array in its closure (triggering all inline handler objects to rebuild on every move/resize). `removeWidget` now reads widgets through a ref so it has no `widgets` dep; each widget is rendered via a `React.memo` `WidgetSlot` with stable per-id callbacks. Only the widgets that actually changed (state, position, focus, selection) re-render.
- **Vault / workspace** - workspace.json was loaded with raw `unknown` casts; a deeply-malformed file (wrong field types, unknown version) could crash vault load despite the existing migration guards. Zod schemas now validate every field of the workspace envelope on read: corrupted geometry fields are clamped to safe defaults, non-parseable widget entries are filtered rather than crashing, and an unknown `version` falls back to a clean default workspace. 7 new tests cover the recovery paths (202 total).
- **All widgets** - per-widget state loaded from workspace.json was cast directly to the widget's state type with no validation; a hand-edited or corrupted field (e.g. `members: null`, `round: "two"`) would crash the widget render. Each built-in widget now has a Zod schema (`parseState`) registered alongside its `WidgetDefinition`; `WidgetSlot` applies it before passing state to the component. Required missing fields are defaulted, corrupted arrays are element-filtered rather than fully dropped, and completely invalid state falls back to the widget's default. 32 new tests across all 13 widget types (202 → 234 total).
- **Window** - if the renderer was wedged or crashed, the first close attempt would be prevented (waiting for `confirm_close`) and no further close attempt could succeed, trapping the app open until the process was killed. A second close attempt now force-closes, so users always have an escape hatch.
- **Mod system** - a mod declaring a widget type that collides with a built-in (e.g. `"party-tracker"`) would silently overwrite it, and the next mod reload would permanently remove the built-in for the session. `registerModWidget` now refuses to overwrite built-in types.
- **Initiative Tracker** - adding a combatant via the Bestiary or Party Tracker bridge before the Initiative Tracker widget was first opened would seed the tracker at round 0 instead of round 1, mismatching what the widget shows on first open.
- **AI (Ollama / OpenAI)** - HTTP error responses (401 bad key, 404 wrong model/URL, 500 server error) were silently treated as successful empty generations. The widget would show a blank result with no feedback. All four commands (`ollama_generate`, `openai_generate`, `ollama_list_models`, `openai_list_models`) now call `error_for_status()` and surface the HTTP error to the UI.
- **AI (Ollama / OpenAI)** - generate calls had no timeout; a connected-but-unresponsive endpoint would leave the widget stuck in "generating" indefinitely. List-model calls now have a 10 s total timeout. Streaming generate calls use a 30 s per-chunk idle timeout: if no data arrives for 30 s the request errors out, while legitimate long generations that keep streaming are unaffected.
- **Player Window** - on a scene or map switch, the previous map image was visible under the new scene's fog reveals and tokens for the entire duration of the async image load (~1-2 s for a large map). The player window now clears the image immediately when a new map is requested, showing a plain dark background until the new image finishes loading - mirroring the transition shield already present on the GM side.
- **Session Notes / Bestiary / Creature sheets** - `[[wikilink]]` display text was injected into the rendered HTML without escaping. A note containing `[[<img src=x onerror=…>]]` - including via an imported `.bestiary.json` - would inject arbitrary HTML elements. Display text is now HTML-escaped before building the anchor. (Execution was already blocked by CSP; this closes the content-injection hole.)

- **Map Display / Player Window** - clicking "Push current view to player screen" no longer blanks the GM's map (fog of war and tokens disappearing). The fix removes the full base64 image from the Tauri IPC event; the player window now loads the map file independently via a direct Rust command, keeping the event payload small.
- **Map Display** - scroll-wheel zoom no longer accidentally zooms the main canvas when the cursor is over a Map Display widget.
- **Window** - minimum size set to 680×480; the titlebar no longer overlaps itself when the window is resized too small.
- **Windows** - token drag from Party Tracker and Initiative Tracker to Map Display now works on Windows (WebView2). Two root causes fixed: Tauri 2 registers the window as an OS-level drop target by default (fixed via `dragDropEnabled: false` in `tauri.conf.json`), and `dataTransfer.getData` is unreliable for custom MIME types in WebView2 (fixed by storing the drag payload in a module-level variable via `tokenDrag.ts`).
- **Windows** - NPC Library (and all vault file listings) now load correctly on Windows. `list_vault_files` was returning backslash-separated paths (`npcs\file.json`) which the TypeScript forward-slash filters silently rejected, making all NPCs disappear after the vault watcher reloaded the list.
- **Map Display** - fog of war and token pins disappeared after resolving a duplicate-token conflict ("Move here" or "Add second"), requiring a scene switch to restore them. The image-reload effect was unconditionally clearing `imgSize` on every run; if the same map file was re-fetched the base64 src was identical, `onLoad` never re-fired, and `imgSize` stayed `null` permanently. The effect now only clears `imgSize` when the map path actually changes, and restores it directly from the already-decoded `<img>` element when a spurious re-run is detected.

---

## v0.9.0 - 2026-05-11

First public release (Phase 5 / public alpha).

### Features

- **Canvas** - freeform widget canvas with pan, zoom, multi-select marquee, undo move/resize, multiple named layouts, Widget Rail, Command Palette, keyboard shortcuts overlay
- **Trackpad navigation** - two-finger scroll pans, pinch zooms, Space+drag pans
- **Dice Roller** - d4-d100, advantage/disadvantage, custom expressions, result history
- **Party Tracker** - HP / AC / initiative / passive Perception, portraits, death saves, condition badges, custom stat fields
- **Initiative Tracker** - round counter, kind pips, HP bar, sort by roll, add from Bestiary
- **Map Display** - multi-scene image viewer, grid overlay, fog-of-war brush, token placement, Player Window output
- **Session Notes** - folder-tree file browser, Markdown / plain-text editing, Wikilink navigation
- **Custom Calendar** - fully configurable months and week days, intercalary periods, event log, Player Window time display
- **Time Tracker** - in-game time advancement, synced to Calendar
- **Sound Board** - ambient audio loop grid with per-pad volume
- **NPC Generator** - randomised NPC creation with AI description generation (Ollama / OpenAI-compatible)
- **NPC Library** - vault-resident NPC sheets with D&D 5e stat blocks
- **Bestiary** - creature library with folder tree, portraits, and Initiative Tracker integration
- **Session Recorder** - timestamped session log with Markdown export
- **Player Window** - separate output window for maps, fog reveals, and in-game time
- **Preferences** - themes, accent colours, density, reduce-motion toggle, AI provider config
- **Mod system** - load custom ESM widget files from `{vault}/mods/` without recompiling
- **Auto-update** - in-app update notifications via GitHub Releases (opt-in)

### Technical

- Built with Tauri 2, React 19, TypeScript, Rust
- All vault files are plain JSON / Markdown in a folder you own
- GPL-3.0-or-later licence with Plugin Exception
