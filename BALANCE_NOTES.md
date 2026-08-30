# Balance notes

What the balance runner measured on the night of August 26, 2026, what was fixed the same night, and what is left. Plain prose with short lists, since this is read with a screen reader.

Two notes on how these were taken. The engine was being changed while the first pass ran, so every figure quoted here was re-taken afterwards against one fixed state of the code. And the numbers below are from before the fixes unless the entry says otherwise; where something was fixed, the after figure is given too.

## The crash

node harness.js 300 11 crashed reproducibly, and so did seed 13. It survived two hundred and forty two games on seed eleven and died on the next one, at a rate of about one game in every three thousand.

The cause was a null quarterback. Both quarterbacks on one roster were injured out of the same game, the lineup builder had nobody left to pick, and it handed a null to the snap resolver. Fixed: if a position is wiped out entirely, somebody else plays there, taken from the nearest position that can cover it and falling back to any healthy player. A high school team that loses both quarterbacks puts an athlete under centre; it does not field ten men. Both seeds now complete three hundred games.

## What was outside its target

Only one number in the harness header was out of band, and it was out by a lot. Fumbles lost were running at zero point three nine a game against a target of about one, roughly forty percent of target, with total fumbles at zero point seven four. The fumble chance on a carry and on a catch have both been raised. After the change, total fumbles are one point one two a game and fumbles lost are zero point five eight. That is much closer and it is deliberately still under target, because a game with a fumble a side every time reads as slapstick rather than as football. It is worth another look with fresh eyes.

Everything else in the header was inside its band, though points sit in the bottom quarter of theirs at around eighteen a team a game against a range of fourteen to thirty five.

Three things that are not in the header are out of bounds for the sport and are not yet addressed. The highest single team score seen was eighty nine points. Four point seven percent of team games end at fifty points or more. And ten point one percent of team games are shutouts, falling to three point five percent when the teams are of equal quality.

## Blowouts

The harness does not report this and it should. Measured separately over five hundred games with the default quality spread: the average margin is twenty three point seven points, the median is twenty two, and one game in four, twenty five percent, is decided by more than thirty five points. More than half of all games, fifty one point two percent, are decided by more than twenty one. Only twenty one point eight percent are one score games.

With equal teams the same run gives an average margin of thirteen, a median of ten, and only four percent over thirty five, with forty four percent one score games.

That factor of six between the two runs is the finding. The harness only varies team quality over plus or minus zero point six, which is a modest roster gap, and the engine is turning it into a blowout one time in four. Real high school football is nearer twelve to fifteen percent over thirty five with about forty percent one score games. Something is compounding a talent edge rather than adding it. This is the largest single gap from real football in the engine and it is not fixed.

## The defensive adjustments

This was the worst finding and it was a fault introduced the same night. Four of the five adjustments were inert or pointed the wrong way.

Bracketing the best receiver made the defense one point zero nine yards a snap worse. Safety help made it zero point eight two worse. Both had been given a bonus to the other receivers that was larger than the penalty to the receiver being covered, so doubling a man was worse for the defense than doing nothing. The bonus is now smaller than the penalty. Measured against Four Verticals from the Spread in cover three, no adjustment gives up nine point nine seven, a bracket eight point five five, and safety help nine point zero five.

Contain did nothing to the run game, which is its whole purpose: four point five three yards against a baseline of four point four six. It now costs the offense one point two yards a carry on an outside run: six point three one with no adjustment against five point zero eight with contain.

Loading the box was the only one behaving correctly and still is, now more strongly. Inside zone from the I formation drops from five point five four to three point three two.

The spy remains the weak one. It cuts the quarterback scramble rate from about fourteen percent to three, but scrambles are rare enough that this does not show up in yards allowed. It is the most called adjustment in the game at around eleven percent of snaps and it changes almost nothing. It needs either a real second effect or to be called far less often.

## Pressure and coverage

Bringing more rushers used to be strictly better with no cost anywhere. Yards allowed fell monotonically: four rushers five point two nine, five rushers four point eight eight, six rushers four point three zero. Cover zero allowed the fewest yards of any coverage at four point zero two while being called on only four percent of snaps.

Two changes were made. The general benefit an offense gets from facing fewer coverage defenders was raised, and a coverage with nobody deep now gives up far more explosive plays, on the ground and through the air, which is the real price of an all out blitz.

