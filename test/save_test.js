// save_test.js - Round-trips a game in progress through engine/save.js and
// checks it replays identically. Covers DESIGN.md 21.10.
//
// The scenario that actually exercises the hard part: a coach plays twenty
// snaps, asks his coordinator for the next suggestion (which draws from the
// seed) but has not yet called the play, saves right there, and loads into a
// fresh controller. If the load dropped the cached suggestion, asking again
// would redraw and the reloaded game would run one draw ahead of the
// original for the rest of the night. Playing twenty more snaps on both and
// diffing the play by play line for line is what would catch that.

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
var Save = require(path.join(eng, 'save.js'));

function build(seed) {
    var rng = new deps.Rng(seed);
    return {
        home: deps.game.makeTeam(deps, { name: 'Riverton', stub: 'R', rng: rng, level: 'HS', quality: 0, execMean: 55 }),
        away: deps.game.makeTeam(deps, { name: 'Fairview', stub: 'F', rng: rng, level: 'HS', quality: 0, execMean: 55 })
    };
}

function newController(seed) {
    var teams = build(seed);
    var c = C.newGame({ deps: deps, home: teams.home, away: teams.away, seed: seed * 31 + 5,
                         coachTeam: 0, offenseMode: 'ME', defenseMode: 'ME', reportThreshold: 'everything' });
    C.drain(c);
    return c;
}

// One question answered, the way a coach who takes his coordinator's advice
// answers it. Returns the pending kind that was handled, or 'over'.
function driveOne(c) {
    var p = C.pending(c);
    if (p.kind === 'offense') { var s = C.suggestion(c, 'offense'); C.callOffense(c, s.play.id, s.tempo); }
    else if (p.kind === 'defense') { var d = C.suggestion(c, 'defense'); C.callDefense(c, d.call); }
    else if (p.kind === 'substitution') { C.answerSubstitution(c, 'yes'); }
    else if (p.kind === 'halftime') { var h = C.halftime(c); C.halftimeChoice(c, h.choices[0].id); }
    else if (p.kind === 'special') { var sp = C.specialTeamsChoices(c); C.callSpecial(c, sp.recommendation.toUpperCase()); }
    else if (p.kind === 'cointoss') { C.callToss(c, true); }
    else if (p.kind === 'tosschoice') { C.callTossChoice(c, C.tossChoices(c).recommendation); }
    else if (p.kind === 'kickoff') { C.callKickoff(c, C.kickoffChoices(c).recommendation); }
    else if (p.kind === 'pat') { C.callPat(c, C.patChoices(c).recommendation); }
    else if (p.kind === 'defspecial') { C.callDefSpecial(c, C.defSpecialChoices(c).recommendation); }
    else if (p.kind === 'auto') { C.advance(c); }
    C.reports(c); // drain like the interface would, so nothing piles up
    return p.kind;
}

// Plays snaps until the controller's snapId reaches target or the game ends.
function driveTo(c, targetSnapId) {
    var guard = 0;
    while (c.snapId < targetSnapId && !c.over && guard++ < 4000) driveOne(c);
}

module.exports = function (t) {
    var SEED = 41;

    var c = newController(SEED);
    driveTo(c, 20);
    t.ok(!c.over, 'twenty snaps is not a whole game, so this one is still going');
    t.eq(c.snapId, 20, 'the original controller has played exactly twenty snaps');

    // Ask for the next suggestion without calling it yet, mid-decision,
    // which is the state a real save is most likely to happen in.
    var pendingKind = C.pending(c).kind;
    var suggestedBefore = (pendingKind === 'offense' || pendingKind === 'defense')
        ? C.suggestion(c, pendingKind).text : null;
    var rngStateAtSave = c.game.rng.state;

    var json = Save.serialize(c);
    t.ok(typeof json === 'string' && json.length > 100, 'serialize produces a real JSON string');

    var c2 = Save.deserialize(deps, json);
    t.eq(c2.snapId, 20, 'the reloaded controller remembers the snap count');
    t.eq(c2.game.rng.state, rngStateAtSave, 'the reloaded random generator is in the same state, not redrawn');
    t.eq(C.pending(c2).kind, pendingKind, 'the reloaded controller is waiting on the same kind of input');

    // The cached suggestion must come back unchanged and must not cost a draw.
    if (pendingKind === 'offense' || pendingKind === 'defense') {
        var suggestedAfter = C.suggestion(c2, pendingKind).text;
        t.eq(suggestedAfter, suggestedBefore, 'the reloaded coordinator repeats the exact suggestion he had already made');
        t.eq(c2.game.rng.state, rngStateAtSave, 'asking for the same suggestion again did not draw again');
    }

    // Identity, not equality: a substitution answered through the reloaded
    // controller has to change the same roster the reloaded controller reads
    // from everywhere else, the way engine/controller.js answerSubstitution
    // mutates h.target directly.
    var teamAfterLoad = c2.game.teams[c2.coach];
    t.ok(teamAfterLoad.roster.byId[teamAfterLoad.roster.players[0].id] === teamAfterLoad.roster.players[0],
         'the reloaded roster byId map points at the same objects as the roster it belongs to');
    t.ok(teamAfterLoad.live.beliefs.OC.member === teamAfterLoad.staff.OC,
         "the reloaded offensive coordinator's belief store points at the same staff member as the roster's own copy");

    // Continue both controllers, unloaded and reloaded, from here to the
    // fortieth snap, driven by the same scripted coach.
    driveTo(c, 40);
    driveTo(c2, 40);

    t.eq(c2.snapId, c.snapId, 'both controllers reach the same snap count');
    t.eq(c2.over, c.over, 'both controllers agree on whether the game has ended');
    t.eq(c2.log.length, c.log.length, 'both controllers produced the same number of play by play lines');
    var i, mismatch = 0;
    for (i = 0; i < c.log.length; i++) if (c.log[i] !== c2.log[i]) mismatch++;
    t.eq(mismatch, 0, 'every play by play line after the reload matches the unbroken game word for word');
    t.eq(c2.game.score[0], c.game.score[0], 'the home score matches after the reload');
    t.eq(c2.game.score[1], c.game.score[1], 'the away score matches after the reload');

    // ---- a second, shorter run: save and load right at kickoff ----
    var early = newController(SEED + 1);
    var earlyJson = Save.serialize(early);
    var earlyLoaded = Save.deserialize(deps, earlyJson);
    driveTo(early, 15);
    driveTo(earlyLoaded, 15);
    var j, mismatch2 = 0;
    for (j = 0; j < early.log.length; j++) if (early.log[j] !== earlyLoaded.log[j]) mismatch2++;
    t.eq(mismatch2, 0, 'a save made at kickoff, before any snap, also replays identically');

    // ---- a run played to its final, saved, and loaded still reports final ----
    var whole = newController(SEED + 2);
    var guard = 0;
    while (!whole.over && guard++ < 4000) driveOne(whole);
    t.ok(whole.over, 'the sanity game actually finished');
    var wholeJson = Save.serialize(whole);
    var wholeLoaded = Save.deserialize(deps, wholeJson);
    t.ok(wholeLoaded.over, 'a finished game is still finished after a reload');
    var fin = C.final(wholeLoaded);
    t.ok(fin !== null, 'a final is still available after loading a finished game');
    t.eq(fin.score[0], whole.game.final[0], 'the reloaded final score matches');
};
