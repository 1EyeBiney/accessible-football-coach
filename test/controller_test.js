// controller_test.js - A scripted coach plays a whole game through
// engine/controller.js, calling both sides of the ball on every snap from the
// coordinators' suggestions, and answering every question the game asks.
// Checks the contract in CLAUDE.md: the game reaches a final, every
// announcement is a non-empty string, no announcement speaks a raw attribute
// number, and the same seed replays exactly.

'use strict';

var path = require('path');
var eng = path.join(__dirname, '..', 'engine');
var deps = {
    Rng: require(path.join(eng, 'rng.js')).Rng,
    players: require(path.join(eng, 'players.js')),
    plays: require(path.join(eng, 'plays.js')),
    resolve: require(path.join(eng, 'resolve.js')),
    staff: require(path.join(eng, 'staff.js')),
    game: require(path.join(eng, 'game.js'))
};
var C = require(path.join(eng, 'controller.js'));

function build(seed) {
    var rng = new deps.Rng(seed);
    return {
        home: deps.game.makeTeam(deps, { name: 'Riverton', stub: 'R', rng: rng, level: 'HS', quality: 0, execMean: 55 }),
        away: deps.game.makeTeam(deps, { name: 'Fairview', stub: 'F', rng: rng, level: 'HS', quality: 0, execMean: 55 })
    };
}

// Plays a whole game and returns everything that was said plus the final.
function playThrough(seed, opts) {
    var teams = build(seed);
    var c = C.newGame({
        deps: deps, home: teams.home, away: teams.away, seed: seed * 31 + 5,
        coachTeam: 0,
        offenseMode: (opts && opts.offenseMode) || 'ME',
        defenseMode: (opts && opts.defenseMode) || 'ME',
        reportThreshold: 'everything'
    });
    var said = C.drain(c).slice();
    var guard = 0, halftimes = 0, subs = 0, forced = 0;
    while (!c.over && guard++ < 4000) {
        var p = C.pending(c);
        var out = [];
        if (p.kind === 'offense') {
            var s = C.suggestion(c, 'offense');
            out = C.callOffense(c, s.play.id, s.tempo);
            forced++;
        } else if (p.kind === 'defense') {
            var d = C.suggestion(c, 'defense');
            out = C.callDefense(c, d.call);
            forced++;
        } else if (p.kind === 'substitution') {
            subs++;
            out = C.answerSubstitution(c, subs % 2 ? 'yes' : 'no');
        } else if (p.kind === 'halftime') {
            var h = C.halftime(c);
            halftimes++;
            out = C.halftimeChoice(c, h.choices[0].id);
        } else if (p.kind === 'special') {
            var sp = C.specialTeamsChoices(c);
            out = C.callSpecial(c, sp.recommendation.toUpperCase());
            forced++;
        } else if (p.kind === 'cointoss') {
            out = C.callToss(c, true);
        } else if (p.kind === 'tosschoice') {
            out = C.callTossChoice(c, C.tossChoices(c).recommendation);
        } else if (p.kind === 'kickoff') {
            out = C.callKickoff(c, C.kickoffChoices(c).recommendation);
        } else if (p.kind === 'pat') {
            out = C.callPat(c, C.patChoices(c).recommendation);
        } else if (p.kind === 'defspecial') {
            out = C.callDefSpecial(c, C.defSpecialChoices(c).recommendation);
            forced++;
        } else if (p.kind === 'penalty') {
            out = C.callPenalty(c, C.penaltyChoices(c).recommendation);
            forced++;
        } else if (p.kind === 'auto') {
            out = C.advance(c);
        } else if (p.kind === 'over') {
            break;
        }
        said = said.concat(out);
        // Take the reports the way the interface would, so the queues drain.
        said = said.concat(C.reports(c));
    }
    return { c: c, said: said, guard: guard, halftimes: halftimes, subs: subs, forced: forced,
             halftimeReport: null };
}

