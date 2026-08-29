// reporting_test.js - What the game says out loud about the field and about
// the other team. Covers the ball spot spoken from the coach's side of the
// ball (ISSUES.md, from play), the Z key's report on the opponent's unit, and
// the play hints toggle. DESIGN.md 16.5, 21.8, 24.1.

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

function newGame(seed, opts) {
    var teams = build(seed), o = opts || {};
    var c = C.newGame({
        deps: deps, home: teams.home, away: teams.away, seed: seed * 31 + 5,
        coachTeam: o.coachTeam === undefined ? 0 : o.coachTeam,
        offenseMode: o.offenseMode || 'ME', defenseMode: o.defenseMode || 'ME',
        playClock: 'OFF', reportThreshold: 'everything',
        hints: o.hints, naming: o.naming
    });
    C.drain(c);
    return c;
}

// Answers whatever the game asks, so a test can walk to an interesting state.
function answer(c) {
    var p = C.pending(c);
    if (!p || p.kind === 'over') return p ? p.kind : 'over';
    if (p.kind === 'offense') { var s = C.suggestion(c, 'offense'); C.callOffense(c, s.play.id, s.tempo); }
    else if (p.kind === 'defense') { var d = C.suggestion(c, 'defense'); C.callDefense(c, d.call); }
    else if (p.kind === 'substitution') { C.answerSubstitution(c, 'yes'); }
    else if (p.kind === 'halftime') { var h = C.halftime(c); C.halftimeChoice(c, h.choices[0].id); }
    else if (p.kind === 'special') { var sp = C.specialTeamsChoices(c); C.callSpecial(c, sp.recommendation.toUpperCase()); }
    else if (p.kind === 'cointoss') { C.callToss(c, true); }
    else if (p.kind === 'tosschoice') { C.callTossChoice(c, 'RECEIVE'); }
    else if (p.kind === 'kickoff') { C.callKickoff(c, C.kickoffChoices(c).recommendation); }
    else { C.advance(c); }
    C.drain(c);
    return p.kind;
}

function step(c, n) {
    var i = 0;
    while (i++ < n) {
        var p = C.pending(c);
        if (!p || p.kind === 'over') break;
        answer(c);
    }
    return C.pending(c);
}

