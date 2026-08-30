// special_teams_test.js - The fourth down suggest-and-accept flow added to
// engine/controller.js and engine/game.js. Covers DESIGN.md 8.4 and the
// scoping in DESIGN_PROPOSALS.md proposal 3.

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

function newController(seed, opts) {
    var teams = build(seed);
    var c = C.newGame({ deps: deps, home: teams.home, away: teams.away, seed: seed * 31 + 5, coachTeam: 0,
                         offenseMode: (opts && opts.offenseMode) || 'ME',
                         defenseMode: (opts && opts.defenseMode) || 'ME', reportThreshold: 'everything' });
    C.drain(c);
    return c;
}

// Drives snaps, taking the coordinator's recommendation on offense, defense,
// and special teams, until either a 'special' decision arrives (returned) or
// the game ends (returns null).
function driveToSpecial(c, guardMax) {
    var guard = 0;
    while (!c.over && guard++ < guardMax) {
        var p = C.pending(c);
        if (p.kind === 'special') return p;
        if (p.kind === 'offense') { var s = C.suggestion(c, 'offense'); C.callOffense(c, s.play.id, s.tempo); }
        else if (p.kind === 'defense') { var d = C.suggestion(c, 'defense'); C.callDefense(c, d.call); }
        else if (p.kind === 'substitution') { C.answerSubstitution(c, 'yes'); }
        else if (p.kind === 'halftime') { var h = C.halftime(c); C.halftimeChoice(c, h.choices[0].id); }
        else if (p.kind === 'cointoss') { C.callToss(c, true); }
        else if (p.kind === 'tosschoice') { C.callTossChoice(c, C.tossChoices(c).recommendation); }
        else if (p.kind === 'kickoff') { C.callKickoff(c, C.kickoffChoices(c).recommendation); }
        else if (p.kind === 'pat') { C.callPat(c, C.patChoices(c).recommendation); }
        else if (p.kind === 'defspecial') { C.callDefSpecial(c, C.defSpecialChoices(c).recommendation); }
        else if (p.kind === 'auto') { C.advance(c); }
        C.reports(c);
    }
    return null;
}

