# Issues and tweaks

The running list of things noticed in play. Brian adds to the first section in his own words, as many or as few as he likes, one paragraph each; nobody needs to make them tidy. Claude Code reads this file at the start of every session and moves items it fixes into the Done section with a one-line note on what changed. Items nobody has decided on go in Needs a decision, and Brian answers them here or in conversation.

An item marked "before next build" is fixed before any new feature work starts. Everything else is fixed in the fix passes between build sessions.

## From play (Brian writes here)

(Add what you noticed while playing. Where it happened, what you heard, and what you expected instead. A seed number helps if you have one; Shift Tab reads the current seed on the game screen.)


## Before next build

(Empty.)

## Not started

Defend-an-end at the toss. The real toss offers a winner the choice of which goal to defend; the engine has no wind, weather, or field direction for that choice to mean anything yet, so it is deliberately not offered (a choice that changes nothing would be dishonest). If an elements model ever arrives, the toss flow has the natural slot for it.

The OC shell-read clause: at full verbosity on offense, when the offensive coordinator has a confident read of the defensive shell, one short clause in the suggestion line about what they are showing, filtered through his belief store so a bad staff can be wrong about it (DESIGN.md 24.1). Deliberately deferred from the 2026-08-28 reported-information pass to keep it conservative; the T key already gives tendencies on demand.

## Tuning

Z says there is no look at their offense yet on the first snap of every new drive, even in the fourth quarter against a team you have watched all night. The guard behind it is right and deliberate: the stamps are per-possession, so Z can never report your own unit as theirs, which is the correctness rule of DESIGN.md 24.1. But your memory is not per-possession. The improvement is to report the last time you actually faced that unit, worded so it does not claim to be last snap ("the last time they had the ball" rather than "last snap"), which needs a small decision about how stale information should be presented before it is built. Found by the session 5 audit.

The engine's defensive coordinator reads stale personnel for one snap after a turnover: buildSuggestion hands chooseDefense the personnel of whatever offense ran the last snap, which after a change of possession is the other team's. The spoken line was fixed in the whistle session (it now says there is no look yet), but the engine-side call still leans on the stale value. Fixing it changes what a seed replays, so it belongs in a deliberate engine pass with the harness run before and after, not a quick patch. Found by the session 3 audit; details in REVIEW_NOTES.md.

(Fumbles lost were checked and deliberately left; see Done, below, and BALANCE_NOTES.md.)

## Needs a decision

Original recorded audio (2026-08-28). Brian wants to eventually add real audio clips
(crowd noise, play-by-play lines, etc.), not just the synthesized chimes. Section 21's
"runs by opening index.html, no server" rule is marked non-negotiable, and it is
possible to keep it while adding recorded audio: plain `<audio>` elements (or a
MediaElementAudioSourceNode built from one) load local files fine under file://
in every major browser, no fetch() involved. What would actually force a server is
the fancier path - fetching a clip's raw bytes and decoding it into a Web Audio buffer
for layering/pitch control/precise timing, which Chrome blocks under file://. Past
projects apparently needed Live Server because they used that fancier path, maybe out
of habit rather than necessity. When this work starts, default to the plain-<audio>
approach to keep section 21 intact; only spend the server-requirement conversation if
a specific desired effect genuinely can't be done that way.

## Done

(Moved here by Claude Code with the commit that fixed it.)

The ball position said "our own" when it meant theirs (2026-08-29, from play). Where the ball is was resolved against the offense, not against you, so on defense every spot was spoken with the offense's possessives: after a kickoff and a short return you heard "ball on our own 25" for a ball on their 25. It is now resolved against who owns the half the ball is in compared to your own team, so it is right on both sides of the ball, and the engine's own formatter says it the same way the situation line does - you were hearing one spot named two ways inside a single utterance, "at their twenty four" and then "at opponent twenty four". A game nobody is coaching keeps the old offense-relative wording, so the harness is byte for byte unchanged. Also fixed in passing: "kickoff returned to the our own thirty eight", and the kickoff lines now end in a full stop instead of running into the next sentence. Commit: "Milestone 11: the listening pass".

The snap cue, and turning the play hints off (2026-08-29, from play). A low short blip now sits between the call you just made and the description of what happened, so the two are no longer one block of speech: the order around every play is now snap cue, result, referee whistle, down and distance, set tone, call. I turns the play hints on and off, on the suggestion and on the call sheet both, and it is independent of V, so you can keep the full play by play and stop being told what a concept beats once you know the playbook. Both the hints and the pacing now survive a save, and Resume says which settings came back with the game rather than changing them under you. Same commit.

A key for the other team's personnel (2026-08-29, from play). Z is the mirror of X: what they had on the field on the last snap. On offense it names the front they actually ran and how many linemen, linebackers and defensive backs were in it; on defense it names the formation and personnel they showed, which the pre-snap line deliberately will not give you because the formation is hidden until the line - by the time you press Z the snap has happened and you have earned it. It never reports one team's unit as the other's. The design question your note raised, whether the defense should see the offense's personnel and get a chance to answer it with a substitution, is written up as DESIGN_PROPOSALS.md proposal 5 rather than built blind. Same commit.

