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
        HS: { quarterSecs: 720, kickoffFrom: 40, touchback: 20, otStart: 10, timeouts: 3 }
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
        // What each man is called this snap, stamped where the slot is known
        // so resolve.js can name him without carrying the lineup around
        // (DESIGN.md 4.4).
        //
        // An offensive label is the job being done on this snap, not a name
        // that belongs to a man for the game: these slots are real positions,
        // and a back filling in while the starter rests really is the running
        // back while he is out there. That is the opposite of the defensive
        // rule below it, and deliberately so - a defensive alignment here is
        // a convention over the depth chart, so it stays with the man, while
        // an offensive one is a job, so it stays with the job.
        for (k in lu) { if (lu[k] && P.SLOT_SAY[k]) lu[k].live.slot = P.SLOT_SAY[k]; }
        return lu;
    }

    // P (the players module) is optional: without it the lineup is built
    // exactly as before but nobody is given a spoken position. Every caller
    // inside a real game passes it; matrix.js and the unit tests build a
    // lineup to resolve one snap and do not care what anyone is called.
    function defenseLineup(team, front, PL, P) {
        var f = PL.FRONTS[front], d = team.roster.depth, byId = team.roster.byId;
        function take(pos, n) {
            var ids = d[pos].filter(function (id) { return !byId[id].live.out && !byId[id].live.benched; });
            if (ids.length < n) ids = d[pos].filter(function (id) { return !byId[id].live.out; });
            var out = ids.slice(0, n).map(function (id) { return byId[id]; });
            while (out.length < n) out.push(emergency(team, pos));   // never field a short unit
            // A defensive label is the man's own place on the depth chart,
            // not his place in the group that happens to be on the field,
            // and the difference is the whole point. Indexing the filtered
            // list renamed everybody behind a man the coordinator had rested
            // for a series: a nose tackle became a left end and back again
            // while the coach was trying to learn who he was. Depth is
            // looked up on the full chart so a label stays with a man
            // through benchings, front changes and injuries alike (found by
            // the milestone review; DESIGN.md 4.4).
            if (P) out.forEach(function (p) {
                if (!p) return;
                var at = d[pos].indexOf(p.id);
                p.live.slot = P.defSlotSay(pos, at < 0 ? d[pos].length : at);
            });
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
        // A team comfortably ahead starts protecting the lead earlier and at
        // a lower bar than it used to (ISSUES.md): fourteen in the fourth
        // quarter was leaving a big lead free to keep expanding through the
        // third quarter and most of the fourth.
        var leadingBig = (lead >= 10 && game.quarter >= 4) || (lead >= 17 && game.quarter >= 3) || (lead >= 24 && game.quarter >= 2);
        var runLean = team.style.runLean + (leadingBig ? 0.3 : 0) - (late && trailing ? 0.35 : 0) + (tags.indexOf('long') >= 0 ? -0.2 : 0) + (tags.indexOf('short') >= 0 ? 0.2 : 0);
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
        // Coverage by situation and preference. Cover three ruling (Decided,
        // DESIGN.md 26.2): it is a run-down and heavy-personnel call, not a
        // default, so its base weight comes down and it earns its way back
        // up on first down, short yardage, and heavier personnel groups,
        // while two-high shells become the clear answer on a passing down.
        var cw = { C0: 0.4, C1: 2, C2: 1.5, C3: 2, C4: 2, C2M: 0.8 };
        if (tags.indexOf('1st') >= 0) cw.C3 += 1;
        if (tags.indexOf('long') >= 0) { cw.C2 += 2; cw.C4 += 2.5; cw.C2M += 0.8; cw.C3 -= 1.5; }
        if (tags.indexOf('short') >= 0 || tags.indexOf('goal') >= 0) { cw.C1 += 2; cw.C0 += 1; cw.C3 += 2; cw.C4 -= 1; }
        if (personnel === '11') { cw.C2 += 0.8; cw.C4 += 0.8; }
        if (personnel === '21') { cw.C3 += 1; }
        if (personnel === '22') { cw.C1 += 1; cw.C3 += 1.5; }
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

    // A kickoff is no longer resolved where the score happened: it is
    // deferred to the next step so the kicking and receiving sides can each
    // be asked for a call first (deep, squib, pooch, or onside; regular
    // return or hands team). Every old call site is unchanged; stepGame
    // resolves the deferral before anything else. Headless games decide both
    // calls deterministically, so the default path draws exactly what the
    // old synchronous kickoff drew and a seed replays as before.
    function kickoff(game, kickIdx, deps) {
        game.pendingKickoff = { kickIdx: kickIdx };
    }

    // A trailing team kicks onside when it is genuinely desperate: fourth
    // quarter, inside four minutes, down by one to sixteen points. Both
    // sidelines can read the same scoreboard, so the receiving side's hands
    // team decision mirrors this with no belief model needed.
    function onsideSituation(game, kickIdx) {
        if (game.ot || game.quarter < 4 || game.clock > 240) return false;
        var deficit = game.score[1 - kickIdx] - game.score[kickIdx];
        return deficit >= 1 && deficit <= 16;
    }

    // kcall: DEEP | SQUIB | POOCH | ONSIDE. rcall: RETURN | HANDS.
    function kickoffPlay(game, kickIdx, kcall, rcall, deps) {
        var rng = game.rng, P = deps.players;
        var K = kicker(game.teams[kickIdx], 'K', P);
        var leg = K ? P.eff(K, 'leg') : 40;
        var recv = 1 - kickIdx;
        var line, text;
        if (kcall === 'ONSIDE') {
            // A real gamble with a real recovery rate: better against a
            // regular return unit that is not expecting it, poor against a
            // hands team sent on for exactly this.
            var pRec = rcall === 'HANDS' ? 0.10 : 0.22;
            if (rng.chance(pRec)) {
                line = Math.round(clamp(rng.normal(52, 3), 46, 58));
                text = 'onside kick, and ' + game.teams[kickIdx].name + ' recover it.';
                game.log.push({ q: game.quarter, clock: game.clock, team: kickIdx, kind: 'kickoff', text: text });
                game.clock = Math.max(0, game.clock - 4);
                setPossession(game, kickIdx, line);
                return;
            }
            line = Math.round(clamp(rng.normal(47, 4), 40, 55));
            text = 'onside kick, recovered by ' + game.teams[recv].name + '.';
        } else if (kcall === 'SQUIB') {
            // Short field position traded for no return and no disaster.
            line = Math.round(clamp(rng.normal(35, 5), 25, 48));
            text = 'squib kick, taken at ' + spot(line, recv, coachIdxOf(game)) + '.';
        } else if (kcall === 'POOCH') {
            line = Math.round(clamp(rng.normal(22, 5), 12, 35));
            text = 'pooch kick, fair caught at ' + spot(line, recv, coachIdxOf(game)) + '.';
        } else if (rcall === 'HANDS') {
            // A hands team fielding a deep ball gives up the return game.
            line = Math.round(clamp(rng.normal(15, 6), 3, 25));
            text = 'kickoff against the hands team, brought out to ' + spot(line, recv, coachIdxOf(game)) + '.';
        } else {
            var pTB = clamp((leg - 35) * 0.02, 0.03, 0.7);
            if (rng.chance(pTB)) { line = RULES.HS.touchback; text = 'kickoff into the end zone, touchback.'; }
            else {
                var ret = Math.round(clamp(rng.normal(24, 8), 3, 45));
                // A long return is rare and a return for a score is rarer. The old
                // form put one kickoff in fifty inside the opponent's half and
                // narrated it as an ordinary return.
                if (rng.chance(0.015)) ret = Math.round(rng.uniform(46, 70));
                if (rng.chance(0.004)) ret = 100;
                line = Math.min(100, ret);
                text = line >= 100
                    ? 'kickoff returned all the way for a touchdown by ' + game.teams[recv].name + '.'
                    : 'kickoff returned to ' + spot(line, recv, coachIdxOf(game)) + '.';
            }
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

    // The returner: the fastest back or receiver on the depth chart who can
    // go. A deterministic read, no draw, so naming him costs the seed
    // nothing (ISSUES.md, special teams name nobody).
    function returner(team, P) {
        var d = team.roster.depth, byId = team.roster.byId, best = null, bv = -1;
        ['WR', 'RB'].forEach(function (pos) {
            (d[pos] || []).forEach(function (id) {
                var p = byId[id];
                if (!p || p.live.out || p.live.benched) return;
                var v = P.eff(p, 'spd');
                if (v > bv) { bv = v; best = p; }
            });
        });
        if (best) best.live.slot = 'returner';
        return best;
    }

    // The defense's best shot at getting a hand on a kick: the strongest
    // blitzer or rusher it has. Deterministic read, no draw.
    function bestRusher(team, P) {
        var d = team.roster.depth, byId = team.roster.byId, best = null, bv = -1;
        ['DL', 'LB'].forEach(function (pos) {
            (d[pos] || []).forEach(function (id) {
                var p = byId[id];
                if (!p || p.live.out || p.live.benched) return;
                var v = P.eff(p, pos === 'DL' ? 'prs' : 'blz');
                if (v > bv) { bv = v; best = p; }
            });
        });
        return best;
    }

    // What the computer defense calls against a shown kicking unit. The
    // desperation window mirrors the onside one: late, trailing, needing
    // the ball back, a block attempt is worth its cost. A field goal rush
    // is the standard call; punt safe and field goal safe exist for the
    // coach who smells a fake, which today only a human offense runs.
    function defSpecialCall(game, defIdx, unit) {
        if (unit === 'fg') return 'BLOCK';
        var diff = game.score[defIdx] - game.score[1 - defIdx];
        var desperate = game.quarter >= 4 && game.clock <= 240 && diff < 0 && diff >= -16;
        return desperate ? 'BLOCK' : 'RETURN';
    }

    // dcall is the defense's answer to the punt unit: RETURN (the default,
    // and exactly the old behaviour), BLOCK (a real shot at the kick, paid
    // for in return yards and in what a fake does to a committed rush), or
    // SAFE (nobody rushes, the return is conceded, a fake gains nothing).
    // DESIGN.md 8.4; ISSUES.md 2026-08-29, from Brian's play notes.
    function punt(game, offIdx, deps, dcall) {
        var rng = game.rng, P = deps.players;
        var defIdx = 1 - offIdx;
        dcall = dcall || 'RETURN';
        var pu = kicker(game.teams[offIdx], 'P', P);
        if (pu) pu.live.slot = 'punter';
        var puSay = pu ? P.sayPlayer(pu, game.naming || 'both') : 'the punter';
        var leg = pu ? P.eff(pu, 'leg') : 40, kacc = pu ? P.eff(pu, 'kacc') : 40;

        // The block attempt comes first, because a blocked punt never gets
        // its distance. Rare even when called: a good rusher gets a hand on
        // roughly one punt in twenty he rushes.
        if (dcall === 'BLOCK') {
            var rusher = bestRusher(game.teams[defIdx], P);
            var pBlock = clamp(0.02 + ((rusher ? P.eff(rusher, 'blz') : 40) - 45) * 0.0008, 0.01, 0.06);
            if (rng.chance(pBlock)) {
                var scoop = Math.round(clamp(rng.normal(4, 4), 0, 12));
                var spot = clamp(game.ball - scoop, 1, 99);
                var rSay = rusher ? P.sayPlayer(rusher, game.naming || 'both') : 'the rush';
                game.stats[offIdx].punts++;
                game.log.push({ q: game.quarter, clock: game.clock, team: offIdx, kind: 'punt',
                                text: puSay + "'s punt is blocked by " + rSay + '. ' +
                                      game.teams[defIdx].name + ' take over.' });
                game.clock = Math.max(0, game.clock - 4);
                setPossession(game, defIdx, 100 - spot);
                return;
            }
        }

        var dist = Math.round(clamp(34 + (leg - 45) * 0.25 + rng.normal(0, 6), 12, 62));
        if (rng.chance(clamp(0.08 - (kacc - 45) * 0.002, 0.02, 0.15))) dist = Math.round(dist * 0.55); // shank
        var ret = Math.round(clamp(rng.normal(5, 5), 0, 25));
        // A rush-committed unit has nobody back to block for the return; a
        // safe unit concedes it and just gets the ball down.
        if (dcall === 'BLOCK') ret = Math.round(ret * 0.5);
        if (dcall === 'SAFE') ret = Math.round(ret * 0.6);
        var ball = game.ball + dist; // yards from offense's own goal
        var text;
        if (ball >= 100) { ball = 100 - RULES.HS.touchback; text = puSay + ' punts into the end zone, touchback.'; }
        else {
            ball = Math.max(1, ball - ret);
            var rMan = ret ? returner(game.teams[defIdx], P) : null;
            // "Returned zero" is not something anybody says, and without the
            // full stop the line ran straight into the situation after it.
            text = puSay + ' punts ' + dist + ' yards' +
                   (ret ? (rMan ? ', ' + P.sayPlayer(rMan, game.naming || 'both') + ' returns ' + ret
                                : ', returned ' + ret)
                        : ', no return') + '.';
        }
        game.stats[offIdx].punts++;
        game.log.push({ q: game.quarter, clock: game.clock, team: offIdx, kind: 'punt', text: text });
        game.clock = Math.max(0, game.clock - 6);
        setPossession(game, 1 - offIdx, 100 - ball);
    }

    // dcall against the field goal unit: BLOCK (the standard rush, with a
    // real if small shot at the kick) or SAFE (nobody rushes; the answer to
    // a smelled fake).
    function fieldGoal(game, offIdx, deps, dcall) {
        var rng = game.rng, P = deps.players;
        var defIdx = 1 - offIdx;
        dcall = dcall || 'BLOCK';
        var K = kicker(game.teams[offIdx], 'K', P);
        if (K) K.live.slot = 'kicker';
        var dist = (100 - game.ball) + 17;
        var who = K ? P.sayPlayer(K, game.naming || 'both') + "'s " : '';

        if (dcall === 'BLOCK') {
            var rusher = bestRusher(game.teams[defIdx], P);
            var pBlock = clamp(0.01 + ((rusher ? P.eff(rusher, 'blz') : 40) - 45) * 0.0004, 0.005, 0.03);
            if (rng.chance(pBlock)) {
                var rSay = rusher ? P.sayPlayer(rusher, game.naming || 'both') : 'the rush';
                game.stats[offIdx].fga++;
                game.log.push({ q: game.quarter, clock: game.clock, team: offIdx, kind: 'fg',
                                text: who + dist + ' yard field goal is blocked by ' + rSay + '. ' +
                                      game.teams[defIdx].name + ' take over.' });
                game.clock = Math.max(0, game.clock - 4);
                setPossession(game, defIdx, Math.max(20, 100 - (game.ball - 7)));
                return;
            }
        }

        var kacc = K ? P.eff(K, 'kacc') : 40, leg = K ? P.eff(K, 'leg') : 40, nrv = K ? P.eff(K, 'nrv') : 40;
        var base = dist <= 25 ? 0.86 : dist <= 30 ? 0.76 : dist <= 35 ? 0.64 : dist <= 40 ? 0.50 : dist <= 45 ? 0.34 : dist <= 50 ? 0.20 : 0.08;
        var p = base + (kacc - 45) * 0.006 + (dist > 38 ? (leg - 45) * 0.004 : 0);
        var clutch = game.quarter >= 4 && game.clock <= 120 && Math.abs(game.score[0] - game.score[1]) <= 3;
        if (clutch) p += (nrv - 45) * 0.004;
        p = clamp(p, 0.02, 0.97);
        game.stats[offIdx].fga++;
        var good = rng.chance(p);
        game.log.push({ q: game.quarter, clock: game.clock, team: offIdx, kind: 'fg', text: who + dist + ' yard field goal ' + (good ? 'is good.' : 'is no good.') });
        game.clock = Math.max(0, game.clock - 5);
        if (good) { game.stats[offIdx].fgm++; score(game, offIdx, 3, deps); if (!game.ot) kickoff(game, offIdx, deps); }
        else setPossession(game, 1 - offIdx, Math.max(20, 100 - (game.ball - 7)));
    }

    // The try after a touchdown is deferred to its own step, the same
    // pattern as the kickoff, so the scoring coach can be asked: kick the
    // extra point, or go for two (ISSUES.md, from play - the computer was
    // choosing for him). The call sites did not change at all.
    function tryPAT(game, offIdx, deps) {
        game.pendingTry = { offIdx: offIdx };
    }

    // When a two-point try is genuinely worth a thought: fourth quarter,
    // inside ten minutes, at the post-touchdown margins where two changes
    // the game (down two, down five, down eight, or up one). Deterministic
    // and public - the KEY-mode gate, the recommendation, and the headless
    // fallback all read the same arithmetic, so a game nobody coaches makes
    // the choice the old synchronous code made at the same moment.
    function twoPointSituation(game, offIdx) {
        var diff = game.score[offIdx] - game.score[1 - offIdx];
        return game.quarter >= 4 && (diff === -2 || diff === -5 || diff === 1 || diff === -8) && game.clock <= 600;
    }

    // One line for a two-point try. The snap is real and its description is
    // the ordinary one, but the down-and-distance head would be a lie - a
    // try is not a first down - so the head is replaced with the try's own.
    // Shared with the controller's renderEntry so a line already in the log
    // re-renders under the naming setting in force now.
    function describeTry(res, made, PL, opts) {
        var full = describe(res, PL, opts);
        return 'Two point try: ' + full.slice(full.indexOf(': ') + 2) +
               (made ? ' The try is good.' : ' The try is no good.');
    }

    function resolveTry(game, deps) {
        var t = game.pendingTry;
        game.pendingTry = null;
        var offIdx = t.offIdx;
        var rng = game.rng, P = deps.players, PL = deps.plays;
        var call = game.hooks && game.hooks.patCall ? game.hooks.patCall(game, offIdx)
                 : (twoPointSituation(game, offIdx) ? 'two' : 'kick');
        if (call === 'two') {
            var saved = { ball: game.ball, down: game.down, dist: game.dist };
            game.ball = 97; game.down = 1; game.dist = 3;
            var r = runPlay(game, offIdx, deps, true);
            var made = r && r.td;
            // The try is a real snap and is finally described as one: the
            // old line said "two point try fails" with no word of what was
            // run (found by the session 5 milestone review). res rides on
            // the entry so the line re-renders under the naming setting.
            game.log.push({ q: game.quarter, clock: game.clock, team: offIdx, kind: 'pat', made: made, res: r,
                            text: describeTry(r, made, PL, { off: offIdx, coach: coachIdxOf(game),
                                                            players: P, naming: game.naming || 'both' }) });
            if (made) game.score[offIdx] += 2;
            game.ball = saved.ball; game.down = saved.down; game.dist = saved.dist;
            return null;
        }
        var K = kicker(game.teams[offIdx], 'K', P);
        if (K) K.live.slot = 'kicker';
        var p = clamp(0.84 + ((K ? P.eff(K, 'kacc') : 40) - 45) * 0.005, 0.5, 0.99);
        var good = rng.chance(p);
        // The kicker finally has a name (ISSUES.md, special teams name
        // nobody): "kicker Foster's extra point is good."
        var who = K ? P.sayPlayer(K, game.naming || 'both') + "'s " : '';
        game.log.push({ q: game.quarter, clock: game.clock, team: offIdx, kind: 'pat',
                        text: who + 'extra point ' + (good ? 'is good.' : 'is no good.') });
        if (good) game.score[offIdx] += 1;
        return null;
    }

    // ---------- game state helpers ----------

    // The team a human is coaching, or null when nobody is (the harness).
    // The controller stamps autoCoach false on exactly one team; anything it
    // has not touched leaves both undefined, which reads as nobody.
    function coachIdxOf(game) {
        if (game.teams[0].autoCoach === false) return 0;
        if (game.teams[1].autoCoach === false) return 1;
        return null;
    }

    // A yard line, spoken from the coach's side of the ball. nearIdx is the
    // team that owns the half below fifty: the offense for a down and
    // distance, the receiving team for a kickoff. With nobody coaching, the
    // near half is "own", which is the offense-relative wording the harness
    // has always printed. With a coach, "own" means his, so a kickoff his
    // opponent returns to their twenty-five no longer reads as his own
    // twenty-five (ISSUES.md, from play).
    // One vocabulary, shared with controller.js's spotWords. It used to say
    // "own 24" and "opponent 24" where the situation line said "our own 24"
    // and "their 24", so a coach heard the same spot named two ways inside a
    // single utterance: "second and nine at their twenty four" and then
    // "second and nine at opponent twenty four".
    function spot(ball, nearIdx, coachIdx) {
        if (ball === 50) return 'midfield';
        var near = ball < 50;
        var mine = (coachIdx === null || coachIdx === undefined)
            ? near
            : (near ? nearIdx : 1 - nearIdx) === coachIdx;
        return (mine ? 'our own ' : 'their ') + (near ? ball : 100 - ball);
    }

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
        // A team already down by more than a score has no business gambling
        // on fourth and short deep in its own territory before it is
        // genuinely desperate: a stop there hands the other side a short
        // field and turns a bad game into a rout, for the sake of staying on
        // the field a little longer well before it matters (ISSUES.md).
        // Left alone once the team actually is desperate, and left alone for
        // a leading or tied team, or a trailing team already past its own
        // fifty.
        var troubleEarly = !desperate && diff < -8 && game.ball < 50;
        if (desperate && ytg > 35) return 'go';
        if (ytg <= 27 && dist > 3) return 'fg';
        if (ytg <= 27 && dist <= 3 && (ytg <= 8 || game.teams[offIdx].style.aggression > 0.4)) return 'go';
        if (ytg <= 27) return 'fg';
        if (ytg <= 33 && dist > 4 && !desperate) return 'punt';
        if (!troubleEarly && dist <= 2 && game.ball >= 45) return 'go';
        if (!troubleEarly && dist <= 1 && game.ball >= 35) return 'go';
        if (desperate) return 'go';
        return 'punt';
    }

    // How one-sided the math behind fourthDownDecision is, in the same three
    // words a coordinator's confidence already comes in (DESIGN.md 8.4,
    // 5.3). Kept separate from fourthDownDecision itself so the automatic
    // coach's own call in step() is untouched by this.
    function fourthDownConfidence(game, offIdx) {
        var ytg = 100 - game.ball, dist = game.dist, diff = game.score[offIdx] - game.score[1 - offIdx];
        var late = game.quarter >= 4 && game.clock <= 300;
        var desperate = late && diff < 0 && (game.clock <= 120 || diff < -8);
        if (desperate) return 'sure';               // the clock is the only argument left
        if (dist <= 1) return 'sure';                // a yard or less is rarely a real argument
        if (ytg <= 15) return 'sure';                // a short field goal, or already fourth and short in the red zone
        if (ytg <= 33 && dist > 7) return 'sure';    // plainly out of both range and reach: punt
        if (dist <= 4 && game.ball >= 40) return 'likely'; // the analytics zone, but a real argument either way
        return 'guess';
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

    // ---------- penalties: accept or decline (DESIGN.md 8.4; ISSUES.md
    // 2026-08-29, from Brian's play notes) ----------

    // A penalty is decidable when both futures genuinely exist: a live-ball
    // flag on the offense, where the play's own result was computed and can
    // stand. Pass interference is only ever rolled on an incompletion, so
    // declining it is never better and it stays automatic; a pre-snap flag
    // has no play to decline to.
    function penaltyDecidable(res) {
        return !!(res && res.penalty && !res.penalty.preSnap &&
                  res.penalty.on === 'O' && !res.penalty.autoFirst);
    }

    // Both futures as plain data, for the decision rule and for the spoken
    // prompt: what accepting does (replay the down, the offense walked
    // back) and what declining does (the play stands, downs advance).
    function penaltyFutures(game, res) {
        var pen = res.penalty;
        // Accept: half-the-distance cap, the line to gain moves only as far
        // as the ball does - the same arithmetic markOff applies.
        var most = Math.floor(game.ball / 2);
        var moved = Math.min(pen.yards, most);
        var aBall = Math.max(1, game.ball - moved);
        var accept = { down: game.down, dist: game.dist + (game.ball - aBall), ball: aBall };
        // Decline: the play stands.
        var decline;
        if (res.outcome === 'interception' || res.fumbleLost) {
            decline = { turnover: true };
        } else {
            var dBall = clamp(game.ball + res.yards, 0, 100);
            if (dBall >= 100) decline = { td: true };
            else if (dBall <= 0) decline = { safety: true };
            else if (res.yards >= game.dist) decline = { down: 1, dist: Math.min(10, 100 - dBall), ball: dBall, first: true };
            else if (game.down + 1 > 4) decline = { downs: true, ball: dBall };
            else decline = { down: game.down + 1, dist: game.dist - res.yards, ball: dBall };
        }
        return { accept: accept, decline: decline };
    }

    // The rule a real coach uses, in order, and the recommendation the
    // human hears. The defense is choosing, so "better" means worse for
    // the offense.
    function penaltyRule(game, res) {
        var f = penaltyFutures(game, res);
        var d = f.decline;
        if (d.turnover || d.downs || d.safety) return 'decline';   // never wave off the ball
        if (d.td || d.first) return 'accept';                      // never let the gain stand
        if (res.yards <= -res.penalty.yards) return 'decline';     // the play cost them more than the flag would
        if (d.down === 4 && d.dist > 3) return 'decline';          // force the punt
        return 'accept';
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
        // A fake kick against a defense that committed to the block: the
        // rush is real and the ball is not kicked, which is a misalignment
        // in the exact sense the flag already models. Set by step() for this
        // one snap and consumed here.
        if (game.fakeVsBlock) { misaligned = true; game.fakeVsBlock = false; }
        off.live.lastPersonnel = personnel;
        def.live.lastDefPersonnel = defPersonnel;

        var lu = offenseLineup(off, play.formation, P, PL);
        var dl = defenseLineup(def, dc.front, PL, P);
        var ctx = { rng: rng, plays: PL, players: P, off: { lineup: lu }, def: { lineup: dl, misaligned: misaligned },
                    play: play, call: dc, sit: sit, tempo: tempo,
                    // How a player is named in the event sentences: 'both'
                    // (position and last name), 'position', or 'name'. The
                    // controller sets it; headless play leaves it at both.
                    naming: game.naming || 'both' };
        var res;
        if (twelveMen) {
            res = { type: 'penalty', outcome: 'penalty', yards: 0, clockRuns: false, events: [{ kind: 'penalty', say: 'twelve men on the field' }],
                    penalty: { on: 'D', kind: 'twelve men on the field', yards: 5, preSnap: true }, concept: play.concept, formation: play.formation, call: dc };
        } else {
            res = R.resolveSnap(ctx);
        }
        res.tempo = tempo;
        res.sit = sit;

        // Tendency tracking: the offense sees what the defense lined up in.
        // This is an observation, not a peek at the call sheet.
        deps.staff.noteCoverage(off.live.beliefs.OC, covBucket(sit), dc.coverage, rng);
        deps.staff.noteAdjustment(off.live.beliefs.OC, dc.adjustment, rng);

        // A decidable penalty is the benefiting coach's call (ISSUES.md
        // 2026-08-29): the defense chooses on offensive holding. When that
        // defense is the human's, everything from here on waits for his
        // answer, deferred the way the try and the kickoff are; the
        // computer decides by penaltyRule, which replaces the old hardcoded
        // interception guard as its first clause. Not deferred on a
        // two-point try (the penalty is ignored there, a logged wart) and
        // not in overtime, where the rotation bookkeeping reads the score
        // around the snap and cannot see a change of possession that lands
        // in a ceremony step; overtime penalties take the rule.
        if (penaltyDecidable(res) && !isTwoPoint) {
            var humanDefense = game.teams[defIdx].autoCoach === false;
            if (humanDefense && !game.ot && !(game.hooks && game.hooks.penaltyCall)) {
                game.pendingPenalty = { res: res, offIdx: offIdx, playId: play.id,
                                        hunchTest: hunchTest || null };
                return null;
            }
            var pcall = game.hooks && game.hooks.penaltyCall
                ? game.hooks.penaltyCall(game, res)
                : penaltyRule(game, res);
            if (pcall === 'decline') { res.penaltyDeclined = res.penalty; res.penalty = null; }
        }

        return finishPlay(game, offIdx, deps, res, play.id, hunchTest, isTwoPoint);
    }

    // Resolves the deferred penalty decision as a ceremony step, then
    // finishes the snap it interrupted.
    function resolvePenaltyStep(game, deps) {
        var pp = game.pendingPenalty;
        game.pendingPenalty = null;
        var res = pp.res;
        var pcall = game.hooks && game.hooks.penaltyCall
            ? game.hooks.penaltyCall(game, res)
            : penaltyRule(game, res);
        if (pcall === 'decline') { res.penaltyDeclined = res.penalty; res.penalty = null; }
        return finishPlay(game, pp.offIdx, deps, res, pp.playId, pp.hunchTest, false);
    }

    // Everything a snap does after the penalty question is settled: stats,
    // beliefs, stamina, injuries, the application to the field, the clock,
    // and the log. Split out of runPlay so a deferred decision can finish
    // the same snap later; the lineups are rebuilt rather than carried,
    // which is safe because building them draws nothing and nothing changes
    // between the deferral and the answer.
    function finishPlay(game, offIdx, deps, res, playId, hunchTest, isTwoPoint) {
        var rng = game.rng, P = deps.players, PL = deps.plays;
        var off = game.teams[offIdx], def = game.teams[1 - offIdx];
        var defIdx = 1 - offIdx;
        var sit = res.sit;
        var tempo = res.tempo;
        var dc = res.call;
        var play = null, pi;
        for (pi = 0; pi < off.playbook.length; pi++) if (off.playbook[pi].id === playId) { play = off.playbook[pi]; break; }
        var lu = offenseLineup(off, res.formation, P, PL);
        var dl = defenseLineup(def, dc.front, PL, P);

        // Stats and memory
        var st = game.stats[offIdx], dst = game.stats[defIdx];
        var concept = PL.CONCEPTS[res.concept];

        // A play wiped out by a penalty did not happen, so it does not go in
        // the book. Pass interference is scored as no attempt, the way real
        // football scores it.
        var nullified = !!res.penalty && (res.penalty.preSnap || res.penalty.on === 'O' || res.penalty.autoFirst);
        res.nullified = nullified;

        var needed = sit.down === 1 ? sit.dist * 0.4 : (sit.down === 2 ? sit.dist * 0.6 : sit.dist);
        var success = res.yards >= needed && res.outcome !== 'interception' && !res.fumbleLost;
        if (res.type !== 'penalty' && !nullified) {
            if (play) { play.calls++; play.yards += res.yards; if (success) play.success++; }
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
        var thrownFlag = res.penalty || res.penaltyDeclined;
        if (thrownFlag) { (thrownFlag.on === 'O' ? st : dst).penalties++; }

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

        // What everyone on this snap was called, kept on the result so the
        // line can be said again later without lying. live.slot is where a
        // man stands now, and a line describing a snap from ten plays ago
        // must not borrow it: re-rendering the log at the final whistle
        // moved a fifth of its blocks to the wrong linemen (found by the
        // milestone review). Captured before injuries rebuild the chart.
        res.slotOf = {};
        onOff.concat(onDef).forEach(function (p) {
            if (p && p.live && p.live.slot) res.slotOf[p.id] = p.live.slot;
        });

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
        var described = describeBoth(res, PL, { off: offIdx, coach: coachIdxOf(game), players: P, naming: game.naming || 'both' });
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
            // On the result, not only on the two strings: the controller
            // rebuilds a line from the result to apply the naming and
            // verbosity settings in force now, and a clause that lives only
            // in the stored text is a clause it cannot know about. This one
            // was going silent about twice a game - the coach was never told
            // his opponent had stopped the clock (found by the milestone
            // review).
            res.timeoutBy = game.teams[defIdx].name;
            text += ', timeout ' + res.timeoutBy;
            described.terse += ', timeout ' + res.timeoutBy;
        }
        if (!game.ot) game.clock = Math.max(0, game.clock - secs);
        game.log.push({ q: game.quarter, clock: game.clock, team: offIdx, kind: 'play',
                        text: text, terse: described.terse, res: res });
        game.drivePlays++;

        if (td) {
            game.log.push({ q: game.quarter, clock: game.clock, team: offIdx, kind: 'td', text: 'Touchdown ' + game.teams[offIdx].name + '.' });
            score(game, offIdx, 6, deps); tryPAT(game, offIdx, deps);
            if (!game.ot) kickoff(game, offIdx, deps);
        } else if (safety) {
            game.log.push({ q: game.quarter, clock: game.clock, team: defIdx, kind: 'safety',
                            text: 'Safety, two points for ' + game.teams[defIdx].name + '.' });
            game.score[defIdx] += 2;
            // The team that gave up the safety free kicks from its own twenty.
            var fk = Math.round(clamp(game.rng.normal(45, 7), 25, 60));
            game.log.push({ q: game.quarter, clock: game.clock, team: offIdx, kind: 'freekick',
                            text: 'free kick of ' + fk + ' yards after the safety.' });
            game.clock = Math.max(0, game.clock - 6);
            setPossession(game, defIdx, clamp(fk - 5, 15, 60));
        } else if (!turnover && game.down > 4) {
            game.log.push({ q: game.quarter, clock: game.clock, team: offIdx, kind: 'downs', text: 'Turnover on downs.' });
            setPossession(game, defIdx, 100 - game.ball);
        }
        res.td = td; res.turnover = turnover;
        return res;
    }

    // Two forms of the same snap. The full one carries the call and the
    // matchup events for a coach who wants the detail; the terse one is the
    // single line DESIGN.md 2 asks for. The interface picks between them.
    function describeBoth(res, PL, opts) {
        var full = describe(res, PL, opts);
        var head = downLine(res, opts) + ': ';
        var timeout = res.timeoutBy ? ', timeout ' + res.timeoutBy : '';
        var body = full.slice(head.length);
        var callEnd = body.indexOf('. ');
        var terseBody = callEnd >= 0 ? body.slice(callEnd + 2) : body;
        var evStart = terseBody.lastIndexOf(' (');
        if (evStart > 0 && /\)$/.test(terseBody)) terseBody = terseBody.slice(0, evStart);
        return { full: full + timeout, terse: head + terseBody + timeout };
    }

    function downLine(res, opts) {
        opts = opts || {};
        return (res.sit.down === 1 ? '1st' : res.sit.down === 2 ? '2nd' : res.sit.down === 3 ? '3rd' : '4th') +
               ' and ' + (res.sit.dist >= res.sit.ytg ? 'goal' : res.sit.dist) +
               ' at ' + spot(100 - res.sit.ytg, opts.off, opts.coach);
    }

    function describe(res, PL, opts) {
        opts = opts || {};
        var c = PL.CONCEPTS[res.concept], f = PL.FORMATIONS[res.formation];
        // Who a player is to the coach: position and last name by default
        // (DESIGN.md 4, status note). P is optional so a caller with no
        // players module still gets the plain name it always got.
        var nm = function (p) {
            return opts.players ? opts.players.sayPlayer(p, opts.naming, res.slotOf) : (p ? p.name : '');
        };
        // A position label starts a sentence in lower case where a name did
        // not, so the one place a player opens a clause capitalises him.
        var cap = function (t) { return t ? t.charAt(0).toUpperCase() + t.slice(1) : t; };
        var head = downLine(res, opts) + ': ';
        var call = c.name + ' from ' + f.name + ' against ' + PL.COVERAGES[res.call.coverage].name + ', ' + PL.PRESSURES[res.call.pressure].say + (res.call.adjustment !== 'NONE' ? ', ' + PL.ADJUSTMENTS[res.call.adjustment].say : '') + '. ';
        var body;
        if (res.penalty && res.penalty.preSnap) body = 'Penalty, ' + res.penalty.kind + ', ' + res.penalty.yards + ' yards.';
        else if (res.outcome === 'sack') body = 'Sack for a loss of ' + (-res.yards) + '.';
        else if (res.outcome === 'interception') body = 'Intercepted' + (res.defender ? ' by ' + nm(res.defender) : '') + '.';
        else if (res.outcome === 'complete') body = 'Complete to ' + nm(res.target) + ' for ' + res.yards + (res.yac > 8 ? ', most of it after the catch' : '') + '.';
        else if (res.outcome === 'incomplete') body = res.bust ? 'Incomplete, a busted play.' : (res.drop ? 'Dropped.' : (res.breakup ? 'Incomplete, broken up.' : 'Incomplete.'));
        else if (res.outcome === 'throwaway') body = 'Thrown away.';
        else if (res.outcome === 'scramble') body = 'Scramble for ' + res.yards + '.';
        else if (res.kneel) body = 'Kneel.';
        else body = (res.carrier ? cap(nm(res.carrier)) : 'Run') + ' for ' + (res.yards < 0 ? 'a loss of ' + (-res.yards) : res.yards) + (res.broke ? ', broke a tackle' : '') + '.';
        // An event that named players kept the shape it was written in, so
        // the matchups in this line are said in the naming mode in force
        // now rather than the one in force when the snap resolved. Without
        // this, pressing A re-read the body of a line already in the log
        // but not its tail, which is worse than not re-reading it at all.
        var ev = res.events && res.events.length ? ' (' + res.events.map(function (e) {
            if (e.tmpl && e.refs && opts.players) {
                return opts.players.fillTemplate(e.tmpl, e.refs.map(nm));
            }
            return e.say;
        }).join('; ') + ')' : '';
        if (res.fumble) body += ' Fumble, ' + (res.fumbleLost ? 'lost' : 'recovered') + '.';
        if (res.penalty && !res.penalty.preSnap) {
            body += ' Penalty, ' + res.penalty.kind + ', ' + res.penalty.yards + ' yards' +
                    (res.penalty.autoFirst ? ' and an automatic first down' : '') + '.';
        }
        // A declined flag is still part of the story of the snap.
        if (res.penaltyDeclined) {
            body += ' Penalty, ' + res.penaltyDeclined.kind + ', declined. The play stands.';
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
        // The coin toss is a step of its own now, resolved by the first call
        // to stepGame, so a human coach can call it in the air and the winner
        // can choose. Headless games make the same single draw the old code
        // made here, with the same meaning, so a seed replays as before.
        game.pendingToss = true;
        game.pendingTossChoice = null;
        game.pendingKickoff = null;
        game.pendingTry = null;
        game.pendingPenalty = null;
        game.otRotate = false;
        return game;
    }

    function resolveToss(game, deps) {
        var rng = game.rng;
        game.pendingToss = false;
        var call = game.hooks && game.hooks.coinToss ? game.hooks.coinToss(game) : null;
        var flip = rng.chance(0.5);
        if (!call) {
            // Headless, or a fully delegated coach: winner takes the ball,
            // which is exactly what the old startGame draw meant.
            game.receivedFirst = flip ? 0 : 1;
            game.log.push({ q: 1, clock: game.clock, kind: 'toss',
                            text: game.teams[game.receivedFirst].name + ' win the toss and will receive.' });
            kickoff(game, 1 - game.receivedFirst, deps);
            return null;
        }
        var coin = flip ? 'heads' : 'tails';
        var team = call.team || 0;
        if (call.call === coin) {
            game.pendingTossChoice = { winner: team, coin: coin };
            game.log.push({ q: 1, clock: game.clock, kind: 'toss',
                            text: 'The coin comes up ' + coin + '. ' + game.teams[team].name + ' win the toss.' });
            return null;
        }
        // The other captain takes the ball, which is what a computer winner
        // always chooses.
        game.receivedFirst = 1 - team;
        game.log.push({ q: 1, clock: game.clock, kind: 'toss',
                        text: 'The coin comes up ' + coin + '. ' + game.teams[1 - team].name +
                              ' win the toss and will receive.' });
        kickoff(game, team, deps);
        return null;
    }

    function resolveTossChoice(game, deps) {
        var tc = game.pendingTossChoice;
        game.pendingTossChoice = null;
        var pick = game.hooks && game.hooks.tossChoice ? game.hooks.tossChoice(game) : { choice: 'RECEIVE' };
        var team = tc.winner;
        if (pick.choice === 'RECEIVE') {
            game.receivedFirst = team;
            game.log.push({ q: 1, clock: game.clock, kind: 'toss',
                            text: game.teams[team].name + ' will receive.' });
        } else {
            // DEFER and KICK land in the same place for the opening: the
            // other side takes the ball now. Deferring banks the choice for
            // the second half, which receivedFirst already encodes.
            game.receivedFirst = 1 - team;
            game.log.push({ q: 1, clock: game.clock, kind: 'toss',
                            text: pick.choice === 'DEFER'
                                ? game.teams[team].name + ' defer to the second half'
                                : game.teams[team].name + ' elect to kick' });
        }
        kickoff(game, 1 - game.receivedFirst, deps);
        return null;
    }

    function resolveKickoff(game, deps) {
        var ko = game.pendingKickoff;
        game.pendingKickoff = null;
        var kickIdx = ko.kickIdx, recv = 1 - kickIdx;
        var kcall = game.hooks && game.hooks.kickoffKick ? game.hooks.kickoffKick(game, kickIdx)
                  : (onsideSituation(game, kickIdx) ? 'ONSIDE' : 'DEEP');
        var rcall = game.hooks && game.hooks.kickoffReceive ? game.hooks.kickoffReceive(game, recv)
                  : (onsideSituation(game, kickIdx) ? 'HANDS' : 'RETURN');
        kickoffPlay(game, kickIdx, kcall, rcall, deps);
        return null;
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
        // The deferred ceremonies, each a step of its own so the interface
        // can ask its question and speak the answer between them.
        // The flag on the last snap resolves before anything else: the
        // snap it interrupted is not finished until it does.
        if (game.pendingPenalty) return resolvePenaltyStep(game, deps);
        if (game.pendingToss) return resolveToss(game, deps);
        if (game.pendingTossChoice) return resolveTossChoice(game, deps);
        // The try resolves before the kickoff a touchdown also owes, which
        // is the order the field runs in.
        if (game.pendingTry) return resolveTry(game, deps);
        if (game.pendingKickoff) return resolveKickoff(game, deps);
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
        game.log.push({ q: game.quarter, clock: 0, kind: 'ot', text: 'Overtime period one.' });
        setPossession(game, game.otFirst, 90);
    }

    function otStep(game, deps) {
        // Rotation waits for a deferred try, because whether overtime
        // continues depends on the score the try produces: deciding the
        // period off the bare six would end a game the kick was about to
        // tie, or play on in one it had already won. The old synchronous
        // order - snap, try, then the bookkeeping - is preserved exactly,
        // just spread across steps.
        if (game.otRotate) { game.otRotate = false; return otRotate(game, deps, null); }
        var t = game.off;
        var before = game.score.slice();
        var res = step(game, deps, true);
        var possessionOver = (game.off !== t) || (game.score[t] !== before[t]) || game.down > 4;
        if (!possessionOver) return res;
        if (game.pendingTry) { game.otRotate = true; return res; }
        return otRotate(game, deps, res);
    }

    function otRotate(game, deps, res) {
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
                        text: 'Overtime period ' + (OT_WORD[game.otRound] || game.otRound) + '.' });
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
            // The coach's own fourth-down call, when he has one, takes
            // precedence over the automatic recommendation (DESIGN.md 8.4).
            // 'fakepunt' and 'fakefg' both resolve as a real snap, the same
            // as 'go': a fake is a real conversion attempt with a kick
            // formation's dressing on it, not a separate probability model
            // (see DESIGN_PROPOSALS.md proposal 3).
            var d = game.hooks && game.hooks.special ? game.hooks.special(game, offIdx)
                    : (ot ? otFourthDownDecision(game, offIdx) : fourthDownDecision(game, offIdx));
            // The defense answers the unit it is shown (DESIGN.md 8.4;
            // ISSUES.md 2026-08-29). The coach's call comes through
            // hooks.defSpecial; the computer picks from the same public
            // arithmetic. A fake against a committed block rush plays like
            // a snap against a misaligned defense, because that is what an
            // all-out rush is once the ball is not kicked.
            var shownUnit = d === 'punt' || d === 'fakepunt' ? 'punt'
                          : d === 'fg' || d === 'fakefg' ? 'fg' : null;
            var dsc = shownUnit
                ? (game.hooks && game.hooks.defSpecial ? game.hooks.defSpecial(game, 1 - offIdx, shownUnit)
                                                       : defSpecialCall(game, 1 - offIdx, shownUnit))
                : null;
            if (d === 'punt') { punt(game, offIdx, deps, dsc); return null; }
            if (d === 'fg') { fieldGoal(game, offIdx, deps, dsc); return null; }
            if ((d === 'fakepunt' || d === 'fakefg') && dsc === 'BLOCK') game.fakeVsBlock = true;
        }
        return runPlay(game, offIdx, deps, false);
    }

    // Overtime never punts (Decided, section 25): a team either kicks or
    // goes for it. In range means the kicker could plausibly make it, the
    // same forty-yard field goal threshold engine/controller.js uses to
    // decide whether the special teams choice offers a kick at all.
    function otFourthDownDecision(game, offIdx) {
        return (100 - game.ball) + 17 <= 40 && game.dist > 2 ? 'fg' : 'go';
    }

    var api = { RULES: RULES, makeTeam: makeTeam, playGame: playGame, chooseOffense: chooseOffense, chooseDefense: chooseDefense,
                offenseLineup: offenseLineup, defenseLineup: defenseLineup, runPlay: runPlay, describe: describe, spot: spot, scoreLine: scoreLine,
                resetBeliefs: resetBeliefs, observeSnap: observeSnap, applyHunches: applyHunches,
                situationTags: situationTags, onFieldList: onFieldList, newStats: newStats,
                describeBoth: describeBoth,
                fourthDownDecision: fourthDownDecision, fourthDownConfidence: fourthDownConfidence,
                otFourthDownDecision: otFourthDownDecision, setPossession: setPossession, step: step,
                startGame: startGame, stepGame: stepGame, covBucket: covBucket,
                kickoff: kickoff, kickoffPlay: kickoffPlay, onsideSituation: onsideSituation,
                twoPointSituation: twoPointSituation, describeTry: describeTry,
                defSpecialCall: defSpecialCall,
                penaltyDecidable: penaltyDecidable, penaltyFutures: penaltyFutures, penaltyRule: penaltyRule,
                punt: punt, fieldGoal: fieldGoal, tryPAT: tryPAT, expected: expected };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.AF = root.AF || {};
    root.AF.game = api;
})(typeof window !== 'undefined' ? window : globalThis);
