# Review notes

What the reviewers found, what was fixed, and what was left. Plain prose. Each entry says which file it is about so it can be picked up later.

## Simulation reviewer, session of August 26, 2026, after milestone one

The reviewer read the design sections on hunches, the counter loop, the scheme matrix, live state, the never-omniscient rule, and snap resolution, then read the whole engine and both development tools. It ran the harness and the matrix to back its numbers. Fourteen findings came back. Ten were fixed the same night. Four were left, and they are recorded below with the reason.

### Fixed

Every defensive adjustment now costs the defense somewhere else, which is what section 8.3 requires and what the code did not do. Bracketing the X receiver took twelve points of separation off him and gave nothing to anybody else, so the offense had no counter to the counter and the loop was not a loop. A bracket now opens the other receivers by six, safety help opens them by four, loading the box opens every route by five because a safety in the box is a safety out of coverage, and a spy opens every route by four because the spy is neither rushing nor covering. Measured against Four Verticals from the Spread in cover three, the adjustments now swing the play from twelve point eight yards to eight point three. Before the fix the three numbers were identical to within a tenth of a yard.

Substituting a tired man mid-drive was free. The defense only got its free substitution when the offense changed personnel group, so pulling a gassed guard cost nothing and the trade section 18.3 describes, fresh legs now against the defense resetting, did not exist. A substitution now counts as a substitution however it happened, both when the automatic coach makes it and when the coach answers the question himself.

An offensive holding penalty could erase an interception or a lost fumble, because the penalty branch was tested before the turnover branch. The defense now declines an offensive penalty on a snap that turned the ball over, which is what a real defense does.

Plays wiped out by a penalty were still going into the box score. A forty yard completion called back for holding had already counted as an attempt, a completion, and forty passing yards, and a pass interference incompletion counted as an attempt when real football scores it as no attempt. Nullified plays are now excluded from the statistics and from the hunch log, which means every passing number in the harness was previously inflated by the penalty rate.

Two per cent of kickoffs were being returned to somewhere between the returning team's own fifty and the opponent's one yard line and narrated as an ordinary return. Long returns are now rarer and shorter, and a return for a touchdown is its own much rarer roll.

The injury roll read a player's base toughness rather than his effective toughness, which is the one place in the engine that touched a raw attribute and meant a man already playing hurt got no reduction. It now reads the effective value, as section 26.6 requires.

The quarterback sneak could not fumble and could not draw a holding penalty, because its branch returned before both rolls. That made third and one a zero variance conversion. It can now be fumbled in the pile and it can be held. It is still low variance, which is the point of the play.

The heavy personnel group drew a light box against almost every defensive call, because a box with the same number of defenders as the offense had blockers was being counted as light. Even numbers is a normal box. That was handing inside zone and power a permanent bonus of roughly two yards a carry out of the two tight end set.

The matrix check was hiding that problem, because its middle column asked for a normal box and got a light one, so it printed two light box columns under different labels. The check now asks the engine what box weight each cell actually produces and prints the answer, so it can no longer mislabel itself.

The blitz bonus was being paid twice. Every route got eight points of separation against a six man rush on top of the concept's own value from the pressure matrix, so the quick game collected both and never had a losing look against pressure. The general term is now small and the concept matrix carries the specificity, which is where the football knowledge is supposed to live.

Screens were hard coded to be sack proof and to ignore the hurry penalty. That was an exemption rather than a consequence, so no protection edge, no blitz and no front could ever make a screen a bad call. A screen is now much harder to sack rather than impossible, and a screen thrown into a rush that stayed home is still a rushed throw.

Two findings were against the controller written the same night. The halftime choice to shift attention elsewhere was emptying the offensive coordinator's belief store, which redrew his evaluation bias, so a coach could reroll a bad coordinator's read at will and keep doing it. It now moves him off the subject without wiping what he has learned. And the halftime briefing was reading the opposing defensive coordinator's private hunch to tell the coach what the other side had changed, which is the same violation as a computer coach reading your attributes, only pointed the other way. It now reports only adjustments our own coordinator actually watched them make, and whether he noticed is filtered through his evaluation like everything else. The biggest personnel problem at halftime was also being read straight off raw stamina; it now comes from the coordinator, who is the man whose job it is to watch that.

### Left, with reasons

The intermediate passing concepts are too strong. Going from a short concept to an intermediate one costs eight points of completion and buys eight air yards, which is a bad trade for the defense: Curl and Flat against its worst coverage beats the Quick Game against its best. There is currently no coverage that makes an intermediate concept a bad call, which is exactly what section 26.2 says must not happen. The reviewer's suggested direction is to widen the completion penalty by depth band rather than narrowing the air yards. This is a balance change that moves every passing number in the harness, so it belongs in the balance pass rather than in a night of feature work.

