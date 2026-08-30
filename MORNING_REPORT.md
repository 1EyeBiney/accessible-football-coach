# Morning report

Written August 29, 2026, after session six. Your six play notes went in as four milestones; the sliders idea is written up for your ruling. Everything is committed and pushed, the test suite is at 724 checks, and the balance numbers held through all of it.

## The whole game asks you now

This session's theme, looking back at your notes, was one thing: every decision a real head coach makes is now yours, on both sides of the ball. Open index.html and play a drive of defense and you will hear most of it.

Their fourth down is your call. When they show the punt unit: "They show the punt unit. Set up the return. Enter accepts, or F for your other calls" - the block and punt safe are behind F. The block is a real gamble: about one punt in twenty-five when you call it, paid for in return yards, and a fake gains against a committed rush. When they show the field goal unit, Enter rushes the kick and F offers field goal safe. And when they keep the offense out there, you call a defense like any other snap - that was your exact note, "the play just ran," and it cannot any more. The computer makes the same calls against you from the same public logic, so a block can happen to you too.

The try is your call. After your touchdown: Enter kicks, F goes for two. The two-point try is a real snap from the three and you finally hear what was run - the old line said "two point try fails" and nothing else. On the stop-me setting your coordinator only interrupts when the score genuinely makes two worth a thought.

The flag is your ruling. A live-ball penalty in your favour waits for you, and you hear exactly what a real coach gets from the referee: the play, the flag, and both futures. "Accept: second and seventeen at their forty five, replay the down. Decline: the play stands, third and two at their fifty two. I would take the penalty." Enter takes your coordinator's call, F offers the other. Flags with one sensible answer - pass interference, anything before the snap - are ruled automatically as they always were. Worth knowing: the computer defense now declines bad penalties too, about one holding call in twelve, where it used to accept every one. Your opponent got smarter this session.

## The smaller keys, from your other notes

S says the last play again, always. You were right that C could not do this job - checking anything with Z, X or Tab overwrote it. S walks back to the last action and brings everything that followed: the touchdown and the try ride along with the play that scored. During a flag, S says the snap under the flag.

Tab now leads with the possession, in your suggested wording: "third and four. Fairview ball, own eighteen." Own and opponent are relative to the team just named, so there is no pronoun to resolve.

Z remembers across drives now: on a new possession it says "The last time they had the ball, they showed twenty one personnel from the I Formation" - never claiming to be last snap - and only says there is no look yet before you have faced that unit at all.

## Your sliders idea, written up for your ruling

Proposal 6 in DESIGN_PROPOSALS.md. Your three questions are answered from the code, and one answer will interest you: your defensive coordinator's observe-and-adjust loop is real and closed, but the offensive side is open - "they are bracketing your X receiver" is collected, reported to you once at halftime, and then acted on by nobody, on either team. Your OC never calls away from a bracket he has seen, and neither does theirs. Also: two of the five halftime choices currently do nothing at all, which the proposal documents plainly.

The proposal's recommended order, when you rule: close that offensive loop first (it is arguably a bug, not a feature), then build directives - a short authored list of standing instructions per coordinator, "take away their back," "attack their corner," in words rather than sliders, filtered through the same staff attributes as everything else and available to the computer coach on equal terms - and then make the halftime menu honest. Say the word and any or all of it gets built.

## Two things to listen for and tell me about

The flag prompt describes the play, and then the resolved line describes it again with the ruling attached. The reviewer flagged the repetition as a judgment call only you can make: does hearing the play twice reassure or wear? Related: the snap cue plays when you commit a ruling, a snap sound before something that is not a snap. Both are one-line changes if they grate.

And the block call's price - the halved return - plus the one-in-twenty-five payoff: does the gamble feel worth it at your ear, or should it bite harder and cost more?

## Known and parked

The two-point try still ignores penalties entirely - a false start ends it instead of replaying it, and holding on a successful try reads contradictory - all one wart, logged for its own engine pass. The "later" answers to a substitution request (L and K) turn out to be promises nothing keeps: the player is never pulled. That predates everything this session and is logged for the next fix pass; until then Y and N do what they say. Overtime flags take the rule rather than asking you, a documented compromise. The offensive line still slides positions when you rest one man, from last session's list.

## Where everything is written down

PROGRESS.md has all four milestones. ISSUES.md moved your five built notes to Done and holds the steering proposal under Needs a decision. CHANGELOG.md is at 0.9.0. BALANCE_NOTES.md has the before-and-after numbers for the two seed-breaking milestones - every band held. REVIEW_NOTES.md has both reviewer passes, including an eighty-game proof that the penalty machinery moved no randomness. All pushed to github.com/1EyeBiney/accessible-football-coach.
