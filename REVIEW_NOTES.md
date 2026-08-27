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
