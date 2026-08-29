// kickoff_test.js - The coin toss and the kickoff calls added to
// engine/game.js and engine/controller.js. Covers DESIGN.md 8.4, the
// milestone agreed in ISSUES.md on 2026-08-28, and the decision count of
// DESIGN_PROPOSALS.md proposal 4.

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

function answer(c) {
    var p = C.pending(c);
    if (p.kind === 'offense') { var s = C.suggestion(c, 'offense'); C.callOffense(c, s.play.id, s.tempo); }
    else if (p.kind === 'defense') { var d = C.suggestion(c, 'defense'); C.callDefense(c, d.call); }
    else if (p.kind === 'substitution') { C.answerSubstitution(c, 'yes'); }
    else if (p.kind === 'halftime') { var h = C.halftime(c); C.halftimeChoice(c, h.choices[0].id); }
    else if (p.kind === 'special') { var sp = C.specialTeamsChoices(c); C.callSpecial(c, sp.recommendation.toUpperCase()); }
    else if (p.kind === 'cointoss') { C.callToss(c, true); }
    else if (p.kind === 'tosschoice') { C.callTossChoice(c, 'RECEIVE'); }
    else if (p.kind === 'kickoff') { C.callKickoff(c, C.kickoffChoices(c).recommendation); }
    else if (p.kind === 'auto') { C.advance(c); }
    C.reports(c);
    return p.kind;
}

