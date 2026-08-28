// harness.js - Plays many games headless and prints statistics as plain text.
// Usage: node harness.js [games] [seed] [--log]
//   node harness.js            50 games, seed 1
//   node harness.js 200 7      200 games, seed 7
//   node harness.js 1 3 --log  one game with the full play-by-play printed
//   node harness.js 200 1 --even   equal-quality teams (isolates randomness)
//
// The question the harness answers: does this look like high school football?
// Targets (rough, for tuning, per team per game):
//   points 14-35, plays 55-70, completion 50-60%, yards per carry 4-5.5,
//   sack rate 5-8% of dropbacks, interception 2-4% of attempts,
//   fumbles lost about 1 per game, penalties 4-7 per game, punts 3-6.

'use strict';

var path = require('path');
var eng = path.join(__dirname, 'engine');
var deps = {
    Rng: require(path.join(eng, 'rng.js')).Rng,
    players: require(path.join(eng, 'players.js')),
    plays: require(path.join(eng, 'plays.js')),
    resolve: require(path.join(eng, 'resolve.js')),
    staff: require(path.join(eng, 'staff.js')),
    game: require(path.join(eng, 'game.js'))
};

var args = process.argv.slice(2);
var GAMES = parseInt(args[0], 10) || 50;
var SEED = parseInt(args[1], 10) || 1;
var LOG = args.indexOf('--log') >= 0;
var EVEN = args.indexOf('--even') >= 0; // equal-quality teams, to see pure randomness

function pct(a, b) { return b ? (100 * a / b).toFixed(1) + '%' : 'n/a'; }
function per(a, n, d) { return (a / n).toFixed(d === undefined ? 1 : d); }

function clockText(secs) { var m = Math.floor(secs / 60), s = secs % 60; return m + ':' + (s < 10 ? '0' : '') + s; }

var master = new deps.Rng(SEED);
var totals = null, games = 0, teamGames = 0, wins = [0, 0], ties = 0, margins = [], pointsList = [];
var hunchLog = [], conceptYds = {}, conceptN = {};
var covYds = {}, covN = {}, passSnaps = 0; // per-coverage yards and call rate, DESIGN.md 26.2
var ocPoints = { poor: { n: 0, pts: 0 }, average: { n: 0, pts: 0 }, good: { n: 0, pts: 0 } };
var beliefAcc = { poor: { n: 0, hit: 0, miss: 0 }, average: { n: 0, hit: 0, miss: 0 }, good: { n: 0, hit: 0, miss: 0 } };
var yardsHist = {};
var g;

function addStats(t, s) {
    var k;
    for (k in s) {
        if (typeof s[k] === 'number') t[k] = (t[k] || 0) + s[k];
    }
    var d;
    for (d in s.depth) { t.depth = t.depth || {}; t.depth[d] = t.depth[d] || { att: 0, comp: 0 }; t.depth[d].att += s.depth[d].att; t.depth[d].comp += s.depth[d].comp; }
    for (d in s.box) { t.box = t.box || {}; t.box[d] = t.box[d] || { att: 0, yds: 0 }; t.box[d].att += s.box[d].att; t.box[d].yds += s.box[d].yds; }
    var i;
    for (i = 0; i < s.yardsHist.length; i++) { var y = s.yardsHist[i]; var b = y < -5 ? '<-5' : y < 0 ? '-5..-1' : y === 0 ? '0' : y <= 3 ? '1-3' : y <= 7 ? '4-7' : y <= 12 ? '8-12' : y <= 20 ? '13-20' : y <= 40 ? '21-40' : '41+'; yardsHist[b] = (yardsHist[b] || 0) + 1; }
}

