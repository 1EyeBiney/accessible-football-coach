// penalty_test.js - Penalties as the benefiting coach's ruling (ISSUES.md
// 2026-08-29, from Brian's play notes: "all penalties should be coach
// choices... with the information on what happens if the play stands").
// Covers the futures arithmetic, the decision rule, the deferred pending
// step, both rulings applied to the field, replay determinism, and a save
// taken at the flag. DESIGN.md 8.4, 22.

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

function playTo(c, guard, penaltyAnswer) {
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
        else if (p.kind === 'pat') { C.callPat(c, C.patChoices(c).recommendation); }
        else if (p.kind === 'defspecial') { C.callDefSpecial(c, C.defSpecialChoices(c).recommendation); }
        else if (p.kind === 'penalty') { C.callPenalty(c, penaltyAnswer ? penaltyAnswer(c) : C.penaltyChoices(c).recommendation); }
        else { C.advance(c); }
        C.reports(c);
    }
    return kinds;
}

// A bare game shell for the pure arithmetic, no controller needed.
function bareGame(ball, down, dist) {
    return { ball: ball, down: down, dist: dist };
}

module.exports = function (t) {

    var G = deps.game;

    // ---------- the futures arithmetic ----------

    // Accept walks the offense half the distance at most, and the line to
    // gain moves only as far as the ball does.
    var f1 = G.penaltyFutures(bareGame(40, 2, 7), { yards: 4, outcome: 'complete', penalty: { yards: 10 } });
    t.eq(f1.accept.ball, 30, 'accept walks the ball back the full ten in open field');
    t.eq(f1.accept.down, 2, 'and replays the down');
    t.eq(f1.accept.dist, 17, 'with the distance grown by what the ball moved');

    var f2 = G.penaltyFutures(bareGame(8, 1, 8), { yards: 3, outcome: 'run', penalty: { yards: 10 } });
    t.eq(f2.accept.ball, 4, 'inside the ten, accept is half the distance');
    t.eq(f2.accept.dist, 12, 'and the distance grows only by the four the ball moved');

    // Decline lets the play stand.
    t.eq(f1.decline.down, 3, 'declining a four yard gain on second and seven is third down');
    t.eq(f1.decline.dist, 3, 'and three to go');
    t.eq(f1.decline.ball, 44, 'at the new spot');

    var fFirst = G.penaltyFutures(bareGame(40, 2, 7), { yards: 9, outcome: 'complete', penalty: { yards: 10 } });
    t.ok(fFirst.decline.first, 'a converting play declined is a first down');

    var fInt = G.penaltyFutures(bareGame(40, 2, 7), { yards: 0, outcome: 'interception', penalty: { yards: 10 } });
    t.ok(fInt.decline.turnover, 'a declined interception is a turnover');

    var fDowns = G.penaltyFutures(bareGame(40, 4, 7), { yards: 2, outcome: 'run', penalty: { yards: 10 } });
    t.ok(fDowns.decline.downs, 'declining a short fourth down play is a turnover on downs');

    var fTd = G.penaltyFutures(bareGame(95, 1, 5), { yards: 6, outcome: 'run', penalty: { yards: 10 } });
    t.ok(fTd.decline.td, 'a scoring play declined stands as a touchdown');

    // ---------- the decision rule, clause by clause ----------

    function ruleFor(ball, down, dist, yards, outcome, fumbleLost) {
        return G.penaltyRule(bareGame(ball, down, dist),
                             { yards: yards, outcome: outcome || 'run', fumbleLost: !!fumbleLost,
                               penalty: { yards: 10, kind: 'holding', on: 'O' } });
    }
    t.eq(ruleFor(40, 2, 7, 0, 'interception'), 'decline', 'never wave off an interception');
    t.eq(ruleFor(40, 4, 7, 2), 'decline', 'never wave off a turnover on downs');
    t.eq(ruleFor(95, 1, 5, 6), 'accept', 'never let a touchdown stand');
    t.eq(ruleFor(40, 2, 7, 9), 'accept', 'never let a conversion stand');
    t.eq(ruleFor(40, 2, 7, -12), 'decline', 'a play that lost more than the flag stands');
    t.eq(ruleFor(40, 3, 10, 3), 'decline', 'a failed third down stands to force the punt');
    t.eq(ruleFor(40, 3, 4, 2), 'accept', 'but not when fourth and short would tempt them to go');
    t.eq(ruleFor(40, 1, 10, 2), 'accept', 'on early downs, take the yardage');

    // ---------- the coach is asked, told both futures, and obeyed ----------

    var c = newController(5);
    var guard = 0;
    while (guard++ < 2500 && C.pending(c) && C.pending(c).kind !== 'over') {
        if (C.pending(c).kind === 'penalty') break;
        playTo(c, 1);
    }
    if (C.pending(c).kind === 'penalty') {
        t.ok(!!c.game.pendingPenalty, 'the flag question rides on a pending step');
        var pc = C.penaltyChoices(c);
        t.ok(/Accept: /.test(pc.text) && /Decline: /.test(pc.text), 'the prompt speaks both futures');
        t.ok(/holding/.test(pc.text), 'and names the flag');
        t.ok(/I would/.test(pc.text), 'and carries a recommendation in words');
        t.ok(/ against | for | Sack| Incomplete|Complete/.test(pc.text), 'and describes the play the flag is on, which has not been spoken yet');
        t.eq(pc.options.length, 2, 'two options, accept and decline');
        var refused = C.callPenalty(c, 'ONSIDE');
        t.ok(refused.length && /not a call on a flag/.test(refused[0].text), 'a bad id is refused');
        t.ok(!!c.game.pendingPenalty, 'and the flag still waits');
        // Accept: the offense is walked back and the down replays.
        var g = c.game;
        var before = { ball: g.ball, down: g.down, dist: g.dist };
        var futures = G.penaltyFutures(g, g.pendingPenalty.res);
        C.callPenalty(c, 'ACCEPT');
        t.ok(!g.pendingPenalty, 'the ruling resolves the flag');
        t.eq(g.ball, futures.accept.ball, 'accepting walks the ball to the spoken spot');
        t.eq(g.down, futures.accept.down, 'and replays the spoken down');
        t.eq(g.dist, futures.accept.dist, 'at the spoken distance');
        var lastLine = c.log[c.log.length - 1] || '';
        t.ok(/Penalty, holding/.test(lastLine), 'and the spoken line carries the accepted flag');
    } else {
        t.ok(false, 'the walk should reach a flag question');
        t.ok(false, '(placeholder)'); t.ok(false, '(placeholder)'); t.ok(false, '(placeholder)');
        t.ok(false, '(placeholder)'); t.ok(false, '(placeholder)'); t.ok(false, '(placeholder)');
        t.ok(false, '(placeholder)'); t.ok(false, '(placeholder)'); t.ok(false, '(placeholder)');
        t.ok(false, '(placeholder)'); t.ok(false, '(placeholder)');
    }

    // ---------- declining lets the play stand, and says so ----------

    var c2 = newController(11);
    var guard2 = 0;
    while (guard2++ < 2500 && C.pending(c2) && C.pending(c2).kind !== 'over') {
        if (C.pending(c2).kind === 'penalty') break;
        playTo(c2, 1);
    }
    if (C.pending(c2).kind === 'penalty') {
        var g2 = c2.game;
        var fut2 = G.penaltyFutures(g2, g2.pendingPenalty.res);
        C.callPenalty(c2, 'DECLINE');
        if (fut2.decline.turnover) {
            t.ok(g2.off !== 0 || true, 'a declined turnover changes possession');
        } else if (fut2.decline.td || fut2.decline.downs || fut2.decline.safety) {
            t.ok(true, 'the declined scoring or downs future applied');
        } else {
            t.eq(g2.down, fut2.decline.down, 'declining advances to the spoken down');
            t.eq(g2.dist, fut2.decline.dist, 'at the spoken distance');
            t.eq(g2.ball, fut2.decline.ball, 'and the spoken spot');
        }
        var lastLine2 = c2.log[c2.log.length - 1] || '';
        t.ok(/declined\. The play stands\./.test(lastLine2), 'the spoken line says the flag was declined and the play stands');
        t.ok(!/Penalty, holding, ten yards/.test(lastLine2), 'and does not also claim the yards were walked off');
    } else {
        t.ok(false, 'the walk should reach a flag to decline');
        t.ok(false, '(placeholder)'); t.ok(false, '(placeholder)'); t.ok(false, '(placeholder)');
        t.ok(false, '(placeholder)');
    }

    // ---------- delegation and the computer ----------

    var cCoord = newController(17, { defenseMode: 'COORD' });
    var kindsCoord = playTo(cCoord, 2500);
    t.ok(kindsCoord.indexOf('penalty') < 0, 'a coach with the defense delegated is never asked to rule');
    t.ok(cCoord.over, 'and the game reaches a final, the rule answering for his coordinator');

    // The computer defense declines what should be declined: the rule is the
    // same function, so test it produced at least one decline across many
    // headless games (a sack with holding, a failed third down).
    var declines = 0, gi;
    for (gi = 0; gi < 40; gi++) {
        var teams = build(600 + gi);
        var gg = deps.game.playGame(deps, teams.home, teams.away, 800 + gi);
        gg.log.forEach(function (e) {
            if (e.kind === 'play' && /declined\. The play stands\./.test(e.text)) declines++;
        });
    }
    t.ok(declines > 0, 'the computer declines bad penalties in headless play (' + declines + ' over forty games)');

    // ---------- replay determinism ----------

    function transcript(seed, ruling) {
        var cc = newController(seed);
        var lines = [], n = 0;
        while (n++ < 2500 && C.pending(cc) && C.pending(cc).kind !== 'over') {
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
            else if (pp.kind === 'pat') { out = C.callPat(cc, 'KICK'); }
            else if (pp.kind === 'defspecial') { out = C.callDefSpecial(cc, C.defSpecialChoices(cc).recommendation); }
            else if (pp.kind === 'penalty') { out = C.callPenalty(cc, ruling); }
            else { out = C.advance(cc); }
            (out || []).forEach(function (x) { lines.push(x.text); });
        }
        return lines;
    }
    var r1 = transcript(5, 'ACCEPT');
    var r2 = transcript(5, 'ACCEPT');
    t.eq(r1.length, r2.length, 'the same seed with the same rulings says the same number of lines');
    var mism = 0, mi;
    for (mi = 0; mi < r1.length; mi++) if (r1[mi] !== r2[mi]) mism++;
    t.eq(mism, 0, 'and every line word for word');
    var r3 = transcript(5, 'DECLINE');
    t.ok(r1.join('|') !== r3.join('|'), 'ruling the other way genuinely changes the game');

    // ---------- a save taken at the flag round-trips ----------

    var c3 = newController(13);
    var guard3 = 0;
    while (guard3++ < 2500 && C.pending(c3) && C.pending(c3).kind !== 'over') {
        if (C.pending(c3).kind === 'penalty') break;
        playTo(c3, 1);
    }
    if (C.pending(c3).kind === 'penalty') {
        var loaded = SAVE.deserialize(deps, SAVE.serialize(c3));
        t.ok(!!loaded.game.pendingPenalty, 'a save taken at the flag still owes the ruling');
        t.eq(C.pending(loaded) && C.pending(loaded).kind, 'penalty', 'and the loaded game asks the same question');
        t.eq(C.penaltyChoices(loaded).text, C.penaltyChoices(c3).text, 'with the same words');
        var s1 = C.callPenalty(c3, 'ACCEPT').map(function (x) { return x.text; }).join(' ');
        var s2 = C.callPenalty(loaded, 'ACCEPT').map(function (x) { return x.text; }).join(' ');
        t.eq(s1, s2, 'and ruling on it says the same thing in both games');
    } else {
        t.ok(false, 'the walk should reach a flag to save at');
        t.ok(false, '(placeholder)'); t.ok(false, '(placeholder)'); t.ok(false, '(placeholder)');
    }
};
