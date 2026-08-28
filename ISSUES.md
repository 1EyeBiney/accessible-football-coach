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

Blowouts. One game in four is decided by more than thirty-five points against about one in eight in real high school football, and only one in twenty-five between equal teams, so a modest roster gap becomes a rout somewhere. Candidates: the harness draws quality from too wide a range for a ten-team league (narrow to about plus or minus 0.35 and see), leading teams should run the clock harder earlier, and trailing teams should not keep giving the ball back on downs. Measured in BALANCE_NOTES.md.

Cover three. Ruled in DESIGN.md 26.2: fix the caller, trim the matrix only slightly.

Fumbles lost are low, about 0.35 a team a game against roughly 0.8 in real high school football.

## Needs a decision

(Empty. Put questions here that need Brian's call.)

## Done

(Moved here by Claude Code with the commit that fixed it.)

Save and load a whole game in progress (DESIGN.md 21.10). engine/save.js serialises a controller to JSON, tagging every player reference outside the roster that owns him so loading can rebuild real object identity rather than disconnected copies; test/save_test.js plays twenty snaps, saves mid-decision (after the coordinator's suggestion has already drawn from the seed but before the play is called), loads into a fresh controller, and checks twenty more snaps replay word for word. G saves to a file, Shift G and the main menu's Load open the file picker, and the main menu's Resume reads the crash copy that is now written to localStorage after every decision point. Commit: "Milestone 5a: save and load".

The special teams flow, the fourth-down half (DESIGN.md 8.4). The coach's own fourth down now goes through the same suggest-and-accept grammar as offense and defense: a recommendation with confidence wording, Enter to accept, F for the full list (punt, field goal, go for it, and a fake of whichever kick is recommended). Built without a fourth full coordinator - see DESIGN_PROPOSALS.md proposal 3 for why. The opponent's own fourth down and a victory-formation kneel-out still resolve automatically, whatever the delegation setting; onside kicks and a kickoff-specific choice are moved to Not started, above. Commit: "Milestone 5b: special teams".