for (g = 0; g < GAMES; g++) {
    var rng = master.child(g);
    // -0.35..0.35 approximates the spread of a real ten-team high school
    // league rather than the -0.6..0.6 a full point wider than that, which
    // was turning a modest roster gap into a rout too often (ISSUES.md).
    var qa = EVEN ? 0 : rng.uniform(-0.35, 0.35), qb = EVEN ? 0 : rng.uniform(-0.35, 0.35);
    var home = deps.game.makeTeam(deps, { name: 'Home', stub: 'H', rng: rng, level: 'HS', quality: qa, runLean: rng.uniform(0.4, 0.65), aggression: rng.uniform(0.1, 0.5), execMean: 50,
        staffQuality: rng.uniform(-1.4, 1.4) });
    var away = deps.game.makeTeam(deps, { name: 'Away', stub: 'A', rng: rng, level: 'HS', quality: qb, runLean: rng.uniform(0.4, 0.65), aggression: rng.uniform(0.1, 0.5), execMean: 50,
        staffQuality: rng.uniform(-1.4, 1.4) });
    var game = deps.game.playGame(deps, home, away, SEED * 1000 + g);
    games++;
    if (game.final[0] > game.final[1]) wins[0]++; else if (game.final[1] > game.final[0]) wins[1]++; else ties++;
    // What a coordinator is actually worth, which is the number that matters:
    // the rosters are the same quality, so any difference in points is staff.
    for (var ti = 0; ti < 2; ti++) {
        var ev = game.teams[ti].staff.OC.attr.evaluation;
        var bn = ev < 40 ? 'poor' : (ev < 55 ? 'average' : 'good');
        ocPoints[bn].n++; ocPoints[bn].pts += game.final[ti];
    }
    margins.push(Math.abs(game.final[0] - game.final[1]));
    pointsList.push(game.final[0], game.final[1]);
    totals = totals || {};
    addStats(totals, game.stats[0]); addStats(totals, game.stats[1]);
    teamGames += 2;
    // Was the coordinator right about who was winning? The harness is a
    // development tool, so unlike anything in engine/ it is allowed to look at
    // the truth and score the staff against it. Truth here is the average real
    // matchup edge each receiver role produced this game, taken from the events
    // themselves; the belief is what the coordinator ended the game thinking.
    var ti2, tr, k2, trueBest, tv, believed, bv2, est2, st2;
    var truth = [{}, {}], lj, le2, ej;
    for (lj = 0; lj < game.log.length; lj++) {
        le2 = game.log[lj];
        if (le2.kind !== 'play' || !le2.res) continue;
        if (le2.res.type === 'pass' && le2.res.call && !le2.res.nullified) {
            var cvId = le2.res.call.coverage;
            passSnaps++;
            covN[cvId] = (covN[cvId] || 0) + 1;
            covYds[cvId] = (covYds[cvId] || 0) + le2.res.yards;
        }
        if (!le2.res.events) continue;
        for (ej = 0; ej < le2.res.events.length; ej++) {
            var evt = le2.res.events[ej];
            if (evt.kind !== 'target' || evt.edge === undefined) continue;
            tr = truth[le2.team];
            if (!tr[evt.role]) tr[evt.role] = { n: 0, sum: 0 };
            tr[evt.role].n++; tr[evt.role].sum += evt.edge;
        }
    }
    for (ti2 = 0; ti2 < 2; ti2++) {
        trueBest = null; tv = -1e9;
        for (k2 in truth[ti2]) {
            if (truth[ti2][k2].n < 3) continue;
            var mm = truth[ti2][k2].sum / truth[ti2][k2].n;
            if (mm > tv) { tv = mm; trueBest = k2; }
        }
        if (!trueBest) continue;
        st2 = game.teams[ti2].live.beliefs.OC;
        believed = null; bv2 = -1e9;
        for (k2 in st2.obs) {
            if (k2.indexOf('pass:') !== 0 || st2.obs[k2].ready < 0) continue;
            est2 = deps.staff.estimate(st2, k2);
            if (est2 > bv2) { bv2 = est2; believed = k2.slice(5); }
        }
        if (!believed) continue;
        var bnd = game.teams[ti2].staff.OC.attr.evaluation;
        var bname = bnd < 40 ? 'poor' : (bnd < 55 ? 'average' : 'good');
        beliefAcc[bname].n++;
        if (believed === trueBest) beliefAcc[bname].hit++;
        var pk = truth[ti2][believed];
        beliefAcc[bname].miss += (pk && pk.n >= 3) ? (tv - pk.sum / pk.n) : 15;
    }

    // Every scrimmage play is recorded, whether or not a hunch was being
    // followed, so the control group below is the same concept called without
    // a coordinator's read behind it.
    var li, h;
    for (li = 0; li < game.hunchLog.length; li++) {
        h = game.hunchLog[li];
        if (h.followed) { hunchLog.push(h); continue; }
        conceptYds[h.concept] = (conceptYds[h.concept] || 0) + h.yards;
        conceptN[h.concept] = (conceptN[h.concept] || 0) + 1;
    }
    if (LOG) {
        var i, e;
        console.log('Home quality ' + qa.toFixed(2) + ', Away quality ' + qb.toFixed(2));
        for (i = 0; i < game.log.length; i++) {
            e = game.log[i];
            console.log('Q' + e.q + ' ' + clockText(e.clock) + ' ' + (e.team !== undefined ? game.teams[e.team].name + ' ' : '') + e.text);
        }
        console.log('Final: ' + deps.game.scoreLine(game));
    }
}