The coin toss and the kickoff (2026-08-29, from Brian's play notes). Every game opens with the toss: call it in the air with H or T, and a winner chooses receive, defer, or kick, in the same Enter-accepts, F-for-more grammar as everything else. Every kickoff is then a call: deep, squib, pooch, or onside kicking; regular return or hands team receiving; gated by offenseMode like the fourth down, with the coordinator only stopping a KEY-mode coach when an onside kick is genuinely in play. Onside kicks have a real recovery mechanic (about one in five against a return unit, half that against a hands team), and the computer coach uses the same desperation window honestly on both sides. The engine defers every kickoff to its own step, so the old synchronous call sites are untouched and a seed replays as before; the controller also now counts coach-made against staff-made decisions per game, the accepted seed of DESIGN_PROPOSALS.md proposal 4. Defend-an-end is deliberately not offered (see Not started). Commit: "Milestone 10: the coin toss and the kickoff".

Whistle timing and the call prompt's shape (2026-08-28, from Brian's first listen). The whistle fires at half the pacing estimate so it lands on the announcement's tail instead of after a dead gap; every call prompt is now down and distance, a short synthesised set tone with an exactly known length, then the look and the suggestion. Commit: "Milestone 9a: whistle timing and the call prompt".

The referee whistle (2026-08-28). One of the eight whistles in audio/ref plays between a play's result and the next play's prompt, marking the ball ready for play. Built on the three patterns from the accessible golf audio engine: Audio elements created once at the Begin click, a grab bag so no clip repeats until all eight have been heard, and the next utterance gated on the clip's ended event rather than a duration guess. The shuffle draws from its own clock-seeded Rng so the game's seed replays exactly as before. The announce queue gained segments (ui/core.js) so the result and the prompt are two utterances with the whistle in the gap, and the play clock now starts at the whistle, like real football. Commit: "Milestone 9: the whistle and the coach's ears".

The seed on Shift Tab (2026-08-28). Tab stays the short situation line; Shift Tab speaks the seed as digits, for reporting anything noticed in play. Documented in help and the keyboard explorer. Same commit.

Defensive awareness of the offense (2026-08-28). Before the coach's own defensive call, the prompt now says what personnel the offense is showing, which is exactly the look the engine's own defensive coordinator is handed (DESIGN.md 16.5, 24.1) - neither more nor less. On the first defensive snap, before any look exists, it says so instead of guessing. Personnel groupings already existed on every formation; no new attributes were added. Same commit.

Save and load a whole game in progress (DESIGN.md 21.10). engine/save.js serialises a controller to JSON, tagging every player reference outside the roster that owns him so loading can rebuild real object identity rather than disconnected copies; test/save_test.js plays twenty snaps, saves mid-decision (after the coordinator's suggestion has already drawn from the seed but before the play is called), loads into a fresh controller, and checks twenty more snaps replay word for word. G saves to a file, Shift G and the main menu's Load open the file picker, and the main menu's Resume reads the crash copy that is now written to localStorage after every decision point. Commit: "Milestone 5a: save and load".

The special teams flow, the fourth-down half (DESIGN.md 8.4). The coach's own fourth down now goes through the same suggest-and-accept grammar as offense and defense: a recommendation with confidence wording, Enter to accept, F for the full list (punt, field goal, go for it, and a fake of whichever kick is recommended). Built without a fourth full coordinator - see DESIGN_PROPOSALS.md proposal 3 for why. The opponent's own fourth down and a victory-formation kneel-out still resolve automatically, whatever the delegation setting; onside kicks and a kickoff-specific choice are moved to Not started, above. Commit: "Milestone 5b: special teams".

Blowouts (Milestone 7). Games decided by more than thirty-five points went from 18.8% to 8.7% of mixed-quality games (target about one in eight) and from 4.2% to 3.3% between equal teams (target about one in twenty-five), across three changes: harness.js's quality draw narrowed from plus-or-minus 0.6 to plus-or-minus 0.35; a leading team now runs the ball more starting at a ten-point lead in the fourth quarter instead of fourteen; and a team trailing by more than a score no longer gambles on fourth-and-short deep in its own territory before the fourth quarter's last five minutes. Measured before and after in BALANCE_NOTES.md.

Cover three (Milestone 7). Ruled in DESIGN.md 26.2. The defensive caller no longer gives cover three a flat, dominant base weight: it now earns its way up on first down, short yardage, and heavy personnel, and two-high shells are the clear answer on long yardage instead of a mild nudge. Its run-support bonus (the extra man the single deep safety frees into the box) was raised to match cover zero's. The two largest positive matrix entries against it (Four Verticals, Curl and Flat) were trimmed by two points each, per the ruling's cap. Call rate came down from 27.7% of pass snaps to 23.7%, close to cover two and cover four instead of standing well clear of both; matrix.js's spreads still hold. Full numbers, including a real side effect on yards per carry worth watching, in BALANCE_NOTES.md.

Fumbles lost, checked and left. Measured at 0.58-0.68 a team a game against the roughly 0.8 target, which is close to where the previous balance pass deliberately stopped rather than risk exceeding real per-carry fumble rates or making every game read as slapstick. Nothing new this session changes that reasoning. Reasoning in BALANCE_NOTES.md.
