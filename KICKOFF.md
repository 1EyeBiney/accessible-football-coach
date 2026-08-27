# Overnight kickoff, session 1

You are working unattended tonight. Brian will read PROGRESS.md and MORNING_REPORT.md in the morning with a screen reader. Follow CLAUDE.md throughout. Work the milestones below in order, commit after each, and stop cleanly at whatever point you reach; a finished milestone with a clean tree is worth more than a half-finished later one.

## Before you start

Read CLAUDE.md, README.md, CHANGELOG.md, and DESIGN.md sections 2, 5, 8, 16, 18, 19, 21, 22, 23, 25, and 26 in full. Read every file in engine/ and both harness.js and matrix.js. Run node harness.js 100 1 --even and node matrix.js and paste both outputs into PROGRESS.md as the baseline. If the folder is not a git repository, run git init, add a .gitignore that already exists, and make an initial commit named "Engine 0.1.0 baseline". Do not push.

## Milestone 1: the staff knowledge model (engine/staff.js)

This implements DESIGN.md 5.3, 18.2, 18.3, 19, 24.1, and 26.7. Build engine/staff.js with:

A staff member record: role (OC, DC, SPOT, TRAINER), name, attributes evaluation, scheme, communication, teaching, and for the spotter eyes, timing, accuracy, voice, and for the trainer diagnosis, treatment, prevention. Generate them with a function that takes an Rng and a level, using the same 1 to 99 scale.

A belief store per staff member per game, built only from PlayResult events and from pre-game scouting knowledge passed in as fuzzy ranges. For every matchup the staff member can observe (our receiver against their defender, their rusher against our blocker, our back against their box, and the mirror images for the defensive coordinator), keep observations and an estimate. Evaluation sets how many observations are needed before the estimate becomes a hunch and how much noise sits on it. Communication (or timing for the spotter) sets how many plays after the threshold the hunch is released. Accuracy for the spotter sets the chance a reported fact is wrong.

A function that, given the belief store and the current situation, returns the Hunch objects that are ready, in the contract shape from CLAUDE.md, including matchup hunches with a recommended play from the call sheet, adjustment hunches for the defensive coordinator, substitution hunches from stamina and health, and recovered-player hunches at change of possession, and spotter observations about limping or tiring opponents.

Rewire engine/game.js so both automatic coaches decide from their staff's beliefs and hunches instead of from true attributes or from the raw memory counters. The defensive counter loop keeps working, but through the DC's belief store. Remove any read of true attributes from coaching decisions.

