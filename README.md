# Accessible Football

A coach career simulator built for screen reader users and keyboard-only players. You start as a high school football coach and try to work your way up to the NFL. The design is in DESIGN.md; the rules for working on it are in CLAUDE.md; this file is about the code.

## Playing it

Open index.html in any browser. Press Enter on the one button, and from that moment every key goes to the game. F1 is help. F12 describes any key you press without doing it. There is nothing to install and no build step.

## Layout

engine/ holds the game engine. Every file is a plain script with no browser dependencies: it attaches itself to a global AF object in a browser and exports itself under Node. The same files are loaded by index.html and by the Node tools below.

engine/rng.js. Seeded random number generator. Nothing in the engine calls Math.random. Every game is replayable from its seed.

engine/players.js. Attribute definitions, position overalls, talent bands by level, the two-platoon roster generator, depth charts, effective attributes (base adjusted by stamina, injury, and confidence), and word grades.

engine/plays.js. Formations, offensive concepts, defensive fronts, coverages, pressures, adjustments, and the scheme matrix that gives each concept its reasons to exist.

engine/resolve.js. Snap resolution. One snap is a chain of phases (pressure, target, throw, catch, run after catch for passes; blocking, the hole, the tackle, the breakaway for runs) plus penalties, fumbles, and the events list that coaches and spotters observe.

engine/staff.js. The people. Staff members and their attributes, the belief store each one builds during a game from the events on a play result, and the hunches they hand the coach. Nothing here reads a true player attribute for an opinion, which is the rule in DESIGN.md 24.1.

engine/game.js. The game loop: clock, downs, special teams, stamina, injuries, the automatic coaches, the counter loop, overtime, and the play-by-play text. A game is built by startGame and walked one snap at a time by stepGame; playGame is a loop over stepGame for the headless tools.

engine/controller.js. The only surface the interface talks to for a game. It says what input is needed next, gives the coordinator's suggestion, takes the coach's call, and hands back announcements with a priority and a source. It returns strings and plain objects and never touches the page.

engine/save.js. Turns a controller into plain JSON and back. The one place in the project that has to think about object identity: a player is serialised once, in the roster that owns him, and every other reference to him (a hunch's target, an event's carrier or tackler, a belief store's evidence) is saved as a tagged id and rebuilt into the same live object on load.

ui/core.js. Interface logic that does not touch the page: the announce queue and its priorities, the speech sanitiser, menus, grids, the point allocation list, confirmations, the help viewer, and the ordered interceptor stack. Tested under Node.

ui/help_text.js. Every word of help, split by mode, and the key description table the keyboard explorer reads.

ui/dom.js. The only file that touches document: the focus trap, the live region, the visual mirror, the synthesised chimes, and reading and writing files.

ui/screens.js. The screens and the keys that work on each of them.

main.js. Boot, load order, and the one keydown listener.

index.html. The page. Loads the engine, then the interface, then main, as plain script tags in a fixed order.

harness.js. Plays many games headless and prints statistics, including how often a coordinator is right. This is how the engine is tuned.

matrix.js. Resolves every concept against every coverage, pressure, and box weight between equal teams and prints average yards. This is how we check that the scheme matrix is doing its job.

test/. Plain Node tests, no framework. run.js runs every file ending in _test.js and prints a plain text report.

dev_data/ holds real NFL reference data for calibration. It is in .gitignore and is never shipped. See dev_data/README.md.

## Running the tools

You need Node. From the project folder:

node test/run.js
Runs every test and prints how many checks passed. Run this before every commit.

node harness.js
Plays 50 games with seed 1 and prints the summary.

node harness.js 300 7
Plays 300 games with seed 7.

node harness.js 200 1 --even
Equal-quality teams, which isolates the randomness of the engine from talent gaps.

node harness.js 1 12 --log
One game with the full play-by-play printed, one line per play. Change the seed to get a different game.

node matrix.js
The scheme matrix check. Read the spread column: a concept whose best and worst coverages differ by only a yard or two has no reason to exist.

## Conventions

Plain JavaScript, no framework, no build step, no package installs. Files are UTF-8 with Unix line endings, four-space indent, single quotes. Each engine and interface file ends with the same export block and starts with a comment saying what it owns and which DESIGN.md sections it implements. Version and history live in CHANGELOG.md, open arguments about the design in DESIGN_PROPOSALS.md, and what the reviewers found in REVIEW_NOTES.md and BALANCE_NOTES.md.
