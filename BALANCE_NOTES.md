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
