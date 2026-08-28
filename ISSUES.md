# Issues and tweaks

The running list of things noticed in play. Brian adds to the first section in his own words, as many or as few as he likes, one paragraph each; nobody needs to make them tidy. Claude Code reads this file at the start of every session and moves items it fixes into the Done section with a one-line note on what changed. Items nobody has decided on go in Needs a decision, and Brian answers them here or in conversation.

An item marked "before next build" is fixed before any new feature work starts. Everything else is fixed in the fix passes between build sessions.

## From play (Brian writes here)

(Add what you noticed while playing. Where it happened, what you heard, and what you expected instead. A seed number helps if you have one; Tab reads the current seed on the game screen once that is built.)

## Before next build

(Empty.)

## Not started

Onside kicks, and a suggest-and-accept moment around the kickoff itself. The fourth-down half of DESIGN.md 8.4 is built (see Done, below); kickoffs still run automatically. See DESIGN_PROPOSALS.md proposal 3 for why this was split off rather than built the same night: it needs a real recovery-rate mechanic, not a UI wrapper around something the engine already does.

## Tuning

(Empty. Fumbles lost were checked and deliberately left; see Done, below, and BALANCE_NOTES.md.)

## Needs a decision

(Empty. Put questions here that need Brian's call.)

## Done

(Moved here by Claude Code with the commit that fixed it.)

Save and load a whole game in progress (DESIGN.md 21.10). engine/save.js serialises a controller to JSON, tagging every player reference outside the roster that owns him so loading can rebuild real object identity rather than disconnected copies; test/save_test.js plays twenty snaps, saves mid-decision (after the coordinator's suggestion has already drawn from the seed but before the play is called), loads into a fresh controller, and checks twenty more snaps replay word for word. G saves to a file, Shift G and the main menu's Load open the file picker, and the main menu's Resume reads the crash copy that is now written to localStorage after every decision point. Commit: "Milestone 5a: save and load".

The special teams flow, the fourth-down half (DESIGN.md 8.4). The coach's own fourth down now goes through the same suggest-and-accept grammar as offense and defense: a recommendation with confidence wording, Enter to accept, F for the full list (punt, field goal, go for it, and a fake of whichever kick is recommended). Built without a fourth full coordinator - see DESIGN_PROPOSALS.md proposal 3 for why. The opponent's own fourth down and a victory-formation kneel-out still resolve automatically, whatever the delegation setting; onside kicks and a kickoff-specific choice are moved to Not started, above. Commit: "Milestone 5b: special teams".

Blowouts (Milestone 7). Games decided by more than thirty-five points went from 18.8% to 8.7% of mixed-quality games (target about one in eight) and from 4.2% to 3.3% between equal teams (target about one in twenty-five), across three changes: harness.js's quality draw narrowed from plus-or-minus 0.6 to plus-or-minus 0.35; a leading team now runs the ball more starting at a ten-point lead in the fourth quarter instead of fourteen; and a team trailing by more than a score no longer gambles on fourth-and-short deep in its own territory before the fourth quarter's last five minutes. Measured before and after in BALANCE_NOTES.md.

Cover three (Milestone 7). Ruled in DESIGN.md 26.2. The defensive caller no longer gives cover three a flat, dominant base weight: it now earns its way up on first down, short yardage, and heavy personnel, and two-high shells are the clear answer on long yardage instead of a mild nudge. Its run-support bonus (the extra man the single deep safety frees into the box) was raised to match cover zero's. The two largest positive matrix entries against it (Four Verticals, Curl and Flat) were trimmed by two points each, per the ruling's cap. Call rate came down from 27.7% of pass snaps to 23.7%, close to cover two and cover four instead of standing well clear of both; matrix.js's spreads still hold. Full numbers, including a real side effect on yards per carry worth watching, in BALANCE_NOTES.md.

Fumbles lost, checked and left. Measured at 0.58-0.68 a team a game against the roughly 0.8 target, which is close to where the previous balance pass deliberately stopped rather than risk exceeding real per-carry fumble rates or making every game read as slapstick. Nothing new this session changes that reasoning. Reasoning in BALANCE_NOTES.md.
