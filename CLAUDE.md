# Accessible Football: rules for Claude Code

Read this file first in every session. It is short on purpose. The full design is DESIGN.md; the code layout is README.md; history is CHANGELOG.md.

## Who this is for

The developer and first player is Brian, who is blind and uses NVDA and JAWS. He cannot see the screen, so nothing visual counts as verification. He reads and tests by keyboard and speech. Every summary you write for him should be plain prose, no tables, headings where they help navigation, and it should say what to test with a screen reader.

## Authority

DESIGN.md is authoritative. You may not change a decision marked Decided. If you believe a decision is wrong or impossible, write the argument in DESIGN_PROPOSALS.md with the section number and carry on with the decision as written. You may add facts to DESIGN.md (for example a status note) but not change decisions.

## Non-negotiable accessibility rules (DESIGN.md section 21)

The game is a single static page, plain JavaScript, no framework, no build step, no package installs. It must run by opening index.html from a folder.
Zero standard inputs. No text fields, selects, range sliders, buttons, or links inside the game, except the one "Press Enter to Begin" button that starts audio and focuses the container, and the native file picker for loading a save.
One focus trap: body role="application", one container with tabindex="0" that receives focus after Enter, and one window keydown listener. F5 and F6 pass through; everything handled calls preventDefault.
One voice: a single sr-only div with aria-live="assertive" and aria-atomic="true", written only by window.announce(). Every visual panel is aria-hidden. Every state change announces something; silence is a bug.
Interceptors in priority order at the top of the keydown handler, each returning early: pending confirmation, explore mode, help viewer, any open list or grid viewer, then the mode branch. Opening a viewer sets a flag; Escape clears it and re-announces context.
Menus are arrays with wrap-around, entry prompt on first announce, Enter confirms, Escape backs out. Grids are 2D arrays announcing "row header, column header: value" and speaking edges. Help is an array with heading lines that end in "Heading Level 2" and H and Shift+H jump between them. F12 is keyboard explore mode. Tab is quick status, C repeats the last report, X examines the current setup.
No silent changes to values the user is not on. The Focus allocation says "Nothing unallocated. Lower another category first."
Pace auto-advancing events to speech length (milliseconds per character by pacing mode) and offer a manual pacing mode.

## Engine rules

The engine (engine/) has no browser dependencies. Every engine file is a plain script that attaches to the global AF object and also sets module.exports. The same files run in the browser and in Node.
No Math.random anywhere. Everything draws from an AF.Rng instance. Every game is replayable from its seed.
The engine reads effective attributes only (players.eff), never raw attributes, and returns events describing who beat whom. Coaches, spotters, and the computer opponent form their beliefs from events and from scouting, never from true attributes. If you find code where a computer coach reads a true attribute to make a decision, that is a bug against DESIGN.md 24.1; fix it or log it.
The scheme matrix in engine/plays.js is authored football knowledge. Do not derive it from attributes or flatten it. node matrix.js must keep showing a spread of several yards between a concept's best and worst coverage.
Do not add attributes to players without a proposal. The short list in DESIGN.md 4.2 is deliberate.

## Code conventions

UTF-8, Unix line endings, four-space indentation, single quotes, the existing IIFE-with-export pattern at the bottom of every file. No TypeScript, no modules, no async unless the browser forces it (file loading).
UI logic that does not touch the DOM (the announce queue, menu state, input dispatch, screen state machines) lives in ui/core.js and is tested in Node. Only ui/dom.js touches document.
Speech text is sanitized before announce: "3rd and 7" becomes "third and seven", minus signs become the word minus, percent signs become the word percent.
Every file starts with a comment saying what it owns and which DESIGN.md sections it implements.

## Verification, always

Before any commit: node harness.js 100 1 --even runs clean and its numbers stay inside the targets in the harness header; node matrix.js runs clean; node test/run.js (create it if it does not exist) passes.
After finishing a feature, spawn a fresh read-only reviewer subagent with the relevant prompt from KICKOFF.md before moving on. Fix what it finds that is real; log the rest in REVIEW_NOTES.md.
Commit after every milestone with a message that names the milestone. Never leave the working tree in a state where index.html or the harness is broken. If a milestone is going badly, revert to the last commit and write down why in PROGRESS.md rather than pushing forward on a broken base.
Do not push to any remote. Local commits only. Brian pushes.

## Delegation policy

You are the main agent and the only one who makes architectural decisions, edits DESIGN.md, or touches more than one area at once. Work through milestones sequentially.
Subagents are for: read-only review (simulation reviewer, accessibility auditor, design-drift auditor); running the harness and matrix at scale and reporting anomalies; and at most one parallel worker on an isolated file that nobody else is editing (for example authoring help text in ui/help_text.js). Never more than two subagents at once. Never two agents editing the same file. A subagent may not change a design decision or an interface; it proposes, you decide.
Give every subagent: the file list it may read, the file list it may write (usually none), the DESIGN.md sections that apply, and the exact question. Ask for findings as a plain list with file and line, no rewrites.

## Contracts between areas

PlayResult is what engine/resolve.js returns and engine/game.js enriches: type, outcome, yards, clockRuns, oob, carrier, target, defender, tackler, pressured, air, yac, fumble, fumbleLost, penalty, events, injuries, td, turnover, concept, formation, call, tempo, sit. Events are objects with kind and say plus references to the players involved. The UI never computes football from these; it announces them.
Hunch is what engine/staff.js produces: source (OC, DC, SPOT, TRAINER), kind (matchup, adjustment, substitution, injury, observation, recovered), target (a role or player), confidence (sure, likely, guess), recommendation (a play id or a defensive call or a substitution), evidence (event references), urgency (must, cued, batched), text (a plain template sentence). The UI turns hunches into speech and chimes; it never invents them.
GameController in engine/controller.js is the only thing the UI talks to for a game: start, pending (what input is needed next), suggestion for each side, callOffense, callDefense, substitutions, advance, reports, situationLine, halftime, final, and the play log. It returns strings and plain objects, never DOM.
Saves are JSON: the full run state plus the coach profile, written by the browser download and read by the native file picker; localStorage holds only a crash-recovery copy.

## Session start ritual

Every session begins by reading, in this order: CLAUDE.md, PROGRESS.md (the running log), the latest MORNING_REPORT.md, ISSUES.md, and the KICKOFF file named in the opening prompt. The files are the project's memory; the conversation is not. If something in the files contradicts something you remember, the files win. Anything worth remembering must be written to PROGRESS.md or ISSUES.md before the session ends.

## Reporting to Brian

Keep PROGRESS.md as a running log: one paragraph per milestone with what was built, what the harness said, what the reviewers found, and what was skipped. At the end of a session write MORNING_REPORT.md: what to open, the keys to press, what to listen for, what is known to be missing, and any decisions you need from him. Plain prose, no tables.
