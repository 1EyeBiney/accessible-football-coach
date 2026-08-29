// resolve.js - Snap resolution (Accessible Football engine)
// Plain script, no browser dependencies. DESIGN.md section 26.
//
// One snap resolves as a chain of phases. Every phase is a bounded random draw
// shifted by the matchups, the scheme matrix, execution, and live state.
// The engine only reads effective attributes (players.eff) and returns
// EVENTS describing who beat whom, which is what coaches and spotters observe.
//
// resolveSnap(ctx) where ctx = {
//   rng, plays (the plays module), players (the players module),
//   off: { lineup: { QB1: player, RB1, RB2, TE1, TE2, WR1, WR2, WR3, OL1..OL5 } },
//   def: { lineup: { DL: [..], LB: [..], DB: [..] }, misaligned: bool },
//   play: { concept: 'QUICK', formation: 'SPREAD', exec: 0..99 },
//   call: { front, coverage, pressure, adjustment },
//   sit: { down, dist, ytg (yards to goal), twoPoint: bool }
// }
// Returns a result object (see bottom of resolveSnap).

(function (root) {
    'use strict';

    function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

    function avg(arr) { var s = 0, i; for (i = 0; i < arr.length; i++) s += arr[i]; return arr.length ? s / arr.length : 0; }

    // Execution scale: how much of the scheme bonus the offense actually gets.
    // 50 execution = 70% of the matrix value, 90 = 110%.
    function execScale(exec) { return clamp(0.2 + exec * 0.01, 0.2, 1.2); }

    // ---------- lineup helpers ----------

    function dbSlot(lineup, i) { return lineup.DB[i] || lineup.DB[lineup.DB.length - 1]; }

    // The one place an event sentence names a player. Position and last name
    // by default, because a bare name is the one thing a blind coach cannot
    // anchor: there is no jersey number and no replay to hang it on
    // (ISSUES.md, from play; DESIGN.md 4, status note).
    function who(ctx, p) { return ctx.players.sayPlayer(p, ctx.naming); }

    // An event that names players keeps the shape it was written in and the
    // men it names, alongside the sentence itself. The sentence is what
    // almost everything reads; the shape is what lets engine/game.js say the
    // line again if the coach changes how players are announced, so pressing
    // A re-reads the matchups in a line already in the log and not only its
    // body. refs are player objects, which engine/save.js already knows how
    // to write without duplicating them.
    function named(ctx, ev, tmpl, refs) {
        ev.tmpl = tmpl;
        ev.refs = refs;
        ev.say = ctx.players.fillTemplate(tmpl, refs.map(function (p) { return who(ctx, p); }));
        return ev;
    }

    function bestBy(players, key, eff) {
        var best = null, bv = -1, i, v;
        for (i = 0; i < players.length; i++) { v = eff(players[i], key); if (v > bv) { bv = v; best = players[i]; } }
        return best;
    }

    // Man coverage assignment for a receiver role.
    function manDefender(role, dl) {
        var lbs = dl.LB, dbs = dl.DB;
        switch (role) {
            case 'WR1': return dbSlot(dl, 0);
            case 'WR2': return dbSlot(dl, 1);
            case 'WR3': return dbs.length >= 5 ? dbs[4] : (lbs[lbs.length - 1] || dbSlot(dl, 3));
            case 'TE1': return dbs.length >= 4 ? dbs[2] : lbs[0];
            case 'TE2': return lbs[1] || lbs[0] || dbSlot(dl, 3);
            case 'RB1': return lbs[0] || dbSlot(dl, 3);
            case 'RB2': return lbs[1] || lbs[0] || dbSlot(dl, 3);
        }
        return dbSlot(dl, 0);
    }

    // Zone assignment: the defender whose zone the route enters.
    function zoneDefender(role, depth, dl, eff) {
        var lbs = dl.LB, dbs = dl.DB;
        if (depth === 'deep') return dbs[3] || dbs[2] || dbs[0];              // a safety
        if (depth === 'int') return (role === 'WR1' ? dbs[0] : role === 'WR2' ? dbs[1] : (dbs[2] || dbs[0]));
        // short: an underneath defender, the best coverage linebacker or the nickel
        if (role === 'WR3' && dbs.length >= 5) return dbs[4];
        if (role === 'WR1' || role === 'WR2') return role === 'WR1' ? dbs[0] : dbs[1];
        return bestBy(lbs.length ? lbs : dbs, 'cov', eff);
    }

    // ---------- pressure phase ----------

    function pressurePhase(ctx, concept, events) {
        var rng = ctx.rng, eff = ctx.players.eff, P = ctx.plays;
        var pr = P.PRESSURES[ctx.call.pressure];
        var lu = ctx.off.lineup, dl = ctx.def.lineup;
        var rushers = [], i;

        // Rushers: linemen first, then linebackers by blitz ability
        var dline = dl.DL.slice();
        if (pr.dropsLineman && dline.length > 1) {
            dline.sort(function (a, b) { return eff(b, 'prs') - eff(a, 'prs'); });
            dline.pop(); // the weakest rusher drops into coverage
        }
        rushers = dline.slice(0, pr.rushers);
        var lbs = dl.LB.slice().sort(function (a, b) { return eff(b, 'blz') - eff(a, 'blz'); });
        i = 0;
        while (rushers.length < pr.rushers && i < lbs.length) rushers.push(lbs[i++]);
        // cover-zero style: a safety can come too
        i = dl.DB.length - 1;
        while (rushers.length < pr.rushers && i >= 0) rushers.push(dl.DB[i--]);

        // Blockers: five linemen, plus a back or tight end kept in against heavy pressure
        var blockers = [ { p: lu.OL1, key: 'pbk' }, { p: lu.OL2, key: 'pbk' }, { p: lu.OL3, key: 'pbk' },
                         { p: lu.OL4, key: 'pbk' }, { p: lu.OL5, key: 'pbk' } ];
        var firstRead = concept.reads ? concept.reads[0] : null;
        if (!concept.screen) {
            if (rushers.length >= 5 && lu.RB1 && firstRead !== 'RB1') blockers.push({ p: lu.RB1, key: 'rbblock' });
            if (rushers.length >= 6 && lu.TE1 && firstRead !== 'TE1') blockers.push({ p: lu.TE1, key: 'blk' });
        }

        rushers.sort(function (a, b) { return eff(b, 'prs') - eff(a, 'prs'); });
        blockers.sort(function (a, b) { return blockVal(b, eff) - blockVal(a, eff); });

        var edges = [], unblocked = 0, worst = null, worstEdge = 99;
        for (i = 0; i < rushers.length; i++) {
            if (i < blockers.length) {
                var e = blockVal(blockers[i], eff) - rushVal(rushers[i], eff);
                edges.push(e);
                if (e < worstEdge) { worstEdge = e; worst = { rusher: rushers[i], blocker: blockers[i].p }; }
            } else {
                unblocked++;
                worst = { rusher: rushers[i], blocker: null }; worstEdge = -30;
            }
        }
        var edge = avg(edges) - 22 * unblocked;
        if (ctx.def.misaligned) edge += 8;
        if (concept.screen) edge -= 10; // the line lets them come on purpose

        var ttp = 3.0 + edge * 0.028 - 0.1 * (rushers.length - 4) + rng.normal(0, 0.32);
        var ttt = concept.ttt + (concept.pa ? 0.25 : 0);
        var pressured = ttp < ttt;
        var margin = pressured ? (ttt - ttp) : 0;
        if (pressured && worst) {
            events.push(named(ctx, { kind: 'pressure', rusher: worst.rusher, blocker: worst.blocker, unblocked: !worst.blocker },
                              worst.blocker ? '$1 beat $2' : '$1 came free',
                              worst.blocker ? [worst.rusher, worst.blocker] : [worst.rusher]));
        } else if (edge > 8) {
            events.push({ kind: 'protection', say: 'clean pocket' });
        }
        return { pressured: pressured, margin: margin, edge: edge, rushers: rushers.length, worst: worst };
    }

    function blockVal(b, eff) {
        if (b.key === 'rbblock') return (eff(b.p, 'pow') + eff(b.p, 'awr')) / 2 - 14;
        return eff(b.p, b.key);
    }
    function rushVal(r, eff) {
        if (r.pos === 'DL') return eff(r, 'prs');
        if (r.pos === 'LB') return eff(r, 'blz') + 8; // blitzers arrive with a running start
        return eff(r, 'spd') - 5;
    }

    // ---------- pass plays ----------

    function resolvePass(ctx, concept, events) {
        var rng = ctx.rng, eff = ctx.players.eff, P = ctx.plays;
        var lu = ctx.off.lineup, dl = ctx.def.lineup;
        var cov = P.COVERAGES[ctx.call.coverage];
        var adj = ctx.call.adjustment;
        var qb = lu.QB1;
        var es = execScale(ctx.play.exec);
        var schemeMod = ((concept.vsCov[ctx.call.coverage] || 0) + (concept.vsPress[ctx.call.pressure] || 0)) * es * 1.8;
        // screen and depth are carried on the result because the staff belief
        // model (engine/staff.js) files observations by what kind of play it
        // was, and it may not read the concept tables.
        var res = { type: 'pass', screen: !!concept.screen, depth: concept.depth };

        // Busted assignment: the play simply fails (DESIGN.md 26.6)
        if (rng.chance(clamp(0.10 - ctx.play.exec * 0.001, 0.015, 0.10))) {
            events.push({ kind: 'bust', say: 'wrong route, nobody where the quarterback expected' });
            res.outcome = 'incomplete'; res.yards = 0; res.clockRuns = false; res.bust = true;
            return res;
        }

        var pp = pressurePhase(ctx, concept, events);
        res.pressured = pp.pressured;

        // A screen invites the rush, so it is far harder to sack, but it is not
        // immune: a rusher who stays home blows it up in the backfield. Making
        // this a hard exemption meant no front, no blitz and no protection edge
        // could ever make a screen a losing call.
        if (pp.pressured) {
            var screenGuard = concept.screen ? 0.18 : 1;
            var pSack = clamp((0.16 + pp.margin * 0.15 - (eff(qb, 'pkt') - 45) * 0.005) * screenGuard, 0.01, 0.55);
            if (rng.chance(pSack)) {
                res.outcome = 'sack';
                res.yards = -Math.round(rng.uniform(3, 9));
                res.tackler = pp.worst ? pp.worst.rusher : null;
                res.clockRuns = true;
                events.push(res.tackler ? named(ctx, { kind: 'sack', by: res.tackler }, 'sacked by $1', [res.tackler])
                                            : { kind: 'sack', by: null, say: 'sacked' });
                // strip sack
                if (rng.chance(0.09 - (eff(qb, 'awr') - 45) * 0.001)) { res.fumble = true; }
                return res;
            }
            var spy = adj === 'SPY';
            var pScr = concept.screen ? 0 : (spy ? 0.03 : clamp(0.14 + (eff(qb, 'spd') - 45) * 0.004, 0.03, 0.4));
            if (rng.chance(pScr)) {
                res.outcome = 'scramble';
                var chaser = bestBy(dl.LB.length ? dl.LB : dl.DB, 'spd', eff);
                res.yards = Math.round(2 + (eff(qb, 'spd') - 45) * 0.12 + rng.normal(0, 4));
                res.carrier = qb; res.tackler = chaser; res.clockRuns = true;
                res.oob = rng.chance(0.3);
                events.push(named(ctx, { kind: 'scramble', by: qb }, '$1 escaped the pocket', [qb]));
                return res;
            }
        }
        if (pp.edge < -8 && rng.chance(0.06)) res.penalty = { on: 'O', kind: 'holding', yards: 10 };
        // A screen thrown into a rush that stayed home is still a rushed throw,
        // just less of one than a five step drop under pressure.
        var hurried = pp.pressured;
        var hurry = hurried ? (10 + pp.margin * 8) * (concept.screen ? 0.3 : 1) : 0;

        // Target selection
        var reads = [], i, role, rcv, dfd, sep, zone = !cov.man, depth = concept.depth;
        // Fewer defenders in coverage loosens every route. This is the general
        // effect; which concepts profit most from a blitz is the concept's own
        // vsPress row, already added into schemeMod above.
        //
        // It has to be big enough that bringing more rushers is a trade rather
        // than a free win. Tuned too low, yards allowed fell monotonically as
        // the defense brought more men, so an all-out blitz on every snap was
        // simply the best defense in the game.
        var thin = pp.rushers >= 6 ? 7 : (pp.rushers === 5 ? 3.5 : 0);
        for (i = 0; i < concept.reads.length; i++) {
            role = concept.reads[i]; rcv = lu[role];
            if (!rcv) continue;
            dfd = zone ? zoneDefender(role, depth, dl, eff) : manDefender(role, dl);
            if (!dfd) continue;
            var rv = eff(rcv, 'rte') * 0.45 + eff(rcv, 'spd') * 0.35 + eff(rcv, 'rel') * 0.2;
            if (rcv.pos === 'RB') rv = eff(rcv, 'spd') * 0.4 + eff(rcv, 'elu') * 0.35 + eff(rcv, 'hnd') * 0.25;
            var dv = eff(dfd, 'cov') * 0.5 + eff(dfd, 'spd') * 0.3 + eff(dfd, 'prss') * 0.2;
            if (dfd.pos === 'LB') dv = eff(dfd, 'cov') * 0.55 + eff(dfd, 'spd') * 0.3 + eff(dfd, 'rdd') * 0.15;
            sep = rv - dv + schemeMod + thin;
            if (zone) sep += (depth === 'short' ? 4 : depth === 'deep' ? -2 : 0);
            if (concept.pa && cov.deep <= 1 && depth !== 'short') sep += 4;
            // Every adjustment costs the defense somewhere else (DESIGN.md
            // 8.3). A defender committed to one receiver is a defender who is
            // not on the others, and that opening is what lets the offense
            // move before the counter lands.
            //
            // The cost has to stay smaller than the benefit, though, or the
            // adjustment is worse than doing nothing and the defense should
            // never call it. The first version of this opened the other
            // receivers by six and made bracketing the best receiver worth two
            // yards a snap to the offense, which is the wrong way round.
            var help = 0;
            if (adj === 'BRACKET') help += (role === 'WR1' ? -16 : 3);
            if (adj === 'HELP') help += (role === 'WR1' && depth !== 'short' ? -12 : 2);
            if (adj === 'LOAD') help += 3;   // a safety in the box is a safety out of coverage
            if (adj === 'SPY') help += 2;    // the spy is neither rushing nor covering
            if (adj === 'CONTAIN' && (concept.screen || concept.pa)) help -= 5;
            sep += help + rng.normal(0, 7);
            // edge is the part of the separation that is the receiver beating
            // the man in front of him, with the scheme, the coverage shell and
            // the help stripped out. Coordinators form beliefs from this rather
            // than from raw separation, because a coach watching the tape can
            // tell a man winning from a scheme creating space (DESIGN.md 5.3).
            reads.push({ role: role, rcv: rcv, dfd: dfd, sep: sep, help: help, edge: rv - dv });
        }
        if (!reads.length) { res.outcome = 'throwaway'; res.yards = 0; res.clockRuns = false; return res; }

        // The quarterback works the progression the concept defines, in the
        // order it defines it, and throws the first read that is open enough.
        // He accepts less separation the deeper into the progression he goes,
        // and every read he passes on costs him time. This is why the order of
        // a concept's reads matters, and it is why a coordinator who knows
        // which matchup is winning is worth listening to (DESIGN.md 26.3).
        var openBar = 6 - (eff(qb, 'dec') - 45) * 0.06;
        var choice = null, worked = 0, bestIdx = 0;
        for (i = 0; i < reads.length; i++) {
            if (reads[i].sep >= openBar - i * 5) { choice = reads[i]; worked = i; break; }
        }
        if (!choice) {
            // Nothing came open. He comes back to the best of a bad set.
            for (i = 1; i < reads.length; i++) if (reads[i].sep > reads[bestIdx].sep) bestIdx = i;
            choice = reads[bestIdx];
            worked = reads.length;
        }
        var bad = false;
        var pErr = clamp(0.20 - (eff(qb, 'dec') - 45) * 0.004 + (hurried ? 0.15 : 0) + (P.PRESSURES[ctx.call.pressure].disguise ? 0.06 : 0), 0.03, 0.6);
        if (rng.chance(pErr)) {
            var alt = rng.pick(reads);
            if (alt !== choice) { choice = alt; bad = true; }
        }
        // Time spent getting off the first read shows up in the throw.
        hurry += worked * 3;
        // Throwaway when nothing is open under pressure
        if (choice.sep < -18 && hurried && rng.chance(0.5)) {
            res.outcome = 'throwaway'; res.yards = 0; res.clockRuns = false;
            events.push({ kind: 'throwaway', say: 'threw it away' });
            return res;
        }
        events.push(named(ctx, { kind: 'target', role: choice.role, rcv: choice.rcv, dfd: choice.dfd, sep: choice.sep, edge: choice.edge, help: choice.help, bad: bad },
                          '$1 against $2' + (choice.help < 0 ? ' with help' : ''), [choice.rcv, choice.dfd]));
        res.target = choice.rcv; res.defender = choice.dfd; res.role = choice.role;

        // Throw
        var base = concept.screen ? 0.85 : (depth === 'short' ? 0.66 : (depth === 'int' ? 0.58 : 0.44));
        var pComp = base + (eff(qb, 'acc') - 45) * 0.005 + choice.sep * 0.010 - hurry * 0.008 + (depth === 'deep' ? (eff(qb, 'arm') - 45) * 0.003 : 0);
        pComp = clamp(pComp, 0.05, 0.95);
        var air = Math.round(rng.uniform(P.DEPTH_YARDS[depth][0], P.DEPTH_YARDS[depth][1]));
        if (concept.screen) air = -Math.round(rng.uniform(0, 3));
        air = Math.min(air, ctx.sit.ytg);

        if (rng.chance(pComp)) {
            var pDrop = clamp(0.06 - (eff(choice.rcv, 'hnd') - 45) * 0.0012, 0.01, 0.15);
            if (rng.chance(pDrop)) {
                res.outcome = 'incomplete'; res.yards = 0; res.clockRuns = false; res.drop = true;
                events.push(named(ctx, { kind: 'drop', by: choice.rcv }, '$1 dropped it', [choice.rcv]));
                return res;
            }
            // Run after catch
            var tackler = choice.dfd;
            var elus = choice.rcv.pos === 'RB' ? eff(choice.rcv, 'elu') : (eff(choice.rcv, 'rte') * 0.5 + eff(choice.rcv, 'spd') * 0.5);
            var yac = concept.yac * (3 + (elus - 45) * 0.08 + (eff(choice.rcv, 'spd') - eff(tackler, 'spd')) * 0.06) + rng.normal(0, 2.5);
            if (zone) yac *= 0.85; else yac *= 1.1;
            if (concept.screen) {
                var scrEdge = avg([eff(lu.OL1, 'rbk'), eff(lu.OL2, 'rbk')]) - avg(dl.LB.map(function (l) { return eff(l, 'tak'); }));
                yac += 4 + scrEdge * 0.12 + (adj === 'CONTAIN' ? -4 : 0);
            }
            yac += Math.max(0, choice.sep) * 0.04;
            yac = Math.max(0, yac);
            // A coverage with nobody deep is a coverage with nobody to stop a
            // catch turning into a touchdown. This is the price of an all out
            // blitz, and without it bringing everybody was simply the best
            // defense in the game on every down.
            var pBreak = concept.yac * 0.05 + (eff(choice.rcv, 'spd') - eff(tackler, 'spd')) * 0.002 +
                         (cov.deep === 0 ? 0.16 : cov.deep === 1 ? 0.06 : 0);
            if (rng.chance(clamp(pBreak, 0.005, 0.25))) {
                yac += rng.uniform(15, 40);
                events.push(named(ctx, { kind: 'breakaway', by: choice.rcv }, '$1 broke free', [choice.rcv]));
            }
            res.outcome = 'complete';
            res.air = air; res.yac = Math.round(yac);
            res.yards = Math.min(ctx.sit.ytg, air + res.yac);
            res.carrier = choice.rcv; res.tackler = tackler;
            res.clockRuns = true;
            res.oob = rng.chance(depth === 'short' ? 0.18 : 0.25);
            // fumble after the catch
            if (rng.chance(clamp(0.013 - (eff(choice.rcv, 'hnd') - 45) * 0.0002, 0.002, 0.035))) res.fumble = true;
            return res;
        }
        // Not complete: interception, breakup, or plain incompletion
        var pInt = clamp(0.045 + (bad ? 0.14 : 0) + (eff(choice.dfd, 'bsk') - 45) * 0.0015 + (depth === 'deep' ? 0.03 : 0) + (hurried ? 0.03 : 0) - choice.sep * 0.0015, 0.005, 0.5);
        if (rng.chance(pInt)) {
            res.outcome = 'interception'; res.yards = air; res.clockRuns = false;
            res.defender = choice.dfd;
            res.retYards = Math.round(Math.max(0, rng.normal(6, 8)));
            events.push(named(ctx, { kind: 'interception', by: choice.dfd }, 'intercepted by $1' + (bad ? ', a bad decision' : ''), [choice.dfd]));
            return res;
        }
        var pBu = clamp(0.25 + (eff(choice.dfd, 'bsk') - 45) * 0.004, 0.05, 0.6);
        res.outcome = 'incomplete'; res.yards = 0; res.clockRuns = false;
        if (rng.chance(pBu)) { res.breakup = true; events.push(named(ctx, { kind: 'breakup', by: choice.dfd }, 'broken up by $1', [choice.dfd])); }
        else if (hurried) events.push({ kind: 'hurried', say: 'hurried throw, off target' });
        // Pass interference on deep man coverage
        if (!cov.man && depth !== 'deep') return res;
        if (depth === 'deep' && rng.chance(clamp(0.05 * (1 + (50 - eff(choice.dfd, 'dis')) / 50), 0.01, 0.12))) {
            res.penalty = { on: 'D', kind: 'pass interference', yards: Math.min(air, 15), autoFirst: true };
        }
        return res;
    }

    // ---------- run plays ----------

    function resolveRun(ctx, concept, events) {
        var rng = ctx.rng, eff = ctx.players.eff, P = ctx.plays;
        var lu = ctx.off.lineup, dl = ctx.def.lineup;
        var cov = P.COVERAGES[ctx.call.coverage];
        var adj = ctx.call.adjustment;
        var es = execScale(ctx.play.exec);
        var form = P.FORMATIONS[ctx.play.formation];
        var bw = P.boxWeight(ctx.call.front, ctx.call.coverage, adj, form.personnel);
        // poa is carried on the result for the same reason screen is on a pass:
        // the staff belief model files run observations by point of attack.
        var res = { type: 'run', box: bw.box, boxWeight: bw.weight, poa: concept.poa };
        var carrier = concept.qbRun ? lu.QB1 : lu.RB1;
        res.carrier = carrier;

        if (rng.chance(clamp(0.10 - ctx.play.exec * 0.001, 0.015, 0.10))) {
            events.push({ kind: 'bust', say: 'missed assignment up front' });
            res.outcome = 'run'; res.yards = Math.round(rng.normal(-1, 1.5)); res.clockRuns = true;
            res.tackler = dl.LB[0] || dl.DL[0];
            return res;
        }

        // Point of attack matchups
        var dline = dl.DL.slice().sort(function (a, b) { return eff(b, 'str') - eff(a, 'str'); }); // interior first
        var lbs = dl.LB.slice().sort(function (a, b) { return eff(b, 'rdd') - eff(a, 'rdd'); });
        var pairs = [];
        function pair(bp, bk, dp, dk) { if (bp && dp) pairs.push({ b: bp, bk: bk, d: dp, dk: dk }); }
        var poa = concept.poa;
        if (poa === 'inside' || poa === 'draw') {
            pair(lu.OL3, 'rbk', dline[0], 'rst'); pair(lu.OL2, 'rbk', dline[1] || dline[0], 'rst'); pair(lu.OL4, 'rbk', dline[2] || dline[0], 'rst');
        } else if (poa === 'offtackle') {
            pair(lu.OL5, 'rbk', dline[2] || dline[0], 'rst'); pair(lu.OL4, 'rbk', dline[1] || dline[0], 'rst'); pair(lu.TE1, 'blk', lbs[1] || lbs[0], 'tak');
            if (lu.RB2) pair(lu.RB2, 'pow', lbs[0], 'tak');
        } else { // outside
            pair(lu.OL5, 'rbk', dline[dline.length - 1], 'rst'); pair(lu.TE1, 'blk', lbs[1] || lbs[0], 'tak'); pair(lu.WR1, 'blk', dl.DB[0], 'tak');
        }
        var edges = [], i, worst = null, we = 99, best = null, be = -99;
        for (i = 0; i < pairs.length; i++) {
            var e = eff(pairs[i].b, pairs[i].bk) - eff(pairs[i].d, pairs[i].dk) + (pairs[i].bk === 'blk' ? 5 : 0);
            edges.push(e);
            if (e < we) { we = e; worst = pairs[i]; }
            if (e > be) { be = e; best = pairs[i]; }
        }
        var edge = avg(edges);
        edge += ((concept.vsBox[bw.weight] || 0) + (concept.vsPress[ctx.call.pressure] || 0)) * es * 2.2;
        // Contain is the one adjustment whose whole purpose is the run. It has
        // to bite hard on the edge and give something back inside, or it does
        // nothing measurable to the run game at all.
        if (adj === 'CONTAIN') edge += (poa === 'outside' ? -12 : 2);
        if (ctx.def.misaligned) edge += 7;
        // A fast-flowing linebacker corps reads the play: their read ability against execution
        var readPen = (eff(lbs[0] || dline[0], 'rdd') - 45) * 0.15 - (ctx.play.exec - 50) * 0.08;
        edge -= readPen;
        edge += rng.normal(0, 5);

        if (worst && we < -8) events.push(named(ctx, { kind: 'blockLost', blocker: worst.b, defender: worst.d }, '$1 beat $2', [worst.d, worst.b]));
        if (best && be > 8) events.push(named(ctx, { kind: 'blockWon', blocker: best.b, defender: best.d }, '$1 opened a hole', [best.b]));

        if (concept.qbRun) {
            res.outcome = 'run'; res.yards = Math.round(clamp(1 + edge * 0.05 + rng.normal(0.4, 0.9), -1, 4));
            res.yards = Math.min(res.yards, ctx.sit.ytg); res.clockRuns = true; res.tackler = dline[0];
            // A sneak is low variance, not no variance. It can still be
            // fumbled in the pile and it can still be held (DESIGN.md 26.5).
            if (rng.chance(clamp(0.006 - (eff(carrier, 'awr') - 45) * 0.00008, 0.001, 0.02))) res.fumble = true;
            if (we < -8 && rng.chance(0.06)) res.penalty = { on: 'O', kind: 'holding', yards: 10 };
            return res;
        }

        var ybc = 2.9 + edge * 0.13 + (eff(carrier, 'vis') - 45) * 0.03 + rng.normal(0, 1.4);
        var firstTackler = (poa === 'outside') ? (rng.chance(0.5) ? dl.DB[0] : (lbs[1] || lbs[0])) : (lbs[0] || dline[0]);
        var yards = ybc;
        var broke = false;
        if (ybc < 0) {
            // met in the backfield
            yards = ybc - rng.uniform(0, 1.5);
            res.tackler = worst ? worst.d : firstTackler;
            events.push({ kind: 'tfl', by: res.tackler, say: 'stopped in the backfield' });
        } else {
            var pBreak = clamp(0.15 + (eff(carrier, 'elu') - eff(firstTackler, 'tak')) * 0.006, 0.02, 0.5);
            var yacon = 1.8 + (eff(carrier, 'pow') - 45) * 0.04 + rng.normal(0, 1.2);
            res.tackler = firstTackler;
            if (rng.chance(pBreak)) {
                broke = true;
                yacon += 3 + rng.normal(0, 3);
                events.push(named(ctx, { kind: 'brokeTackle', by: carrier }, '$1 broke a tackle', [carrier]));
                var safety = dl.DB[3] || dl.DB[2] || dl.DB[0];
                var pBreakaway = clamp(0.05 + (eff(carrier, 'spd') - eff(safety, 'spd')) * 0.005 +
                                       (cov.deep === 0 ? 0.20 : cov.deep === 1 ? 0.07 : 0), 0.01, 0.45);
                res.tackler = safety;
                if (rng.chance(pBreakaway)) {
                    yacon += rng.uniform(12, 45);
                    events.push(named(ctx, { kind: 'breakaway', by: carrier }, '$1 is gone', [carrier]));
                }
            }
            yards = ybc + Math.max(0, yacon);
        }
        res.outcome = 'run';
        res.yards = Math.min(ctx.sit.ytg, Math.round(yards));
        res.broke = broke;
        res.clockRuns = true;
        res.oob = poa === 'outside' ? rng.chance(0.2) : rng.chance(0.04);
        // Tuned up: fumbles lost were running at about four tenths of a game
        // against a target of about one.
        var pFum = clamp(0.022 - (eff(carrier, 'hnd') - 45) * 0.0003 + (broke ? 0.008 : 0), 0.004, 0.05);
        if (rng.chance(pFum)) res.fumble = true;
        // Holding when badly beaten
        if (we < -8 && rng.chance(0.10)) res.penalty = { on: 'O', kind: 'holding', yards: 10 };
        return res;
    }

    // ---------- entry point ----------

    function resolveSnap(ctx) {
        var P = ctx.plays, rng = ctx.rng, eff = ctx.players.eff;
        var concept = P.CONCEPTS[ctx.play.concept];
        var events = [];
        var res;

        // Pre-snap penalties
        var lu = ctx.off.lineup;
        var olDis = avg([lu.OL1, lu.OL2, lu.OL3, lu.OL4, lu.OL5].map(function (p) { return eff(p, 'dis'); }));
        var pFS = 0.022 * (1 + (50 - olDis) / 50) + (ctx.tempo === 'nohuddle' ? 0.008 : 0);
        if (rng.chance(clamp(pFS, 0.004, 0.05))) {
            res = { type: 'penalty', outcome: 'penalty', yards: 0, clockRuns: false, penalty: { on: 'O', kind: 'false start', yards: 5, preSnap: true } };
            events.push({ kind: 'penalty', say: 'false start' });
        }
        var pr = P.PRESSURES[ctx.call.pressure];
        var dlDis = avg(ctx.def.lineup.DL.map(function (p) { return eff(p, 'dis'); }));
        var pOff = (0.012 + (pr.rushers >= 5 ? 0.012 : 0)) * (1 + (50 - dlDis) / 50);
        if (!res && rng.chance(clamp(pOff, 0.003, 0.04))) {
            res = { type: 'penalty', outcome: 'penalty', yards: 0, clockRuns: false, penalty: { on: 'D', kind: 'offside', yards: 5, preSnap: true } };
            events.push({ kind: 'penalty', say: 'offside' });
        }

        if (res) {
            // pre-snap penalty, nothing else happens
        } else if (concept.type === 'special') {
            if (ctx.play.concept === 'SPIKE') res = { type: 'special', outcome: 'incomplete', yards: 0, clockRuns: false, spike: true };
            else res = { type: 'special', outcome: 'run', yards: -1, clockRuns: true, kneel: true, carrier: lu.QB1 };
        } else if (concept.type === 'pass') {
            res = resolvePass(ctx, concept, events);
        } else {
            res = resolveRun(ctx, concept, events);
        }
        res.events = events;
        res.concept = ctx.play.concept;
        res.formation = ctx.play.formation;
        res.call = ctx.call;
        // Fumble resolution: who recovers
        if (res.fumble) {
            res.fumbleLost = rng.chance(0.55);
            events.push({ kind: 'fumble', lost: res.fumbleLost, say: 'fumble, ' + (res.fumbleLost ? 'recovered by the defense' : 'recovered by the offense') });
        }
        return res;
    }

    var api = { resolveSnap: resolveSnap, execScale: execScale };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.AF = root.AF || {};
    root.AF.resolve = api;
})(typeof window !== 'undefined' ? window : globalThis);
