# Morning report

Written August 29, 2026, after the listening pass and the naming pass. Plain prose, as always. Two milestones went in, both from your play notes and our conversation about the "X beat Y" lines. Everything is committed and pushed.

## What to open, and the first thing you will notice

Open index.html the way you always do, Enter to begin, through the menu and the team choice to the pre-game screen, and Enter again for the coin toss.

The first thing that is different is on the very first play. You will hear a low short blip, then what happened, then the referee whistle, then the down and distance, then the set tone, then the next call. The blip is the snap: everything after it belongs to the play, everything before it was you deciding. That is the boundary you asked for between the suggestion and the description, and it is the one thing I would most like your ear on, because I could only check its timing in a browser without a screen reader running.

The second thing is the names. Where the game used to say "Marcus Webb beat Terrell Jones" it now says "nose tackle Webb beat right guard Jones". Every player has a position now, on both sides of the ball.

## The three new keys

Z is the mirror of X. X is your own setup; Z is what the other team had on the field on the last snap. On offense it names the front they ran and how many linemen, linebackers and defensive backs were in it. On defense it names the formation and the personnel they showed - which the pre-snap prompt deliberately will not tell you, because the formation is hidden until the line, but by the time you press Z the snap has happened and you have earned it. If you have not seen that unit yet this possession it says so rather than guessing.

I turns the play hints on and off. A hint is your coordinator's note about what a concept beats and loses to, on the suggestion and on the call sheet both. It used to be tied to V, which meant you could not have the full play by play without the tutoring; they are separate settings now.

A sets how players are announced, cycling position and name, position only, and name only. It also says the last play again in whatever setting you just landed on, so you can hear the three side by side and pick rather than guess. Name only gives the whole name, not the last name, because fifty surnames are spread across the eighty men who dress and you were getting "Fletcher beat Fletcher" about twice a game.

All three work everywhere, and I and A also work on the pre-game screen, where Tab now reads them back with everything else.

## What the positions actually mean, because it is not quite one rule

On defense, a position stays with a man all game. It follows his place on your depth chart, so it survives you resting him, changing fronts around him, or anyone in front of him going down. That is what makes it something to learn him by. It is honestly a convention rather than a real alignment - the engine models position groups, not where a man lines up - and DESIGN.md 4.4 says so plainly.

On offense it is the job on the field instead, because those slots are real positions. A back filling in while your starter gets his legs back really is called the running back while he is out there. So you will hear the same man called two things across a game on offense, and that is correct rather than a bug.

One thing that came out of this and is written down rather than fixed: your offensive line slides a position when you rest one man. Bench the left tackle and the left guard becomes the left tackle, the center becomes the left guard, and so on. Real teams put a backup tackle at tackle. The naming made that audible rather than causing it, and fixing it changes which lineman blocks which defender, so it wants its own pass with the harness run before and after.

## The ball position, which you were right about

You heard "ball on our own 25" on defense when the ball was on their 25. Where the ball is was being worked out from the offense's point of view rather than yours, so on defense every spot in the game had the wrong possessive. It is now worked out from your side of the ball and is right on both sides.

Two things fell out of fixing it. You had been hearing the same spot named two different ways inside a single utterance - "at their twenty four" from the situation line and then "at opponent twenty four" from the play by play - because there were two formatters with two vocabularies; there is one now. And "kickoff returned to the our own thirty eight", which was the new wording meeting an old template.

Several lines were also running straight into the next sentence for want of a full stop. The touchdown into the extra point was the frequent one: "Touchdown Riverton extra point is no good." Kickoffs, punts, field goals, safeties, the coin toss, halftime and overtime all had it.

And one that predates everything and was audible in every game you have ever played: the situation line said "three quarter, twelve minutes" where it meant "third quarter".

## What is parked, and why

Special teams still name nobody, in any mode, so you never meet your kicker, your punter or your returner. That is a gap in the naming idea rather than a defect in it, and it is written into ISSUES.md rather than bolted onto the end of a milestone.

Z says "no look at their offense yet" on the first snap of every new drive, even in the fourth quarter against a team you have watched all night. The guard behind that is deliberate - it is what stops Z ever reporting your own unit as theirs - but your memory is not per-possession and the wording should probably be "the last time they had the ball". It needs a small decision from you about how stale information should be presented, so it is logged rather than guessed at.

The question your third note raised, whether the defense should see your personnel and get a chance to answer it with a substitution, is written up in full as DESIGN_PROPOSALS.md proposal 5 - the football reasoning, what it would cost, and why it belongs in the same pass as the stale-personnel bug already logged. You chose to have it written up rather than built, and I think that was right: it changes the snap order and therefore what a seed replays.

## What I need from you

Mostly just your ear on the snap cue's timing, the same way the whistle needed a second pass. It fires as soon as you commit and the result waits on the end of the tone, so it should feel tight, but you are the one who can tell.

After that, whether position and name is the right default or whether you would rather start somewhere else, and whether the position labels themselves sound right to you - "left end", "nose tackle", "mike linebacker", "nickel back", "X receiver", "right guard". Those are authored and easy to change.

## Where everything is written down

PROGRESS.md has both milestones in order. ISSUES.md moved your three play notes and the naming work to Done, and gained the two new items above. CHANGELOG.md is at 0.7.0. REVIEW_NOTES.md has both reviewer passes in full, including what they checked and found fine. DESIGN.md gained section 4.4 on the position labels. Test suite is at 582 checks across eight files, up from 413 when the session started; the harness and the matrix are byte for byte what they were, because none of this touches how a snap resolves.
