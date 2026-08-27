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

    // ---------- team construction ----------

    function makeTeam(deps, opts) {
        var P = deps.players, PL = deps.plays;
        var roster = P.makeRoster(opts.rng, opts.level || 'HS', opts.quality || 0, opts.stub || opts.name);
        var playbook = PL.buildPlaybook();
        var i;
        for (i = 0; i < playbook.length; i++) playbook[i].exec = clamp(Math.round(opts.rng.normal(opts.execMean || 50, 10)), 20, 90);
        return { name: opts.name, roster: roster, playbook: playbook,
                 // Coaching identity: run/pass lean, aggression, coverage preference
                 style: { runLean: opts.runLean !== undefined ? opts.runLean : 0.5, aggression: opts.aggression || 0.3,
                          covPref: opts.covPref || null },
                 // What this staff has learned this game (reset each game)
                 memory: null };
    }

    function resetMemory(team) {
        team.memory = {
            seenCov: {}, seenPress: {},              // what the opponent's defense has shown
            targets: {},                            // role -> {calls, success}  (defense's exploitation counter)
            runs: { calls: 0, success: 0 },
            lastPersonnel: null, lastDefPersonnel: null
        };
    }

    // ---------- lineups ----------

    function offenseLineup(team, formation, P, PL) {
        var d = team.roster.depth, byId = team.roster.byId;
        var lu = {}, i;
        function pick(pos, idx) {
            var ids = d[pos].filter(function (id) { return !byId[id].live.out; });
            return byId[ids[idx]] || byId[ids[ids.length - 1]] || null;
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
            return d[pos].filter(function (id) { return !byId[id].live.out; }).slice(0, n).map(function (id) { return byId[id]; });
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
            if (on[p.id]) {
                var drain = (p.pos === 'OL' || p.pos === 'DL') ? 2.4 : 1.8;
                if (p === carrier) drain += 1.2;
                if (tempo === 'nohuddle') drain += 1.3;
                p.live.stamina = Math.max(0, p.live.stamina - drain);
            } else {
                p.live.stamina = Math.min(100, p.live.stamina + 3.2);
            }
        }
    }

    function rollInjuries(rng, players, involved, injuries) {
        var i, p;
        for (i = 0; i < involved.length; i++) {
            p = involved[i];
            if (!p || p.live.out) continue;
            var pInj = 0.0014 * (1 + (50 - p.attr.tgh) / 50) * (1 + (100 - p.live.stamina) / 100) * (p.hidden.injuryProne ? 1.6 : 1);
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

    function guessCoverage(mem) {
        var best = 'C3', bv = -1, k;
        for (k in mem.seenCov) if (mem.seenCov[k] > bv) { bv = mem.seenCov[k]; best = k; }
        return best;
    }

    function chooseOffense(game, team, sit, offIdx, deps) {
        var rng = game.rng, PL = deps.plays, P = deps.players;
        var tags = situationTags(sit, game, offIdx);
        var expected = guessCoverage(team.memory);
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
            // the coach's read of what the defense has shown
            var sm = (c.vsCov && c.vsCov[expected]) || 0;
            w *= 1 + sm * 0.04;
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
        var mem = team.memory;
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
        // Adjustment: the counter loop in its first form (DESIGN.md 8.3)
        var adjustment = 'NONE';
        var t1 = mem.targets.WR1;
        if (t1 && t1.calls >= 3 && t1.success / t1.calls > 0.55 && rng.chance(0.6)) adjustment = rng.chance(0.5) ? 'BRACKET' : 'HELP';
        else if (mem.runs.calls >= 6 && mem.runs.success / mem.runs.calls > 0.55 && rng.chance(0.5)) adjustment = 'LOAD';
        else if (rng.chance(0.08)) adjustment = rng.pick(['SPY', 'CONTAIN']);
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
            if (rng.chance(0.02)) ret = Math.round(rng.uniform(50, 100));
            line = Math.min(100, ret);
            text = 'kickoff returned to the ' + spot(line);
            if (line >= 100) { text = 'kickoff returned all the way for a touchdown'; }
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

    function setPossession(game, idx, ball) {
        game.off = idx; game.ball = clamp(ball, 1, 99); game.down = 1; game.dist = Math.min(10, 100 - game.ball);
        game.drivePlays = 0;
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
        var personnel = PL.FORMATIONS[play.formation].personnel;
        var offSubbed = off.memory.lastPersonnel !== null && off.memory.lastPersonnel !== personnel;

        // Defensive call
        var dc = game.hooks && game.hooks.defense ? game.hooks.defense(game, def, sit, off, personnel, defIdx) : null;
        if (!dc) dc = chooseDefense(game, def, sit, off, personnel, defIdx, deps);
        var defPersonnel = PL.FRONTS[dc.front].dl + '-' + PL.FRONTS[dc.front].lb + '-' + PL.FRONTS[dc.front].db;
        var misaligned = false, twelveMen = false;
        // Substitution rule (DESIGN.md 16.5): the defense subs freely on a huddle or an offensive sub.
        if (tempo === 'nohuddle' && !offSubbed && def.memory.lastDefPersonnel && def.memory.lastDefPersonnel !== defPersonnel) {
            if (rng.chance(0.22)) twelveMen = true; else misaligned = true;
        }
        off.memory.lastPersonnel = personnel;
        def.memory.lastDefPersonnel = defPersonnel;

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
        off.memory.seenCov[dc.coverage] = (off.memory.seenCov[dc.coverage] || 0) + 1;
        off.memory.seenPress[dc.pressure] = (off.memory.seenPress[dc.pressure] || 0) + 1;

        var needed = sit.down === 1 ? sit.dist * 0.4 : (sit.down === 2 ? sit.dist * 0.6 : sit.dist);
        var success = res.yards >= needed && res.outcome !== 'interception' && !res.fumbleLost;
        if (res.type !== 'penalty') {
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
                    if (res.role) {
                        var tr = def.memory.targets[res.role] || (def.memory.targets[res.role] = { calls: 0, success: 0 });
                        tr.calls++; if (success) tr.success++;
                    }
                    if (res.pressured) st.pressuredAtt++;
                }
            } else if (res.type === 'run') {
                st.rushAtt++; st.rushYds += res.yards;
                st.box[res.boxWeight].att++;
                st.box[res.boxWeight].yds += res.yards;
                def.memory.runs.calls++; if (success) def.memory.runs.success++;
            }
            if (res.fumble) { st.fumbles++; if (res.fumbleLost) st.fumblesLost++; }
            st.yardsHist.push(res.yards);
        }
        if (res.penalty) { (res.penalty.on === 'O' ? st : dst).penalties++; }

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

        // Apply the result to the field
        var text = describe(res, PL, offIdx, game);
        var td = false, turnover = false, safety = false;
        if (isTwoPoint) {
            td = (res.outcome === 'complete' || res.outcome === 'run' || res.outcome === 'scramble') && res.yards >= 3 && !res.fumbleLost;
            res.td = td;
            return res;
        }
        if (res.penalty && res.penalty.preSnap) {
            if (res.penalty.on === 'O') { game.ball = Math.max(1, game.ball - res.penalty.yards); game.dist += res.penalty.yards; }
            else { game.ball = Math.min(99, game.ball + res.penalty.yards); game.dist -= res.penalty.yards; if (game.dist <= 0) { game.down = 1; game.dist = Math.min(10, 100 - game.ball); } }
        } else if (res.penalty && res.penalty.on === 'D' && res.penalty.autoFirst) {
            game.ball = Math.min(99, game.ball + res.penalty.yards); game.down = 1; game.dist = Math.min(10, 100 - game.ball);
        } else if (res.penalty && res.penalty.on === 'O') {
            game.ball = Math.max(1, game.ball - res.penalty.yards); game.dist += res.penalty.yards; // holding, replay the down
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
        if (res.clockRuns && trailingLate && game.timeouts[defIdx] > 0 && !td) { game.timeouts[defIdx]--; secs = 5; text += ', timeout ' + game.teams[defIdx].name; }
        game.clock = Math.max(0, game.clock - secs);
        game.log.push({ q: game.quarter, clock: game.clock, team: offIdx, kind: 'play', text: text, res: res });
        game.drivePlays++;

        if (td) {
            game.log.push({ q: game.quarter, clock: game.clock, team: offIdx, kind: 'td', text: 'Touchdown ' + game.teams[offIdx].name });
            score(game, offIdx, 6, deps); tryPAT(game, offIdx, deps);
            if (!game.ot) kickoff(game, offIdx, deps);
        } else if (safety) {
            game.log.push({ q: game.quarter, clock: game.clock, team: defIdx, kind: 'safety', text: 'Safety' });
            game.score[defIdx] += 2;
            setPossession(game, defIdx, 40); // free kick, simplified
        } else if (!turnover && game.down > 4) {
            game.log.push({ q: game.quarter, clock: game.clock, team: offIdx, kind: 'downs', text: 'Turnover on downs' });
            setPossession(game, defIdx, 100 - game.ball);
        }
        res.td = td; res.turnover = turnover;
        return res;
    }

    function describe(res, PL, offIdx, game) {
        var c = PL.CONCEPTS[res.concept], f = PL.FORMATIONS[res.formation];
        var head = (res.sit.down === 1 ? '1st' : res.sit.down === 2 ? '2nd' : res.sit.down === 3 ? '3rd' : '4th') + ' and ' + (res.sit.dist >= res.sit.ytg ? 'goal' : res.sit.dist) + ' at ' + spot(100 - res.sit.ytg) + ': ';
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
        if (res.penalty && !res.penalty.preSnap) body += ' Penalty, ' + res.penalty.kind + '.';
        return head + call + body + ev;
    }

    // ---------- the game ----------

    function newStats() {
        return { plays: 0, passAtt: 0, comp: 0, passYds: 0, yac: 0, int: 0, drops: 0, sacks: 0, sackYds: 0, pressuredAtt: 0,
                 rushAtt: 0, rushYds: 0, fumbles: 0, fumblesLost: 0, firstDowns: 0, penalties: 0, punts: 0, fga: 0, fgm: 0, td: 0, injuries: 0,
                 depth: { short: { att: 0, comp: 0 }, int: { att: 0, comp: 0 }, deep: { att: 0, comp: 0 } },
                 box: { light: { att: 0, yds: 0 }, normal: { att: 0, yds: 0 }, loaded: { att: 0, yds: 0 } }, yardsHist: [] };
    }

    function playGame(deps, home, away, seed, hooks) {
        var rng = new deps.Rng(seed);
        var game = { rng: rng, teams: [home, away], score: [0, 0], stats: [newStats(), newStats()], log: [],
                     quarter: 1, clock: RULES.HS.quarterSecs, off: 0, ball: 25, down: 1, dist: 10, timeouts: [3, 3],
                     hooks: hooks || null, drivePlays: 0, ot: false };
        deps.players.resetLive(home.roster); deps.players.resetLive(away.roster);
        resetMemory(home); resetMemory(away);
        var receivedFirst = rng.chance(0.5) ? 0 : 1;
        kickoff(game, 1 - receivedFirst, deps);
        var guard = 0;
        while (game.quarter <= 4 && guard++ < 400) {
            if (game.clock <= 0) {
                game.quarter++;
                game.clock = RULES.HS.quarterSecs;
                if (game.quarter === 3) { game.timeouts = [3, 3]; game.log.push({ q: 3, clock: game.clock, kind: 'half', text: 'Halftime. ' + scoreLine(game) }); kickoff(game, receivedFirst, deps); }
                if (game.quarter > 4) break;
                continue;
            }
            step(game, deps);
        }
        // Overtime: alternating possessions from the 10 (DESIGN.md 25)
        var otRounds = 0;
        game.ot = false;
        while (game.score[0] === game.score[1] && otRounds < 6) {
            game.ot = true;
            otRounds++;
            game.quarter = 4 + otRounds; game.clock = 9999;
            var first = otRounds % 2 === 1 ? 0 : 1, k;
            game.log.push({ q: game.quarter, clock: 0, kind: 'ot', text: 'Overtime period ' + otRounds });
            for (k = 0; k < 2; k++) {
                var t = k === 0 ? first : 1 - first;
                setPossession(game, t, 90);
                var g2 = 0;
                while (game.off === t && g2++ < 20 && !(game.down > 4)) {
                    var before = game.score.slice();
                    step(game, deps, true);
                    if (game.score[t] !== before[t] || game.off !== t) break;
                }
            }
        }
        game.final = game.score.slice();
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
            return;
        }
        if (game.down === 4) {
            var d = ot ? ((100 - game.ball) + 17 <= 40 && game.dist > 2 ? 'fg' : 'go') : fourthDownDecision(game, offIdx);
            if (d === 'punt') { punt(game, offIdx, deps); return; }
            if (d === 'fg') { fieldGoal(game, offIdx, deps); return; }
        }
        runPlay(game, offIdx, deps, false);
        // In overtime the kickoff after a score must not happen; reset if it did
        if (ot && game.off !== offIdx && game.ball !== 90 && game.down === 1) { /* possession changed by score or turnover; caller handles */ }
    }

    var api = { RULES: RULES, makeTeam: makeTeam, playGame: playGame, chooseOffense: chooseOffense, chooseDefense: chooseDefense,
                offenseLineup: offenseLineup, defenseLineup: defenseLineup, runPlay: runPlay, describe: describe, spot: spot, scoreLine: scoreLine };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.AF = root.AF || {};
    root.AF.game = api;
})(typeof window !== 'undefined' ? window : globalThis);