module.exports = function (t) {
    // ---- the coach is asked on his own fourth down, in ME mode ----
    var c = newController(50);
    var reached = driveToSpecial(c, 4000);
    t.ok(reached !== null, 'a fourth down the coach faces arrives as a special-teams decision within a game');
    t.eq(c.game.down, 4, 'the decision genuinely is fourth down');
    t.eq(c.game.off, c.coach, 'the decision is on the coach\'s own possession');

    var choices = C.specialTeamsChoices(c);
    t.ok(['go', 'punt', 'fg'].indexOf(choices.recommendation) >= 0, 'the recommendation is one of the three real choices');
    t.ok(['sure', 'likely', 'guess'].indexOf(choices.confidence) >= 0, 'the confidence is one of the three words every coordinator uses');
    t.ok(choices.options.length >= 2, 'there is always more than one option on the list');
    t.ok(choices.options.some(function (o) { return o.id === 'GO'; }), 'going for it is always on the list');
    var ids = choices.options.map(function (o) { return o.id; });
    if (choices.recommendation === 'punt') t.ok(ids.indexOf('FAKEPUNT') >= 0, 'a fake punt is offered exactly when a punt is recommended');
    else t.ok(ids.indexOf('FAKEPUNT') < 0, 'a fake punt is not offered when a punt is not the call');
    if (choices.recommendation === 'fg') t.ok(ids.indexOf('FAKEFG') >= 0, 'a fake field goal is offered exactly when a field goal is recommended');
    else t.ok(ids.indexOf('FAKEFG') < 0, 'a fake field goal is not offered when a field goal is not the call');
    t.ok(typeof choices.text === 'string' && choices.text.length > 5, 'the suggestion is a real sentence');
    t.ok(!/\d/.test(choices.text.replace(/^\d+ yard/, '')), 'nothing but the field goal distance itself is spoken as a figure');

    // ---- every option is a real, accepted call ----
    ['GO', 'PUNT', 'FG', 'FAKEPUNT', 'FAKEFG'].forEach(function (id) {
        var fresh = newController(50);
        driveToSpecial(fresh, 4000);
        var before = { down: fresh.game.down, ball: fresh.game.ball, off: fresh.game.off };
        var out = C.callSpecial(fresh, id);
        t.ok(out.length > 0, id + ' produces an announcement');
        var changed = fresh.game.down !== before.down || fresh.game.ball !== before.ball || fresh.game.off !== before.off || fresh.game.finished;
        t.ok(changed, id + ' actually moves the game on');
    });
    var badCall = newController(50);
    driveToSpecial(badCall, 4000);
    var saidBad = C.callSpecial(badCall, 'NOTREAL');
    t.ok(saidBad.length > 0 && /not one of the options/i.test(saidBad[0].text), 'a call that is not one of the options is refused, not silently ignored');

    // ---- a fake announces itself as a fake ----
    var fakeC = newController(50);
    var p2 = driveToSpecial(fakeC, 4000);
    var choices2 = C.specialTeamsChoices(fakeC);
    if (choices2.recommendation === 'punt') {
        var said = C.callSpecial(fakeC, 'FAKEPUNT');
        t.ok(said.some(function (x) { return /fake punt/i.test(x.text); }), 'calling a fake punt announces it as one');
    } else if (choices2.recommendation === 'fg') {
        var said2 = C.callSpecial(fakeC, 'FAKEFG');
        t.ok(said2.some(function (x) { return /fake field goal/i.test(x.text); }), 'calling a fake field goal announces it as one');
    }

    // ---- the opponent's fourth down is never a decision the coach makes ----
    var opp = newController(51);
    var guard = 0, sawOpponentFourth = false, askedOnOpponentFourth = false;
    while (!opp.over && guard++ < 4000) {
        var pp = C.pending(opp);
        if (opp.game.down === 4 && opp.game.off !== opp.coach) {
            sawOpponentFourth = true;
            if (pp.kind === 'special') askedOnOpponentFourth = true;
        }
        if (pp.kind === 'offense') { var s2 = C.suggestion(opp, 'offense'); C.callOffense(opp, s2.play.id, s2.tempo); }
        else if (pp.kind === 'defense') { var d2 = C.suggestion(opp, 'defense'); C.callDefense(opp, d2.call); }
        else if (pp.kind === 'substitution') { C.answerSubstitution(opp, 'yes'); }
        else if (pp.kind === 'halftime') { var h2 = C.halftime(opp); C.halftimeChoice(opp, h2.choices[0].id); }
        else if (pp.kind === 'special') { var sp2 = C.specialTeamsChoices(opp); C.callSpecial(opp, sp2.recommendation.toUpperCase()); }
        else if (pp.kind === 'cointoss') { C.callToss(opp, true); }
        else if (pp.kind === 'tosschoice') { C.callTossChoice(opp, C.tossChoices(opp).recommendation); }
        else if (pp.kind === 'kickoff') { C.callKickoff(opp, C.kickoffChoices(opp).recommendation); }
        else if (pp.kind === 'pat') { C.callPat(opp, C.patChoices(opp).recommendation); }
        else if (pp.kind === 'defspecial') { C.callDefSpecial(opp, C.defSpecialChoices(opp).recommendation); }
        else if (pp.kind === 'auto') { C.advance(opp); }
        C.reports(opp);
    }
    t.ok(sawOpponentFourth, 'the opponent faced at least one fourth down over the course of a game');
    t.ok(!askedOnOpponentFourth, 'the coach is never asked about the opponent\'s fourth down');

    // ---- delegation: COORD never stops the coach, KEY always does (fourth down is always worth stopping for) ----
    var coord = newController(52, { offenseMode: 'COORD' });
    var guard2 = 0, sawSpecialInCoord = false;
    while (!coord.over && guard2++ < 4000) {
        var pc = C.pending(coord);
        if (pc.kind === 'special') sawSpecialInCoord = true;
        if (pc.kind === 'substitution') C.answerSubstitution(coord, 'yes');
        else if (pc.kind === 'halftime') { var hc = C.halftime(coord); C.halftimeChoice(coord, hc.choices[0].id); }
        else C.advance(coord);
        C.reports(coord);
    }
    t.ok(!sawSpecialInCoord, 'in COORD mode the coach is never stopped for a fourth-down decision');
    t.ok(coord.over, 'a fully delegated game with fourth downs still reaches a final');

    var key = newController(53, { offenseMode: 'KEY' });
    var reachedKey = driveToSpecial(key, 4000);
    t.ok(reachedKey !== null, 'in KEY mode the coach is still stopped for his own fourth down, since it is always worth stopping for');

    // ---- the same seed replays identically through a forced special-teams call ----
    function playFixedFourth(seed) {
        var cc = newController(seed);
        driveToSpecial(cc, 4000);
        C.callSpecial(cc, 'PUNT');
        var guardX = 0;
        while (!cc.over && guardX++ < 4000) {
            var px = C.pending(cc);
            if (px.kind === 'offense') { var sx = C.suggestion(cc, 'offense'); C.callOffense(cc, sx.play.id, sx.tempo); }
            else if (px.kind === 'defense') { var dx = C.suggestion(cc, 'defense'); C.callDefense(cc, dx.call); }
            else if (px.kind === 'substitution') C.answerSubstitution(cc, 'yes');
            else if (px.kind === 'halftime') { var hx = C.halftime(cc); C.halftimeChoice(cc, hx.choices[0].id); }
            else if (px.kind === 'special') { var spx = C.specialTeamsChoices(cc); C.callSpecial(cc, spx.recommendation.toUpperCase()); }
            else C.advance(cc);
            C.reports(cc);
        }
        return cc;
    }
    var run1 = playFixedFourth(54), run2 = playFixedFourth(54);
    t.eq(run1.log.length, run2.log.length, 'forcing a punt on a fourth down that might not have called for one still replays the same number of snaps');
    var mismatch = 0, i;
    for (i = 0; i < run1.log.length; i++) if (run1.log[i] !== run2.log[i]) mismatch++;
    t.eq(mismatch, 0, 'the same seed with the same forced special-teams call replays the play by play word for word');
    t.eq(run1.game.final[0], run2.game.final[0], 'and the same final score');
};