After the change, cover zero is no longer the best coverage in the game. It has moved from first to fourth, from four point three eight yards allowed to five point six zero. Six rushers is still the best pressure at five point two zero against five point eight six for four rushers, but the gap has narrowed from zero point nine three to zero point six six and part of what remains is selection rather than balance, because the automatic coach blitzes on obvious passing downs. This is better but it is not finished.

Cover three is still the worst coverage in the game at six point two zero yards allowed, and it is also the most called at about twenty eight percent of snaps. That is not a code fault. It is what the authored scheme matrix says: six of the ten pass concepts carry a positive number against cover three, several of them large. The matrix is authored football knowledge and CLAUDE.md says not to flatten it, so this one is left for the coach to decide. Either cover three deserves fewer concepts beating it, or the defensive play caller should stop calling it a quarter of the time.

The five man rush is never the right answer against anything. It always lands between four rushers and six, so it has no situation of its own.

## The scheme matrix

One concept fails the two yard bar outright: Stick, at one point six between its best coverage and its worst. Five more sit between two and three yards: Mesh, the running back screen, the quick game, the receiver screen, and post and dig. For contrast Four Verticals and the play action shot both spread about seven and a half.

The matrix is doing real work at the top and almost none in the middle, and the five flattest concepts are the five a high school offense actually lives on. That is the shape of the problem worth attacking next, and it is the same finding the simulation reviewer made from the other direction: the intermediate concepts have no coverage that punishes them.

## Where the football still reads wrong

Fixed the same night, all of them things a listener would hear:

Overtime printed a game clock of one hundred and sixty six minutes and counted down from it. High school overtime is untimed; the clock is now silent in overtime and the periods are spoken in words rather than mixing "period one" with "period 2".

The line to gain ran away from the ball. A penalty inside the ten moved the ball only as far as half the distance to the goal but added the full ten yards to the distance, so a series read second and twenty five, then second and thirty five, then second and forty five while the ball moved a few yards. The half the distance rule is now enforced and the distance only moves as far as the ball does. That also removes the first and thirty and second and forty four lines, which do not happen in football.

Goal to go stuck. A penalty that put the ball on the eleven still read third and goal. Goal to go is now a fact about where the ball is, rechecked whenever a penalty moves it. The engine was already right in the other case, where a tackle for a loss legitimately keeps a goal to go series.

A kickoff returned all the way was attributed to the kicking team and never named the team that scored, which for a screen reader first game says the opposite of what happened. It now names the returning team.

A safety produced no free kick line at all, silently skipping the restart that every other score logs. The free kick is now played and announced.

Penalty announcements left out the yardage on thirty nine percent of calls, because holding and pass interference never stated it. Every penalty line now says how far the ball went, and an automatic first down says so.

## Where the football still reads wrong and is not fixed

The game clock does not distinguish a play that stops it from one that keeps it running. Measured over about twenty one thousand consecutive snaps, a run averaged twenty seconds and an incomplete pass sixteen, and around forty percent of clock running plays took six seconds or less. The total lands in the right place by accident, at about sixty four plays a team, but late game clock management does not work. This wants a proper look rather than a quick tune, because the log timestamps and the clock arithmetic have to be read together.

Field goals are attempted when they cannot help. Twenty one times in two hundred games a team kicked while trailing by more than three, including a forty three yard attempt down thirty three with two and a half minutes left, and one in overtime on fourth and goal from the three while trailing by seven, which loses the game even if it is good. The fourth down decision function does not look at the score margin against the value of three points.

Two point conversions effectively do not happen: seventeen in two hundred games, and teams down eight, five or fourteen late kick the extra point.

Extra points miss seventeen and a half percent of the time while field goals from forty to forty nine are made thirty eight percent of the time. The same kicker cannot be that bad from twenty and that good from forty five.

About one punt in ten travels under twenty yards and none of them is described as a shank or a block, so the listener hears an ordinary punt that went ten yards with no explanation.

The play calling is pass first at about fifty eight percent, while every team in the harness is nominally run leaning. High school football is nearer sixty percent run. The lean is being overridden somewhere between the style setting and the weighted pick.

The quarterback sneak gains between one point seven and one point nine yards against a five, eight or nine man box, a spread of two tenths of a yard. A sneak that does not care how many defenders are in front of it is not a sneak.