Screens still take no sacks in practice even after the exemption was removed, because a receiver screen is thrown in one and four tenths of a second and pressure almost never arrives that fast. That part is defensible football. Whether the screen game as a whole is too safe is a balance question and it is on the list for the balance pass.

There is dead wood left from the refactor that replaced the old memory counters with belief stores. The header comment in engine/game.js still promises a later pass that has already landed. A comment still says "Stats and memory" using the old name. The expected function is defined and exported but nothing calls it, while the function that feeds it keeps writing every snap. Several functions take a parameter they never use: chooseDefense takes the offensive team and the plays module, offenseLineup takes the players module, kicker takes the players module, score takes the dependency bundle, and describe takes an index and the game. The defensive coordinator files an observation about protection on every pass and nothing ever reads it, because there is no adjustment for our rush winning. None of this changes behaviour, so none of it was worth touching in the middle of a night of feature work, but it should be swept before the code grows.

The step function returns nothing for a kickoff, a punt, a field goal or a quarter rolling over, and returns a result for a snap, so a caller stepping one at a time has to tell "no snap happened" from "the game is over" using a separate flag. That works and the controller does it correctly, but it wants a comment before more of the interface grows around it.

The reviewer did not read the controller in full, because the file appeared after the review started and was not in its brief. Three findings came from a targeted scan of it and two of those were the sharpest in the list. The controller deserves a review pass of its own.

## Accessibility auditor, session 2, after save and load

Scoped to the new save/load feature only: main.js, ui/core.js, ui/screens.js, ui/help_text.js, engine/save.js, plus DESIGN.md 2, 19, and 21. Eight findings, ranked high to low. Five were fixed; three were checked and left with reasons.

### Fixed

Nothing actually stopped the pacing timer or the play clock's own key-press guard from applying to a stray keystroke that landed during the narrow gap between opening the native file picker and its callback firing, and worse, a confirmation opened in that gap was never cleared when the load finished, so the coach's next Enter, meant to accept his resumed game's play suggestion, could instead silently confirm a stale "quit to menu" and throw the game away. enterLoadedGame now clears state.confirm, state.help, and state.viewer defensively on every load, the same way Q already clears help and viewer when it quits.

loadFromFile had no reentrancy guard: a second G or Shift G before the dialog had actually taken focus could open a second hidden file input with its own focus-restore logic fighting the first. It now refuses a second call while state.loading is already true.

ui/dom.js's own focus trap was fighting the file picker it is meant to allow: the trap pulls focus back into the game container from anything outside it, and clicking the hidden file input to open the picker is exactly such a focusin event. A module-level trapSuspended flag, set for the life of loadFromDisk's call, tells the trap to stand down for the one case DESIGN.md 21.10 already carves out as the exception. The input also now carries tabindex="-1" to match the pattern the save-to-disk anchor already used.

Resuming or loading a game that had already reached its final spoke "Resumed." followed by the ordinary situation line, which for a finished game is a stale down-and-distance sentence left over from the last snap, and never spoke the postgame staff review at all. It now speaks "Resumed. Final. [score]." followed by the same review lines a game that ends normally gets, and lands on the final screen rather than the game screen. Reaching this path in the first place needed a fix of its own: G only worked on the game screen, so there was no way to save a finished game to revisit later. G now also works on the final screen, documented in help and the keyboard explorer table for that mode.

A FileReader error (an unreadable file) was routed into the same callback as the coach cancelling the dialog, so a real read failure was announced as "Cancelled." loadFromDisk now takes an optional third callback for a genuine error, distinct from a cancel, and screens.js uses it to say "Could not read that file" instead.

### Checked and left

The auditor's highest-severity finding was that no interceptor layer blocks a real keystroke from reaching the normal key handling during the file-picker gap, only the two timers check state.loading. In practice this window is the few synchronous lines inside loadFromFile between setting the flag and dom.js's own input.click(), which triggers the browser's native, focus-stealing dialog before any further JS runs; there is no async boundary in between for a real keypress to land in. The reentrancy guard and the defensive clearing above remove the worst consequences even if this reasoning about browser timing turns out to be wrong on some platform, so nothing more was done, but it is worth Brian testing directly: press G, then immediately try another key before the dialog visibly appears, on both NVDA and JAWS.

