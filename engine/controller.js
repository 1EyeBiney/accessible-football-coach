// controller.js - The only surface the interface talks to for a game.
// (Accessible Football engine) Plain script, no browser dependencies.
// Implements DESIGN.md 8.2, 16.5, 16.5.1, 18.3, 19, 22, 23.
//
// This file owns the step-by-step shape of a game: what input is needed next,
// what the coordinator suggests, what to say after each snap, and in what
// order. It returns strings and plain objects and never touches the DOM. The
// interface announces what it is given; it never works out football for itself.
//
// The between-play order is fixed by DESIGN.md 19.3 and this file is where it
// lives:
//   1. the play result
//   2. must-answer reports, each with a one-key choice
//   3. a chime per source for anything cued
//   4. the situation line
//   5. the coordinator's suggestion
//   6. the play call
//
// Announcements come back as { text, priority, source }. Priority is one of
// result, must, cued, batched. Source is OC, DC, SPOT, TRAINER, or null, and
// is what the interface uses to pick a chime.

(function (root) {
    'use strict';

    function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

    // Delegation levels for a side of the ball (DESIGN.md 22).
    var MODES = { ME: 'I call everything', COORD: 'The coordinator calls everything',
                  KEY: 'The coordinator calls, and stops for the big ones' };

    // Play clock settings (DESIGN.md 16.5.1). Off is the default for a first run.
    var PLAY_CLOCK = { OFF: 0, RELAXED: 40, STANDARD: 25, FAST: 18 };

    // ---------- speech shaping ----------

    var ORDINAL = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth' };

    function words(n) {
        var small = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
                     'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
                     'seventeen', 'eighteen', 'nineteen'];
        var tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
        n = Math.round(n);
        if (n < 0) return 'minus ' + words(-n);
        if (n < 20) return small[n];
        if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + small[n % 10] : '');
        return String(n);
    }

    function clockWords(secs) {
        var m = Math.floor(secs / 60), s = secs % 60;
        if (m === 0) return words(s) + ' seconds';
        return words(m) + ' ' + (m === 1 ? 'minute' : 'minutes') + (s ? ' ' + words(s) : '');
    }

    // Where the ball is, spoken the way a coach says it.
    function spotWords(ball) {
        if (ball === 50) return 'midfield';
        return (ball < 50 ? 'our own ' : 'their ') + words(ball < 50 ? ball : 100 - ball);
    }

    // ---------- construction ----------

    // opts: { deps, home, away, seed, coachTeam (0 or 1),
    //         offenseMode, defenseMode, playClock, reportThreshold }
    function newGame(opts) {
        var deps = opts.deps;
        var c = {
            deps: deps,
            home: opts.home, away: opts.away,
            coach: opts.coachTeam === undefined ? 0 : opts.coachTeam,
            offenseMode: opts.offenseMode || 'ME',
            defenseMode: opts.defenseMode || 'ME',
            playClock: opts.playClock === undefined ? 'OFF' : opts.playClock,
            // everything | important | injuries (DESIGN.md 19.4)
            reportThreshold: opts.reportThreshold || 'everything',
            pending: null,
            queue: [],          // announcements not yet handed to the interface
            cued: [],           // reports waiting behind a chime
            batched: [],        // low priority notes, spoken at a break
            log: [],            // the play by play, one string per snap
            halftimeDone: false,
            over: false,
            lastReport: '',
            verbosity: opts.verbosity || 'full',
            secondHalfPlan: null
        };
        c.game = deps.game.startGame(deps, opts.home, opts.away, opts.seed);
        c.game.controller = c;
        // The coach answers his own substitution questions rather than having
        // the automatic coach answer them for him (DESIGN.md 18.3).
        c.game.teams[c.coach].autoCoach = false;
        c.game.teams[1 - c.coach].autoCoach = true;
        c.snapId = 0;
        c.suggestCache = {};
        say(c, situationLine(c), 'result', null);
        c.pending = nextPending(c);
        return c;
    }

    function say(c, text, priority, source) {
        if (!text) return;
        c.queue.push({ text: text, priority: priority || 'result', source: source || null });
    }

    // Everything said since the interface last collected. The interface calls
    // this after every action and announces what comes back in order.
    function drain(c) {
        var out = c.queue;
        c.queue = [];
        return out;
    }

    // ---------- what the game needs next ----------

    function offenseIsCoach(c) { return c.game.off === c.coach; }

    function sideMode(c, offense) {
        return offense ? c.offenseMode : c.defenseMode;
    }

    // Is this a snap the coach should be stopped for, in the third delegation
    // mode? DESIGN.md 22 lists what counts.
    function worthStopping(c) {
        var g = c.game;
        if (g.down >= 3) return true;
        if (100 - g.ball <= 20) return true;
        if ((g.quarter === 2 || g.quarter >= 4) && g.clock <= 120) return true;
        var team = g.teams[c.coach];
        if (team.live.ocHunch && team.live.ocHunchAge === 0 && team.live.ocHunch.confidence === 'sure') return true;
        if (team.live.dcHunch && team.live.dcHunchAge === 0 && team.live.dcHunch.confidence === 'sure') return true;
        return false;
    }

    // What input does the game want? One of:
    //   { kind: 'substitution', hunch }      a must-answer report
    //   { kind: 'halftime' }
    //   { kind: 'offense' } / { kind: 'defense' }
    //   { kind: 'special' }                  the coach's own fourth down
    //   { kind: 'auto' }                     a delegated side is calling
    //   { kind: 'over' }
    function nextPending(c) {
        if (c.over) return { kind: 'over' };
        var must = takeMust(c);
        if (must) return { kind: 'substitution', hunch: must };
        if (c.game.quarter === 3 && !c.halftimeDone) return { kind: 'halftime' };
        if (victoryFormationComing(c)) return { kind: 'auto', reason: 'victory formation' };
        if (c.game.down === 4) {
            // Not the coach's ball: the automatic coach's fourth-down call is
            // never a decision he is asked about, the same as any other snap
            // the other sideline runs (DESIGN.md 24.1).
            if (c.game.off !== c.coach) return { kind: 'auto', reason: 'special teams' };
            var stMode = c.offenseMode; // it is his possession either way
            if (stMode === 'COORD') return { kind: 'auto', reason: 'special teams' };
            if (stMode === 'KEY' && !worthStopping(c)) return { kind: 'auto', reason: 'special teams' };
            return { kind: 'special' };
        }
        var mine = offenseIsCoach(c);
        var mode = sideMode(c, mine);
        if (mode === 'COORD') return { kind: 'auto' };
        if (mode === 'KEY' && !worthStopping(c)) return { kind: 'auto' };
        return { kind: mine ? 'offense' : 'defense' };
    }

    // The same victory-formation test engine/game.js's step() uses, so the
    // interface never asks a question a kneel is about to make moot.
    function victoryFormationComing(c) {
        var g = c.game;
        var diff = g.score[g.off] - g.score[1 - g.off];
        return !g.ot && g.quarter >= 4 && diff > 0 &&
               g.clock <= 40 * (5 - g.down) && g.timeouts[1 - g.off] === 0;
    }

    function takeMust(c) {
        var team = c.game.teams[c.coach], i, h;
        for (i = 0; i < team.live.reports.length; i++) {
            h = team.live.reports[i];
            if (h.urgency === 'must' && h.kind === 'substitution' && !h.answered) return h;
        }
        return null;
    }

    function pending(c) { return c.pending; }

    // ---------- the lines the interface speaks ----------

    function situationLine(c) {
        var g = c.game;
        var us = g.teams[c.coach].name, them = g.teams[1 - c.coach].name;
        var toGo = g.dist >= (100 - g.ball) ? 'goal' : words(g.dist);
        // Only call it overtime when it actually is overtime. The quarter
        // counter runs past four at the end of regulation whether the game is
        // tied or not.
        var qtr = g.ot ? 'overtime' : (words(Math.min(4, g.quarter)) + ' quarter');
        return ORDINAL[Math.min(4, g.down)] + ' and ' + toGo + ', ball on ' + spotWords(g.ball) + '. ' +
               qtr + ', ' + clockWords(g.clock) + '. ' +
               us + ' ' + words(g.score[c.coach]) + ', ' + them + ' ' + words(g.score[1 - c.coach]) + '.';
    }

    // What is on the field and what the defense is showing, front-loaded by
    // importance and leaving out anything at its default (DESIGN.md 21.8).
    function examine(c) {
        var g = c.game, PL = c.deps.plays;
        var parts = [];
        var team = g.teams[c.coach];
        if (offenseIsCoach(c)) {
            var f = c.lastFormation || 'SPREAD';
            parts.push('Personnel ' + PL.FORMATIONS[f].personnel + ', ' + PL.FORMATIONS[f].say + '.');
            if (team.live.ocHunch) parts.push('Your coordinator: ' + team.live.ocHunch.text);
        } else {
            if (team.live.dcHunch) parts.push('Your coordinator: ' + team.live.dcHunch.text);
        }
        var benched = team.roster.players.filter(function (p) { return p.live.benched; });
        if (benched.length) parts.push(words(benched.length) + ' resting: ' + benched.map(function (p) { return p.name; }).join(', ') + '.');
        var hurt = team.roster.players.filter(function (p) { return p.live.out; });
        if (hurt.length) parts.push(words(hurt.length) + ' out: ' + hurt.map(function (p) { return p.name; }).join(', ') + '.');
        if (!parts.length) parts.push('Nothing unusual.');
        return parts.join(' ');
    }

    // What the offense is showing before the coach's defensive call, spoken
    // only when it is real information. This is exactly what the engine's own
    // defensive coordinator is handed (buildSuggestion feeds chooseDefense the
    // same personnel), so the human coach hears neither more nor less than the
    // computer one knows (DESIGN.md 16.5, 24.1). Real defenses match personnel,
    // not formation: the formation is only revealed at the line, so it is not
    // announced here.
    function offenseShows(c) {
        var PL = c.deps.plays;
        // A look only counts when it was a look at the team that has the
        // ball now; after a turnover the last formation seen belongs to the
        // coach's own offense, and reporting it as the opponent's would be a
        // false claim spoken as fact.
        var seen = c.lastOffFormation && c.lastOffTeam === c.game.off;
        if (!seen) return 'No look at their personnel yet.';
        var p = PL.FORMATIONS[c.lastOffFormation].personnel;
        return 'They show ' + words(Number(p)) + ' personnel.';
    }

    // ---------- suggestions (DESIGN.md 16.5) ----------

    var CONF_SAY = { sure: 'I like it', likely: 'worth a shot', guess: 'I am guessing here' };

    // What an adjustment looks like from the other sideline, for the halftime
    // briefing. These are things our coordinator watched them do.
    var ADJ_SAY = { BRACKET: 'put two men on our best receiver',
                    HELP: 'shade a safety over the top',
                    LOAD: 'crowd the box',
                    SPY: 'keep a linebacker on our quarterback',
                    CONTAIN: 'stay wide and take away the edge' };

    // side is 'offense' or 'defense'. Returns the coordinator's call plus the
    // wording the interface reads, including the word sub when the call changes
    // personnel and hands the defense a free substitution.
    // Working out a suggestion draws from the generator, so it is worked out
    // once per snap and remembered. Without this, a coach who asks his
    // coordinator twice would get a different game from one who asks once, and
    // a seed would stop replaying.
    function suggestion(c, side) {
        var key = side + ':' + c.snapId;
        if (c.suggestCache[key]) return c.suggestCache[key];
        var s = buildSuggestion(c, side);
        c.suggestCache[key] = s;
        return s;
    }

    function buildSuggestion(c, side) {
        var g = c.game, PL = c.deps.plays;
        var sit = { down: g.down, dist: g.dist, ytg: 100 - g.ball, twoPoint: false };
        if (side === 'offense') {
            var team = g.teams[g.off];
            var oc = c.deps.game.chooseOffense(g, team, sit, g.off, c.deps);
            var play = oc.play;
            var personnel = PL.FORMATIONS[play.formation].personnel;
            var subs = team.live.lastPersonnel !== null && team.live.lastPersonnel !== personnel;
            var hunch = team.live.ocHunch;
            var conf = hunch ? (CONF_SAY[hunch.confidence] || '') : 'worth a shot';
            var c2 = PL.CONCEPTS[play.concept];
            var line = PL.CONCEPTS[play.concept].name + ' from ' + PL.FORMATIONS[play.formation].name +
                       (subs ? ', sub' : '') + '. ' + conf + '.';
            return { side: 'offense', play: play, tempo: oc.tempo, sub: subs,
                     confidence: hunch ? hunch.confidence : 'guess',
                     text: line, describe: c2.desc,
                     calls: play.calls, successRate: play.calls ? Math.round(100 * play.success / play.calls) : null };
        }
        var dteam = g.teams[1 - g.off];
        var offTeam = g.teams[g.off];
        var personnel2 = PL.FORMATIONS[c.lastOffFormation || 'SPREAD'].personnel;
        var dc = c.deps.game.chooseDefense(g, dteam, sit, offTeam, personnel2, 1 - g.off, c.deps);
        var dh = dteam.live.dcHunch;
        c.lastDefFront = dc.front;
        return { side: 'defense', call: dc, confidence: dh ? dh.confidence : 'guess',
                 text: PL.FRONTS[dc.front].name + ', ' + PL.COVERAGES[dc.coverage].name + ', ' +
                       PL.PRESSURES[dc.pressure].say +
                       (dc.adjustment !== 'NONE' ? ', ' + PL.ADJUSTMENTS[dc.adjustment].say : '') + '. ' +
                       (dh ? (CONF_SAY[dh.confidence] || '') : 'standard call') + '.' };
    }

    // The call sheet for the current situation, as a list of plays that fit,
    // so the coach hears the handful that matter rather than the whole book
    // (DESIGN.md 16.4).
    function callSheet(c, formation) {
        var g = c.game, PL = c.deps.plays;
        var team = g.teams[g.off];
        var sit = { down: g.down, dist: g.dist, ytg: 100 - g.ball };
        var tags = c.deps.game.situationTags(sit, g, g.off);
        var out = [], i, pl, con, fit, ti;
        for (i = 0; i < team.playbook.length; i++) {
            pl = team.playbook[i];
            if (formation && pl.formation !== formation) continue;
            con = PL.CONCEPTS[pl.concept];
            fit = 0;
            for (ti = 0; ti < tags.length; ti++) if (con.tags.indexOf(tags[ti]) >= 0) fit++;
            if (!fit && con.type !== 'special') continue;
            out.push({ id: pl.id, play: pl, name: con.name, describe: con.desc,
                       calls: pl.calls, successRate: pl.calls ? Math.round(100 * pl.success / pl.calls) : null,
                       text: con.name + (pl.calls ? '. Called ' + words(pl.calls) + ' times, working ' +
                             words(Math.round(100 * pl.success / pl.calls)) + ' percent.' : '.') });
        }
        return out;
    }

    function formations(c) {
        var PL = c.deps.plays, out = [], k;
        for (k in PL.FORMATIONS) {
            out.push({ id: k, name: PL.FORMATIONS[k].name, text: PL.FORMATIONS[k].name + '. ' + PL.FORMATIONS[k].say + '.' });
        }
        return out;
    }

    // The players on the field for a personnel group, for the substitution list
    // that hangs off the formation prompt (DESIGN.md 16.5).
    function substitutionList(c, formation) {
        var g = c.game, team = g.teams[c.coach];
        var lu = offenseIsCoach(c)
            ? c.deps.game.offenseLineup(team, formation || c.lastFormation || 'SPREAD', c.deps.players, c.deps.plays)
            : c.deps.game.defenseLineup(team, c.lastDefFront || 'NICKEL', c.deps.plays);
        var on = c.deps.game.onFieldList(lu), out = [], i, p, next;
        for (i = 0; i < on.length; i++) {
            p = on[i];
            next = nextOnChart(team.roster, p);
            out.push({ player: p, replacement: next,
                       text: p.pos + ' ' + p.name + ', ' + staminaWord(p) +
                             (next ? '. Next man, ' + next.name + '.' : '. No one behind him.') });
        }
        return out;
    }

    function nextOnChart(roster, p) {
        var ids = roster.depth[p.pos] || [], i, cand;
        for (i = 0; i < ids.length; i++) {
            cand = roster.byId[ids[i]];
            if (cand && cand !== p && !cand.live.out && !cand.live.benched) return cand;
        }
        return null;
    }

    function staminaWord(p) {
        if (p.live.out) return 'out';
        if (p.live.health === 'hurt') return 'playing hurt';
        if (p.live.stamina >= 80) return 'fresh';
        if (p.live.stamina >= 55) return 'working';
        if (p.live.stamina >= 35) return 'tiring';
        return 'gassed';
    }

    // ---------- the coach acting ----------

    function callOffense(c, playId, tempo) {
        var team = c.game.teams[c.game.off], i, chosen = null;
        for (i = 0; i < team.playbook.length; i++) if (team.playbook[i].id === playId) chosen = team.playbook[i];
        if (!chosen) return fail(c, 'That play is not on the sheet.');
        c.forcedOffense = { play: chosen, tempo: tempo || 'huddle' };
        return advance(c);
    }

    function callDefense(c, call) {
        c.forcedDefense = { front: call.front, coverage: call.coverage,
                            pressure: call.pressure, adjustment: call.adjustment || 'NONE' };
        return advance(c);
    }

    var ST_CONF_SAY = { sure: 'I like it', likely: 'worth a shot', guess: 'your call, coach' };

    // Punt, field goal, go for it, or a fake, with the same confidence
    // wording an offensive or defensive suggestion carries (DESIGN.md 8.4).
    // Deterministic, unlike suggestion(): fourthDownDecision draws from
    // nothing, so there is no seed to protect by caching this.
    function specialTeamsChoices(c) {
        var g = c.game, GM = c.deps.game;
        var ytg = 100 - g.ball, fgDist = ytg + 17;
        var rec = g.ot ? GM.otFourthDownDecision(g, g.off) : GM.fourthDownDecision(g, g.off);
        var conf = GM.fourthDownConfidence(g, g.off);
        var opts = [{ id: 'GO', text: 'Go for it.' }];
        // Overtime never punts (Decided, section 25); punting from inside
        // the ten is not a real option either.
        if (!g.ot && ytg > 10) opts.push({ id: 'PUNT', text: 'Punt.' });
        if (fgDist <= 58) opts.push({ id: 'FG', text: words(fgDist) + ' yard field goal.' });
        // A fake is only offered dressed as the kick it is faking, which is
        // also what makes it a fake rather than a second way to go for it
        // (DESIGN_PROPOSALS.md proposal 3).
        if (rec === 'punt') opts.push({ id: 'FAKEPUNT', text: 'Fake the punt.' });
        if (rec === 'fg') opts.push({ id: 'FAKEFG', text: 'Fake the field goal.' });
        var recSay = rec === 'go' ? 'Go for it' : rec === 'fg' ? words(fgDist) + ' yard field goal' : 'Punt';
        return { recommendation: rec, confidence: conf, options: opts,
                 text: recSay + '. ' + (ST_CONF_SAY[conf] || '') + '.' };
    }

    var ST_ACTION = { GO: 'go', PUNT: 'punt', FG: 'fg', FAKEPUNT: 'go', FAKEFG: 'go' };
    var ST_FAKE_SAY = { FAKEPUNT: 'Fake punt!', FAKEFG: 'Fake field goal!' };

    function callSpecial(c, id) {
        if (!ST_ACTION[id]) return fail(c, 'That is not one of the options.');
        c.forcedSpecial = ST_ACTION[id];
        if (ST_FAKE_SAY[id]) say(c, ST_FAKE_SAY[id], 'result', 'ST');
        return advance(c);
    }

    // yes | no | change | dead (DESIGN.md 18.3)
    function answerSubstitution(c, answer) {
        var h = takeMust(c);
        if (!h) return fail(c, 'Nothing to answer.');
        h.answered = true;
        var team = c.game.teams[c.coach];
        var p = h.target;
        if (answer === 'yes' && p && !p.live.out) {
            p.live.benched = true;
            // Going now hands the defense a free substitution (DESIGN.md 18.3).
            team.live.subbedSinceSnap = true;
            var store = h.source === 'OC' ? team.live.beliefs.OC : team.live.beliefs.DC;
            store.pulled[p.id] = true;
            say(c, p.name + ' comes out. ' + (h.recommendation && team.roster.byId[h.recommendation.into]
                ? team.roster.byId[h.recommendation.into].name + ' goes in.' : ''), 'result', h.source);
        } else if (answer === 'change') {
            h.deferred = 'personnel';
            say(c, 'We will get him at the next personnel change.', 'result', h.source);
        } else if (answer === 'dead') {
            h.deferred = 'dead';
            say(c, 'We will get him at the next dead ball.', 'result', h.source);
        } else {
            say(c, 'He stays in.', 'result', h.source);
        }
        c.pending = nextPending(c);
        return drain(c);
    }

    function fail(c, msg) {
        say(c, msg, 'result', null);
        return drain(c);
    }

    // Halftime (DESIGN.md 23.1): three things learned, two things they changed,
    // the biggest personnel problem, then one strategic choice.
    function halftime(c) {
        var g = c.game, S = c.deps.staff;
        var team = g.teams[c.coach];
        var learned = [], changed = [], problem = null;
        var ocStore = team.live.beliefs.OC, dcStore = team.live.beliefs.DC;
        var map = S.beliefMap(ocStore), k, best = null, bv = -1e9, worst = null, wv = 1e9;
        for (k in map) {
            if (map[k] > bv) { bv = map[k]; best = k; }
            if (map[k] < wv) { wv = map[k]; worst = k; }
        }
        if (best && bv > 3) learned.push('We can win ' + keySay(ocStore, best) + '.');
        if (worst && wv < -3) learned.push('We are getting nothing ' + keySay(ocStore, worst) + '.');
        var cov = S.likelyCoverage(ocStore, 'long');
        if (cov) learned.push('On long down and distance they have been sitting in ' + c.deps.plays.COVERAGES[cov].name.toLowerCase() + '.');
        if (!learned.length) learned.push('Honestly, not much yet.');
        var dmap = S.beliefMap(dcStore), dbest = null, dv = -1e9;
        for (k in dmap) if (dmap[k] > dv) { dv = dmap[k]; dbest = k; }
        if (dbest && dv > 3) changed.push('They keep going ' + keySay(dcStore, dbest) + '.');
        // What the other staff has changed is read from what our own
        // coordinator has watched them do, never from their hunches. Looking
        // inside the opposing coordinator's head is the same violation as a
        // computer coach reading our attributes (DESIGN.md 24.1).
        var adjSeen = ocStore.adjSeen || {}, adjBest = null, av = 0;
        for (k in adjSeen) if (adjSeen[k] > av) { av = adjSeen[k]; adjBest = k; }
        if (adjBest && av >= 2) changed.push('They have started to ' + ADJ_SAY[adjBest] + '.');
        if (!changed.length) changed.push('They have not shown us anything new.');
        // The personnel problem comes from the coordinator, who is the man
        // whose job it is to watch this (DESIGN.md 18.1 and 18.3). The coach
        // does not read stamina himself.
        var out = team.roster.players.filter(function (p) { return p.live.out; });
        var pulled = [], id;
        for (id in ocStore.pulled) if (team.roster.byId[id]) pulled.push(team.roster.byId[id]);
        for (id in dcStore.pulled) if (team.roster.byId[id]) pulled.push(team.roster.byId[id]);
        var flagged = [], hid;
        for (hid in ocStore.asked) if (team.roster.byId[hid]) flagged.push(team.roster.byId[hid]);
        for (hid in dcStore.asked) if (team.roster.byId[hid]) flagged.push(team.roster.byId[hid]);
        if (out.length) problem = out[0].name + ' is done for the night and we are thin behind him.';
        else if (pulled.length) problem = 'We have had to rest ' + pulled[0].name + ' already.';
        else if (flagged.length) problem = flagged[0].name + ' is the one your coordinator keeps mentioning.';
        else problem = 'Your staff is not worried about anybody yet.';
        return { learned: learned.slice(0, 3), changed: changed.slice(0, 2), problem: problem,
                 choices: [
                     { id: 'KEEP', text: 'Keep attacking where we have been winning.' },
                     { id: 'SHIFT', text: 'Shift our attention somewhere else.' },
                     { id: 'PRESSURE', text: 'Bring more pressure.' },
                     { id: 'PROTECT', text: 'Protect the quarterback.' },
                     { id: 'STAY', text: 'Stay with the original plan.' }
                 ] };
    }

    function keySay(store, key) {
        var S = root.AF && root.AF.staff ? root.AF.staff : require_staff();
        if (key.indexOf('pass:') === 0) return 'with ' + S.roleSay(store, key.slice(5));
        if (key.indexOf('run:') === 0) return (S.POA_SAY[key.slice(4)] || key.slice(4));
        if (key === 'screen') return 'to the screen game';
        if (key === 'qbrun') return 'with the quarterback pulling it down';
        return 'up front';
    }

    function require_staff() {
        return typeof module !== 'undefined' && module.exports ? require('./staff.js') : root.AF.staff;
    }

    function halftimeChoice(c, id) {
        c.halftimeDone = true;
        c.secondHalfPlan = id;
        var team = c.game.teams[c.coach];
        // The choice shapes what the coordinators suggest after the break.
        if (id === 'PRESSURE') team.style.aggression = clamp(team.style.aggression + 0.25, 0, 1);
        if (id === 'PROTECT') team.style.runLean = clamp(team.style.runLean + 0.15, 0, 1);
        if (id === 'SHIFT') {
            // Look somewhere else, but do not forget the game. Emptying the
            // store would redraw the coordinator's evaluation bias, which is
            // drawn once a game on purpose, and would let a coach reroll a bad
            // coordinator's read at will.
            team.live.ocHunch = null;
            var obs = team.live.beliefs.OC.obs, k;
            for (k in obs) obs[k].last = team.live.beliefs.OC.plays;
        }
        say(c, 'Second half plan set.', 'result', null);
        c.pending = nextPending(c);
        return drain(c);
    }

    // ---------- moving the game on ----------

    function advance(c) {
        if (c.over) return drain(c);
        var g = c.game, deps = c.deps;
        var before = { off: g.off, quarter: g.quarter };
        var hooks = {};
        if (c.forcedOffense) {
            var fo = c.forcedOffense;
            hooks.offense = function () { return { play: fo.play, tempo: fo.tempo }; };
        }
        if (c.forcedDefense) {
            var fd = c.forcedDefense;
            hooks.defense = function () { return fd; };
        }
        if (c.forcedSpecial) {
            var fs = c.forcedSpecial;
            hooks.special = function () { return fs; };
        }
        g.hooks = hooks;
        c.lastOffFormation = null;
        // Whose offense is about to run this snap. Recorded before the step
        // because a turnover flips g.off inside it, and a look at one team's
        // personnel must never be reported as a look at the other's (found by
        // the whistle audit: after an interception, offenseShows spoke the
        // coach's own formation as the opponent's).
        var offBefore = g.off;

        var res = deps.game.stepGame(g, deps);
        c.forcedOffense = null; c.forcedDefense = null; c.forcedSpecial = null; g.hooks = null;
        c.snapId++;
        c.suggestCache = {};

        // 1. the play result
        // Terse gives the coach one line a play; full adds the call and who
        // beat whom (DESIGN.md 2). The interface sets which it wants.
        var last = g.log.length ? g.log[g.log.length - 1] : null;
        var line = last ? ((c.verbosity === 'terse' && last.terse) ? last.terse : last.text) : '';
        if (res && res.formation) { c.lastFormation = res.formation; c.lastOffFormation = res.formation; c.lastOffTeam = offBefore; }
        if (line) { c.log.push(line); c.lastReport = line; say(c, line, 'result', null); }

        // 2. must-answer reports come next, and the injuries are spoken with
        //    the result because the trainer speaks at once (DESIGN.md 18.4).
        collectReports(c);

        // 4. the situation line, when a possession or a quarter changed. Not
        //    when the game has just ended: there is no next snap to set up.
        if (!g.finished && (g.off !== before.off || g.quarter !== before.quarter)) {
            say(c, situationLine(c), 'result', null);
        }

        if (g.finished) {
            c.over = true;
            say(c, 'Final. ' + deps.game.scoreLine(g) + '.', 'result', null);
            postgameReview(c).forEach(function (t) { say(c, t, 'batched', null); });
        }
        c.pending = nextPending(c);
        return drain(c);
    }

    // Sort what the staff produced into the three urgencies of DESIGN.md 19.2
    // and apply the report threshold of 19.4.
    function collectReports(c) {
        var team = c.game.teams[c.coach], i, h;
        for (i = 0; i < team.live.reports.length; i++) {
            h = team.live.reports[i];
            if (h.seen) continue;
            h.seen = true;
            if (h.urgency === 'must') {
                // Injuries are spoken; substitutions become the pending question.
                if (h.kind === 'injury') say(c, h.text, 'must', h.source);
                continue;
            }
            if (c.reportThreshold === 'injuries') continue;
            if (c.reportThreshold === 'important' && h.confidence === 'guess') continue;
            if (h.urgency === 'cued') c.cued.push(h);
            else c.batched.push(h);
        }
    }

    // Which sources have something waiting. The interface plays one chime per
    // source and offers one key to hear it (DESIGN.md 19.2).
    function chimes(c) {
        var seen = {}, out = [], i;
        for (i = 0; i < c.cued.length; i++) if (!seen[c.cued[i].source]) { seen[c.cued[i].source] = true; out.push(c.cued[i].source); }
        return out;
    }

    // Take the waiting cued reports, oldest first.
    function reports(c) {
        var out = c.cued.map(function (h) { return { text: h.text, priority: 'cued', source: h.source }; });
        c.cued = [];
        if (out.length) c.lastReport = out.map(function (o) { return o.text; }).join(' ');
        return out;
    }

    // The low priority notes, spoken at a break or on demand (DESIGN.md 19.2).
    function batchedReports(c) {
        var out = c.batched.map(function (h) { return { text: h.text, priority: 'batched', source: h.source }; });
        c.batched = [];
        if (!out.length) out.push({ text: 'Nothing else waiting.', priority: 'batched', source: null });
        return out;
    }

    // The top three hunches for the personnel on the field, best first, which
    // is what the M key reads (DESIGN.md 8.2).
    function matchups(c) {
        var team = c.game.teams[c.coach], S = c.deps.staff;
        var store = offenseIsCoach(c) ? team.live.beliefs.OC : team.live.beliefs.DC;
        var map = S.beliefMap(store), arr = [], k;
        for (k in map) arr.push({ key: k, v: map[k] });
        arr.sort(function (a, b) { return Math.abs(b.v) - Math.abs(a.v); });
        if (!arr.length) return ['Your coordinator has not seen enough yet.'];
        return arr.slice(0, 3).map(function (e) {
            return (e.v > 0 ? 'We are winning ' : 'We are losing ') + keySay(store, e.key) + '.';
        });
    }

    // What film study says about this opponent in this situation, the T key.
    function tendencies(c) {
        var team = c.game.teams[c.coach], S = c.deps.staff;
        var g = c.game;
        var bucket = g.dist <= 3 ? 'short' : (g.dist <= 7 ? 'med' : 'long');
        if (100 - g.ball <= 5) bucket = 'goal';
        var cov = S.likelyCoverage(team.live.beliefs.OC, bucket);
        if (!cov) return 'Your coordinator has not worked out what they like here yet.';
        return 'On this down and distance they have been playing ' + c.deps.plays.COVERAGES[cov].name.toLowerCase() + '.';
    }

    // The postgame staff review, in plain words and without numbers
    // (DESIGN.md 23.2).
    function postgameReview(c) {
        var g = c.game, S = c.deps.staff, out = [];
        var team = g.teams[c.coach];
        var ocRight = 0, ocTotal = 0, i, h;
        for (i = 0; i < g.hunchLog.length; i++) {
            h = g.hunchLog[i];
            if (h.team !== c.coach || !h.followed) continue;
            ocTotal++;
            if (h.yards > 5) ocRight++;
        }
        if (!ocTotal) {
            out.push('Offensive coordinator: he never got a firm read on them tonight.');
        } else if (ocRight / ocTotal > 0.5) {
            out.push('Offensive coordinator: when he told you where the edge was, the ball moved. He was worth listening to.');
        } else {
            out.push('Offensive coordinator: his reads did not come to much tonight.');
        }
        var dcAdj = team.live.dcHunch;
        out.push('Defensive coordinator: ' + (dcAdj
            ? 'he saw what they were doing to us and wanted to change it.'
            : 'he never settled on what was hurting us.'));
        var spot = team.live.beliefs.SPOT;
        var spotted = Object.keys(spot.reported).length;
        out.push('Spotter: ' + (spotted > 3 ? 'he had plenty for you tonight.'
            : (spotted ? 'he caught one or two things.' : 'he was quiet all night.')));
        return out;
    }

    // ---------- the play clock (DESIGN.md 16.5.1) ----------

    // The controller exposes the seconds and the outcome; the interface runs
    // the timer, because only the interface knows about time passing.
    function playClockSeconds(c) { return PLAY_CLOCK[c.playClock] || 0; }

    // Called by the interface when its timer expires: five yards, replay the
    // down (Decided).
    function delayOfGame(c) {
        var g = c.game;
        g.ball = Math.max(1, g.ball - 5);
        g.dist += 5;
        say(c, 'Delay of game. Five yards, replay the down.', 'result', null);
        say(c, situationLine(c), 'result', null);
        c.pending = nextPending(c);
        return drain(c);
    }

    function setMode(c, side, mode) {
        if (!MODES[mode]) return fail(c, 'That is not a mode.');
        if (side === 'offense') c.offenseMode = mode; else c.defenseMode = mode;
        say(c, (side === 'offense' ? 'Offense' : 'Defense') + ': ' + MODES[mode] + '.', 'result', null);
        c.pending = nextPending(c);
        return drain(c);
    }

    // full or terse (DESIGN.md 2). The interface owns the key; the controller
    // owns which form of the play by play it hands back.
    function setVerbosity(c, level) {
        c.verbosity = level === 'terse' ? 'terse' : 'full';
        return c.verbosity;
    }

    function setReportThreshold(c, level) {
        c.reportThreshold = level;
        say(c, 'Reports: ' + level + '.', 'result', null);
        return drain(c);
    }

    function final(c) {
        if (!c.over) return null;
        return { score: c.game.final.slice(), line: c.deps.game.scoreLine(c.game), review: postgameReview(c) };
    }

    var api = { MODES: MODES, PLAY_CLOCK: PLAY_CLOCK,
                newGame: newGame, pending: pending, drain: drain,
                situationLine: situationLine, examine: examine, suggestion: suggestion,
                offenseShows: offenseShows,
                callSheet: callSheet, formations: formations, substitutionList: substitutionList,
                callOffense: callOffense, callDefense: callDefense,
                specialTeamsChoices: specialTeamsChoices, callSpecial: callSpecial,
                answerSubstitution: answerSubstitution, advance: advance,
                halftime: halftime, halftimeChoice: halftimeChoice,
                reports: reports, batchedReports: batchedReports, chimes: chimes,
                matchups: matchups, tendencies: tendencies, postgameReview: postgameReview,
                playClockSeconds: playClockSeconds, delayOfGame: delayOfGame,
                setMode: setMode, setReportThreshold: setReportThreshold,
                setVerbosity: setVerbosity, final: final,
                words: words, clockWords: clockWords, spotWords: spotWords, staminaWord: staminaWord };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.AF = root.AF || {};
    root.AF.controller = api;
})(typeof window !== 'undefined' ? window : globalThis);