module.exports = function (t) {
    // ---------- the toss opens every game ----------
    var c = newController(11);
    t.eq(C.pending(c).kind, 'cointoss', 'a new game opens on the coin toss, whatever the delegation settings');
    var said = C.callToss(c, true).map(function (x) { return x.text; }).join(' ');
    t.ok(/comes up (heads|tails)/.test(said), 'calling the toss announces the coin');
    var p = C.pending(c);
    t.ok(p.kind === 'tosschoice' || p.kind === 'kickoff' || p.kind === 'auto',
         'after the coin the game is at the choice or the kickoff');

    // If the coach won, the choice flow works and RECEIVE gives him the ball.
    if (p.kind === 'tosschoice') {
        var tc = C.tossChoices(c);
        t.eq(tc.recommendation, 'RECEIVE', 'the toss recommendation is to take the ball');
        t.eq(tc.options.length, 3, 'receive, defer, and kick are all offered');
        C.callTossChoice(c, 'RECEIVE');
        t.eq(c.game.receivedFirst, 0, 'taking the ball means the coach receives first');
    }

    // ---------- determinism: same seed, same calls, same game ----------
    function playThrough(seed) {
        var cc = newController(seed), guard = 0;
        while (!cc.over && guard++ < 4000) answer(cc);
        return cc.game.log.map(function (l) { return l.text; }).join('|');
    }
    t.ok(playThrough(21) === playThrough(21), 'the same seed with the same toss and kickoff calls replays word for word');
    t.ok(playThrough(21) !== playThrough(22), 'a different seed is a different game');

    // ---------- the kickoff call itself ----------
    var c2 = newController(13);
    C.callToss(c2, true);
    if (C.pending(c2).kind === 'tosschoice') C.callTossChoice(c2, 'RECEIVE');
    var p2 = C.pending(c2);
    t.eq(p2.kind, 'kickoff', 'in full control the kickoff itself is a call');
    var kc = C.kickoffChoices(c2);
    t.ok(kc.side === 'kick' || kc.side === 'receive', 'the choice knows which side of the kick the coach is on');
    t.eq(kc.recommendation, kc.side === 'kick' ? 'DEEP' : 'RETURN',
         'with nothing at stake the recommendation is the ordinary call');
    var before2 = c2.game.log.length;
    C.callKickoff(c2, kc.recommendation);
    t.ok(c2.game.log.length > before2, 'the kickoff call moves the game on');
    t.ok(!c2.game.pendingKickoff, 'and the kickoff is resolved');
    var bad = C.callKickoff(c2, 'DEEP');
    t.ok(bad.length && /no kickoff/i.test(bad[0].text), 'a kickoff call with no kickoff pending is refused');

    // ---------- gating: COORD never asks, KEY asks only when it matters ----------
    var c3 = newController(17, { offenseMode: 'COORD', defenseMode: 'COORD' });
    t.eq(C.pending(c3).kind, 'cointoss', 'even a fully delegated coach is asked the toss');
    C.callToss(c3, false);
    var guard3 = 0;
    while (!c3.over && guard3++ < 50 && C.pending(c3).kind === 'auto') C.advance(c3);
    t.ok(C.pending(c3).kind !== 'kickoff', 'a fully delegated coach is never asked a kickoff call');

    // ---------- onside mechanics, statistically ----------
    function onsideTrials(rcall, n) {
        var rec = 0, i;
        for (i = 0; i < n; i++) {
            var teams = build(900 + i);
            var g = deps.game.startGame(deps, teams.home, teams.away, 900 + i);
            g.pendingToss = false; g.pendingKickoff = null;
            deps.game.kickoffPlay(g, 0, 'ONSIDE', rcall, deps);
            if (g.off === 0) rec++;
        }
        return rec / n;
    }
    var vsReturn = onsideTrials('RETURN', 200);
    var vsHands = onsideTrials('HANDS', 200);
    t.ok(vsReturn > 0.10 && vsReturn < 0.35, 'an onside kick against a regular return unit is a real gamble, recovered sometimes');
    t.ok(vsHands < vsReturn, 'the hands team recovers more onside kicks than a regular return unit gives up');
    t.ok(vsHands > 0.005, 'but even the hands team is not a guarantee');

    // A deep kick is never recovered by the kicking team.
    var teams4 = build(41);
    var g4 = deps.game.startGame(deps, teams4.home, teams4.away, 41);
    g4.pendingToss = false; g4.pendingKickoff = null;
    deps.game.kickoffPlay(g4, 0, 'DEEP', 'RETURN', deps);
    t.eq(g4.off, 1, 'a deep kick gives the receiving team the ball');

    // ---------- the onside window ----------
    var teams5 = build(43);
    var g5 = deps.game.startGame(deps, teams5.home, teams5.away, 43);
    g5.quarter = 4; g5.clock = 120; g5.score = [14, 20];
    t.ok(deps.game.onsideSituation(g5, 0), 'a team down six inside four minutes is in the onside window');
    t.ok(!deps.game.onsideSituation(g5, 1), 'the team that leads is not');
    g5.score = [14, 44];
    t.ok(!deps.game.onsideSituation(g5, 0), 'a team down thirty is past saving and does not kick onside');
    g5.quarter = 2;
    g5.score = [14, 20];
    t.ok(!deps.game.onsideSituation(g5, 0), 'the second quarter is too early for the window');

    // ---------- the decision count (DESIGN_PROPOSALS.md proposal 4) ----------
    var c6 = newController(19);
    var guard6 = 0;
    while (!c6.over && guard6++ < 4000) answer(c6);
    t.ok(c6.decisions.coach > 50, 'a coach who calls everything is credited with his decisions');
    t.eq(c6.decisions.staff, 0, 'and his staff with none of them');

    var c7 = newController(19, { offenseMode: 'COORD', defenseMode: 'COORD' });
    var guard7 = 0;
    while (!c7.over && guard7++ < 4000) answer(c7);
    t.ok(c7.decisions.staff > 50, 'a fully delegated game credits the staff');
    t.eq(c7.decisions.coach, 0, 'and the coach with none: the toss is deliberately not counted');

    // A coach-called punt counts the same as a coach-called go (the review
    // caught punts and field goals falling out of the tally entirely).
    var c9 = newController(29);
    var guard9 = 0, p9 = null;
    while (!c9.over && guard9++ < 4000) {
        p9 = C.pending(c9);
        if (p9.kind === 'special') break;
        answer(c9);
    }
    t.eq(p9 && p9.kind, 'special', 'the counting scenario reached a fourth down');
    var coachBefore = c9.decisions.coach;
    var sp9 = C.specialTeamsChoices(c9);
    var punts = sp9.options.filter(function (o) { return o.id === 'PUNT' || o.id === 'FG'; });
    C.callSpecial(c9, punts.length ? punts[0].id : 'GO');
    t.eq(c9.decisions.coach, coachBefore + 1, 'a coach-called punt or kick counts as exactly one decision');

    // KEY mode is stopped for a kickoff exactly when the onside window is
    // live, and a kickoff at zero on the clock is never a question. White-box
    // state shaping, with setMode as the legitimate lever that recomputes the
    // pending question the way the interface's own O key does.
    var c10 = newController(31, { offenseMode: 'KEY', defenseMode: 'KEY' });
    c10.game.pendingToss = false;
    c10.game.pendingKickoff = { kickIdx: 0 };
    c10.game.quarter = 4; c10.game.clock = 120; c10.game.score = [14, 20];
    C.setMode(c10, 'offense', 'KEY');
    t.eq(C.pending(c10).kind, 'kickoff', 'a KEY coach is stopped for a kickoff inside the onside window');
    c10.game.score = [20, 14];
    C.setMode(c10, 'offense', 'KEY');
    t.eq(C.pending(c10).kind, 'auto', 'and not stopped when he leads and the window is closed');
    c10.game.score = [14, 20];
    c10.game.clock = 0;
    C.setMode(c10, 'offense', 'KEY');
    t.eq(C.pending(c10).kind, 'auto', 'a kickoff at zero on the clock is never a question, even in the window');

    // A save taken with a kickoff pending round-trips to the same question.
    c10.game.clock = 120;
    C.setMode(c10, 'offense', 'ME');
    var loadedK = SAVE.deserialize(deps, SAVE.serialize(c10));
    t.eq(C.pending(loadedK).kind, 'kickoff', 'a game saved at a kickoff call reloads at the kickoff call');

    // The ceremonies never fabricate a down and distance (the review found
    // Tab speaking "second and goal, ball on their zero" at a kickoff).
    t.ok(/kicking off/.test(C.situationLine(c10)), 'the situation line during a kickoff says who is kicking');
    var c12 = newController(37);
    t.ok(/Before the kickoff/.test(C.situationLine(c12)), 'the situation line before the toss does not invent a possession');

    // ---------- a save taken at the toss round-trips ----------
    var c8 = newController(23);
    t.eq(C.pending(c8).kind, 'cointoss', 'the save scenario starts at the toss');
    var loaded = SAVE.deserialize(deps, SAVE.serialize(c8));
    t.eq(C.pending(loaded).kind, 'cointoss', 'a game saved at the toss reloads at the toss');
    C.callToss(loaded, true);
    t.ok(!loaded.game.pendingToss, 'and the reloaded toss resolves');
    t.eq(typeof loaded.decisions.coach, 'number', 'the decision count rides through a save');
};
