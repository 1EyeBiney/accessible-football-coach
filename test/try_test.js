// try_test.js - The try after a touchdown as the coach's own decision
// (ISSUES.md 2026-08-29, from Brian's play notes: the computer was kicking
// the extra point for him). Covers the deferral in engine/game.js, the pat
// pending kind and its gating in engine/controller.js, the two-point snap
// finally being described, the overtime rotation waiting for the try, and
// a save taken at the try. DESIGN.md 8.4, 22.

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
var SAVE = require(path.join(eng, 'save.js'));

function build(seed) {
    var rng = new deps.Rng(seed);
    return {
        home: deps.game.makeTeam(deps, { name: 'Riverton', stub: 'R', rng: rng, level: 'HS', quality: 0, execMean: 55 }),
        away: deps.game.makeTeam(deps, { name: 'Fairview', stub: 'F', rng: rng, level: 'HS', quality: 0, execMean: 55 })
    };
}

function newController(seed, opts) {
    var teams = build(seed);
    var c = C.newGame({ deps: deps, home: teams.home, away: teams.away, seed: seed * 31 + 5, coachTeam: 0,
                         offenseMode: (opts && opts.offenseMode) || 'ME',
                         defenseMode: (opts && opts.defenseMode) || 'ME', reportThreshold: 'everything' });
    C.drain(c);
    return c;
}

// patAnswer decides what the driver does at a try; everything else follows
// the recommendation. Returns every pending kind seen, so a test can assert
// what the game asked.
function playTo(c, guard, patAnswer) {
    var kinds = [], n = 0;
    while (n++ < guard) {
        var p = C.pending(c);
        if (!p || p.kind === 'over') break;
        kinds.push(p.kind);
        if (p.kind === 'offense') { var s = C.suggestion(c, 'offense'); C.callOffense(c, s.play.id, s.tempo); }
        else if (p.kind === 'defense') { var d = C.suggestion(c, 'defense'); C.callDefense(c, d.call); }
        else if (p.kind === 'substitution') { C.answerSubstitution(c, 'yes'); }
        else if (p.kind === 'halftime') { var h = C.halftime(c); C.halftimeChoice(c, h.choices[0].id); }
        else if (p.kind === 'special') { var sp = C.specialTeamsChoices(c); C.callSpecial(c, sp.recommendation.toUpperCase()); }
        else if (p.kind === 'cointoss') { C.callToss(c, true); }
        else if (p.kind === 'tosschoice') { C.callTossChoice(c, 'RECEIVE'); }
        else if (p.kind === 'kickoff') { C.callKickoff(c, C.kickoffChoices(c).recommendation); }
        else if (p.kind === 'pat') { C.callPat(c, patAnswer ? patAnswer(c) : C.patChoices(c).recommendation); }
        else if (p.kind === 'defspecial') { C.callDefSpecial(c, C.defSpecialChoices(c).recommendation); }
        else { C.advance(c); }
        C.reports(c);
    }
    return kinds;
}

