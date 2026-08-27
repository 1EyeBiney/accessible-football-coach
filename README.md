# Accessible Football

A coach career simulator built for screen reader users and keyboard-only players. You start as a high school football coach and try to work your way up to the NFL. The design is in DESIGN.md; this file is about the code.

## Layout

engine/ holds the game engine. Every file is a plain script with no browser dependencies: it attaches itself to a global AF object in a browser and exports itself under Node. The same files will be loaded by index.html and by the Node tools below.

engine/rng.js. Seeded random number generator. Nothing in the engine calls Math.random. Every game is replayable from its seed.

engine/players.js. Attribute definitions, position overalls, talent bands by level, the two-platoon roster generator, depth charts, effective attributes (base adjusted by stamina, injury, and confidence), and word grades.

engine/plays.js. Formations, offensive concepts, defensive fronts, coverages, pressures, adjustments, and the scheme matrix that gives each concept its reasons to exist.

engine/resolve.js. Snap resolution. One snap is a chain of phases (pressure, target, throw, catch, run after catch for passes; blocking, the hole, the tackle, the breakaway for runs) plus penalties, fumbles, and the events list that coaches and spotters observe.

engine/game.js. The game loop: clock, downs, special teams, stamina, injuries, the automatic coaches, the first form of the counter loop, overtime, and the play-by-play text.

harness.js. Plays many games headless and prints statistics. This is how the engine is tuned.

matrix.js. Resolves every concept against every coverage, pressure, and box weight between equal teams and prints average yards. This is how we check that the scheme matrix is doing its job.

dev_data/ holds real NFL reference data for calibration. It is in .gitignore and is never shipped. See dev_data/README.md.

## Running the tools

You need Node. From the project folder:

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

Plain JavaScript, no framework, no build step. Files are UTF-8 with Unix line endings. Each engine file ends with the same export block. Version and history live in CHANGELOG.md.
