# Kickoff, session 2

Read CLAUDE.md, then PROGRESS.md, MORNING_REPORT.md, REVIEW_NOTES.md, BALANCE_NOTES.md, DESIGN_PROPOSALS.md, and ISSUES.md. Then read DESIGN.md sections 8.3, 8.4, 16.5, 21.10, and 26.3, which changed since your last session: both of your proposals were accepted and recorded, the designated target mechanic was decided, and cover three was ruled on. Run node test/run.js, node harness.js 100 1 --even, and node matrix.js and paste the outputs into PROGRESS.md as this session's baseline. Commit nothing until the baseline is recorded.

Work the milestones in order. Commit after each. Stop cleanly wherever you reach. Update ISSUES.md as you go: items you fix move to Done with a one-line note; anything you cannot decide goes under Needs a decision.

## Milestone 5: fixes from play and the before-next-build items

First, anything Brian wrote in ISSUES.md under From play. Reproduce each one from its seed where he gave one, fix it, and note what changed. If an item is a design question rather than a bug, move it to Needs a decision and carry on.

Then save and load per DESIGN.md 21.10 and CLAUDE.md. Serialise the whole run state, which for now is one game in progress plus settings, to JSON: players by id with their live state, both rosters and depth charts, playbook execution and call counts, both staffs and their belief stores, the controller's phase and pending input, the game state, and the log. Rebuild every object reference on load. The crash copy goes to localStorage after every snap and is offered on the main menu as Resume. The file save is a browser download; the file load is the native picker, the one standard control allowed. Write test/save_test.js: play twenty snaps through the controller, save, load into a fresh controller, play the same twenty further snaps in both with the same seed, and assert identical logs.

Then the special teams flow per DESIGN.md 8.4 and ISSUES.md: on fourth down and after scores the special teams coordinator suggests punt, field goal, go for it, or the kickoff, with confidence wording, and the coach accepts with Enter or picks another option, using the same grammar as the offensive and defensive calls. Fake punt and fake field goal are options with real risk. Delegation modes apply to special teams as they do to the other sides.

Spawn the accessibility auditor from KICKOFF.md over the changed screens. Fix real findings. Commit as "Milestone 5: play fixes, save and load, special teams".

## Milestone 6: the designated target

Implement DESIGN.md 26.3, the designated target, end to end. In engine/resolve.js the pass phase accepts an optional target role: the quarterback starts his progression at that read and gives it the benefit of the doubt, with the costs the section describes when the target is covered or bracketed, and forced targets feed the defense's exploitation counter faster. In engine/staff.js the coordinator's matchup hunches and the pre-game plan carry a target where the staff has one, and the suggestion line speaks it as part of the play name in the form the design uses, "Slant to X". In engine/controller.js callOffense accepts a target and the suggestion exposes one. In the shell, when a play is chosen the coach can accept the suggested target, change it with a short list of the receivers in the formation, or clear it, in one extra key at most; Enter on the suggestion accepts it with its target.

Add to harness.js and BALANCE_NOTES.md the measurement that decides whether this worked: identical rosters, staff differing only in the offensive coordinator's Evaluation, with targets on. The gap between a good and a poor coordinator was about a point and a half a game. Report the new gap. If it is not clearly larger, and if forcing the ball into a bracket is not clearly punished, adjust the costs until both are true, and record the numbers.

Spawn the simulation reviewer from KICKOFF.md with the changed engine in scope. Fix real findings. Commit as "Milestone 6: designated target".

## Milestone 7: cover three and blowouts

Cover three, per the ruling in DESIGN.md 26.2: change the defensive caller so cover three is a run-down and heavy-personnel call and two-high coverages are the passing-down answer, make sure the extra box defender in cover three shows up in the run numbers, and trim the largest positive matrix entries against cover three by no more than two points each. Re-run node matrix.js and confirm the spreads hold. Report cover three's yards per snap and call rate before and after in BALANCE_NOTES.md.

Blowouts, per ISSUES.md: narrow the harness quality draw to plus or minus 0.35 for the mixed runs, make leading teams run the clock harder earlier, and stop trailing teams from turning the ball over on downs in their own territory outside the last five minutes. Target: games decided by more than thirty-five points at about one in eight of mixed-quality games. Report before and after.

Fumbles lost toward 0.8 a team a game if it can be done without raising fumbles per carry past real rates; otherwise leave it and say so.

Commit as "Milestone 7: cover three and blowouts".

## Milestone 8: report and stop

Run the balance runner from KICKOFF.md once over the finished tree. Update CHANGELOG.md to 0.3.0. Rewrite MORNING_REPORT.md from scratch for this session: what changed, the exact keys for the new target step and the special teams call, how to save and load, the coordinator worth numbers before and after, what the reviewers left open, and the decisions you need. Update ISSUES.md. Commit as "Milestone 8: session 2 report".

If you finish early, do not start the weekly Focus screen or anything beyond one game. Run the accessibility auditor once more over the whole shell with fresh eyes and fix what it finds, then improve the wording of the play-by-play and the postgame staff review until every line reads as a clean sentence to a listener.