The save-to-disk anchor element in ui/dom.js (a hidden, tabindex -1 anchor created and clicked to trigger the browser download, then removed within a tick) is technically a second standard control beyond the one file picker CLAUDE.md and DESIGN.md 21.10 name explicitly. It predates this session, is never focused or seen by the coach, and there is no other way to start a file download from a static page with no server. Left as a defensible technical necessity rather than a violation of the rule's intent.

A defensive fix (clearing state.confirm on a load) does not have a test exercising the specific race that motivates it, because that race needs an asynchronous file-picker callback and test/shell_test.js's fake dom resolves loadFromDisk synchronously. The fix is cheap and correct on inspection; giving the fake dom a way to defer its callback so this can be driven through a real test is left for later rather than done under this milestone.

## Accessibility auditor, session 2, after the special teams flow

Scoped to the fourth-down suggest-and-accept flow: engine/controller.js's nextPending, victoryFormationComing, specialTeamsChoices, and callSpecial, plus the new ui/screens.js and ui/help_text.js wiring. Four findings; two fixed, two logged as fine or as a documentation gap rather than code.

### Fixed

The F12 keyboard explorer described F on a fourth-down suggestion as "opens the formation list," which is what F does on an offensive suggestion, not what it does here (it opens the fourth-down options list). The explorer's getKeyDescription was mode-aware but not step-aware, and this feature made an existing ambiguity (F already meant something different on offense than on defense) into a three-way one with no way to tell them apart. It now takes an optional step argument and a STEP_KEYS table that is checked before the per-mode one, which also fixes the pre-existing defense case as a side effect: F12 then F now correctly names whichever list F is about to open, on all three kinds of suggestion.

Real keys with no meaning on a fourth-down suggestion (N, D, U, all of which mean something on an offensive suggestion) fall all the way through specialKey unhandled, which is correct - what turns that into a spoken "N does nothing here" for a real coach is main.js's own unhandledLine(), a browser-only function test/shell_test.js's driver never exercises because it calls AF.screens.handleKey directly. Nothing was broken, but the "silence is a bug" guarantee for this specific step rested on untested code. A check was added confirming handleKey returns {swallowed:false, say:null} for such a key, which is the exact contract unhandledLine needs to do its job.

### Checked and left

Whether special teams delegation should be gated by offenseMode alone, with no dependence on defenseMode, was previously decided only in code and argued in DESIGN_PROPOSALS.md, not written into DESIGN.md 8.4 itself. Added as a status note to 8.4, a fact rather than a decision change, so the actual rule is no longer only inferable from a proposals document.

Whether full verbosity should add anything to the fourth-down suggestion the way it adds a play's description on offense was flagged as worth a one-line confirmation from Brian rather than a bug: there is no equivalent detail to add (a punt, a kick, or going for it does not have a scheme description the way a play concept does), so the two verbosity levels being identical here looks correct rather than missing something.

## Accessibility auditor, session 3, after the whistle

The auditor read main.js, the queue segmentation in ui/core.js, the clip pool in ui/dom.js, the boundary placement in ui/screens.js, and offenseShows in engine/controller.js, hunting the class of bug the first audit found in the pacing timer: an asynchronous continuation firing into something the coach has open, and speech lost or doubled across the new gaps. Eight findings, four of them real. All four real ones were fixed the same session, plus two of the theoretical ones cheaply; two were logged and left.

### Fixed

The delay of game penalty was silent, and had been since the play clock was built. The controller's delayOfGame drains its own queue and returns what was said; main.js discarded that return and drained again, which is empty, so the coach heard the must tone and then the next prompt while the ball had silently moved five yards. This is the exact double-drain trap ui/screens.js documents on emit, on the other side of the same contract. main.js now emits what delayOfGame returns. Pre-existing, not introduced by the whistle work, but found by it.

A coach stalling on his own defensive call was rewarded with five free yards. The play clock armed for defensive decisions too, and expiry always charged the offense, who in that situation is the opponent, with delay of game. DESIGN.md 16.5.1 says the offense takes the penalty, and real defenses cannot flag their opponent by dawdling. A defensive expiry now snaps the ball with the coordinator's suggested call and says so; an offensive expiry still takes the flag. Also pre-existing.

After a turnover, the defensive look line reported the coach's own formation as the opponent's. lastOffFormation held whatever offense ran the last snap, with no memory of whose offense that was, so an interception thrown from the Spread produced "They show eleven personnel" about a team that had not lined up yet. The controller now records which team's offense ran the snap, offenseShows only claims a look when it was a look at the team that has the ball now, and the new field rides through a save. The engine's own defensive coordinator is still handed the stale personnel for its first call after a turnover, which is a modeling wart with the same shape; fixing that changes what a seed replays, so it is logged in ISSUES.md for a proper engine pass rather than patched here.