Deep drop sack rates in isolation are extreme. The play action shot concedes a sack on seventeen percent of snaps against a plain four man rush and twenty five percent against five, while the quick game and the receiver screen take none at all in thousands of snaps. The in game rate of five point six percent is an average of two impossible extremes.

The penalty vocabulary is five items: holding, false start, offside, pass interference and twelve men. There is no facemask, personal foul, illegal block, delay of game on a normal snap, or encroachment. The total rate is in range but it will read repetitively over a season.

## What was checked and is clean

No kneel ever gained yards. No punt was taken from inside the opponent's ten. No team punted while trailing by two scores or more inside two minutes. The game clock never ran backwards. Every final score reconciles with the play by play. Field goal distances are consistent with the ball spot and none is attempted beyond forty nine yards. Overtime possession alternates correctly and starts at the ten, which is the right format.

## Session 2, Milestone 7: cover three, blowouts, and fumbles

Three tuning items from ISSUES.md. Cover three and blowouts were both real and both moved close to target; fumbles were checked and left, with the reasoning below.

### Cover three

Ruled in DESIGN.md 26.2: fix the defensive caller and the run-support value of the extra box defender, trim the matrix only slightly, and confirm the spreads still hold.

Before, on six hundred mixed-quality games (seed 9): cover three was called on twenty-seven point seven percent of pass snaps, the most of any coverage by a wide margin, at seven point five yards a snap by the harness's own weighted measurement across real game situations (a different, hotter number than matrix.js's isolated-scenario figure, since it mixes in every down and distance a real game produces, including the situations a coordinator is right to call it in). After: twenty-three point seven percent of snaps, now close to cover two's twenty-two point six and cover four's twenty-three point one rather than standing well clear of both, at seven point three yards a snap. The call rate moved a full four points toward the rest of the field; the harness-level yards figure barely moved, because it is an average across every situation a real game produces and the fix changes which situations cover three gets called in, not how it performs once called.

matrix.js is the cleaner read on that: Curl and Flat's advantage against cover three came down from ten point one yards to nine point five, and Four Verticals' from ten point six to nine point oh, the two authored trims of two points each landing as roughly a point and a half after the concept's own scaling and randomness. Every concept's spread between its best and worst coverage still holds well clear of the two or three yards that would mean it has no reason to exist: Four Verticals is still eight point three, Play Action Shot nine point oh.

What actually did the work was the caller and the box, not the matrix trim. engine/game.js's chooseDefense used to give cover three a flat base weight of three and a half against every other coverage's zero point four to two, so it won the weighted draw everywhere, including on obvious passing downs where a two-high shell should have been the answer. It now starts at two, the same as cover one, and earns its way back up on first down, short yardage, and heavier personnel (twenty-one and twenty-two personnel both now push it up, where only twenty-two did before), while a long-yardage tag now pushes cover two and cover four up hard and cover three down instead of the mild nudge it got before. Separately, cover three's boxAdd (the extra man its single deep safety frees into the run fit) was raised from one to two, matching cover zero's man-coverage bonus rather than sitting below it, which is what the ruling meant by making sure the extra defender shows up in the run numbers.

One more thing the box change broke, caught by matrix.js's own design rather than by inspection: its run-concepts check represented a "normal" box with OVER front plus cover three specifically, on the reasoning that this combination used to land exactly there. It does not any more - it is now the loaded cell, and because the check asks boxWeight what a cell actually produces rather than assuming, it printed "loaded box of 9" twice instead of silently mislabelling anything. The check's normal cell is now OVER plus cover two, which has no run-support bonus of its own and reliably stays normal.

That box change has a real side effect, reported rather than buried: yards per carry across three separate six-hundred and three-hundred game samples came in at three point nine eight to four point one three, hugging the bottom of the four to five and a half target band and once landing two hundredths under it. Loaded-box carries roughly doubled in the same samples. This is the intended consequence, not a bug: cover three from a nickel front over the most common personnel group now correctly registers as a stout run look instead of a normal one, which is exactly what a safety rolling into the box is supposed to mean. Worth a look if a future balance pass finds the run game getting stopped a little too often, but it was not chased further this session because it is the direct, requested effect rather than a drift.

### Blowouts

