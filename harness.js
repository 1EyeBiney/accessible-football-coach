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
    var qa = EVEN ? 0 : rng.uniform(-0.6, 0.6), qb = EVEN ? 0 : rng.uniform(-0.6, 0.6);
    var home = deps.game.makeTeam(deps, { name: 'Home', stub: 'H', rng: rng, level: 'HS', quality: qa, runLean: rng.uniform(0.4, 0.65), aggression: rng.uniform(0.1, 0.5), execMean: 50 });
    var away = deps.game.makeTeam(deps, { name: 'Away', stub: 'A', rng: rng, level: 'HS', quality: qb, runLean: rng.uniform(0.4, 0.65), aggression: rng.uniform(0.1, 0.5), execMean: 50 });
    var game = deps.game.playGame(deps, home, away, SEED * 1000 + g);
    games++;
    if (game.final[0] > game.final[1]) wins[0]++; else if (game.final[1] > game.final[0]) wins[1]++; else ties++;
    margins.push(Math.abs(game.final[0] - game.final[1]));
    pointsList.push(game.final[0], game.final[1]);
    totals = totals || {};
    addStats(totals, game.stats[0]); addStats(totals, game.stats[1]);
    teamGames += 2;
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
console.log('');
console.log('Rushing:');
console.log('  yards per carry ' + per(t.rushYds, t.rushAtt, 2) + ', fumbles ' + per(t.fumbles, teamGames, 2) + ' per game, lost ' + per(t.fumblesLost, teamGames, 2));
for (d in t.box) console.log('  ' + d + ' box: ' + t.box[d].att + ' carries, ' + per(t.box[d].yds, t.box[d].att, 2) + ' per carry');
console.log('');
console.log('Games: home wins ' + wins[0] + ', away wins ' + wins[1] + ', ties ' + ties + '. Average margin ' + per(margins.reduce(function (a, b) { return a + b; }, 0), games) + '.');
pointsList.sort(function (a, b) { return a - b; });
console.log('Team points: low ' + pointsList[0] + ', median ' + pointsList[Math.floor(pointsList.length / 2)] + ', high ' + pointsList[pointsList.length - 1] + '.');
console.log('');
console.log('Yards per play distribution:');
var order = ['<-5', '-5..-1', '0', '1-3', '4-7', '8-12', '13-20', '21-40', '41+'];
var totalPlays = 0, k;
for (k in yardsHist) totalPlays += yardsHist[k];
for (k = 0; k < order.length; k++) console.log('  ' + order[k] + ': ' + pct(yardsHist[order[k]] || 0, totalPlays));