C, pressed during the whistle gap, offered a line the coach had not heard yet, and speaking it doubled the suggestion inside one utterance. The repeat buffer was written when a line was queued; it is now written when the line is actually spoken, carried by a report flag on each queue item, so C always repeats the last thing that reached the coach's ears.

The whistle continuation now re-checks the open-interface guards, mirroring the auto-advance continuation. Today the check can never fire, because only a keypress can open anything and every keypress invalidates the continuation's generation, but the auditor is right that the asymmetry between the two continuations was itself the hazard; the guard and the reasoning are now written at the site. And a keypress now silences a whistle still sounding, not just its continuation, because the coach's key takes precedence over everything, including our own audio.

### Left, with reasons

An exception inside a key handler leaves the timers dead until the next keypress, because the catch path announces the error but does not re-arm. Escape recovers, the announcement tells the coach to press it, and re-arming from inside a failure path risks re-throwing into a loop. Accepted as the safer of the two behaviours; pre-existing shape.

AF.main.restart reuses start() without resetting the whistle generation or in-flight continuations. Nothing calls restart today. Logged so whoever wires a caller to it reads this first.

The auditor also noted that main.js has no Node coverage at all, so the whistle sequencing, the generation counter, and both play clock expiry branches rest on reading and on the browser pass rather than on the suite. True, and worth a harness for the timers eventually; the queue segmentation and the boundary placement that decide what is spoken are covered, at 367 checks.

## Milestone reviewer, session 4, after the coin toss and the kickoff

The reviewer read the deferral refactor in engine/game.js, the new pending kinds and the decision counter in engine/controller.js, the save fields, and the new interface steps, and traced the rng stream, the dead-end states, the overtime and halftime edges, and what each new resolution speaks. Eight findings, six real. All six were fixed the same session; the two theoretical ones are recorded below.

### Fixed

T at the toss called up the coordinator's tendencies instead of calling tails. The info keys in gameKey run before the step dispatch, so the very first documented interaction of a game half-worked: H called heads, T talked about coverages and left the toss pending. The toss keys now run first on that step, and the shell suite's regression presses T, never H, since every driver pressing only H is exactly how this stayed invisible.

A kickoff returned for a touchdown spoke only the extra point. The controller spoke one log line per step, and a step that logs several things - the return, the score, the try - dropped everything but the last. This predates the milestone (an ordinary touchdown also spoke only its extra point) but the return made it new and loud: a seven-point swing with no word of how. Every log entry a step produces is now spoken in order, with terse forms still applying per entry.

The decision counter dropped every punt and field goal, coach-called or not, because those resolve without a snap result and the counter only looked at snaps and kickoffs. A career tally that counts "go for it" but not the punt the same key answered grades identical fourth downs differently by their answer. Fourth-down steps on the coach's possession now count regardless of how they resolved, with a quarter guard so a clock rollover at a stale fourth down counts as nobody's decision.

Tab and Escape during the ceremonies fabricated a possession: "second and goal, ball on their zero" while a kickoff was pending after a touchdown, and the untouched opening state before the toss. The situation line now says who is kicking off, or that the toss is still to come, with the quarter, clock and score that are genuinely true.

Escape on the new steps had no context line, so a coach who backed out of a kickoff prompt heard the situation and nothing about what was being asked. The context line now carries the toss call keys and the pending recommendation, the same as every other suggest step.

A score at zero on the clock deferred a kickoff nobody would play after, and the milestone turned that dead kick into a question - at the end of the second quarter the coach called a kickoff and then immediately got halftime and the real one. A kickoff with no time on the clock is never asked now; it resolves silently, which is what the old synchronous code always did.

### Left, with reasons

The kickoff gate uses offenseMode for both the kick and the receive call, so a coach with offense delegated and defense in hand is not asked about the hands team even in an onside window against him. This follows the fourth-down precedent deliberately - a kickoff is about possession, and the receiving team is the offense about to be - but the reviewer is right that a defense-minded coach might see it the other way. Written down rather than changed; if it grates in play it is a one-line gate.

The reviewer also listed coverage that still does not exist: nothing compares a fully delegated controller game against headless playGame for the same seed (the cheapest guard against controller-versus-headless drift), and nothing asserts what a kickoff-return touchdown speaks. The first is worth writing when the controller is next touched; the fixed speaking bug makes the second less urgent.
