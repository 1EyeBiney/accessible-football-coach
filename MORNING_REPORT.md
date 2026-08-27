# Morning report

Written overnight, August 27, 2026. Everything below is plain prose. Read it top to bottom; the first two sections are what you need to get a game running, and the rest is what happened and what I need from you.

## What to open

Open index.html in the project folder in any browser. Double clicking it is enough. There is nothing to install, no server, and no build step.

Your screen reader will find one button that says Press Enter to Begin. Press Enter on it. That click is what lets the browser make sound, so it has to be a real key press on the button. From that moment the button disappears, focus moves into an application container, and every key you press goes to the game rather than to the browser. F5, F6 and F11 still reach the browser, and so do control R and control F, so you are never trapped.

If you would rather read the game than play it, node harness.js 1 21 --log prints one whole game as text, one line a play.

## The exact keys from the button to the first snap

Press Enter on the button. You hear a welcome line telling you that F1 is help and F12 describes any key.

You are now on the main menu, and you hear Accessible Football, main menu, and the first item, which is New game. Press Enter.

You are on the team choice. You hear a description of Riverton, which is a settled programme that runs the ball, with a good line, a steady quarterback and an experienced staff. Down arrow describes Fairview, which is young, throws it about, has speed outside and nothing up front, and an inexperienced staff. Riverton is the easier of the two and the better first game. Press Enter on whichever you want.

You are on the pre-game screen. You hear which team you coach, who tonight's opponent is, the names and personalities of your offensive coordinator, defensive coordinator, spotter and trainer, and a line telling you that nobody has scouted the opponent so everything you hear tonight your staff works out as the game goes on. You also hear the current settings. Press Enter to kick off.

That is four Enters in total from the button to the opening kickoff.

## What to listen for on the first three plays

On the first play you will hear the situation line, then your coordinator's suggestion. The suggestion is one line: the play, the formation it comes from, and his confidence in words. If the formation he wants changes personnel, you will hear the word sub inside that line, and that matters, because substituting hands the defense a free substitution too. If you have full verbosity on, which is the default, you also hear a sentence saying what the play is and what it is good against.

Press Enter and the play happens. You hear the down and distance, where the ball was, the concept and the formation you ran, the coverage and the pressure the defense was in, what happened, and then in brackets who beat whom. That last part is the events the engine produced, and it is the same information your staff is watching, so it is worth listening to for a few plays even though it is long. Press V and the next play will be one line instead: down, distance, spot, and what happened.

On the second and third plays, listen for two things. First, whether a short sound arrives before the words. There are three: a higher one for your offensive coordinator, a lower one for your defensive coordinator, and a bright one for the spotter. When you hear one, press the spacebar to hear what that person has for you. Reports are not expected on most plays, so a chime means something has actually been noticed. Second, notice that your coordinator says he is guessing early on. He has not seen enough yet. His confidence should firm up over the first two or three drives, and if he is a good coordinator it will firm up sooner.

The thing to test on the first three plays is whether the loop feels right: result, then any chime, then the suggestion, then your call. If it is too much talking, press V for terse. If it is too fast, press P to change the pacing. If your staff is too chatty, press B to set reports to important only.

## The keys

Everywhere: F1 help, F12 keyboard explorer, Tab situation, C repeat, P pacing, V verbosity, Escape back, Q quit.

Calling a play: Enter accepts the suggestion. F opens the formation list and then the call sheet for this down and distance. N is no huddle. U opens the substitution list. D expands the play to hear how often you have called it and how often it has worked.

Listening: spacebar plays a waiting report. M reads the three matchups your coordinator feels strongest about. T reads what he has worked out about what this opponent likes on this down and distance. R reads the notes that have collected. X examines who is on the field, who is resting and who is hurt. B changes how much your staff tells you.

Answering a substitution: Y takes him out now, N leaves him in, L waits for the next personnel change, K waits for the next dead ball. The play cannot be called until you answer.

Handing a side over: O cycles who calls the offense and E does the same for the defense. Each has three settings: you call everything, the coordinator calls everything, or the coordinator calls and stops you for the ones that matter. That third setting is the one the design expects you to live in and it is worth trying tonight; the game runs on its own and stops you on third and fourth down, in the red zone, in the last two minutes, and when a coordinator is sure about something.

Every key above is in F1 help for the screen you are on, and F12 will describe any key you press without doing anything, which is the safest way to explore.

## What was built overnight

Three milestones and two rounds of review fixes, in nine commits. Nothing was pushed.

The staff knowledge model, engine/staff.js. Every member of your staff now keeps a belief store for the game, fed only by what happened on the field, and hands you hunches with a confidence in words. Their Evaluation decides how wrong they are about a given matchup and how many looks they need before they will say anything; their Communication decides how long after that they take to tell you. Both automatic coaches now call plays from beliefs rather than from counters, so the counter loop runs off what the other coordinator thinks he has seen.

The game controller, engine/controller.js. This is the only thing the interface talks to for a game. It knows what input the game needs next, what your coordinator suggests, and what to say after every snap and in what order. Halftime, the postgame review, the three delegation modes and the play clock all live here.

The playable shell. index.html, four files in ui, and main.js, built to the Accessible Golf model. One container, one focus trap, one keydown listener with ordered interceptors, one live region, everything sanitised for speech, chimes made with oscillators so there are no sound files, help split by screen with audible headings, and the F12 explorer.

## What the reviewers found

Three read-only reviewers were run: a simulation reviewer over the engine, an accessibility auditor over the whole interface, and a balance runner over two thousand games of output. Between them they found forty six things. Twenty eight were fixed overnight. The rest are written up in REVIEW_NOTES.md and BALANCE_NOTES.md.

