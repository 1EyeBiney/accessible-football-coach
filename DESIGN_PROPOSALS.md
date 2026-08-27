# Design proposals

Arguments about decisions in DESIGN.md, written from the code. Nothing here changes a decision. Each entry names the section it is about, says what the code does now, and says what I think should change and why. Brian decides.

## Proposal 1, section 26.3: the quarterback works a progression rather than picking the best receiver

Section 26.3 says the quarterback's Decision "picks the best open read". The first implementation took that literally: it ranked every receiver in the concept by separation and threw to whichever was most open, with a chance of an error that sent the ball somewhere else instead.

That has a consequence the section probably did not intend. If the quarterback always finds the most open man, the order of a concept's reads means nothing, and so a concept is only its scheme modifier and its air yards. Two concepts with the same depth and the same matrix row become the same play. It also makes the quarterback perfect in a way no quarterback is, and it quietly removes the point of a coordinator telling you which matchup is winning, because the quarterback was going to find that man anyway.

The code now walks the reads in the order the concept defines them and throws the first one that is open enough, accepting less separation the deeper into the progression it goes, and adding a small accuracy penalty for each read passed over. A decisive quarterback pulls the trigger sooner. Nothing came open means he comes back to the best of a bad set, which is the old behaviour as a fallback.

I read this as a detail rather than a change of shape, since section 26 is marked decided in shape with the details open, and section 26.3 already describes the concept as defining "a progression of two or three reads". But it is a different behaviour from what the words say, so it is written down here.

What it bought, measured: bracketing the X receiver against Four Verticals used to change the result by a tenth of a yard, because the quarterback simply threw to the second read. It now costs the offense two yards a snap, and safety help costs three. The counter loop in section 8.3 does not work without this.

## Proposal 2, section 8.3 and 16.5: defensive staffs need situational tendencies for tendency tracking to mean anything

Sections 8.3 and 16.5 both assume the offense can read what a defense likes to do, and section 16.5 names "what its tendency tracking says this offense does from that look" as an input to the defensive call. The engine had no tendencies on either side. Each defensive call was drawn fresh from a weighted list every snap, so the coverage on the next play was very close to independent of everything that had come before.

The effect was that reading a defense was worthless. A coordinator could watch a defense all night, correctly identify the coverage it played most often, and gain almost nothing, because the modal coverage was only going to appear on about a third of the snaps anyway. That in turn made the scheme matrix, which is the largest single lever in the engine and spreads eight or nine yards between a concept's best and worst coverage, almost unreachable by good coaching.

The code now gives every defensive staff a preference by down and distance, generated when the team is made, along with a strength that says how strongly they lean on it. Some staffs are heavily patterned and can be read; some mix it up and give a coordinator nothing to work with. The offensive coordinator's belief store counts coverages by situation rather than in the aggregate, needs to see a habit repeat before he will commit to it, and will not commit at all to a defense whose most common call is under about a third of its snaps.

This is additive rather than contradictory, so I have not treated it as a change to a decided item, but it is a mechanic the design implies without describing, and it may deserve a paragraph of its own in section 8.3.

## Open question 1, section 5.3: how much a coordinator should be worth on the scoreboard

The belief model works: over three hundred games, a good offensive coordinator names the receiver who really is winning about sixty-nine percent of the time and a poor one about forty percent, and the gap is stable across seeds.

Turning that into points is another matter. With identical rosters and only the staff differing, a good offensive coordinator is worth roughly one and a half points a game over a poor one. That is a real effect but a quiet one, and it is quieter than section 5.3 reads as intending.

Two things cap it. The first is that a coordinator's read changes which concept gets called but not what happens inside a concept, so the gain is the difference between a well chosen concept and an averagely chosen one rather than the difference between a good matchup and a bad one. The second is that leaning harder on the scheme matrix does not help: pushed further, the offense over-commits to one answer, becomes predictable, and a good coordinator ends up worse than an average one. The current weight sits at the top of that curve.

If a coordinator should be worth more than this, the lever is probably not the weighting. It is more likely either that the defense should be slower to disguise and vary, so a read stays good for longer, or that a coordinator's read should reach inside the play, for instance by letting a coach who has called a play specifically to attack a matchup tell the quarterback where the ball is going before the snap. Both are design decisions rather than tuning, which is why this is a question rather than a proposal.
