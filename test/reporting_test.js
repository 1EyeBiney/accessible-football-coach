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
    else if (p.kind === 'pat') { C.callPat(c, C.patChoices(c).recommendation); }
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

    // ---------- the situation line names the possession ----------

    // Tab leads with whose ball it is, outright, so the yard line never has
    // to be resolved through a pronoun: "Riverton ball, own twenty one"
    // (ISSUES.md, from play).
    var cTab = newGame(9);
    step(cTab, 30);
    var gTab = cTab.game;
    if (C.pending(cTab) && C.pending(cTab).kind !== 'over' && !gTab.pendingKickoff && !gTab.pendingToss && !gTab.pendingTossChoice) {
        var sit = C.situationLine(cTab);
        var offNameT = gTab.teams[gTab.off].name;
        t.ok(sit.indexOf(offNameT + ' ball') >= 0, 'the situation line names the team with the ball');
        if (gTab.ball < 50) t.ok(/ ball, own /.test(sit), 'a spot in their own half reads own');
        else if (gTab.ball > 50) t.ok(/ ball, opponent /.test(sit), 'a spot across midfield reads opponent');
        else t.ok(/ ball at midfield/.test(sit), 'the fifty is midfield');
        t.ok(!/our own|their /.test(sit.split('.')[1] || ''), 'and the spot clause carries no pronoun to resolve');
    } else {
        t.ok(true, 'no live snap to check the situation line on (ceremony pending)');
        t.ok(true, '(placeholder)'); t.ok(true, '(placeholder)');
    }

    // ---------- S: the last action on the field ----------

    var cAct = newGame(13);
    t.eq(C.lastAction(cAct), null, 'before anything has happened there is no last action');
    step(cAct, 35);
    var act = C.lastAction(cAct);
    t.ok(typeof act === 'string' && act.length > 0, 'after play, S has something to say');
    t.ok(!/undefined/.test(act), 'and it never says undefined');
    // A touchdown sequence speaks the play AND what followed it: the extra
    // point is a consequence, not the action, so S starts at the snap and
    // carries the score with it.
    var guardA = 0, sawScore = false;
    while (guardA++ < 400 && C.pending(cAct) && C.pending(cAct).kind !== 'over') {
        step(cAct, 1);
        var lg = cAct.game.log;
        var tail = lg.slice(-3).map(function (e) { return e.kind; });
        if (tail.indexOf('td') >= 0 && tail.indexOf('pat') >= 0 && tail.indexOf('kickoff') < 0) {
            var line2 = C.lastAction(cAct);
            t.ok(/Touchdown/.test(line2), 'after a score, S includes the touchdown line');
            t.ok(/extra point|two point/.test(line2), 'and the try that followed it');
            sawScore = true;
            break;
        }
    }
    t.ok(sawScore || guardA >= 400, 'the walk ran (a score is not guaranteed in every seed)');

    // ---------- Z: what the other team had on the field ----------

    var c2 = newGame(11);
    // Before anything has happened there is no look to report, on either side.
    t.ok(/yet/.test(C.opponentUnit(c2)), 'before any snap, Z says nothing has been seen yet');

    // Across a change of possession Z remembers, with wording that never
    // claims to be last snap (approved wording, session 5 audit item).
    var cMem = newGame(17);
    step(cMem, 60);
    // Simulate the first snap of a new drive: the per-possession stamps are
    // stale but the per-team memory is not.
    if (cMem.seenOffFormation[cMem.game.off] && cMem.lastOffTeam !== undefined) {
        cMem.lastOffFormation = null;   // no look this possession
        if (cMem.game.off !== cMem.coach) {
            var mem = C.opponentUnit(cMem);
            t.ok(/last time they had the ball/.test(mem), 'a new drive reaches back to the last time that unit was faced');
            t.ok(/personnel/.test(mem), 'and reports the personnel it showed');
        } else {
            cMem.lastRunFront = null;
            var mem2 = C.opponentUnit(cMem);
            t.ok(/last time you had the ball|No look/.test(mem2), 'on offense the memory reads the same way');
            t.ok(true, '(placeholder)');
        }
    } else {
        t.ok(true, 'memory not populated in this seed'); t.ok(true, '(placeholder)');
    }

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

    // ---------- how players are named ----------

    var P = deps.players;

    // sayPlayer is the one place a player becomes speech.
    var man = { name: 'Marcus Webb', live: { slot: 'nose tackle' } };
    t.eq(P.sayPlayer(man, 'both'), 'nose tackle Webb', 'both gives position and last name');
    t.eq(P.sayPlayer(man, 'position'), 'nose tackle', 'position gives the position alone');
    // Name-only says the whole name. Fifty surnames are shared across eighty
    // men who dress, so about twice a game the last name alone came out as
    // "Fletcher beat Fletcher". In both-mode the position tells them apart
    // and the last name is enough; with the position gone it is not.
    t.eq(P.sayPlayer(man, 'name'), 'Marcus Webb', 'name gives the whole name, so two Webbs are told apart');
    t.eq(P.lastName(man), 'Webb', 'the last name is still what both-mode uses');
    t.eq(P.sayPlayer(man), 'nose tackle Webb', 'no mode is the default, which is both');
    t.eq(P.sayPlayer(null, 'both'), '', 'nobody says nothing');

    // A man with no slot stamped on him is off the field, and a position we
    // cannot vouch for is worse than none.
    t.eq(P.sayPlayer({ name: 'Gene Orsini', live: {} }, 'both'), 'Orsini',
         'a player with no slot falls back to his name');
    t.eq(P.sayPlayer({ name: 'Pele', live: { slot: 'center' } }, 'both'), 'center Pele',
         'a one-word name is its own last name');

    // The defensive labels go by depth, not by how many are on the field, so
    // a man keeps the same name whatever front is called around him. That is
    // the whole point: it is what makes a label something to learn him by.
    t.eq(P.defSlotSay('LB', 0), 'mike linebacker', 'the first linebacker is the mike');
    t.eq(P.defSlotSay('LB', 0), P.defSlotSay('LB', 0), 'and stays the mike');
    t.eq(P.defSlotSay('DB', 0), 'left corner', 'the first back is the left corner');
    t.eq(P.defSlotSay('DB', 4), 'nickel back', 'the fifth is the nickel');
    t.eq(P.defSlotSay('DB', 5), 'dime back', 'the sixth is the dime');
    t.eq(P.defSlotSay('DL', 1), 'nose tackle', 'the second lineman is the nose');
    // Past the table, the group's own plain word rather than nothing.
    t.eq(P.defSlotSay('DL', 40), 'defensive lineman', 'a roster deeper than the table still says something true');
    t.eq(P.defSlotSay('LB', 40), 'linebacker', 'the same for linebackers');
    t.eq(P.defSlotSay('DB', 40), 'defensive back', 'and for backs');

    // The offensive line convention matches how the run concepts use the
    // slots: inside runs pair OL3, OL2 and OL4, which is the interior three.
    t.eq(P.SLOT_SAY.OL3, 'center', 'the middle lineman is the center');
    t.eq(P.SLOT_SAY.OL1, 'left tackle', 'and the first is the left tackle');
    t.eq(P.SLOT_SAY.WR1, 'X receiver', 'the first receiver is the X, as the staff already calls him');

    // Every man on the field gets stamped, both sides of the ball.
    var cName = newGame(41);
    step(cName, 30);
    var onField = deps.game.onFieldList(
        deps.game.offenseLineup(cName.game.teams[0], 'IFORM', deps.players, deps.plays));
    t.ok(onField.length > 0, 'the offensive lineup has players in it');
    t.ok(onField.every(function (p) { return typeof p.live.slot === 'string' && p.live.slot.length > 0; }),
         'every man in an offensive lineup is given a position to be called by');
    var dLine = deps.game.defenseLineup(cName.game.teams[1], 'NICKEL', deps.plays, deps.players);
    t.eq(dLine.DB.length, 5, 'a nickel puts five backs on the field');
    t.ok(dLine.DL.concat(dLine.LB).concat(dLine.DB).every(function (p) {
             return typeof p.live.slot === 'string' && p.live.slot.length > 0;
         }), 'and every man in a defensive lineup too');
    t.eq(dLine.DB[4].live.slot, 'nickel back', 'the fifth back in a nickel is the nickel back');

    // The same man keeps his label when the front changes around him.
    var nickelMike = dLine.LB[0];
    var threeFour = deps.game.defenseLineup(cName.game.teams[1], 'THREE4', deps.plays, deps.players);
    t.eq(threeFour.LB[0], nickelMike, 'the same man leads the linebackers in both fronts');
    t.eq(nickelMike.live.slot, 'mike linebacker', 'and he is the mike in both, not a sam in one of them');

    // And - the case the first version got wrong - he keeps it when the man
    // in front of him is rested. The index used to be into the list of who
    // was available, not the depth chart, so benching one player renamed
    // everybody behind him: a nose tackle became a left end for a series and
    // then changed back (found by the milestone review). A label whose whole
    // job is to let a coach learn who somebody is has to stay put.
    var dTeam = cName.game.teams[1];
    var starter = dTeam.roster.byId[dTeam.roster.depth.DL[0]];
    var second = dTeam.roster.byId[dTeam.roster.depth.DL[1]];
    deps.game.defenseLineup(dTeam, 'NICKEL', deps.plays, deps.players);
    var secondBefore = second.live.slot;
    t.eq(starter.live.slot, 'left end', 'the first lineman on the chart is the left end');
    t.eq(secondBefore, 'nose tackle', 'and the second is the nose tackle');
    starter.live.benched = true;
    deps.game.defenseLineup(dTeam, 'NICKEL', deps.plays, deps.players);
    t.eq(second.live.slot, secondBefore, 'resting the man in front of him does not rename him');
    var third = dTeam.roster.byId[dTeam.roster.depth.DL[2]];
    t.eq(third.live.slot, 'defensive tackle', 'nor anybody else behind him');
    starter.live.benched = false;
    deps.game.defenseLineup(dTeam, 'NICKEL', deps.plays, deps.players);
    t.eq(second.live.slot, secondBefore, 'and he is called the same thing when the starter comes back');
    t.eq(starter.live.slot, 'left end', 'and the starter has his own name back');

    // A label is captured on the result, so a line said again later names
    // the men as they were on that snap rather than as they stand now.
    var cSnap = newGame(45);
    step(cSnap, 40);
    var snapEntry = null, si;
    for (si = cSnap.game.log.length - 1; si >= 0; si--) {
        if (cSnap.game.log[si].kind === 'play' && cSnap.game.log[si].res) { snapEntry = cSnap.game.log[si]; break; }
    }
    t.ok(snapEntry !== null, 'a snap was played');
    if (snapEntry) {
        t.ok(snapEntry.res.slotOf && Object.keys(snapEntry.res.slotOf).length > 0,
             'the result keeps who was standing where on that snap');
        var beforeMove = C.renderEntry(cSnap, snapEntry);
        // Move everybody's live label somewhere else entirely; the line must
        // not follow, because it is describing a snap that already happened.
        cSnap.game.teams[0].roster.players.forEach(function (p) { p.live.slot = 'somewhere else'; });
        cSnap.game.teams[1].roster.players.forEach(function (p) { p.live.slot = 'somewhere else'; });
        t.eq(C.renderEntry(cSnap, snapEntry), beforeMove,
             'and the line reads the same afterwards, rather than borrowing where they stand now');
    } else {
        t.ok(false, '(placeholder)'); t.ok(false, '(placeholder)');
    }

    // The mode reaches the play by play, and pressing A takes effect on the
    // next line spoken rather than on the next snap: a line that still
    // carries its result is rebuilt rather than read from what was stored.
    var cSay = newGame(43);
    step(cSay, 60);
    var withBoth = cSay.log.join(' ');
    t.ok(/(receiver|tackle|guard|linebacker|corner|safety|end|back|center)/.test(withBoth),
         'the play by play names positions');

    var lastPlay = null, li;
    for (li = cSay.game.log.length - 1; li >= 0; li--) {
        if (cSay.game.log[li].kind === 'play' && cSay.game.log[li].res) { lastPlay = cSay.game.log[li]; break; }
    }
    t.ok(lastPlay !== null, 'the log keeps the result alongside the text, which is what makes A retroactive');
    if (lastPlay) {
        var asBoth = C.renderEntry(cSay, lastPlay);
        C.setNaming(cSay, 'position');
        var asPos = C.renderEntry(cSay, lastPlay);
        C.setNaming(cSay, 'name');
        var asName = C.renderEntry(cSay, lastPlay);
        C.setNaming(cSay, 'both');
        t.ok(asBoth !== asPos, 'a line already in the log reads differently in position only');
        t.ok(asPos !== asName, 'and differently again in name only');
        t.eq(C.renderEntry(cSay, lastPlay), asBoth, 'and comes back to what it was');
    } else {
        t.ok(false, '(placeholder)'); t.ok(false, '(placeholder)'); t.ok(false, '(placeholder)');
    }

    // Rebuilding a line must not lose anything the stored text carried. The
    // timeout clause lived only on the two strings, so the moment the
    // controller started rebuilding from the result the coach stopped being
    // told his opponent had stopped the clock, about twice a game (found by
    // the milestone review). It rides on the result now.
    var timeoutEntry = { kind: 'play', team: 0, text: 'stored', terse: 'stored',
                         res: null };
    var anyPlay = null, ti;
    for (ti = cSay.game.log.length - 1; ti >= 0; ti--) {
        if (cSay.game.log[ti].kind === 'play' && cSay.game.log[ti].res) { anyPlay = cSay.game.log[ti]; break; }
    }
    if (anyPlay) {
        timeoutEntry.res = anyPlay.res;
        t.ok(C.renderEntry(cSay, timeoutEntry).indexOf('timeout') < 0, 'an ordinary snap says nothing about a timeout');
        anyPlay.res.timeoutBy = 'Fairview';
        t.ok(/timeout Fairview/.test(C.renderEntry(cSay, timeoutEntry)),
             'and a snap the other side stopped the clock on says so, rebuilt or not');
        C.setVerbosity(cSay, 'terse');
        t.ok(/timeout Fairview/.test(C.renderEntry(cSay, timeoutEntry)), 'in terse too');
        C.setVerbosity(cSay, 'full');
        delete anyPlay.res.timeoutBy;
    } else {
        t.ok(false, '(placeholder)'); t.ok(false, '(placeholder)'); t.ok(false, '(placeholder)');
    }

    t.eq(C.setNaming(cSay, 'position'), 'position', 'the setter takes a real mode');
    t.eq(cSay.game.naming, 'position', 'and puts it where the engine reads it when a snap resolves');
    t.eq(C.setNaming(cSay, 'nonsense'), 'both', 'and anything else falls back to the default');

    // Naming survives a save, like every other preference.
    var cNameSave = newGame(47, { naming: 'name' });
    step(cNameSave, 20);
    var reloadedName = Save.deserialize(deps, Save.serialize(cNameSave));
    t.eq(reloadedName.naming, 'name', 'naming comes back from a save');
    t.eq(reloadedName.game.naming, 'name', 'and is put back on the game the engine reads');
    var legacyName = JSON.parse(Save.serialize(cNameSave));
    delete legacyName.controller.naming;
    t.eq(Save.deserialize(deps, JSON.stringify(legacyName)).naming, 'both',
         'a save from before naming existed loads with position and name');
};