module.exports = function (t) {
    var run = playThrough(21);
    var c = run.c;

    // ---- the game finishes ----
    t.ok(c.over, 'the game reaches a final');
    t.ok(run.guard < 4000, 'the game finishes without hitting the loop guard');
    var fin = C.final(c);
    t.ok(fin !== null, 'a final is available once the game is over');
    t.ok(fin.score[0] + fin.score[1] > 0, 'somebody scored');
    t.ok(fin.review.length >= 3, 'the postgame review speaks about each assistant');
    t.ok(c.log.length > 80, 'the play by play has a full game in it');
    t.ok(run.forced > 60, 'the coach called both sides on plenty of snaps');
    t.eq(run.halftimes, 1, 'halftime happens exactly once');

    // ---- every announcement is a real sentence ----
    var i, a, bad = 0, empty = 0;
    for (i = 0; i < run.said.length; i++) {
        a = run.said[i];
        if (typeof a.text !== 'string' || !a.text.length) empty++;
        if (['result', 'must', 'cued', 'batched'].indexOf(a.priority) < 0) bad++;
    }
    t.eq(empty, 0, 'no announcement is empty');
    t.eq(bad, 0, 'every announcement carries a known priority');
    t.ok(run.said.length > 100, 'a game produces plenty to listen to');

    // ---- no announcement speaks a raw attribute number ----
    // The play by play speaks yardage and the clock, which are facts about the
    // game rather than attributes. What must never appear is a bare two digit
    // rating attached to a player, so the check is that no announcement from a
    // member of staff contains a digit at all: hunches, reports, the halftime
    // briefing and the postgame review are all meant to be words.
    var staffSaid = run.said.filter(function (x) { return x.source === 'OC' || x.source === 'DC' || x.source === 'SPOT' || x.source === 'TRAINER'; });
    var withDigits = staffSaid.filter(function (x) { return /\d/.test(x.text); });
    t.eq(withDigits.length, 0, 'nothing a member of staff says contains a number');
    t.ok(staffSaid.length > 0, 'the staff actually said something during the game');

    // ---- the situation line and the examine line are words, not figures ----
    var sit = C.situationLine(c);
    t.ok(typeof sit === 'string' && sit.length > 10, 'the situation line is a sentence');
    t.ok(!/\d/.test(sit), 'the situation line speaks its numbers as words');

    // ---- the same seed replays exactly ----
    var again = playThrough(21);
    t.eq(again.c.game.final[0], c.game.final[0], 'the same seed replays the same home score');
    t.eq(again.c.game.final[1], c.game.final[1], 'the same seed replays the same away score');
    t.eq(again.c.log.length, c.log.length, 'the same seed replays the same number of snaps');
    var mismatch = 0;
    for (i = 0; i < c.log.length; i++) if (c.log[i] !== again.c.log[i]) mismatch++;
    t.eq(mismatch, 0, 'the same seed replays every play by play line word for word');

    // ---- a different seed gives a different game ----
    var other = playThrough(22);
    t.ok(other.c.log[0] !== c.log[0] || other.c.game.final[0] !== c.game.final[0],
         'a different seed gives a different game');

    // ---- delegation: handing both sides over still finishes a game ----
    var handed = playThrough(23, { offenseMode: 'COORD', defenseMode: 'COORD' });
    t.ok(handed.c.over, 'a fully delegated game reaches a final');
    t.eq(handed.forced, 0, 'a fully delegated coach is never asked to call a play');
    t.ok(handed.c.log.length > 80, 'a delegated game plays a full game of snaps');

    // ---- the third mode stops the coach only for the ones that matter ----
    var keyMode = playThrough(24, { offenseMode: 'KEY', defenseMode: 'KEY' });
    t.ok(keyMode.c.over, 'the stop for the big ones mode reaches a final');
    t.ok(keyMode.forced > 0, 'the coach is stopped for something');
    t.ok(keyMode.forced < keyMode.c.log.length, 'the coach is not stopped for everything');

    // ---- the pieces the interface asks for are all there ----
    var fresh = playThrough(25);
    var c2 = fresh.c;
    t.ok(Array.isArray(C.postgameReview(c2)), 'the postgame review is a list');
    var teams2 = build(30);
    var c3 = C.newGame({ deps: deps, home: teams2.home, away: teams2.away, seed: 991, coachTeam: 0 });
    C.drain(c3);
    var forms = C.formations(c3);
    t.ok(forms.length >= 4, 'the formation list has the playbook in it');
    t.ok(forms.every(function (f) { return typeof f.text === 'string' && f.text.length; }), 'every formation has a line to speak');
    var sheet = C.callSheet(c3);
    t.ok(sheet.length > 0, 'the call sheet has plays that fit this situation');
    t.ok(sheet.every(function (p) { return typeof p.text === 'string' && p.text.length; }), 'every play on the sheet has a line to speak');
    var subsList = C.substitutionList(c3, 'SPREAD');
    t.ok(subsList.length === 11, 'eleven men are on the field');
    t.ok(subsList.every(function (s) { return /fresh|working|tiring|gassed|hurt|out/.test(s.text); }), 'every man on the field is described in words');
    t.ok(typeof C.examine(c3) === 'string', 'the examine key has something to say');
    t.ok(Array.isArray(C.matchups(c3)), 'the matchup key returns a list');
    t.ok(typeof C.tendencies(c3) === 'string', 'the tendency key has something to say');
    t.eq(C.playClockSeconds(c3), 0, 'the play clock is off by default');

    // ---- the play clock, when it is on ----
    var c4 = C.newGame({ deps: deps, home: build(31).home, away: build(31).away, seed: 77, coachTeam: 0, playClock: 'STANDARD' });
    C.drain(c4);
    t.eq(C.playClockSeconds(c4), 25, 'the standard play clock is twenty-five seconds');
    var ballBefore = c4.game.ball, distBefore = c4.game.dist;
    C.delayOfGame(c4);
    t.eq(c4.game.ball, ballBefore - 5, 'delay of game costs five yards');
    t.eq(c4.game.dist, distBefore + 5, 'delay of game leaves the down to be replayed');
};