Add to harness.js a hunch accuracy report: over the run, how often matchup hunches were right (the recommended matchup gained more than the play's expected yards) broken down by the coordinator's evaluation in bands of poor, average, and good. A good coordinator must be right more often than a poor one, and the difference should be clearly audible in the numbers. If it is not, the model is wrong; fix it before moving on.

Then spawn the simulation reviewer (prompt below), fix real findings, and commit as "Milestone 1: staff knowledge model".

## Milestone 2: the game controller (engine/controller.js)

Build engine/controller.js as the only surface the UI will use, per the contract in CLAUDE.md. It wraps game.js and staff.js and exposes a step-by-step game: start with two teams and a seed; pending() says what is needed next (offense call, defense call, substitution answer, halftime choice, nothing because a delegated side is auto-calling, or game over); suggestion(side) returns the coordinator's suggestion as a play or call plus the confidence wording and whether the word "sub" applies; callOffense, callDefense, answerSubstitution, halftimeChoice, and advance move the game forward and return the announcements produced, each with a priority (result, must, cued, batched) and a source for the chime; reports() returns waiting cued reports; situationLine() returns the Tab line; log is the play-by-play. Support the three delegation modes per side from DESIGN.md 22 and the play clock setting from 16.5.1 (the controller exposes the seconds and the delay-of-game outcome; the UI runs the timer). Support the no-huddle key and the substitution list. Halftime per DESIGN.md 23.1 and the postgame review per 23.2, in plain sentences.

Write test/controller_test.js: a scripted "human" plays a full game through the controller in Node, calling both sides every snap using the suggestions, and asserts that the game reaches a final, that every announcement is a non-empty string, that no announcement contains a raw attribute number, and that the same seed replays identically. Add test/run.js that runs every test file.

Spawn the simulation reviewer again with the controller in scope. Commit as "Milestone 2: game controller".

## Milestone 3: the playable shell (index.html and ui/)

Build the Accessible Golf interaction model exactly as DESIGN.md 21 and CLAUDE.md describe. Files: index.html (structure and the sr-only live region, a visual mirror that is aria-hidden), ui/core.js (announce queue with priorities and pacing, menu and grid state machines, the interceptor stack as pure functions over key events, screen state), ui/dom.js (the only file touching document: focus, live region write, visual mirror, Web Audio chimes synthesized with oscillators, no audio files), ui/help_text.js (the help arrays by mode and the key description table for explore mode), ui/screens.js (the screens listed below), main.js (boot, load order, the keydown listener). Load engine files first, then ui/core.js, help_text.js, dom.js, screens.js, main.js, plain script tags.

Screens for this milestone, and only these: the boot button; a main menu (New game, Resume from crash copy, Load save file, Help); a team choice menu of two fixed authored high school teams generated from fixed seeds with a spoken profile in words per DESIGN.md 14.2, no numbers; a pregame screen that reads the coordinators' pregame hunches and lets the coach set delegation mode per side and the play clock setting; the game screen with the play call flow from DESIGN.md 16.5 (suggestion first, Enter accepts, or pick formation then play from the situational call sheet, no-huddle key at the formation prompt, substitution list off the formation prompt, defense call as front then coverage then pressure then adjustment with the same one-key accept), the report chimes and the key to hear a waiting report, Tab, C, X, M, R, S and T keys per DESIGN.md 8.2 and 21.8, halftime, the final with the postgame review, and save log to clipboard. Save game to disk and load through the native picker.

Keys must be documented in ui/help_text.js and reachable in explore mode. Every screen must be escapable and every Escape must re-announce where the user is.

Write test/ui_core_test.js exercising the announce queue ordering, menu wrap, grid edges, interceptor priority (a key pressed while help is open never reaches the game), and the Focus allocation rule even though the weekly screen is not built yet.

Spawn the accessibility auditor (prompt below). Fix what it finds. Commit as "Milestone 3: playable shell".

## Milestone 4: balance pass and morning report

Spawn the balance runner (prompt below) and act on anomalies that are clear bugs; log judgment calls. Update CHANGELOG.md to 0.2.0 with what exists now. Write MORNING_REPORT.md: how to open the game, the exact keys to press to get from boot to the first snap, what Brian should listen for on the first three plays, the delegation modes, what is not built yet, the harness and matrix numbers, the reviewers' open items, and any decisions you need from him. Commit as "Milestone 4: balance and morning report".

If you finish early, do not start recruiting, the weekly screen, the career, or legacy. Instead run the accessibility auditor a second time against the whole shell with fresh eyes and fix what it finds, then improve the play-by-play wording in engine/game.js describe() so a sighted reader and a listener both get a clean sentence per snap.

## Subagent prompts

Simulation reviewer. "You are the simulation reviewer. Do not modify any file. Read DESIGN.md sections 5.3, 8.3, 16.2, 18, 24.1, and 26, then read every file in engine/ and the harness and matrix scripts. Report, as a plain list with file and line: any place a computer coach or staff member reads a true attribute rather than events or scouting; any way a player could exploit the resolution (a play or adjustment that dominates regardless of coverage, a loop with no counter, a free substitution); any outcome the math allows that the design forbids; anything that will make one class of plays dominate; and any use of Math.random or unseeded randomness. Rank by severity. Do not propose rewrites longer than three lines."

Accessibility auditor. "You are the accessibility auditor. Do not modify any file. Read DESIGN.md sections 2, 19, and 21, CLAUDE.md, index.html, and every file in ui/ and main.js. Walk every interactive state as a screen reader user would, key by key, and report as a plain list with file and line: any standard input inside the game; any state where a key leaks into another mode; any state change that produces no announcement; any Escape that does not re-announce context; any announcement that could overwrite another before it is spoken; any grid or list without edge announcements or wrap; any place a user could become stuck with no documented key out; any number spoken where the design calls for words; any key not in the help text or the explore table; and any place focus could leave the container. Rank by severity."

Balance runner. "You are the balance runner. Do not modify any file except BALANCE_NOTES.md, which you create. Run node harness.js 500 3, node harness.js 500 3 --even, node harness.js 300 11, and node matrix.js 600 9. Read the harness header targets. Report every number outside its target, every concept whose best-to-worst coverage spread is under two yards, any coverage or pressure that is never the right answer, any adjustment with no measurable effect, blowout frequency (margins over 35), and the hunch accuracy gap between poor and good coordinators. Then play five logged games with node harness.js 1 SEED --log for seeds 21 through 25 and list any play-by-play line that reads wrong to a football fan (impossible yardage, wrong down, a kneel that gains yards, a punt inside the ten, a team punting while trailing by two scores under two minutes). Plain lists, file and line where relevant."

Design-drift auditor, use once at the end if time allows. "Do not modify any file. Read DESIGN.md in full and every source file. List every place the code contradicts a Decided item, every design term that the code names differently, and every feature the code has that the design does not mention. Plain list, file and line, no rewrites."
