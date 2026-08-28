// engine_test.js - Checks on the engine that do not need a controller or an
// interface: seeded replay, the effective attribute rule, the staff belief
// model, and the shape of what resolveSnap hands back.
// Covers DESIGN.md 5.3, 18.1, 24.1, 26.6, 26.7.

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

function twoTeams(seed) {
    var rng = new deps.Rng(seed);
    return [
        deps.game.makeTeam(deps, { name: 'Home', stub: 'H', rng: rng, level: 'HS', quality: 0, execMean: 55 }),
        deps.game.makeTeam(deps, { name: 'Away', stub: 'A', rng: rng, level: 'HS', quality: 0, execMean: 55 })
    ];
}

module.exports = function (t) {
    // ---- the generator is seeded and nothing calls Math.random ----
    var a = new deps.Rng(42), b = new deps.Rng(42), i, same = true;
    for (i = 0; i < 500; i++) if (a.next() !== b.next()) same = false;
    t.ok(same, 'two generators on the same seed produce the same sequence');

    // ---- a whole game replays exactly from its seed ----
    var pair1 = twoTeams(3), pair2 = twoTeams(3);
    var g1 = deps.game.playGame(deps, pair1[0], pair1[1], 12345);
    var g2 = deps.game.playGame(deps, pair2[0], pair2[1], 12345);
    t.eq(g1.final[0], g2.final[0], 'same seed replays the same home score');
    t.eq(g1.final[1], g2.final[1], 'same seed replays the same away score');
    t.eq(g1.log.length, g2.log.length, 'same seed replays the same number of log lines');

    // ---- a game reaches a finish and looks like football ----
    t.ok(g1.final[0] !== g1.final[1], 'a game does not end level');
    t.ok(g1.log.length > 80, 'a game produces a play by play of some length');
    t.ok(g1.stats[0].plays > 40 && g1.stats[0].plays < 110, 'the home team runs a believable number of plays');

    // ---- effective attributes move with live state (DESIGN.md 18.1) ----
    var p = pair1[0].roster.players[0];
    var fresh = deps.players.eff(p, 'spd');
    p.live.stamina = 20;
    var tired = deps.players.eff(p, 'spd');
    t.ok(tired < fresh, 'a tired player is slower than a fresh one');
    p.live.stamina = 100;

    // ---- the staff model: better evaluation means fewer looks and less bias ----
    var good = deps.staff.newBeliefs({ role: 'OC', attr: { evaluation: 80, communication: 80 } }, 'O', {});
    var poor = deps.staff.newBeliefs({ role: 'OC', attr: { evaluation: 28, communication: 28 } }, 'O', {});
    t.ok(good.threshold < poor.threshold, 'a good evaluator needs fewer looks than a poor one');
    t.ok(good.biasSd < poor.biasSd, 'a good evaluator carries less bias than a poor one');
    t.ok(good.delay <= poor.delay, 'a good communicator speaks no later than a poor one');

    // ---- a belief only forms once the threshold is crossed ----
    var rng = new deps.Rng(9);
    var store = deps.staff.newBeliefs({ role: 'OC', attr: { evaluation: 70, communication: 90 } }, 'O', {});
    var res = { type: 'pass', outcome: 'complete', yards: 8, events: [{ kind: 'target', role: 'WR1', edge: 12 }] };
    t.eq(Object.keys(deps.staff.beliefMap(store)).length, 0, 'a coordinator who has seen nothing believes nothing');
    for (i = 0; i < store.threshold; i++) deps.staff.observe(store, res, rng);
    t.ok(deps.staff.beliefMap(store)['pass:WR1'] !== undefined, 'a belief forms once he has seen enough');
    t.ok(deps.staff.estimate(store, 'pass:WR1') > 4, 'a coordinator who keeps seeing a man win rates him highly');

    // ---- a coverage tendency needs repetition before he will call it ----
    var cs = deps.staff.newBeliefs({ role: 'OC', attr: { evaluation: 95, communication: 95 } }, 'O', {});
    t.eq(deps.staff.likelyCoverage(cs, 'long'), null, 'no read on a defence he has not watched');
    for (i = 0; i < 12; i++) deps.staff.noteCoverage(cs, 'long', 'C4', rng);
    t.eq(deps.staff.likelyCoverage(cs, 'long'), 'C4', 'a patterned defence gets read');
    var mixed = deps.staff.newBeliefs({ role: 'OC', attr: { evaluation: 95, communication: 95 } }, 'O', {});
    var shells = ['C0', 'C1', 'C2', 'C3', 'C4', 'C2M'];
    for (i = 0; i < 24; i++) deps.staff.noteCoverage(mixed, 'long', shells[i % 6], rng);
    t.eq(deps.staff.likelyCoverage(mixed, 'long'), null, 'a defence that mixes it up cannot be read');

    // ---- hunches come out in the contract shape (CLAUDE.md) ----
    var found = null, guard = 0;
    var hs = deps.staff.newBeliefs({ role: 'OC', attr: { evaluation: 75, communication: 95 } }, 'O', {});
    while (!found && guard++ < 60) {
        deps.staff.observe(hs, res, rng);
        var out = deps.staff.hunches(hs, { down: 1, dist: 10, ytg: 60 },
            { active: true, plays: deps.plays, playbook: pair1[0].playbook, rng: rng });
        if (out.length) found = out[0];
    }
    t.ok(found !== null, 'a coordinator who keeps seeing the same thing eventually says so');
    if (found) {
        t.eq(found.source, 'OC', 'the hunch names its source');
        t.eq(found.kind, 'matchup', 'the hunch names its kind');
        t.ok(['sure', 'likely', 'guess'].indexOf(found.confidence) >= 0, 'the hunch carries a confidence word');
        t.ok(['must', 'cued', 'batched'].indexOf(found.urgency) >= 0, 'the hunch carries an urgency');
        t.ok(typeof found.text === 'string' && found.text.length > 0, 'the hunch carries a sentence');
        t.ok(!/\d/.test(found.text), 'a hunch never speaks a number');
    }

    // ---- resolveSnap hands back what the contract says it does ----
    var rng2 = new deps.Rng(5);
    deps.players.resetLive(pair1[0].roster); deps.players.resetLive(pair1[1].roster);
    var ctx = { rng: rng2, plays: deps.plays, players: deps.players,
                off: { lineup: deps.game.offenseLineup(pair1[0], 'SPREAD', deps.players, deps.plays) },
                def: { lineup: deps.game.defenseLineup(pair1[1], 'NICKEL', deps.plays), misaligned: false },
                play: { concept: 'QUICK', formation: 'SPREAD', exec: 60 },
                call: { front: 'NICKEL', coverage: 'C3', pressure: 'R4', adjustment: 'NONE' },
                sit: { down: 1, dist: 10, ytg: 60 }, tempo: 'huddle' };
    var snap = deps.resolve.resolveSnap(ctx);
    t.ok(typeof snap.outcome === 'string', 'a snap returns an outcome');
    t.ok(typeof snap.yards === 'number', 'a snap returns yards');
    t.ok(Array.isArray(snap.events), 'a snap returns a list of events');
    t.eq(snap.concept, 'QUICK', 'a snap remembers the concept it was');

    // ---- the scheme matrix still separates concepts (CLAUDE.md engine rules) ----
    function avgYards(concept, formation, coverage, n) {
        var r = new deps.Rng(77), total = 0, j;
        for (j = 0; j < n; j++) {
            deps.players.resetLive(pair1[0].roster); deps.players.resetLive(pair1[1].roster);
            var c2 = { rng: r, plays: deps.plays, players: deps.players,
                       off: { lineup: deps.game.offenseLineup(pair1[0], formation, deps.players, deps.plays) },
                       def: { lineup: deps.game.defenseLineup(pair1[1], 'NICKEL', deps.plays), misaligned: false },
                       play: { concept: concept, formation: formation, exec: 60 },
                       call: { front: 'NICKEL', coverage: coverage, pressure: 'R4', adjustment: 'NONE' },
                       sit: { down: 1, dist: 10, ytg: 60 }, tempo: 'huddle' };
            var rr = deps.resolve.resolveSnap(c2);
            total += rr.outcome === 'interception' ? -20 : rr.yards;
        }
        return total / n;
    }
    var vertsGood = avgYards('VERTS', 'SPREAD', 'C3', 250);
    var vertsBad = avgYards('VERTS', 'SPREAD', 'C4', 250);
    t.ok(vertsGood - vertsBad > 2, 'four verticals is worth several yards more against cover three than cover four');

    // ---- fourthDownDecision: a trailing team does not gamble deep in its own territory before it is desperate (ISSUES.md, Milestone 7) ----
    function fakeGame(homeScore, awayScore, quarter, clock, ball, dist) {
        return { teams: [{ style: { aggression: 0.3 } }, { style: { aggression: 0.3 } }],
                 score: [homeScore, awayScore], quarter: quarter, clock: clock, ball: ball, dist: dist };
    }
    t.eq(deps.game.fourthDownDecision(fakeGame(0, 9, 2, 400, 40, 1), 0), 'punt',
         'down by more than a score in the second quarter, fourth and one from its own forty does not gamble');
    t.eq(deps.game.fourthDownDecision(fakeGame(0, 9, 4, 90, 40, 1), 0), 'go',
         'the same situation inside the last five minutes still goes for it - the gamble is worth it there');
    t.eq(deps.game.fourthDownDecision(fakeGame(0, 3, 2, 400, 40, 1), 0), 'go',
         'down by less than a score, the same fourth and one is untouched: only a real deficit trips the guard');
    t.eq(deps.game.fourthDownDecision(fakeGame(9, 0, 2, 400, 40, 1), 0), 'go',
         'a leading team in the same spot is untouched: the guard is about not compounding a deficit, not about caution in general');

    // ---- fourthDownConfidence: always one of the three words, and predictable at the extremes ----
    t.eq(deps.game.fourthDownConfidence(fakeGame(0, 0, 4, 90, 40, 1), 0), 'sure',
         'a one-score-or-less-to-go fourth down is a sure call');
    t.eq(deps.game.fourthDownConfidence(fakeGame(0, 30, 4, 60, 40, 8), 0), 'sure',
         'a team that has nothing left but the clock is a sure call');
};