var t = totals;
console.log('Accessible Football harness. ' + games + ' games, seed ' + SEED + '.');
console.log('');
console.log('Per team per game:');
console.log('  points ' + per(t.td * 6 + t.fgm * 3, teamGames) + ' (touchdowns ' + per(t.td, teamGames) + ', field goals ' + per(t.fgm, teamGames) + ' of ' + per(t.fga, teamGames) + ')');
console.log('  plays ' + per(t.plays, teamGames) + ', first downs ' + per(t.firstDowns, teamGames) + ', punts ' + per(t.punts, teamGames) + ', penalties ' + per(t.penalties, teamGames));
console.log('  pass attempts ' + per(t.passAtt, teamGames) + ', rush attempts ' + per(t.rushAtt, teamGames) + ', injuries ' + per(t.injuries, teamGames, 2));
console.log('');
console.log('Passing:');
console.log('  completion ' + pct(t.comp, t.passAtt) + ', yards per attempt ' + per(t.passYds - t.sackYds, t.passAtt) + ', yards after catch per completion ' + per(t.yac, t.comp));
console.log('  interceptions ' + pct(t.int, t.passAtt) + ' of attempts, drops ' + pct(t.drops, t.passAtt) + ', pressured ' + pct(t.pressuredAtt, t.passAtt + t.sacks));
console.log('  sacks ' + pct(t.sacks, t.passAtt + t.sacks) + ' of dropbacks, ' + per(t.sacks, teamGames) + ' per game');
var d;
for (d in t.depth) console.log('  ' + d + ': ' + t.depth[d].att + ' attempts, completion ' + pct(t.depth[d].comp, t.depth[d].att));
console.log('  coverage called (yards per snap, share of pass snaps): ' + Object.keys(covN).sort().map(function (k) {
    return k + ' ' + per(covYds[k], covN[k]) + ' (' + pct(covN[k], passSnaps) + ')';
}).join(', '));
console.log('');
console.log('Rushing:');
console.log('  yards per carry ' + per(t.rushYds, t.rushAtt, 2) + ', fumbles ' + per(t.fumbles, teamGames, 2) + ' per game, lost ' + per(t.fumblesLost, teamGames, 2));
for (d in t.box) console.log('  ' + d + ' box: ' + t.box[d].att + ' carries, ' + per(t.box[d].yds, t.box[d].att, 2) + ' per carry');
console.log('');
// Hunch accuracy (DESIGN.md 5.3). A hunch counts as right when the play that
// attacked the matchup the coordinator recommended gained more than that
// offense had been averaging on that kind of play. A good coordinator must be
// right clearly more often than a poor one; if these three lines are level,
// the belief model in engine/staff.js is not doing anything.
console.log('Coordinator hunches, by the offensive coordinator\'s evaluation.');
console.log('First, was he right? At the final whistle, did he name the receiver who');
console.log('really was winning his matchup? This is the direct test of the belief');
console.log('model and a good coordinator must beat a poor one clearly here.');
['poor', 'average', 'good'].forEach(function (n) {
    var b = beliefAcc[n];
    if (!b.n) { console.log('  ' + n + ': no sample'); return; }
    console.log('  ' + n + ': ' + b.n + ' coordinators, named the right man ' + pct(b.hit, b.n) +
        ' of the time, and the man he named was on average ' + (b.miss / b.n).toFixed(2) +
        ' worse than the best one');
});
console.log('Second, did following him pay? A hunch counts as right when the snap that attacked the matchup he named');
console.log('gained more than the same concept gains when it is called with no');
console.log('coordinator read behind it, which is the control group.');
function conceptMean(c) { return conceptN[c] >= 30 ? conceptYds[c] / conceptN[c] : null; }
function scored(h) { var m = conceptMean(h.concept); return m !== null && h.yards > m; }
var BANDS = [{ name: 'poor    ', lo: 0, hi: 40 }, { name: 'average ', lo: 40, hi: 55 }, { name: 'good    ', lo: 55, hi: 100 }];
var bi, band, sub, gain;
for (bi = 0; bi < BANDS.length; bi++) {
    band = BANDS[bi];
    sub = hunchLog.filter(function (h) { return h.evaluation >= band.lo && h.evaluation < band.hi && conceptMean(h.concept) !== null; });
    if (!sub.length) { console.log('  ' + band.name + ' no hunches followed'); continue; }
    gain = sub.reduce(function (a, h) { return a + (h.yards - conceptMean(h.concept)); }, 0) / sub.length;
    console.log('  ' + band.name + ' ' + sub.length + ' followed, right ' + pct(sub.filter(scored).length, sub.length) +
                ', average ' + (gain >= 0 ? 'gain of ' : 'loss of ') + Math.abs(gain).toFixed(2) + ' yards over what the play usually gets');
}
console.log('  What the coordinator is worth, in points scored per game:');
['poor', 'average', 'good'].forEach(function (n) {
    var b = ocPoints[n];
    console.log('    ' + n + ': ' + b.n + ' team games, ' + (b.n ? (b.pts / b.n).toFixed(2) : 'n/a') + ' points');
});
var byConf = ['sure', 'likely', 'guess'], ci, cs;
for (ci = 0; ci < byConf.length; ci++) {
    cs = hunchLog.filter(function (h) { return h.confidence === byConf[ci]; });
    if (cs.length) console.log('  said as a ' + byConf[ci] + ': ' + cs.length + ' followed, right ' + pct(cs.filter(scored).length, cs.length));
}
console.log('');
var blowouts = margins.filter(function (m) { return m > 35; }).length;
console.log('Games: home wins ' + wins[0] + ', away wins ' + wins[1] + ', ties ' + ties + '. Average margin ' + per(margins.reduce(function (a, b) { return a + b; }, 0), games) + '.');
console.log('Decided by more than 35: ' + blowouts + ' of ' + games + ' (' + pct(blowouts, games) + '). Target about one in eight of mixed-quality games, one in twenty-five between equal teams.');
pointsList.sort(function (a, b) { return a - b; });
console.log('Team points: low ' + pointsList[0] + ', median ' + pointsList[Math.floor(pointsList.length / 2)] + ', high ' + pointsList[pointsList.length - 1] + '.');
console.log('');
console.log('Yards per play distribution:');
var order = ['<-5', '-5..-1', '0', '1-3', '4-7', '8-12', '13-20', '21-40', '41+'];
var totalPlays = 0, k;
for (k in yardsHist) totalPlays += yardsHist[k];
for (k = 0; k < order.length; k++) console.log('  ' + order[k] + ': ' + pct(yardsHist[order[k]] || 0, totalPlays));