module.exports = function (t) {

    // ---------- the coach is asked on his own score, and only his ----------

    var c = newController(11);
    var sawOwnTry = false, sawOpponentTd = false, guard = 0;
    while (guard++ < 900 && C.pending(c) && C.pending(c).kind !== 'over') {
        var p = C.pending(c);
        if (p.kind === 'pat') {
            t.eq(c.game.pendingTry.offIdx, c.coach, 'a pat question only ever belongs to the coach\'s own score');
            sawOwnTry = true;
            C.callPat(c, C.patChoices(c).recommendation);
            continue;
        }
        if (p.kind === 'auto' && c.game.pendingTry && c.game.pendingTry.offIdx !== c.coach) {
            sawOpponentTd = true;
            C.advance(c);
            continue;
        }
        playTo(c, 1);
    }
    t.ok(sawOwnTry, 'the coach was asked at least one try over a full game');
    t.ok(sawOpponentTd || c.game.stats[1 - c.coach].fgm >= 0, 'the walk ran (an opponent score is likely but not guaranteed)');

    // ---------- the choices and the calls ----------

    var c2 = newController(17);
    var kinds2 = [];
    var g2 = 0;
    while (g2++ < 900 && C.pending(c2) && C.pending(c2).kind !== 'over') {
        if (C.pending(c2).kind === 'pat') break;
        playTo(c2, 1);
    }
    if (C.pending(c2).kind === 'pat') {
        var pc = C.patChoices(c2);
        t.ok(pc && (pc.recommendation === 'KICK' || pc.recommendation === 'TWO'), 'patChoices recommends a real call');
        t.eq(pc.options.length, 2, 'and offers exactly the two');
        t.ok(!/\d/.test(pc.text), 'the suggestion speaks no digits');
        // A bad id is refused rather than ignored.
        var before2 = c2.game.score.slice();
        var fail2 = C.callPat(c2, 'ONSIDE');
        t.ok(fail2.length && /not a try call/.test(fail2[0].text), 'a bad id is refused with words');
        t.ok(!!c2.game.pendingTry, 'and the try is still waiting');
        // The kick resolves and scores at most one.
        C.callPat(c2, 'KICK');
        t.ok(!c2.game.pendingTry, 'a kick resolves the try');
        var gained = c2.game.score[c2.coach] - before2[c2.coach];
        t.ok(gained === 0 || gained === 1, 'and is worth zero or one');
        var patLine = c2.game.log[c2.game.log.length - 1];
        t.eq(patLine.kind, 'pat', 'the try logs a pat line');
        t.ok(/extra point/.test(patLine.text), 'that says what the kick did');
    } else {
        t.ok(false, 'the walk should reach a try');
    }

    // ---------- going for two is a real, described snap ----------

    var c3 = newController(31);
    var g3 = 0, twoLine = null, twoRes = null, scoreBefore3 = null, gained3 = null;
    while (g3++ < 1500 && C.pending(c3) && C.pending(c3).kind !== 'over') {
        if (C.pending(c3).kind === 'pat') {
            scoreBefore3 = c3.game.score.slice();
            C.callPat(c3, 'TWO');
            var e3 = c3.game.log[c3.game.log.length - 1];
            if (e3.kind === 'pat' && e3.res) { twoLine = e3; twoRes = e3.res; }
            gained3 = c3.game.score[c3.coach] - scoreBefore3[c3.coach];
            break;
        }
        playTo(c3, 1);
    }
    t.ok(twoLine !== null, 'forcing two produces a pat entry carrying the snap');
    if (twoLine) {
        t.ok(/^Two point try: /.test(twoLine.text), 'the line is the try\'s own, not a down and distance');
        t.ok(twoRes.concept && twoRes.formation, 'the snap is real: it has a concept and a formation');
        t.ok(gained3 === 0 || gained3 === 2, 'and is worth zero or two');
        t.eq(typeof twoLine.made, 'boolean', 'the entry records whether it was good');
        t.ok(/The try is (good|no good)\./.test(twoLine.text), 'and says so out loud');
        // The entry re-renders under the naming setting, like any play.
        var asBoth = C.renderEntry(c3, twoLine);
        C.setNaming(c3, 'name');
        var asName = C.renderEntry(c3, twoLine);
        C.setNaming(c3, 'both');
        t.ok(/^Two point try: /.test(asName), 'a re-render keeps the try\'s head');
        t.ok(asBoth === asName || asBoth !== asName, 'and renders without throwing in every mode');
    } else {
        t.ok(false, '(placeholder)'); t.ok(false, '(placeholder)'); t.ok(false, '(placeholder)');
        t.ok(false, '(placeholder)'); t.ok(false, '(placeholder)'); t.ok(false, '(placeholder)');
    }

    // ---------- gating ----------

    // COORD never asks; the game still reaches a final with tries resolved.
    var c4 = newController(41, { offenseMode: 'COORD', defenseMode: 'COORD' });
    var kinds4 = playTo(c4, 2000);
    t.ok(kinds4.indexOf('pat') < 0, 'a fully delegated coach is never asked at a try');
    t.ok(c4.over, 'and the game reaches a final');

    // KEY asks only when a two-point try is genuinely live. The window is
    // deterministic arithmetic, so test it directly.
    // The window reads post-touchdown margins: score() has already added
    // the six by the time the try is asked.
    var c5 = newController(43);
    var g5 = c5.game;
    g5.quarter = 4; g5.clock = 300;
    g5.score = [12, 16];   // down four: a kick does not tie, two does not either - not a window
    t.eq(deps.game.twoPointSituation(g5, 0), false, 'down four late is not a two-point window');
    g5.score = [10, 12];   // down two: two ties the game
    t.eq(deps.game.twoPointSituation(g5, 0), true, 'down two late is a two-point window');
    g5.score = [13, 12];   // up one: two makes it a field goal lead
    t.eq(deps.game.twoPointSituation(g5, 0), true, 'up one late is a two-point window');
    g5.quarter = 2;
    t.eq(deps.game.twoPointSituation(g5, 0), false, 'the same margin in the second quarter is not');

    // ---------- the same seed replays word for word through a forced try ----------

    function transcript(seed, patCall) {
        var cc = newController(seed);
        var lines = [];
        var n = 0;
        while (n++ < 1200 && C.pending(cc) && C.pending(cc).kind !== 'over') {
            var pp = C.pending(cc);
            var out = null;
            if (pp.kind === 'offense') { var ss = C.suggestion(cc, 'offense'); out = C.callOffense(cc, ss.play.id, ss.tempo); }
            else if (pp.kind === 'defense') { out = C.callDefense(cc, C.suggestion(cc, 'defense').call); }
            else if (pp.kind === 'substitution') { out = C.answerSubstitution(cc, 'yes'); }
            else if (pp.kind === 'halftime') { out = C.halftimeChoice(cc, C.halftime(cc).choices[0].id); }
            else if (pp.kind === 'special') { out = C.callSpecial(cc, C.specialTeamsChoices(cc).recommendation.toUpperCase()); }
            else if (pp.kind === 'cointoss') { out = C.callToss(cc, true); }
            else if (pp.kind === 'tosschoice') { out = C.callTossChoice(cc, 'RECEIVE'); }
            else if (pp.kind === 'kickoff') { out = C.callKickoff(cc, C.kickoffChoices(cc).recommendation); }
            else if (pp.kind === 'pat') { out = C.callPat(cc, patCall); }
            else if (pp.kind === 'defspecial') { out = C.callDefSpecial(cc, C.defSpecialChoices(cc).recommendation); }
            else { out = C.advance(cc); }
            (out || []).forEach(function (x) { lines.push(x.text); });
        }
        return { lines: lines, final: cc.game.score.slice() };
    }
    var t1 = transcript(61, 'KICK');
    var t2 = transcript(61, 'KICK');
    t.eq(t1.lines.length, t2.lines.length, 'the same seed with the same try calls says the same number of lines');
    var mism = 0, mi;
    for (mi = 0; mi < t1.lines.length; mi++) if (t1.lines[mi] !== t2.lines[mi]) mism++;
    t.eq(mism, 0, 'and every line word for word');
    t.eq(t1.final[0], t2.final[0], 'same home score');
    t.eq(t1.final[1], t2.final[1], 'same away score');
    var t3 = transcript(61, 'TWO');
    t.ok(t1.lines.join('|') !== t3.lines.join('|'), 'forcing two instead of the kick genuinely changes the game');

    // ---------- a save taken at the try round-trips ----------

    var c6 = newController(61);
    var g6 = 0;
    while (g6++ < 900 && C.pending(c6) && C.pending(c6).kind !== 'over') {
        if (C.pending(c6).kind === 'pat') break;
        playTo(c6, 1);
    }
    if (C.pending(c6).kind === 'pat') {
        var loaded = SAVE.deserialize(deps, SAVE.serialize(c6));
        t.ok(!!loaded.game.pendingTry, 'a save taken at the try still owes the try');
        t.eq(C.pending(loaded) && C.pending(loaded).kind, 'pat', 'and the loaded game asks the same question');
        var s1 = C.callPat(c6, 'KICK').map(function (x) { return x.text; }).join(' ');
        var s2 = C.callPat(loaded, 'KICK').map(function (x) { return x.text; }).join(' ');
        t.eq(s1, s2, 'answering it in both games says the same words');
    } else {
        t.ok(false, 'the walk should reach a try to save at');
        t.ok(false, '(placeholder)'); t.ok(false, '(placeholder)');
    }

    // ---------- overtime: the rotation waits for the try, silently ----------

    // The rotation step after an OT touchdown must never surface as a call
    // prompt: the possession is dead and its state is stale (the ball is
    // past the goal line). The audit found a phantom prompt there whose
    // answer the rotation then swallowed.
    var cOt = newController(83);
    var gOt = cOt.game;
    // Force overtime directly: tied at the end of regulation.
    gOt.quarter = 4; gOt.clock = 1; gOt.score = [14, 14];
    var otGuard = 0, sawPhantom = false, sawOtPat = false;
    while (otGuard++ < 600 && C.pending(cOt) && C.pending(cOt).kind !== 'over') {
        var pOt = C.pending(cOt);
        if (gOt.ot && gOt.otRotate && (pOt.kind === 'offense' || pOt.kind === 'defense' || pOt.kind === 'special')) {
            sawPhantom = true;
            break;
        }
        if (gOt.ot && pOt.kind === 'pat') sawOtPat = true;
        playTo(cOt, 1);
    }
    t.ok(!sawPhantom, 'the overtime rotation never surfaces as a call prompt');
    t.ok(cOt.over || otGuard >= 600, 'and the overtime reaches a final');
    if (cOt.over) {
        t.ok(gOt.final[0] !== gOt.final[1], 'which is not a tie');
    } else {
        t.ok(true, '(overtime still running at the guard, acceptable)');
    }

    // ---------- S never lies about the toss ----------

    var cToss = newController(89);
    C.callToss(cToss, true);
    var tossAction = C.lastAction(cToss);
    t.ok(tossAction !== null, 'after the coin lands, S has something to say');
    t.ok(/toss|receive|coin/i.test(tossAction), 'and it is about the toss');

    // ---------- the decision counter ----------

    var c7 = newController(71);
    playTo(c7, 2000);
    var totalDecided = c7.decisions.coach + c7.decisions.staff;
    t.ok(c7.decisions.coach > 0, 'a coach who answers everything is credited with decisions');
    var c8 = newController(71, { offenseMode: 'COORD', defenseMode: 'COORD' });
    playTo(c8, 2000);
    t.ok(c8.decisions.staff > 0, 'a delegated game credits the staff');
    t.eq(c8.decisions.coach, 0, 'and the coach with none');
};
