# Morning report

Written August 28, 2026, after the session that worked through your play notes live. Plain prose, as always. The first section is what is new to your ears; the rest is what happened and what is parked.

## What to open

Open index.html and press Enter on the button, same as always. Nothing about getting into a game has changed. Three things are new once you are playing.

## The whistle

After every play, you now hear the result as its own utterance, then one of your eight referee whistles, then the next suggestion as a separate utterance. The whistle is the ready-for-play whistle: everything before it belongs to the play that just happened, everything after it belongs to the next one. No two whistles repeat until all eight have been heard, and which one plays is chosen outside the game's seed, so replays are untouched. The play clock, when you have it on, now starts at the whistle, like real football.

The timing to listen for: the whistle is scheduled off the same speech-length estimate the auto-advance already uses, so on medium pacing it should land near the end of the result rather than on top of it. If your NVDA rate is much faster than average, the gap may feel long; press any key and the game does not wait — your key always wins, and anything still owed to you is spoken immediately. P still changes pacing if the rhythm feels wrong, and that is the first thing to try.

## The defensive look

When you are calling the defense, the prompt now starts with what the offense is showing: "They show twenty one personnel," and then your coordinator's suggested call. That personnel read is exactly what the engine's own defensive coordinator is handed, nothing more — real defenses match personnel, and the formation is only revealed at the line, so it is deliberately not announced. On your first defensive snap, before anyone has seen anything, you will hear "No look at their personnel yet" rather than a guess.

## The seed

Shift Tab speaks the seed of the current game as a plain number. Write it down with anything you notice and the whole game can be replayed exactly. Tab is unchanged: the short situation line.

## The play clock, if you use it

Two changes worth hearing, both from the auditor rather than from your notes. Letting the clock expire on your own offensive call now actually announces the delay of game - it had been silently moving the ball five yards since the clock was built. And letting it expire on your own defensive call no longer flags your opponent: the ball is snapped and your defense goes with the call your coordinator suggested, which is what stalling on defense costs in real football.

## What is parked, by your own call

The coin toss and kickoff milestone is agreed in shape and written into ISSUES.md: you call heads or tails as the visitor, the winner chooses receive, kick, defer, or an end, and both sides pick a real kickoff call, with onside kicks riding along. Not started yet. The designated target mechanic stays parked from last session. A possible future clause where your offensive coordinator reads the defensive shell aloud at full verbosity is written down but deliberately left out of this pass, since T already gives you tendencies on demand.

## Where everything is written down

PROGRESS.md has the session 3 entry, including the reasoning ported from your accessible golf audio engine. ISSUES.md moved the whistle, the seed key, and the defensive look to Done. CHANGELOG.md is at 0.4.0. REVIEW_NOTES.md has the accessibility auditor's pass over the new whistle timing. The project is now on GitHub at github.com/1EyeBiney/accessible-football-coach, public, and pushes happen with the work now, per your instruction.
