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

## Proposal 3, sections 8.4 and 25: the special teams flow, without a fourth coordinator

Section 25's practical decisions for the first playable say special teams should be "in the engine in a simple form... without the coordinator flow," and that is what exists today: punts, field goals, and kickoffs happen automatically, and section 8.4 (still marked Decided) says they should instead be "called by the special teams coordinator with the same suggestion-and-accept flow" the offense and defense already have. I read these as sequencing rather than contradiction: 25 describes the minimum for a first pass, 8.4 the shape the game grows into, and ISSUES.md and KICKOFF-2.md's instruction to build the flow now is the decision to take that step. Nothing here overrides either section; this entry is about what the flow is built out of.

Section 5.1 names a special teams coordinator as one of the full staff, with the same attribute list as the offensive and defensive coordinators (Evaluation, Scheme, Communication, and so on) and, by the pattern engine/staff.js already uses, his own belief store and confidence built up from observed events over a game. I did not build that. A fourth full coordinator is the same shape of work the offensive and defensive coordinators took a whole milestone to build, for a decision that is far more mechanical than reading a receiver's separation: whether to punt, kick, or go for it on fourth down is close to solvable from the down, distance, field position, score, and clock alone, the way engine/game.js's existing fourthDownDecision already does it. Inventing Evaluation and Communication scores for a fourth coordinator to be sometimes wrong about arithmetic felt like manufacturing a belief model for a decision that does not need one, and CLAUDE.md's caution about not adding things without a reason applies as much to a staff role as to a player attribute.

What is built instead: the fourth-down call (punt, field goal, go for it, fake punt, fake field goal) goes through the same suggest-and-accept grammar as the other two sides, gated by the offense's delegation mode, with confidence wording drawn from how one-sided the situational math is rather than from an evaluation attribute, and announced with source 'ST' so it reads and chimes distinctly. If Brian wants a real special teams coordinator later, with his own personality and a stake in the postgame review, this flow is the natural place to plug an Evaluation-driven belief store in without changing the interface contract.

What is still not built: onside kicks, and any suggest-and-accept moment around a kickoff itself. KICKOFF-2.md's wording ("the special teams coordinator suggests punt, field goal, go for it, or the kickoff") reads as though accepting "the kickoff" is itself a moment in the flow, presumably so a trailing coach can call an onside kick instead. The engine has no onside kick mechanic at all right now — kickoff() only knows touchback, short return, and long return — and adding one honestly (a real recovery rate, a real risk of a short kick going out of bounds, coverage) is its own piece of engine work, not a UI wrapper around something that already exists the way the fourth-down decision is. Left for a later milestone; recorded in ISSUES.md.

## Open question 1, section 5.3: how much a coordinator should be worth on the scoreboard

The belief model works: over three hundred games, a good offensive coordinator names the receiver who really is winning about sixty-nine percent of the time and a poor one about forty percent, and the gap is stable across seeds.

Turning that into points is another matter. With identical rosters and only the staff differing, a good offensive coordinator is worth roughly one and a half points a game over a poor one. That is a real effect but a quiet one, and it is quieter than section 5.3 reads as intending.

Two things cap it. The first is that a coordinator's read changes which concept gets called but not what happens inside a concept, so the gain is the difference between a well chosen concept and an averagely chosen one rather than the difference between a good matchup and a bad one. The second is that leaning harder on the scheme matrix does not help: pushed further, the offense over-commits to one answer, becomes predictable, and a good coordinator ends up worse than an average one. The current weight sits at the top of that curve.

If a coordinator should be worth more than this, the lever is probably not the weighting. It is more likely either that the defense should be slower to disguise and vary, so a read stays good for longer, or that a coordinator's read should reach inside the play, for instance by letting a coach who has called a play specifically to attack a matchup tell the quarterback where the ball is going before the snap. Both are design decisions rather than tuning, which is why this is a question rather than a proposal.