module.exports = function (t) {

    // ---------- the ball spot, spoken from the coach's side ----------

    // game.ball is offense-relative, so the half below fifty belongs to the
    // offense. Who says "our" about it depends on who is coaching, not on who
    // has the ball. All four quadrants, both directions.
    t.eq(C.spotWords(25, 0, 0), 'our own twenty five', 'coach on offense, ball in the offense half, is our own');
    t.eq(C.spotWords(25, 0, 1), 'their twenty five', 'coach on defense, ball in the offense half, is theirs');
    t.eq(C.spotWords(75, 0, 0), 'their twenty five', 'coach on offense, ball across midfield, is theirs');
    t.eq(C.spotWords(75, 0, 1), 'our own twenty five', 'coach on defense, ball in his own half, is our own');
    t.eq(C.spotWords(25, 1, 1), 'our own twenty five', 'the same holds when the other team is the offense');
    t.eq(C.spotWords(25, 1, 0), 'their twenty five', 'and when the coach is defending it');

    // Midfield belongs to nobody and takes no possessive at all.
    t.eq(C.spotWords(50, 0, 0), 'midfield', 'midfield is midfield to the offense');
    t.eq(C.spotWords(50, 0, 1), 'midfield', 'midfield is midfield to the defense');

    // With nobody coaching - the harness - the wording stays offense-relative,
    // which is what keeps headless output byte for byte what it always was.
    t.eq(C.spotWords(25, 0, null), 'our own twenty five', 'no coach falls back to offense-relative');
    t.eq(C.spotWords(75, 0, null), 'their twenty five', 'no coach, other half');
    t.eq(C.spotWords(25, 0, undefined), 'our own twenty five', 'an omitted coach reads the same as null');

    // The same rule inside the engine's own formatter, which feeds the play
    // by play and the kickoff lines.
    // The engine's own formatter says it the same way, so a coach never hears
    // one spot named two ways inside a single utterance.
    var G = deps.game;
    t.eq(G.spot(25, 0, 0), 'our own 25', 'engine spot, coach owns the near half');
    t.eq(G.spot(25, 0, 1), 'their 25', 'engine spot, the near half is the opponent his');
    t.eq(G.spot(75, 0, 1), 'our own 25', 'engine spot, the far half is the coach his');
    t.eq(G.spot(75, 0, 0), 'their 25', 'engine spot, across midfield from the coach');
    t.eq(G.spot(50, 0, 1), 'midfield', 'engine spot calls the fifty midfield, as the situation line does');
    t.eq(G.spot(25, 0, null), 'our own 25', 'engine spot with nobody coaching stays offense-relative');

    // And in the sentence a coach actually hears. Walk a real game to a snap
    // where the coach is defending, and check the line agrees with the truth.
    var c = newGame(7);
    var p = step(c, 60);
    var g = c.game;
    if (p && p.kind !== 'over') {
        var line = C.shortSituation(c);
        var nearOwner = g.ball < 50 ? g.off : 1 - g.off;
        var wantOurs = nearOwner === c.coach;
        t.eq(/our own/.test(line), wantOurs, 'the short situation says our own only when the near half is the coach his');
        t.eq(/their/.test(line), !wantOurs && g.ball !== 50, 'and says their otherwise');
    } else {
        t.ok(false, 'the walk should reach a live snap');
    }

    // ---------- Z: what the other team had on the field ----------

    var c2 = newGame(11);
    // Before anything has happened there is no look to report, on either side.
    t.ok(/yet/.test(C.opponentUnit(c2)), 'before any snap, Z says nothing has been seen yet');

    step(c2, 40);
    var unit = C.opponentUnit(c2);
    t.ok(typeof unit === 'string' && unit.length > 0, 'Z always answers with a sentence');
    t.ok(!/\d/.test(unit), 'Z speaks no digits');

    // Play far enough to have seen both sides of the ball, then check that the
    // report names a real unit rather than the coach his own.
    var sawDefensive = false, sawOffensive = false, guard = 0;
    while (guard++ < 300 && C.pending(c2) && C.pending(c2).kind !== 'over') {
        var line2 = C.opponentUnit(c2);
        if (/linemen/.test(line2)) sawDefensive = true;
        if (/personnel/.test(line2)) sawOffensive = true;
        step(c2, 3);
    }
    t.ok(sawDefensive, 'on offense Z reports the defensive front that actually played');
    t.ok(sawOffensive, 'on defense Z reports the personnel the offense showed');

    // ---------- play hints ----------

    var cOn = newGame(21, { hints: 'on' });
    var cOff = newGame(21, { hints: 'off' });
    t.eq(cOn.hints, 'on', 'hints default through the option');
    t.eq(cOff.hints, 'off', 'hints can start off');
    t.eq(newGame(21).hints, 'on', 'hints default to on when nothing is passed');

    // The hint itself is the concept description, and it rides on the
    // suggestion regardless of the setting: the interface decides whether to
    // speak it, so the engine never has to know.
    step(cOn, 12);
    var pend = C.pending(cOn);
    if (pend && pend.kind === 'offense') {
        var sug = C.suggestion(cOn, 'offense');
        t.ok(typeof sug.describe === 'string' && sug.describe.length > 0, 'an offensive suggestion carries its hint text');
        t.ok(sug.text.indexOf(sug.describe) < 0, 'the hint is a separate field, not baked into the call');
    } else {
        t.ok(true, 'no offensive call came up in twelve steps, nothing to check');
        t.ok(true, '(placeholder to keep the count stable)');
    }

    // The call sheet carries the same hint on every entry, for the viewer.
    var sheet = C.callSheet(cOn);
    t.ok(sheet.length > 0, 'the call sheet has entries');
    t.ok(sheet.every(function (e) { return typeof e.describe === 'string'; }), 'every call sheet entry carries its hint');

    // The setters, which the interface uses to keep its mirror in step.
    t.eq(C.setHints(cOn, 'off'), 'off', 'hints can be turned off');
    t.eq(C.setHints(cOn, 'on'), 'on', 'and back on');
    t.eq(C.setHints(cOn, 'nonsense'), 'on', 'anything that is not off is on');
    t.eq(C.setPacing(cOn, 'slow'), 'slow', 'pacing has a mirror on the controller too');

    // ---------- the preferences survive a save ----------
    // A preference only comes back from a file if the controller carries it,
    // because the controller is what save.js writes. Pacing was the one
    // setting without a mirror, so P reset to medium on every load.
    var Save = require(path.join(eng, 'save.js'));
    var cSave = newGame(31, { hints: 'off' });
    C.setPacing(cSave, 'slow');
    step(cSave, 25);
    var reloaded = Save.deserialize(deps, Save.serialize(cSave));
    t.eq(reloaded.hints, 'off', 'hints come back from a save');
    t.eq(reloaded.pacing, 'slow', 'and so does pacing');
    t.eq(reloaded.verbosity, cSave.verbosity, 'verbosity still does, as before');
    t.eq(reloaded.lastRunFront, cSave.lastRunFront, 'the front Z reports survives too');
    t.eq(reloaded.lastDefTeam, cSave.lastDefTeam, 'with the team it belonged to');
    t.eq(C.opponentUnit(reloaded), C.opponentUnit(cSave), 'so Z answers a loaded game exactly as it answered the live one');

    // An older save that predates these fields still loads, with the
    // defaults, rather than coming back with them undefined.
    var older = JSON.parse(Save.serialize(cSave));
    delete older.controller.hints;
    delete older.controller.pacing;
    var legacy = Save.deserialize(deps, JSON.stringify(older));
    t.eq(legacy.hints, 'on', 'a save from before hints existed loads with them on');
    t.eq(legacy.pacing, 'medium', 'and with medium pacing');
};