One game in four decided by more than thirty-five points, against about one in eight in real high school football, was the number in the last session's report; freshly measured this session before any change, on six hundred mixed-quality games, it was eighteen point eight percent, and four point two percent between equal-quality teams against a target of about one in twenty-five. The even-quality number was already close to its target; the mixed-quality one was not.

Three changes, per ISSUES.md. First, harness.js's own quality draw for a mixed-quality game was minus point six to plus point six; narrowed to minus point three five to plus point three five, which approximates a real ten-team high school league better than a full point wider than that. This is a measurement change, not a gameplay one - the fixed programs Brian actually plays against (Riverton at point one five, Fairview at minus point one) already sit inside the narrower range. Second, engine/game.js's chooseOffense used to only lean run-heavy at a lead of fourteen in the fourth quarter or twenty-one in the third; it now leans at ten in the fourth, seventeen in the third, or twenty-four in the second, and leans harder once it does (point three of run bias instead of point two five), so a big lead starts working the clock earlier instead of staying pass-heavy and adding to the score. Third, fourthDownDecision's aggressive fourth-and-short gambles from a team's own territory (fourth and two from its own forty five or better, fourth and one from its own thirty five or better) are now skipped in favor of a punt when the team is down by more than a score and not yet in the fourth quarter's last five minutes - the same deficit that later makes it desperate, just before the point where the gamble is actually worth the risk. A team already in that final five-minute window is untouched: the gamble is the right call there.

After: eight point seven percent of mixed-quality games decided by more than thirty-five, against a target of about twelve and a half; three point three percent between equal-quality teams, against a target of about four. Both now sit close to target, mixed-quality slightly under rather than over. Every other harness number - completion rate, sack rate, interception rate, penalties, punts - stayed inside its target band across the same runs; the full numbers are folded into the cover three section above since both fixes were measured together.

### Fumbles lost

Left alone, per the "otherwise leave it and say so" the kickoff offered. Fumbles lost measured zero point five eight to zero point six eight a team a game across this session's harness runs, against the roughly zero point eight target, with total fumbles (a rough proxy for the underlying chance, since the harness does not currently split fumbles by rush versus pass) at one point oh four to one point one four. The previous balance pass already raised this once, from zero point three nine lost to zero point five eight, and stopped deliberately short of the full target because a fumble a side every game reads as slapstick rather than as football, and because pushing the per-carry chance any higher risked exceeding real high school fumble rates, which by rough estimate from these same numbers (fumbles concentrated on carries, roughly twenty six and a half attempts a team a game) are already at or above the two percent per carry that real football sees. Nothing new in this session's measurements changes that reasoning, so it was left where the last balance pass put it rather than pushed further on the strength of the same argument that already applied.

## Session 6, Milestone 15: the defense's fourth down

This milestone gave the defense real calls against a shown kicking unit - return, block, or safe against a punt; rush or safe against a field goal - and the computer defense uses them from the same public arithmetic the human's gate reads (block a punt only in the desperation window; rush every field goal, which is the standard call). That changes what a seed replays and adds new events, so three hundred even-quality games were run before and after.

Before, per team per game: 17.7 points, 66.2 plays, 5.5 punts, completion 57.1 percent, 4.00 yards a carry, average margin 13.1, 2.7 percent of games decided by more than thirty-five.

After: 17.5 points, 66.0 plays, 5.5 punts, completion 57.3 percent, 3.98 yards a carry, average margin 12.4, 2.0 percent decided by more than thirty-five. Every header target stays inside its band; the small dip in points and field goals (0.7 a game against 0.8) is the field goal block existing at all.

The block rates, measured directly: a committed rush blocks about one punt in twenty-five when called (the test pins it between one in three hundred and forty in three hundred), and about one field goal in eighty (five of four hundred forced rushes). In headless play punt blocks are rarer still, because a team desperate enough for the window usually goes for it rather than punting into it - sixty full games produced no block at all, which at these per-kick rates is within expectation, and the forced-call samples above are what verify the mechanics rather than the luck of one run.

The stale-personnel fix rode along in the same pass: the engine's defensive coordinator no longer reads the other team's formation for one snap after a turnover, drawing instead on the per-team memory the Z key uses. Its effect is confined to controller-driven games (the headless snap path always used the true formation), so it shows in no harness number, but it reorders suggestion draws, which is why it belonged in this milestone's seed break rather than a patch of its own.
