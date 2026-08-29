# Morning report

Written August 29, 2026, after the coin toss milestone. Plain prose, as always. The first section is what is new to your ears; the rest is what happened and what is parked.

## The coin toss and the kickoff

The game no longer starts itself. After the pre-game screen you hear "The teams are on the field," the whistle, and then the captains meet at midfield: H calls heads, T calls tails, while the coin is in the air. Win it and you hear "You win the toss. Take the ball." - Enter takes it, F offers deferring to the second half or kicking off. Lose it and they take the ball, like a computer captain always will.

Then the kickoff itself is a call, both directions. Kicking, Enter takes the deep kick and F offers a squib, a pooch, or an onside kick. Receiving, Enter takes the regular return and F offers the hands team. In full control you are asked at every kickoff; hand a side to your coordinator with the stop-me setting and he only stops you when an onside kick is genuinely in play - fourth quarter, inside four minutes, one score or two down - which is also exactly when the computer coach will try one against you, so listen for the hands team recommendation late in a close game. An onside kick is a real gamble: about one in five against a regular return unit, half that against a hands team.

Defend-an-end is deliberately missing from the toss. The engine has no wind for it to mean anything, and a choice that changes nothing is a lie; it is written down for the day an elements model exists.

## Also new under the hood

The game now counts, quietly, how many decisions you made yourself against how many your staff made for you - the seed of the career scoring we agreed on from proposal 4. Nothing announces it yet; it rides through saves and waits for the career milestones.

## The whistle, from the previous build and still fresh

After every play, you now hear the result as its own utterance, then one of your eight referee whistles, then the next suggestion as a separate utterance. The whistle is the ready-for-play whistle: everything before it belongs to the play that just happened, everything after it belongs to the next one. No two whistles repeat until all eight have been heard, and which one plays is chosen outside the game's seed, so replays are untouched. The play clock, when you have it on, now starts at the whistle, like real football.

The timing, retuned after your first listen: the whistle now fires at half the speech-length estimate, so at your rate it should land on the tail of the announcement rather than leaving a dead gap - impinging on purpose, as you asked. P still scales it, any key still wins immediately.

The call prompt has a new shape, also from your notes: after the whistle you hear the down and distance on its own, then a short tone, then the call - on defense, the personnel they show, then the suggestion. The tone is synthesised, not a file, so its length is exact and the prompt follows tight on its end.

## The defensive look

When you are calling the defense, the prompt now starts with what the offense is showing: "They show twenty one personnel," and then your coordinator's suggested call. That personnel read is exactly what the engine's own defensive coordinator is handed, nothing more — real defenses match personnel, and the formation is only revealed at the line, so it is deliberately not announced. On your first defensive snap, before anyone has seen anything, you will hear "No look at their personnel yet" rather than a guess.

## The seed

Shift Tab speaks the seed of the current game as a plain number. Write it down with anything you notice and the whole game can be replayed exactly. Tab is unchanged: the short situation line.

## The play clock, if you use it

Two changes worth hearing, both from the auditor rather than from your notes. Letting the clock expire on your own offensive call now actually announces the delay of game - it had been silently moving the ball five yards since the clock was built. And letting it expire on your own defensive call no longer flags your opponent: the ball is snapped and your defense goes with the call your coordinator suggested, which is what stalling on defense costs in real football.

## What is parked, by your own call

The designated target mechanic stays parked from session two. The OC shell-read clause and defend-an-end at the toss are written down in ISSUES.md's Not started. Intent calling and the career accounting from proposal 4 wait for the career milestones; only their seed, the decision count, is live.

## Where everything is written down

PROGRESS.md has the session entries in order. ISSUES.md moved the coin toss and kickoff to Done. CHANGELOG.md is at 0.5.0. REVIEW_NOTES.md has every reviewer pass. DESIGN.md carries status notes under 8.4 (the toss and kickoff as built) and 22 (proposal 4 accepted). Everything is committed and pushed to github.com/1EyeBiney/accessible-football-coach.
