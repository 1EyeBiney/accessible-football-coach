// game.js - Game loop: clock, downs, special teams, stamina, injuries,
// automatic coaches, and the counter loop in its first form.
// (Accessible Football engine) Plain script, no browser dependencies.
// DESIGN.md sections 8, 16.5, 18, 25, 26.
//
// The automatic coaches here are the "coordinator calls everything" mode.
// They are deliberately simple and they are NOT omniscient: the defensive
// coach adjusts from what it has observed this game (exploitation counters),
// and the offensive coach guesses coverage from what it has seen.
// A later pass replaces the offensive coach's use of true attributes with
// the observed-events knowledge model (DESIGN.md 26.7).

(function (root) {
    'use strict';

    var RULES = {
        HS: { quarterSecs: 720, kickoffFrom: 40, touchback: 20, otStart: 10, timeouts: 3, goForTwoLate: true }
    };

    function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

    // ---------- tendencies ----------

    // Down and distance buckets. A coordinator does not learn "they play cover
    // three"; he learns "on third and long they play cover four", which is what
    // makes reading them worth anything (DESIGN.md 8.3).
    var COV_BUCKETS = ['short', 'med', 'long', 'goal'];

    function covBucket(sit) {
        if (sit.ytg <= 5) return 'goal';
        if (sit.dist <= 3) return 'short';
        if (sit.dist <= 7) return 'med';
        return 'long';
    }

    // Every defensive staff has a call sheet it believes in. Some are heavily
    // patterned and easy to read; some mix it up and give a coordinator little
    // to work with.
    function makeTendency(rng) {
        var out = { strength: rng.uniform(0.35, 1.0) }, i, b;
        var pool = { short: ['C1', 'C3', 'C0'], med: ['C3', 'C1', 'C2'],
                     long: ['C4', 'C2', 'C2M', 'C3'], goal: ['C1', 'C0', 'C3'] };
        for (i = 0; i < COV_BUCKETS.length; i++) {
            b = COV_BUCKETS[i];
            out[b] = rng.pick(pool[b]);
        }
        return out;
    }

    // ---------- team construction ----------

    function makeTeam(deps, opts) {
        var P = deps.players, PL = deps.plays;
        var roster = P.makeRoster(opts.rng, opts.level || 'HS', opts.quality || 0, opts.stub || opts.name);
        var playbook = PL.buildPlaybook();
        var i;
        for (i = 0; i < playbook.length; i++) playbook[i].exec = clamp(Math.round(opts.rng.normal(opts.execMean || 50, 10)), 20, 90);
        var level = opts.level || 'HS';
        return { name: opts.name, roster: roster, playbook: playbook, level: level,
                 // Coaching identity: run/pass lean, aggression, coverage preference
                 style: { runLean: opts.runLean !== undefined ? opts.runLean : 0.5, aggression: opts.aggression || 0.3,
                          covPref: opts.covPref || null,
                          // What this defensive staff likes to call by down and
                          // distance. This is the tendency the other side's
                          // coordinator is trying to read (DESIGN.md 8.3, 16.5).
                          covTendency: makeTendency(opts.rng) },
                 // The people who read the field for this coach (DESIGN.md 5).
                 staff: deps.staff.makeStaffGroup(opts.rng, level, opts.staffQuality || 0),
                 // What this staff has learned this game (reset each game)
                 live: null };
    }

    // One belief store per staff member per game. The offensive coordinator
    // watches our offense, the defensive coordinator watches the offense we
    // face, and the spotter watches both sidelines (DESIGN.md 18.2, 26.7).
    function resetBeliefs(team, deps, opts) {
        opts = opts || {};
        var S = deps.staff;
        team.live = {
            beliefs: {
                OC: S.newBeliefs(team.staff.OC, 'O', { scouting: opts.ocScouting, scoutWeight: opts.scoutWeight }),
                DC: S.newBeliefs(team.staff.DC, 'D', { scouting: opts.dcScouting, scoutWeight: opts.scoutWeight }),
                SPOT: S.newBeliefs(team.staff.SPOT, 'D', {})
            },
            ocHunch: null,      // the live matchup hunch the coach is calling from
            ocHunchAge: 0,
            dcHunch: null,      // the live adjustment hunch
            dcHunchAge: 0,
            reports: [],        // cued and batched hunches waiting to be heard
            lastPersonnel: null,
            lastDefPersonnel: null,
            // Running average yards by play type, used to judge whether a hunch
            // was worth following (the harness reports on this).
            expect: { pass: { n: 0, sum: 0 }, run: { n: 0, sum: 0 } }
        };
    }

    // What this team has been averaging on this kind of play, before the
    // current snap. The fallbacks are roughly the engine's own averages.
    function expected(team, type) {
        var e = team.live.expect[type];
        if (!e || e.n < 6) return type === 'pass' ? 6.5 : 4.4;
        return e.sum / e.n;
    }

    function noteExpect(team, type, yards) {
        var e = team.live.expect[type];
        if (e) { e.n++; e.sum += yards; }
    }

    // ---------- lineups ----------

    // Who fills in when a position has nobody left standing. Preference goes
    // to the nearest thing to the job, then to anybody healthy, and only then
    // to anybody at all, because eleven men have to line up.
    var COVER_FOR = {
        QB: ['RB', 'WR', 'TE'], RB: ['WR', 'TE', 'LB'], WR: ['RB', 'TE', 'DB'],
        TE: ['WR', 'OL', 'LB'], OL: ['TE', 'DL'], DL: ['OL', 'LB'],
        LB: ['TE', 'DL', 'DB'], DB: ['WR', 'LB'], K: ['P'], P: ['K']
    };

    function emergency(team, pos) {
        var order = (COVER_FOR[pos] || []).slice();
        var byId = team.roster.byId, d = team.roster.depth, i, j, ids, cand;
        for (i = 0; i < order.length; i++) {
            ids = d[order[i]] || [];
            for (j = ids.length - 1; j >= 0; j--) {     // the last man on that chart
                cand = byId[ids[j]];
                if (cand && !cand.live.out && !cand.live.benched) return cand;
            }
        }
        var all = team.roster.players;
        for (i = 0; i < all.length; i++) if (!all[i].live.out && !all[i].live.benched) return all[i];
        for (i = 0; i < all.length; i++) if (!all[i].live.out) return all[i];
        return all[0];
    }

    function offenseLineup(team, formation, P, PL) {
        var d = team.roster.depth, byId = team.roster.byId;
        var lu = {}, i;
        // A player who is out, or who the coordinator has pulled to get his
        // legs back (DESIGN.md 18.3), is not available.
        //
        // If a position is wiped out entirely, somebody else plays there. A
        // high school team that loses both quarterbacks puts an athlete under
        // centre; it does not field ten men. Without this the engine crashed
        // about once in every three thousand games, when both quarterbacks on
        // one roster were injured out of the same game.
        function pick(pos, idx) {
            var ids = d[pos].filter(function (id) { return !byId[id].live.out && !byId[id].live.benched; });
            if (!ids.length) ids = d[pos].filter(function (id) { return !byId[id].live.out; });
            var p = byId[ids[idx]] || byId[ids[ids.length - 1]] || null;
            return p || emergency(team, pos);
        }
        lu.QB1 = pick('QB', 0); lu.RB1 = pick('RB', 0); lu.RB2 = pick('RB', 1);
        lu.TE1 = pick('TE', 0); lu.TE2 = pick('TE', 1);
        lu.WR1 = pick('WR', 0); lu.WR2 = pick('WR', 1); lu.WR3 = pick('WR', 2);
        for (i = 0; i < 5; i++) lu['OL' + (i + 1)] = pick('OL', i);
        // Roles not in the formation are off the field
        var roles = PL.FORMATIONS[formation].roles;
        var onField = ['OL1', 'OL2', 'OL3', 'OL4', 'OL5'].concat(roles);
        var k;
        for (k in lu) { if (onField.indexOf(k) < 0) lu[k] = null; }
        return lu;
    }

    function defenseLineup(team, front, PL) {
        var f = PL.FRONTS[front], d = team.roster.depth, byId = team.roster.byId;
        function take(pos, n) {
            var ids = d[pos].filter(function (id) { return !byId[id].live.out && !byId[id].live.benched; });
            if (ids.length < n) ids = d[pos].filter(function (id) { return !byId[id].live.out; });
            var out = ids.slice(0, n).map(function (id) { return byId[id]; });
            while (out.length < n) out.push(emergency(team, pos));   // never field a short unit
            return out;
        }
        return { DL: take('DL', f.dl), LB: take('LB', f.lb), DB: take('DB', f.db) };
    }

    function onFieldList(lu) {
        var out = [], k;
        for (k in lu) { if (lu[k] && !Array.isArray(lu[k])) out.push(lu[k]); else if (Array.isArray(lu[k])) out = out.concat(lu[k]); }
        return out;
    }

    // ---------- stamina and injuries (DESIGN.md 18) ----------

    function applyStamina(team, onField, carrier, tempo) {
        var i, p, all = team.roster.players, on = {};
        for (i = 0; i < onField.length; i++) on[onField[i].id] = true;
        for (i = 0; i < all.length; i++) {
            p = all[i];
            // Recovery has to be slower than the drain, or a starter who plays
            // every snap of his unit ends the game as fresh as he started it
            // and nobody is ever substituted. The old numbers drained 2.4 and
            // recovered 3.2, so across a game where a unit is on the field
            // about half the time, everybody gained stamina: the lowest figure
            // on a roster after a full game was eighty two, the substitution
            // floor is under forty, and so the whole of DESIGN.md 18.3 never
            // fired once. These are set so a starting lineman is somewhere in
            // the fifties or sixties by the fourth quarter and dips lower than
            // that during a long drive.
            if (on[p.id]) {
                var drain = (p.pos === 'OL' || p.pos === 'DL') ? 3.0 : 2.2;
                if (p === carrier) drain += 1.4;
                if (tempo === 'nohuddle') drain += 1.6;
                p.live.stamina = Math.max(0, p.live.stamina - drain);
            } else {
                p.live.stamina = Math.min(100, p.live.stamina + 2.4);
            }
        }
    }

    function rollInjuries(rng, P, involved, injuries) {
        var i, p;
        for (i = 0; i < involved.length; i++) {
            p = involved[i];
            if (!p || p.live.out) continue;
            // Effective toughness, not base: a man already playing hurt is
            // easier to hurt again (DESIGN.md 26.6).
            var tgh = P.eff(p, 'tgh');
            var pInj = 0.0014 * (1 + (50 - tgh) / 50) * (1 + (100 - p.live.stamina) / 100) * (p.hidden.injuryProne ? 1.6 : 1);
            if (rng.chance(pInj)) {
                var severe = rng.chance(0.55);
                if (severe) { p.live.out = true; p.live.health = 'out'; }
                else { p.live.health = 'hurt'; p.live.hurtMods = { spd: 8, elu: 6, cov: 6, rbk: 5, pbk: 5, prs: 5 }; }
                injuries.push({ player: p, severe: severe, say: p.name + (severe ? ' is down and out of the game' : ' is hurt but staying in') });
            }
        }
    }

    // ---------- automatic coaches ----------

    function situationTags(sit, game, offIdx) {
        var tags = [];
        var trailing = game.score[offIdx] < game.score[1 - offIdx];
        var late = (game.quarter === 2 || game.quarter >= 4) && game.clock <= 120;
        if (sit.ytg <= 5) tags.push('goal');
        if (late && trailing) tags.push('two');
        if (sit.down === 1) tags.push('1st');
        if (sit.down === 2) { tags.push('2nd'); if (sit.dist <= 3) tags.push('short'); else if (sit.dist <= 7) tags.push('med'); else tags.push('long'); }
        if (sit.down >= 3) { if (sit.dist <= 2) tags.push('short'); else if (sit.dist <= 7) tags.push('med'); else tags.push('long'); }
        return tags;
    }

    // A coverage read is also a read on the box: a shell that keeps two
    // safeties deep is a shell that is short a man against the run, and one
    // that rolls a safety down is not.
    function boxGuess(cov) {
        if (cov === 'C2' || cov === 'C4' || cov === 'C2M') return 'light';
        if (cov === 'C0') return 'loaded';
        return 'normal';
    }

    // The offensive coach calls from what his coordinator believes, never from
    // the defense's actual call and never from a true attribute (DESIGN.md
    // 24.1). If the coordinator has not seen enough yet, likelyCoverage
    // returns nothing and the coach calls blind, which is the point.
    function chooseOffense(game, team, sit, offIdx, deps) {
        var rng = game.rng, PL = deps.plays, S = deps.staff;
        var tags = situationTags(sit, game, offIdx);
        var ocStore = team.live.beliefs.OC;
        var expectedCov = S.likelyCoverage(ocStore, covBucket(sit));
        var hunch = team.live.ocHunch;
        var trailing = game.score[offIdx] < game.score[1 - offIdx];
        var late = game.quarter >= 4 && game.clock <= 180;
        var lead = game.score[offIdx] - game.score[1 - offIdx];
        var leadingBig = (lead >= 14 && game.quarter >= 4) || (lead >= 21 && game.quarter >= 3);
        var runLean = team.style.runLean + (leadingBig ? 0.25 : 0) - (late && trailing ? 0.35 : 0) + (tags.indexOf('long') >= 0 ? -0.2 : 0) + (tags.indexOf('short') >= 0 ? 0.2 : 0);
        var items = [], i, pl, c, w;
        for (i = 0; i < team.playbook.length; i++) {
            pl = team.playbook[i]; c = PL.CONCEPTS[pl.concept];
            if (c.type === 'special') continue;
            var fit = 0, t;
            for (t = 0; t < tags.length; t++) if (c.tags.indexOf(tags[t]) >= 0) fit++;
            if (!fit) continue;
            w = 1 + fit * 1.5;
            w *= (c.type === 'run' ? runLean : (1 - runLean)) * 2;
            w *= 0.5 + pl.exec / 100;
            // The coordinator's read of what the defense has been showing.
            // Scheme scales how much of his own playbook knowledge he brings.
            if (expectedCov) {
                var sm = (c.vsCov && c.vsCov[expectedCov]) || 0;
                if (c.type === 'run') sm = (c.vsBox && c.vsBox[boxGuess(expectedCov)]) || 0;
                // The weight on the scheme read is deliberately moderate. Tuned
                // higher the offense over-commits to one answer, becomes
                // predictable, and a good coordinator ends up worse than an
                // average one; this value was picked from that curve.
                w *= Math.max(0.15, 1 + sm * 0.07 * (0.4 + team.staff.OC.attr.scheme * 0.008));
            }
            // The live matchup hunch: go at the man the coordinator likes, stay
            // away from the one he does not (DESIGN.md 5.3).
            if (hunch && hunch.kind === 'matchup') {
                if (hunch.key.indexOf('pass:') === 0 && c.type === 'pass' && c.reads) {
                    var ri = c.reads.indexOf(hunch.target);
                    if (ri === 0) w *= hunch.positive ? 2.2 : 0.4;
                    else if (ri === 1) w *= hunch.positive ? 1.5 : 0.6;
                } else if (hunch.key.indexOf('run:') === 0 && c.type === 'run' && c.poa === hunch.target) {
                    w *= hunch.positive ? 2.2 : 0.4;
                }
            }
            if (c.type === 'run' && sit.dist > 12) w *= 0.3;
            if (c.depth === 'deep' && sit.ytg < 25) w *= 0.2;
            items.push({ item: pl, w: Math.max(0.05, w) });
        }
        if (!items.length) items.push({ item: team.playbook[0], w: 1 });
        var play = rng.weighted(items);
        var tempo = (late && trailing && game.clock <= 120) ? 'nohuddle' : 'huddle';
        return { play: play, tempo: tempo };
    }

    function chooseDefense(game, team, sit, offTeam, personnel, defIdx, deps) {
        var rng = game.rng, PL = deps.plays;
        var tags = situationTags(sit, game, 1 - defIdx);
        // Front by personnel
        var front;
        if (sit.ytg <= 3 || (tags.indexOf('short') >= 0 && personnel !== '11')) front = rng.weighted([{ item: 'GOAL', w: 2 }, { item: 'OVER', w: 1 }]);
        else if (personnel === '11') front = rng.weighted([{ item: 'NICKEL', w: 6 }, { item: 'OVER', w: 2 }, { item: 'DIME', w: tags.indexOf('long') >= 0 ? 2 : 0.2 }]);
        else if (personnel === '21') front = rng.weighted([{ item: 'OVER', w: 4 }, { item: 'UNDER', w: 3 }, { item: 'THREE4', w: 2 }]);
        else front = rng.weighted([{ item: 'GOAL', w: 2 }, { item: 'UNDER', w: 3 }, { item: 'THREE4', w: 2 }]);
        // Coverage by situation and preference
        var cw = { C0: 0.4, C1: 2, C2: 1.5, C3: 3.5, C4: 2, C2M: 0.8 };
        if (tags.indexOf('long') >= 0) { cw.C2 += 1.5; cw.C4 += 2; cw.C2M += 0.8; cw.C3 -= 1; }
        if (tags.indexOf('short') >= 0 || tags.indexOf('goal') >= 0) { cw.C1 += 2; cw.C0 += 1; cw.C3 += 0.5; cw.C4 -= 1; }
        if (personnel === '11') { cw.C2 += 0.8; cw.C4 += 0.8; }
        if (personnel === '22') { cw.C1 += 1; cw.C3 += 1; }
        if (team.style.covPref) cw[team.style.covPref] += 2;
        // The staff's own tendency by down and distance. A patterned defense is
        // strong until the other coordinator reads it.
        var tend = team.style.covTendency;
        if (tend) cw[tend[covBucket(sit)]] += 9 * tend.strength;
        var items = [], k;
        for (k in cw) items.push({ item: k, w: Math.max(0.05, cw[k]) });
        var coverage = rng.weighted(items);
        // Pressure
        var pw = { R4: 6, R5: 2.2, R6: 0.6, ZB: 0.8 };
        if (tags.indexOf('long') >= 0) { pw.R5 += 0.8; pw.ZB += 0.8; }
        if (tags.indexOf('short') >= 0) { pw.R6 += 0.6; pw.R5 += 0.6; }
        pw.R5 += team.style.aggression * 2; pw.R6 += team.style.aggression * 1.2;
        items = [];
        for (k in pw) items.push({ item: k, w: Math.max(0.05, pw[k]) });
        var pressure = rng.weighted(items);
        if (coverage === 'C0') pressure = rng.chance(0.6) ? 'R6' : 'R5';
        // Adjustment: the counter loop (DESIGN.md 8.3), now driven entirely by
        // what the defensive coordinator believes he has seen. A coordinator
        // who has not worked it out yet makes no adjustment, so a weak staff
        // simply never counters, which is the intended cost of a weak staff.
        var adjustment = 'NONE';
        var hunch = team.live.dcHunch;
        if (hunch && hunch.kind === 'adjustment' && hunch.recommendation) {
            // Scheme decides whether he actually gets the adjustment installed
            // in time; Evaluation already decided whether he is right.
            var pApply = clamp(0.45 + team.staff.DC.attr.scheme * 0.005, 0.4, 0.95);
            if (hunch.confidence === 'sure') pApply += 0.15;
            else if (hunch.confidence === 'guess') pApply -= 0.15;
            if (rng.chance(clamp(pApply, 0.2, 0.97))) adjustment = hunch.recommendation;
        } else if (rng.chance(0.06)) {
            adjustment = rng.pick(['SPY', 'CONTAIN']);
        }
        return { front: front, coverage: coverage, pressure: pressure, adjustment: adjustment };
    }

    // ---------- special teams (simple form, DESIGN.md 25) ----------

    function kickoff(game, kickIdx, deps) {
        var rng = game.rng, P = deps.players;
        var K = kicker(game.teams[kickIdx], 'K', P);
        var leg = K ? P.eff(K, 'leg') : 40;
        var recv = 1 - kickIdx;
        var pTB = clamp((leg - 35) * 0.02, 0.03, 0.7);
        var line, text;
        if (rng.chance(pTB)) { line = RULES.HS.touchback; text = 'kickoff into the end zone, touchback'; }
        else {
            var ret = Math.round(clamp(rng.normal(24, 8), 3, 45));
            // A long return is rare and a return for a score is rarer. The old
            // form put one kickoff in fifty inside the opponent's half and
            // narrated it as an ordinary return.
            if (rng.chance(0.015)) ret = Math.round(rng.uniform(46, 70));
            if (rng.chance(0.004)) ret = 100;
            line = Math.min(100, ret);
            text = line >= 100
                ? 'kickoff returned all the way for a touchdown by ' + game.teams[recv].name
                : 'kickoff returned to the ' + spot(line);
        }
        game.log.push({ q: game.quarter, clock: game.clock, team: kickIdx, kind: 'kickoff', text: text });
        game.clock = Math.max(0, game.clock - 5);
        if (line >= 100) { score(game, recv, 6, deps); tryPAT(game, recv, deps); kickoff(game, recv, deps); return; }
        setPossession(game, recv, line);
    }

    function kicker(team, pos, P) {
        var ids = team.roster.depth[pos];
        return ids && ids.length ? team.roster.byId[ids[0]] : null;
    }

    function punt(game, offIdx, deps) {
        var rng = game.rng, P = deps.players;
        var pu = kicker(game.teams[offIdx], 'P', P);
        var leg = pu ? P.eff(pu, 'leg') : 40, kacc = pu ? P.eff(pu, 'kacc') : 40;
        var dist = Math.round(clamp(34 + (leg - 45) * 0.25 + rng.normal(0, 6), 12, 62));
        if (rng.chance(clamp(0.08 - (kacc - 45) * 0.002, 0.02, 0.15))) dist = Math.round(dist * 0.55); // shank
        var ret = Math.round(clamp(rng.normal(5, 5), 0, 25));
        var ball = game.ball + dist; // yards from offense's own goal
        var text;
        if (ball >= 100) { ball = 100 - RULES.HS.touchback; text = 'punt into the end zone, touchback'; }
        else { ball = Math.max(1, ball - ret); text = 'punt of ' + dist + ' yards, returned ' + ret; }
        game.stats[offIdx].punts++;
        game.log.push({ q: game.quarter, clock: game.clock, team: offIdx, kind: 'punt', text: text });
        game.clock = Math.max(0, game.clock - 6);
        setPossession(game, 1 - offIdx, 100 - ball);
    }

    function fieldGoal(game, offIdx, deps) {
        var rng = game.rng, P = deps.players;
        var K = kicker(game.teams[offIdx], 'K', P);
        var dist = (100 - game.ball) + 17;
        var kacc = K ? P.eff(K, 'kacc') : 40, leg = K ? P.eff(K, 'leg') : 40, nrv = K ? P.eff(K, 'nrv') : 40;
        var base = dist <= 25 ? 0.86 : dist <= 30 ? 0.76 : dist <= 35 ? 0.64 : dist <= 40 ? 0.50 : dist <= 45 ? 0.34 : dist <= 50 ? 0.20 : 0.08;
        var p = base + (kacc - 45) * 0.006 + (dist > 38 ? (leg - 45) * 0.004 : 0);
        var clutch = game.quarter >= 4 && game.clock <= 120 && Math.abs(game.score[0] - game.score[1]) <= 3;
        if (clutch) p += (nrv - 45) * 0.004;
        p = clamp(p, 0.02, 0.97);
        game.stats[offIdx].fga++;
        var good = rng.chance(p);
        game.log.push({ q: game.quarter, clock: game.clock, team: offIdx, kind: 'fg', text: dist + ' yard field goal ' + (good ? 'is good' : 'is no good') });
        game.clock = Math.max(0, game.clock - 5);
        if (good) { game.stats[offIdx].fgm++; score(game, offIdx, 3, deps); if (!game.ot) kickoff(game, offIdx, deps); }
        else setPossession(game, 1 - offIdx, Math.max(20, 100 - (game.ball - 7)));
    }

    function tryPAT(game, offIdx, deps) {
        var rng = game.rng, P = deps.players;
        var diff = game.score[offIdx] - game.score[1 - offIdx];
        var goTwo = game.quarter >= 4 && (diff === -2 || diff === -5 || diff === 1 || diff === -8) && game.clock <= 600;
        if (goTwo) {
            var saved = { ball: game.ball, down: game.down, dist: game.dist };
            game.ball = 97; game.down = 1; game.dist = 3;
            var r = runPlay(game, offIdx, deps, true);
            var made = r && r.td;
            game.log.push({ q: game.quarter, clock: game.clock, team: offIdx, kind: 'pat', text: 'two point try ' + (made ? 'is good' : 'fails') });
            if (made) game.score[offIdx] += 2;
            game.ball = saved.ball; game.down = saved.down; game.dist = saved.dist;
            return;
        }
        var K = kicker(game.teams[offIdx], 'K', P);
        var p = clamp(0.84 + ((K ? P.eff(K, 'kacc') : 40) - 45) * 0.005, 0.5, 0.99);
        var good = rng.chance(p);
        game.log.push({ q: game.quarter, clock: game.clock, team: offIdx, kind: 'pat', text: 'extra point ' + (good ? 'is good' : 'is no good') });
        if (good) game.score[offIdx] += 1;
    }

    // ---------- game state helpers ----------

    function spot(ball) { return ball <= 50 ? 'own ' + ball : 'opponent ' + (100 - ball); }

    // Walking the offense back. The ball never goes past half the distance to
    // the goal line, and the line to gain moves only as far as the ball does,
    // which is what stops a series reading second and forty five while the
    // ball has moved four yards.
    function markOff(game, yards) {
        var before = game.ball;
        var most = Math.floor(before / 2);          // half the distance to the goal
        var moved = Math.min(yards, most);
        game.ball = Math.max(1, before - moved);
        game.dist += (before - game.ball);
        game.dist = Math.min(game.dist, 99);
        fixGoalToGo(game);
    }

    // Goal to go is a fact about where the ball is, not a label that sticks.
    // A penalty that puts the ball outside the ten makes it first and ten
    // again, or second and twelve, rather than leaving it reading goal.
    function fixGoalToGo(game) {
        var toGoal = 100 - game.ball;
        if (game.dist > toGoal) game.dist = toGoal;
    }

    function setPossession(game, idx, ball) {
        game.off = idx; game.ball = clamp(ball, 1, 99); game.down = 1; game.dist = Math.min(10, 100 - game.ball);
        game.drivePlays = 0;
        // A unit taking the field is when recovered players are announced and
        // go back with the first team (DESIGN.md 18.3).
        var i, b;
        for (i = 0; i < 2; i++) {
            b = game.teams[i].live && game.teams[i].live.beliefs;
            if (b && game.S) { game.S.changeOfPossession(b.OC); game.S.changeOfPossession(b.DC); }
        }
    }

    function score(game, idx, pts, deps) {
        game.score[idx] += pts;
        if (pts === 6) game.stats[idx].td++;
    }

    function fourthDownDecision(game, offIdx) {
        var ytg = 100 - game.ball, dist = game.dist, diff = game.score[offIdx] - game.score[1 - offIdx];
        var late = game.quarter >= 4 && game.clock <= 300;
        var desperate = late && diff < 0 && (game.clock <= 120 || diff < -8);
        if (desperate && ytg > 35) return 'go';
        if (ytg <= 27 && dist > 3) return 'fg';
        if (ytg <= 27 && dist <= 3 && (ytg <= 8 || game.teams[offIdx].style.aggression > 0.4)) return 'go';
        if (ytg <= 27) return 'fg';
        if (ytg <= 33 && dist > 4 && !desperate) return 'punt';
        if (dist <= 2 && game.ball >= 45) return 'go';
        if (dist <= 1 && game.ball >= 35) return 'go';
        if (desperate) return 'go';
        return 'punt';
    }

    // ---------- the staff watching the game ----------

    // Does this call attack the matchup the coordinator recommended? Returns
    // the hunch when it does and null otherwise. Only positive hunches count.
    function hunchFollowed(team, play, PL) {
        var h = team.live.ocHunch;
        if (!h || h.kind !== 'matchup' || !h.positive) return null;
        var c = PL.CONCEPTS[play.concept];
        if (!c) return null;
        if (h.key.indexOf('pass:') === 0) {
            if (c.type !== 'pass' || !c.reads) return null;
            var idx = c.reads.indexOf(h.target);
            return (idx === 0 || idx === 1) ? h : null;
        }
        if (h.key.indexOf('run:') === 0) {
            return (c.type === 'run' && c.poa === h.target) ? h : null;
        }
        return null;
    }

    // One snap, seen by four sets of eyes on each sideline.
    function observeSnap(game, offIdx, res, deps, onOff, onDef) {
        var S = deps.staff, rng = game.rng;
        var off = game.teams[offIdx], def = game.teams[1 - offIdx];
        var ocStore = off.live.beliefs.OC, dcStore = def.live.beliefs.DC;
        var sit = res.sit;

        S.observe(ocStore, res, rng);
        S.observe(dcStore, res, rng);
        // The coordinators whose unit is off the field say little (DESIGN.md
        // 19.2), but their clocks still run so their timers behave.
        def.live.beliefs.OC.plays++;
        off.live.beliefs.DC.plays++;

        var ocOut = S.hunches(ocStore, sit, { active: true, plays: deps.plays, playbook: off.playbook,
                                              ownRoster: off.roster, ownOnField: onOff, rng: rng });
        var dcOut = S.hunches(dcStore, sit, { active: true, plays: deps.plays,
                                              ownRoster: def.roster, ownOnField: onDef, rng: rng });
        // Each spotter watches the other sideline for the coach's benefit.
        var spOff = S.hunches(off.live.beliefs.SPOT, sit, { watch: onDef, rng: rng });
        var spDef = S.hunches(def.live.beliefs.SPOT, sit, { watch: onOff, rng: rng });
        // The trainer speaks with the play result when someone goes down.
        var trOff = S.injuryHunches(off.staff.TRAINER, res.injuries.filter(function (x) { return onOff.indexOf(x.player) >= 0; }), []);
        var trDef = S.injuryHunches(def.staff.TRAINER, res.injuries.filter(function (x) { return onDef.indexOf(x.player) >= 0; }), []);

        applyHunches(off, ocOut.concat(spOff, trOff));
        applyHunches(def, dcOut.concat(spDef, trDef));

        // Hunches go stale. A read from three drives ago is not a read.
        off.live.ocHunchAge++; if (off.live.ocHunchAge > 12) off.live.ocHunch = null;
        def.live.dcHunchAge++; if (def.live.dcHunchAge > 12) def.live.dcHunch = null;
    }

    // The automatic coach's answers. A human coach answers these through the
    // controller instead; the same hunches drive both.
    function applyHunches(team, list) {
        var i, h, p, store;
        for (i = 0; i < list.length; i++) {
            h = list[i];
            if (h.kind === 'matchup') { team.live.ocHunch = h; team.live.ocHunchAge = 0; }
            else if (h.kind === 'adjustment') { team.live.dcHunch = h; team.live.dcHunchAge = 0; }
            else if (h.kind === 'substitution') {
                // The automatic coach answers "yes, now" (DESIGN.md 18.3). A
                // team with a human coach leaves the question for him, but the
                // hunch still has to reach the report queue below, or the
                // controller never turns it into the must-answer of 19.2 and
                // the coach is never asked at all.
                p = h.target;
                if (team.autoCoach !== false && p && !p.live.out) {
                    p.live.benched = true;
                    team.live.subbedSinceSnap = true;
                    store = h.source === 'OC' ? team.live.beliefs.OC : team.live.beliefs.DC;
                    store.pulled[p.id] = true;
                }
            } else if (h.kind === 'recovered') {
                if (h.target) h.target.live.benched = false;
            }
            team.live.reports.push(h);
        }
        // The report queue is a between-play queue, not a season archive.
        if (team.live.reports.length > 30) team.live.reports.splice(0, team.live.reports.length - 30);
    }

    // ---------- one play from scrimmage ----------

    function runPlay(game, offIdx, deps, isTwoPoint) {
        var rng = game.rng, P = deps.players, PL = deps.plays, R = deps.resolve;
        var off = game.teams[offIdx], def = game.teams[1 - offIdx];
        var defIdx = 1 - offIdx;
        var sit = { down: game.down, dist: game.dist, ytg: 100 - game.ball, twoPoint: !!isTwoPoint };

        // Offensive call
        var oc = game.hooks && game.hooks.offense ? game.hooks.offense(game, off, sit, offIdx) : null;
        if (!oc) oc = chooseOffense(game, off, sit, offIdx, deps);
        var play = oc.play, tempo = oc.tempo || 'huddle';
        // Did this call attack what the coordinator recommended? The harness
        // reports on how often that was worth doing (DESIGN.md 5.3).
        var hunchTest = hunchFollowed(off, play, PL);
        var personnel = PL.FORMATIONS[play.formation].personnel;
        // Substituting counts as a substitution, so the defense gets its free
        // one, whether the change came from a new personnel group or from
        // pulling a tired man (DESIGN.md 16.5, 18.3). Without this the trade
        // the design describes, fresh legs now against the defense resetting,
        // does not exist.
        var offSubbed = (off.live.lastPersonnel !== null && off.live.lastPersonnel !== personnel) ||
                        !!off.live.subbedSinceSnap;
        off.live.subbedSinceSnap = false;

        // Defensive call
        var dc = game.hooks && game.hooks.defense ? game.hooks.defense(game, def, sit, off, personnel, defIdx) : null;
        if (!dc) dc = chooseDefense(game, def, sit, off, personnel, defIdx, deps);
        var defPersonnel = PL.FRONTS[dc.front].dl + '-' + PL.FRONTS[dc.front].lb + '-' + PL.FRONTS[dc.front].db;
        var misaligned = false, twelveMen = false;
        // Substitution rule (DESIGN.md 16.5): the defense subs freely on a huddle or an offensive sub.
        if (tempo === 'nohuddle' && !offSubbed && def.live.lastDefPersonnel && def.live.lastDefPersonnel !== defPersonnel) {
            if (rng.chance(0.22)) twelveMen = true; else misaligned = true;
        }
        off.live.lastPersonnel = personnel;
        def.live.lastDefPersonnel = defPersonnel;

        var lu = offenseLineup(off, play.formation, P, PL);
        var dl = defenseLineup(def, dc.front, PL);
        var ctx = { rng: rng, plays: PL, players: P, off: { lineup: lu }, def: { lineup: dl, misaligned: misaligned },
                    play: play, call: dc, sit: sit, tempo: tempo };
        var res;
        if (twelveMen) {
            res = { type: 'penalty', outcome: 'penalty', yards: 0, clockRuns: false, events: [{ kind: 'penalty', say: 'twelve men on the field' }],
                    penalty: { on: 'D', kind: 'twelve men on the field', yards: 5, preSnap: true }, concept: play.concept, formation: play.formation, call: dc };
        } else {
            res = R.resolveSnap(ctx);
        }
        res.tempo = tempo;
        res.sit = sit;

        // Stats and memory
        var st = game.stats[offIdx], dst = game.stats[defIdx];
        var concept = PL.CONCEPTS[play.concept];
        // Tendency tracking: the offense sees what the defense lined up in.
        // This is an observation, not a peek at the call sheet.
        deps.staff.noteCoverage(off.live.beliefs.OC, covBucket(sit), dc.coverage, rng);
        deps.staff.noteAdjustment(off.live.beliefs.OC, dc.adjustment, rng);

        // The defense declines an offensive penalty that would hand the ball
        // back. A holding call must not erase an interception.
        var turnedOver = res.outcome === 'interception' || res.fumbleLost;
        if (turnedOver && res.penalty && res.penalty.on === 'O' && !res.penalty.preSnap) res.penalty = null;

        // A play wiped out by a penalty did not happen, so it does not go in
        // the book. Pass interference is scored as no attempt, the way real
        // football scores it.
        var nullified = !!res.penalty && (res.penalty.preSnap || res.penalty.on === 'O' || res.penalty.autoFirst);
        res.nullified = nullified;

        var needed = sit.down === 1 ? sit.dist * 0.4 : (sit.down === 2 ? sit.dist * 0.6 : sit.dist);
        var success = res.yards >= needed && res.outcome !== 'interception' && !res.fumbleLost;
        if (res.type !== 'penalty' && !nullified) {
            play.calls++; play.yards += res.yards; if (success) play.success++;
            st.plays++;
            if (res.type === 'pass') {
                if (res.outcome === 'sack') { st.sacks++; st.sackYds += res.yards; st.passYds += res.yards; }
                else if (res.outcome === 'scramble') { st.rushAtt++; st.rushYds += res.yards; }
                else {
                    st.passAtt++;
                    if (res.outcome === 'complete') { st.comp++; st.passYds += res.yards; st.yac += res.yac || 0; }
                    if (res.outcome === 'interception') st.int++;
                    if (res.drop) st.drops++;
                    st.depth[concept.depth].att++;
                    if (res.outcome === 'complete') st.depth[concept.depth].comp++;
                    if (res.pressured) st.pressuredAtt++;
                }
            } else if (res.type === 'run') {
                st.rushAtt++; st.rushYds += res.yards;
                st.box[res.boxWeight].att++;
                st.box[res.boxWeight].yds += res.yards;
            }
            if (res.fumble) { st.fumbles++; if (res.fumbleLost) st.fumblesLost++; }
            st.yardsHist.push(res.yards);
        }
        if (res.penalty) { (res.penalty.on === 'O' ? st : dst).penalties++; }

        // Hunch accuracy. Only positive hunches are judged, because only they
        // are a recommendation; "look elsewhere" is not something a play can
        // follow. The concept is recorded with the entry so the harness can
        // score the snap against what that particular play normally gains
        // rather than against the offense's average of everything, which would
        // measure which plays the hunch steered towards instead of whether the
        // coordinator was right.
        if ((res.type === 'pass' || res.type === 'run') && !nullified) {
            game.hunchLog.push({ team: offIdx, concept: res.concept, yards: res.yards,
                                 followed: !!hunchTest,
                                 evaluation: off.staff.OC.attr.evaluation,
                                 confidence: hunchTest ? hunchTest.confidence : null,
                                 key: hunchTest ? hunchTest.key : null });
            noteExpect(off, res.type, res.yards);
        }

        // Stamina and injuries
        var onOff = onFieldList(lu), onDef = onFieldList(dl);
        applyStamina(off, onOff, res.carrier, tempo);
        applyStamina(def, onDef, null, tempo);
        var injuries = [];
        var involved = [res.carrier, res.tackler, res.target].filter(Boolean);
        involved.push(rng.pick(onOff)); involved.push(rng.pick(onDef));
        rollInjuries(rng, P, involved, injuries);
        if (injuries.length) { P.rebuildDepth(off.roster); P.rebuildDepth(def.roster); st.injuries += injuries.filter(function (x) { return onOff.indexOf(x.player) >= 0; }).length; }
        res.injuries = injuries;

        // Everyone watches the same snap and forms their own beliefs from the
        // events on it (DESIGN.md 26.7). This is the only channel; nothing
        // below reads a player's true attributes.
        observeSnap(game, offIdx, res, deps, onOff, onDef);

        // Apply the result to the field
        var described = describeBoth(res, PL);
        var text = described.full;
        var td = false, turnover = false, safety = false;
        if (isTwoPoint) {
            td = (res.outcome === 'complete' || res.outcome === 'run' || res.outcome === 'scramble') && res.yards >= 3 && !res.fumbleLost;
            res.td = td;
            return res;
        }
        if (res.penalty && res.penalty.preSnap) {
            if (res.penalty.on === 'O') { markOff(game, res.penalty.yards); }
            else { game.ball = Math.min(99, game.ball + res.penalty.yards); game.dist -= res.penalty.yards; if (game.dist <= 0) { game.down = 1; game.dist = Math.min(10, 100 - game.ball); } }
        } else if (res.penalty && res.penalty.on === 'D' && res.penalty.autoFirst) {
            game.ball = Math.min(99, game.ball + res.penalty.yards); game.down = 1; game.dist = Math.min(10, 100 - game.ball);
            fixGoalToGo(game);
        } else if (res.penalty && res.penalty.on === 'O') {
            markOff(game, res.penalty.yards);   // holding, replay the down
        } else if (res.outcome === 'interception') {
            turnover = true;
            var spotBall = clamp(game.ball + res.yards - res.retYards, 1, 99);
            setPossession(game, defIdx, 100 - spotBall);
        } else if (res.fumbleLost) {
            turnover = true;
            setPossession(game, defIdx, 100 - clamp(game.ball + res.yards, 1, 99));
        } else {
            game.ball += res.yards;
            if (game.ball >= 100) { td = true; }
            else if (game.ball <= 0) { safety = true; }
            else if (res.yards >= game.dist) { game.down = 1; game.dist = Math.min(10, 100 - game.ball); st.firstDowns++; }
            else { game.down++; game.dist -= res.yards; }
        }
        // Clock
        var secs = 5;
        var mercy = game.quarter >= 3 && Math.abs(game.score[0] - game.score[1]) >= 35;
        if ((res.clockRuns && !res.oob && !td && !turnover && !res.penalty) || mercy) secs += (tempo === 'nohuddle' ? 12 : 26);
        if (res.kneel) secs = 40;
        var trailingLate = game.score[defIdx] < game.score[offIdx] && game.quarter >= 4 && game.clock <= 150;
        if (res.clockRuns && trailingLate && game.timeouts[defIdx] > 0 && !td) {
            game.timeouts[defIdx]--; secs = 5;
            text += ', timeout ' + game.teams[defIdx].name;
            described.terse += ', timeout ' + game.teams[defIdx].name;
        }
        if (!game.ot) game.clock = Math.max(0, game.clock - secs);
        game.log.push({ q: game.quarter, clock: game.clock, team: offIdx, kind: 'play',
                        text: text, terse: described.terse, res: res });
        game.drivePlays++;

        if (td) {
            game.log.push({ q: game.quarter, clock: game.clock, team: offIdx, kind: 'td', text: 'Touchdown ' + game.teams[offIdx].name });
            score(game, offIdx, 6, deps); tryPAT(game, offIdx, deps);
            if (!game.ot) kickoff(game, offIdx, deps);
        } else if (safety) {
            game.log.push({ q: game.quarter, clock: game.clock, team: defIdx, kind: 'safety',
                            text: 'Safety, two points for ' + game.teams[defIdx].name });
            game.score[defIdx] += 2;
            // The team that gave up the safety free kicks from its own twenty.
            var fk = Math.round(clamp(game.rng.normal(45, 7), 25, 60));
            game.log.push({ q: game.quarter, clock: game.clock, team: offIdx, kind: 'freekick',
                            text: 'free kick of ' + fk + ' yards after the safety' });
            game.clock = Math.max(0, game.clock - 6);
            setPossession(game, defIdx, clamp(fk - 5, 15, 60));
        } else if (!turnover && game.down > 4) {
            game.log.push({ q: game.quarter, clock: game.clock, team: offIdx, kind: 'downs', text: 'Turnover on downs' });
            setPossession(game, defIdx, 100 - game.ball);
        }
        res.td = td; res.turnover = turnover;
        return res;
    }

    // Two forms of the same snap. The full one carries the call and the
    // matchup events for a coach who wants the detail; the terse one is the
    // single line DESIGN.md 2 asks for. The interface picks between them.
    function describeBoth(res, PL) {
        var full = describe(res, PL);
        var head = downLine(res) + ': ';
        var body = full.slice(head.length);
        var callEnd = body.indexOf('. ');
        var terseBody = callEnd >= 0 ? body.slice(callEnd + 2) : body;
        var evStart = terseBody.lastIndexOf(' (');
        if (evStart > 0 && /\)$/.test(terseBody)) terseBody = terseBody.slice(0, evStart);
        return { full: full, terse: head + terseBody };
    }

    function downLine(res) {
        return (res.sit.down === 1 ? '1st' : res.sit.down === 2 ? '2nd' : res.sit.down === 3 ? '3rd' : '4th') +
               ' and ' + (res.sit.dist >= res.sit.ytg ? 'goal' : res.sit.dist) + ' at ' + spot(100 - res.sit.ytg);
    }

    function describe(res, PL) {
        var c = PL.CONCEPTS[res.concept], f = PL.FORMATIONS[res.formation];
        var head = downLine(res) + ': ';
        var call = c.name + ' from ' + f.name + ' against ' + PL.COVERAGES[res.call.coverage].name + ', ' + PL.PRESSURES[res.call.pressure].say + (res.call.adjustment !== 'NONE' ? ', ' + PL.ADJUSTMENTS[res.call.adjustment].say : '') + '. ';
        var body;
        if (res.penalty && res.penalty.preSnap) body = 'Penalty, ' + res.penalty.kind + ', ' + res.penalty.yards + ' yards.';
        else if (res.outcome === 'sack') body = 'Sack for a loss of ' + (-res.yards) + '.';
        else if (res.outcome === 'interception') body = 'Intercepted' + (res.defender ? ' by ' + res.defender.name : '') + '.';
        else if (res.outcome === 'complete') body = 'Complete to ' + res.target.name + ' for ' + res.yards + (res.yac > 8 ? ', most of it after the catch' : '') + '.';
        else if (res.outcome === 'incomplete') body = res.bust ? 'Incomplete, a busted play.' : (res.drop ? 'Dropped.' : (res.breakup ? 'Incomplete, broken up.' : 'Incomplete.'));
        else if (res.outcome === 'throwaway') body = 'Thrown away.';
        else if (res.outcome === 'scramble') body = 'Scramble for ' + res.yards + '.';
        else if (res.kneel) body = 'Kneel.';
        else body = (res.carrier ? res.carrier.name : 'Run') + ' for ' + (res.yards < 0 ? 'a loss of ' + (-res.yards) : res.yards) + (res.broke ? ', broke a tackle' : '') + '.';
        var ev = res.events && res.events.length ? ' (' + res.events.map(function (e) { return e.say; }).join('; ') + ')' : '';
        if (res.fumble) body += ' Fumble, ' + (res.fumbleLost ? 'lost' : 'recovered') + '.';
        if (res.penalty && !res.penalty.preSnap) {
            body += ' Penalty, ' + res.penalty.kind + ', ' + res.penalty.yards + ' yards' +
                    (res.penalty.autoFirst ? ' and an automatic first down' : '') + '.';
        }
        return head + call + body + ev;
    }

    // ---------- the game ----------

    function newStats() {
        return { plays: 0, passAtt: 0, comp: 0, passYds: 0, yac: 0, int: 0, drops: 0, sacks: 0, sackYds: 0, pressuredAtt: 0,
                 rushAtt: 0, rushYds: 0, fumbles: 0, fumblesLost: 0, firstDowns: 0, penalties: 0, punts: 0, fga: 0, fgm: 0, td: 0, injuries: 0,
                 depth: { short: { att: 0, comp: 0 }, int: { att: 0, comp: 0 }, deep: { att: 0, comp: 0 } },
                 box: { light: { att: 0, yds: 0 }, normal: { att: 0, yds: 0 }, loaded: { att: 0, yds: 0 } }, yardsHist: [] };
    }

    // A game is built once and then walked one step at a time, so the same
    // loop serves the headless harness and the interface, which has to stop
    // between every snap and let the coach speak (DESIGN.md 16.5, 19.3).

    function startGame(deps, home, away, seed, hooks) {
        var rng = new deps.Rng(seed);
        var game = { rng: rng, teams: [home, away], score: [0, 0], stats: [newStats(), newStats()], log: [],
                     quarter: 1, clock: RULES.HS.quarterSecs, off: 0, ball: 25, down: 1, dist: 10, timeouts: [3, 3],
                     hooks: hooks || null, drivePlays: 0, ot: false,
                     S: deps.staff, hunchLog: [], finished: false, final: null,
                     otRound: 0, otIndex: 0, otFirst: 0, guard: 0 };
        deps.players.resetLive(home.roster); deps.players.resetLive(away.roster);
        resetBeliefs(home, deps, (hooks && hooks.homeScouting) || {});
        resetBeliefs(away, deps, (hooks && hooks.awayScouting) || {});
        game.receivedFirst = rng.chance(0.5) ? 0 : 1;
        kickoff(game, 1 - game.receivedFirst, deps);
        return game;
    }

    function finish(game) {
        game.finished = true;
        game.final = game.score.slice();
    }

    // One step is at most one snap. A quarter or half rolling over is a step of
    // its own that produces no snap, which is what the interface needs so it
    // can speak the break before the next call.
    function stepGame(game, deps) {
        if (game.finished) return null;
        if (game.guard++ > 1500) { finish(game); return null; }
        if (game.ot) return otStep(game, deps);
        if (game.clock <= 0) {
            game.quarter++;
            game.clock = RULES.HS.quarterSecs;
            if (game.quarter === 3) {
                game.timeouts = [3, 3];
                game.log.push({ q: 3, clock: game.clock, kind: 'half', text: 'Halftime. ' + scoreLine(game) });
                kickoff(game, game.receivedFirst, deps);
                return null;
            }
            if (game.quarter > 4) {
                if (game.score[0] === game.score[1]) beginOt(game, deps);
                else finish(game);
                return null;
            }
            return null;
        }
        return step(game, deps);
    }

    // Overtime: alternating possessions from the ten (DESIGN.md 25).
    var OT_WORD = ['', 'one', 'two', 'three', 'four', 'five', 'six'];

    function beginOt(game, deps) {
        game.ot = true;
        game.otRound = 1;
        game.otIndex = 0;
        game.otFirst = 0;
        game.quarter = 5;
        // High school overtime is untimed. The old sentinel of 9999 seconds
        // was being printed as a game clock, so the play by play read "one
        // hundred and sixty six minutes" and counted down from there.
        game.clock = 0;
        game.log.push({ q: game.quarter, clock: 0, kind: 'ot', text: 'Overtime period one' });
        setPossession(game, game.otFirst, 90);
    }

    function otStep(game, deps) {
        var t = game.off;
        var before = game.score.slice();
        var res = step(game, deps, true);
        var possessionOver = (game.off !== t) || (game.score[t] !== before[t]) || game.down > 4;
        if (!possessionOver) return res;
        game.otIndex++;
        if (game.otIndex < 2) {
            setPossession(game, 1 - game.otFirst, 90);
            return res;
        }
        if (game.score[0] !== game.score[1]) { finish(game); return res; }
        game.otRound++;
        if (game.otRound > 6) { finish(game); return res; }
        game.otIndex = 0;
        game.otFirst = 1 - game.otFirst;
        game.quarter = 4 + game.otRound;
        game.clock = 0;
        game.log.push({ q: game.quarter, clock: 0, kind: 'ot',
                        text: 'Overtime period ' + (OT_WORD[game.otRound] || game.otRound) });
        setPossession(game, game.otFirst, 90);
        return res;
    }

    function playGame(deps, home, away, seed, hooks) {
        var game = startGame(deps, home, away, seed, hooks);
        while (!game.finished) stepGame(game, deps);
        return game;
    }

    function scoreLine(game) { return game.teams[0].name + ' ' + game.score[0] + ', ' + game.teams[1].name + ' ' + game.score[1]; }

    function step(game, deps, ot) {
        var offIdx = game.off;
        var diff = game.score[offIdx] - game.score[1 - offIdx];
        // Victory formation
        if (!ot && game.quarter >= 4 && diff > 0 && game.clock <= 40 * (5 - game.down) && game.timeouts[1 - offIdx] === 0) {
            game.clock = Math.max(0, game.clock - 40); game.down++;
            game.log.push({ q: game.quarter, clock: game.clock, team: offIdx, kind: 'play', text: 'Kneel.' });
            if (game.down > 4) setPossession(game, 1 - offIdx, 100 - game.ball);
            return null;
        }
        if (game.down === 4) {
            var d = ot ? ((100 - game.ball) + 17 <= 40 && game.dist > 2 ? 'fg' : 'go') : fourthDownDecision(game, offIdx);
            if (d === 'punt') { punt(game, offIdx, deps); return null; }
            if (d === 'fg') { fieldGoal(game, offIdx, deps); return null; }
        }
        return runPlay(game, offIdx, deps, false);
    }

    var api = { RULES: RULES, makeTeam: makeTeam, playGame: playGame, chooseOffense: chooseOffense, chooseDefense: chooseDefense,
                offenseLineup: offenseLineup, defenseLineup: defenseLineup, runPlay: runPlay, describe: describe, spot: spot, scoreLine: scoreLine,
                resetBeliefs: resetBeliefs, observeSnap: observeSnap, applyHunches: applyHunches,
                situationTags: situationTags, onFieldList: onFieldList, newStats: newStats,
                describeBoth: describeBoth,
                fourthDownDecision: fourthDownDecision, setPossession: setPossession, step: step,
                startGame: startGame, stepGame: stepGame, covBucket: covBucket,
                kickoff: kickoff, punt: punt, fieldGoal: fieldGoal, tryPAT: tryPAT, expected: expected };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.AF = root.AF || {};
    root.AF.game = api;
})(typeof window !== 'undefined' ? window : globalThis);
