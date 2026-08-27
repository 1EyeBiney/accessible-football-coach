// matrix.js - Does the scheme matrix do its job?
// Resolves many snaps of every concept against every coverage (and every run
// concept against every box weight) between two equal teams, and prints
// average yards. If a concept's best and worst coverages do not differ by a
// couple of yards, the concept has no reason to exist and the matrix needs work.
// Usage: node matrix.js [snaps per cell] [seed]

'use strict';
var path = require('path');
var eng = path.join(__dirname, 'engine');
var Rng = require(path.join(eng, 'rng.js')).Rng;
var P = require(path.join(eng, 'players.js'));
var PL = require(path.join(eng, 'plays.js'));
var R = require(path.join(eng, 'resolve.js'));
var S = require(path.join(eng, 'staff.js'));
var G = require(path.join(eng, 'game.js'));
var deps = { Rng: Rng, players: P, plays: PL, resolve: R, staff: S, game: G };

var N = parseInt(process.argv[2], 10) || 400;
var SEED = parseInt(process.argv[3], 10) || 5;
var rng = new Rng(SEED);
var off = G.makeTeam(deps, { name: 'Offense', stub: 'O', rng: rng, quality: 0, execMean: 60 });
var def = G.makeTeam(deps, { name: 'Defense', stub: 'D', rng: rng, quality: 0 });
P.resetLive(off.roster); P.resetLive(def.roster);

function cell(concept, formation, front, coverage, pressure, adjustment) {
    var total = 0, i, turnovers = 0, sacks = 0;
    for (i = 0; i < N; i++) {
        P.resetLive(off.roster); P.resetLive(def.roster);
        var ctx = { rng: rng, plays: PL, players: P,
                    off: { lineup: G.offenseLineup(off, formation, P, PL) },
                    def: { lineup: G.defenseLineup(def, front, PL), misaligned: false },
                    play: { concept: concept, formation: formation, exec: 60 },
                    call: { front: front, coverage: coverage, pressure: pressure, adjustment: adjustment },
                    sit: { down: 1, dist: 10, ytg: 60 }, tempo: 'huddle' };
        var r = R.resolveSnap(ctx);
        if (r.outcome === 'interception' || r.fumbleLost) turnovers++;
        if (r.outcome === 'sack') sacks++;
        total += (r.outcome === 'interception') ? -20 : r.yards; // an interception counts as minus twenty
    }
    return { avg: total / N, to: turnovers, sacks: sacks };
}

var covs = ['C0', 'C1', 'C2', 'C3', 'C4', 'C2M'];
console.log('Pass concepts: average yards per snap against each coverage (four-man rush, nickel front, no adjustment). Interceptions count as minus twenty.');
console.log('Concept, then ' + covs.join(', ') + ', then spread between best and worst.');
var c;
for (c in PL.CONCEPTS) {
    var con = PL.CONCEPTS[c];
    if (con.type !== 'pass') continue;
    var form = con.forms[0], row = [], best = -99, worst = 99, i;
    for (i = 0; i < covs.length; i++) {
        var v = cell(c, form, 'NICKEL', covs[i], 'R4', 'NONE').avg;
        row.push(v.toFixed(1)); if (v > best) best = v; if (v < worst) worst = v;
    }
    console.log(con.name + ': ' + row.join(', ') + '. Spread ' + (best - worst).toFixed(1));
}
console.log('');
console.log('Pass concepts against pressure (cover three): four, five, six rushers, zone blitz.');
for (c in PL.CONCEPTS) {
    var con2 = PL.CONCEPTS[c];
    if (con2.type !== 'pass') continue;
    var prs = ['R4', 'R5', 'R6', 'ZB'], row2 = [], j;
    for (j = 0; j < prs.length; j++) { var r2 = cell(c, con2.forms[0], 'NICKEL', 'C3', prs[j], 'NONE'); row2.push(r2.avg.toFixed(1) + ' (sacks ' + r2.sacks + ')'); }
    console.log(con2.name + ': ' + row2.join(', '));
}
console.log('');
console.log('Run concepts: average yards against a light, normal, and loaded box (from the I formation where allowed).');
for (c in PL.CONCEPTS) {
    var con3 = PL.CONCEPTS[c];
    if (con3.type !== 'run') continue;
    var form3 = con3.forms.indexOf('IFORM') >= 0 ? 'IFORM' : con3.forms[0];
    // light: dime + cover two; normal: over + cover four; loaded: over + cover one with the box loaded
    var light = cell(c, form3, 'DIME', 'C2', 'R4', 'NONE').avg;
    var normal = cell(c, form3, 'OVER', 'C4', 'R4', 'NONE').avg;
    var loaded = cell(c, form3, 'OVER', 'C1', 'R4', 'LOAD').avg;
    console.log(con3.name + ': light ' + light.toFixed(1) + ', normal ' + normal.toFixed(1) + ', loaded ' + loaded.toFixed(1));
}
console.log('');
console.log('Adjustments against Four Verticals from Spread in cover three: none, bracket the X, help over the X.');
console.log(['NONE', 'BRACKET', 'HELP'].map(function (a) { return a + ' ' + cell('VERTS', 'SPREAD', 'NICKEL', 'C3', 'R4', a).avg.toFixed(1); }).join(', '));