Three are worth your attention because they were not small.

The counter loop was not a loop. Bracketing your best receiver changed the result of Four Verticals by a tenth of a yard, because your quarterback simply threw to the second read. Two things were wrong: the quarterback was picking the most open man on the field regardless of what the play was designed to do, which made the order of a concept's reads meaningless, and no defensive adjustment cost the defense anything anywhere else. Both are fixed, and a bracket now costs the offense real yards. This is the mechanic section 25 names as the test of the whole prototype, so it mattered more than anything else on the list.

Nobody ever got tired. Stamina drained by two point four a snap and recovered by three point two, and since your unit is on the field about half the time, every player finished a game fresher than he started. The lowest stamina figure on a roster after a full game was eighty two; a coordinator asks for a substitution below about forty five. So the substitution flow, the gassed reports, the fresh legs against the defense resetting trade, and the recovered player announcements were all dead code that had never executed once in any game. A game now produces between ten and eighteen substitution requests. A second bug in the same place meant that even once players did tire, the question would have been answered by the computer instead of being put to you.

The pacing timer pressed Enter into whatever you had open. Press Q to quit, think for a moment, and it confirmed the quit for you and threw the game away. Press F1 on any fourth down and help closed itself mid-sentence while a punt ran. Turn on the keyboard explorer during a delegated drive and it talked over you every few seconds forever. It now refuses to fire while anything is open, and so does the play clock.

## What is not built yet

Saving and loading a whole game. This is the one piece of the night's scope I deliberately left. G writes the play by play to a file and to your clipboard, but a game in progress is not saved anywhere, and reloading the page loses it. The help text says so. Serialising the game state means dealing with the references between players, lineups and the controller, and I was not willing to start that on a working tree at the end of the night.

Everything the design has beyond one game. No weekly Focus screen, no call sheet built the night before, no scouting or film, no practice, no recruiting, no career, no legacy. The kickoff said not to start any of it and I did not.

Pre-game hunches from scouting. Your coordinators tell you who they are before kickoff, but they have nothing to say about the opponent, because nobody has scouted anyone. Everything they learn, they learn during the game.

The special teams flow. Section 8.4 wants the special teams coordinator to suggest and you to accept, the same as the other two. For now the game recognises when the next snap belongs to the special teams and plays it without asking, which is honest but it is not the design.

## What the numbers say

Over three hundred games between equal teams: eighteen points a team a game, sixty six plays, fifty eight percent completions, six point nine yards an attempt, four point two yards a carry, five point six percent sacks, two point seven percent interceptions, five point seven penalties and five point two punts. Every one of those is inside the target range in the harness header.

The hunch model passes its test. At the final whistle a poor offensive coordinator names the receiver who really was winning about thirty nine percent of the time, an average one about forty six percent, and a good one about sixty two percent, and the man a good one names is on average a yard and a third of edge away from the best one against three and a half for a poor one.

The scheme matrix is sharper than it was: Four Verticals and the play action shot both spread about seven and a half yards between their best coverage and their worst.

## The decisions I need from you

Three, in the order I would want them answered.

First, and this is the important one. A good offensive coordinator identifies the right matchup roughly one and a half times as often as a poor one, and that is a clean, stable result across every seed. But it is worth only about one to three points a game on the scoreboard, and on some seeds it is worth nothing at all. Section 5.3 reads as though a coordinator should matter more than that. The reason he does not is that his read changes which concept gets called but nothing inside the concept, so the gain is the difference between a well chosen play and an averagely chosen one. Leaning harder on the scheme matrix makes it worse rather than better, because the offense over-commits and becomes predictable. If a coordinator should be worth more, the lever is a design decision, not tuning: either defenses should be slower to vary so a read stays good for longer, or a coach who has called a play specifically to attack a matchup should be able to tell the quarterback where the ball is going before the snap. Both are in DESIGN_PROPOSALS.md. Which way do you want to go?

Second, section 26.3 says the quarterback picks the best open read. I have changed him to work the concept's progression in order and throw the first read that is open enough, because taken literally the old wording made every concept with the same depth and the same matrix row into the same play, and made bracketing free for the offense. I think this is a detail rather than a change of shape, and section 26 is marked decided in shape with details open, but it is different from what the words say and you should sign it off or send it back. The argument is written out in DESIGN_PROPOSALS.md.

Third, cover three is the worst coverage in the game, giving up six point two yards a snap, and it is also the most called at about twenty eight percent of snaps. That is not a bug. It is what your scheme matrix says: six of the ten pass concepts carry a positive number against cover three and several of them are large. CLAUDE.md tells me not to flatten the matrix, and I have not touched it. Either cover three should have fewer concepts beating it, or the defensive play caller should stop calling it a quarter of the time. That is your football, not mine.

One smaller thing, if you want it. One game in four is decided by more than thirty five points, against about one in eight in real high school football. With equal teams that falls to one in twenty five, so a modest roster gap is being turned into a blowout somewhere. I have not chased it because it is a tuning problem rather than a fault and I would rather you saw the shape of the game first. It is measured in BALANCE_NOTES.md.

## Where everything is written down

PROGRESS.md is the running log, one section per milestone, in the order the work happened. REVIEW_NOTES.md is what the simulation reviewer and the accessibility auditor found, what was fixed and what was left, with reasons. BALANCE_NOTES.md is two thousand games of measurements, including the numbers behind everything above. DESIGN_PROPOSALS.md is the two arguments about the design and the one open question. CHANGELOG.md is at 0.2.0.
