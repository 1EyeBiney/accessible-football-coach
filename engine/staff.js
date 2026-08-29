// staff.js - Staff members, the beliefs they build during a game, and the
// hunches they hand the coach. (Accessible Football engine)
// Plain script, no browser dependencies.
// Implements DESIGN.md 5.2, 5.3, 18.2, 18.3, 18.4, 19, 24.1, and 26.7.
//
// This file owns everything the coach hears from another person. Nothing in it
// reads a true player attribute for an opinion. A staff member learns only
// from the events on a PlayResult and from pre-game scouting handed in as
// fuzzy priors, which is the rule in DESIGN.md 24.1: nobody reads the numbers,
// everybody reads the game.
//
// The chain is:
//   newBeliefs(member, side)     one store per staff member per game
//   observe(store, result, rng)  files observations against matchup keys
//   hunches(store, sit, opts)    turns the store into Hunch objects once the
//                                staff member has seen enough and has got
//                                round to saying it
//
// A matchup key is a short string naming something a coach can watch:
//   pass:WR1 ... pass:RB2   a receiver role against whoever is covering him
//   run:inside | run:offtackle | run:outside | run:draw
//   prot                    our protection as a whole
//   qbrun                   the quarterback escaping the pocket
//   screen                  the screen game
// The offensive coordinator's store is about his own offense. The defensive
// coordinator's store uses the same keys about the offense he is facing.
//
// Two numbers decide how good a staff member is, and they work differently on
// purpose. Evaluation sets a per-key bias drawn once a game, which never
// averages away, so a poor evaluator is persistently wrong about a particular
// matchup rather than randomly jittery. Communication sets how many snaps pass
// between knowing something and saying it.

(function (root) {
    'use strict';

    function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

    // ---------- staff members (DESIGN.md 5.2) ----------

    var STAFF_BANDS = {
        HS:  { lo: 25, hi: 60 },
        SC:  { lo: 33, hi: 66 },
        FCS: { lo: 40, hi: 72 },
        G5:  { lo: 48, hi: 80 },
        P5:  { lo: 56, hi: 88 },
        NFL: { lo: 62, hi: 92 }
    };

    // Which attributes each role carries. Coordinators share a list; the
    // spotter and the trainer have their own (DESIGN.md 18.2 and 18.4).
    var ROLE_ATTRS = {
        OC:      ['evaluation', 'scheme', 'communication', 'teaching', 'loyalty', 'ambition'],
        DC:      ['evaluation', 'scheme', 'communication', 'teaching', 'loyalty', 'ambition'],
        SPOT:    ['eyes', 'timing', 'accuracy', 'voice'],
        TRAINER: ['diagnosis', 'treatment', 'prevention']
    };

    var ROLE_SAY = { OC: 'offensive coordinator', DC: 'defensive coordinator',
                     SPOT: 'spotter', TRAINER: 'trainer' };

    var PERSONALITIES = ['cautious', 'aggressive', 'old school', 'analytics minded', 'players coach'];

    var COACH_FIRST = ['Arlen', 'Bruce', 'Cal', 'Dean', 'Earl', 'Frank', 'Gus', 'Hal', 'Ike', 'Jim',
        'Ken', 'Lou', 'Marv', 'Ned', 'Ozzie', 'Pete', 'Ray', 'Stan', 'Terry', 'Vern',
        'Walt', 'Andre', 'Curtis', 'Darrell', 'Eddie', 'Gene', 'Hank', 'Jerome', 'Leon', 'Mel'];
    var COACH_LAST = ['Ackley', 'Bidwell', 'Cormier', 'Delaney', 'Estes', 'Farrow', 'Gadsden', 'Hobart',
        'Iverson', 'Jessup', 'Kirkland', 'Ludwig', 'Mahaffey', 'Newcomb', 'Orsini', 'Pemberton',
        'Rademacher', 'Stallworth', 'Tanguay', 'Ulrich', 'Vandersloot', 'Wexler', 'Yarborough', 'Zabel',
        'Bannister', 'Chadwick', 'Dupree', 'Ferraro', 'Grimsley', 'Hollister'];

    // quality is -1..+1 and shifts the mean inside the level's band.
    function makeStaff(rng, level, role, quality) {
        var band = STAFF_BANDS[level] || STAFF_BANDS.HS;
        var mid = (band.lo + band.hi) / 2, span = (band.hi - band.lo) / 2;
        var base = mid + (quality || 0) * span * 0.6 + rng.normal(0, span * 0.3);
        var keys = ROLE_ATTRS[role], attr = {}, i;
        for (i = 0; i < keys.length; i++) {
            attr[keys[i]] = Math.round(clamp(base + rng.normal(0, span * 0.35), 5, 99));
        }
        return {
            role: role,
            roleSay: ROLE_SAY[role],
            name: rng.pick(COACH_FIRST) + ' ' + rng.pick(COACH_LAST),
            attr: attr,
            personality: rng.pick(PERSONALITIES),
            // Filled in over a season by the postgame review (DESIGN.md 23.2).
            record: { right: 0, wrong: 0 }
        };
    }

    function makeStaffGroup(rng, level, quality) {
        return {
            OC: makeStaff(rng, level, 'OC', quality),
            DC: makeStaff(rng, level, 'DC', quality),
            SPOT: makeStaff(rng, level, 'SPOT', quality),
            TRAINER: makeStaff(rng, level, 'TRAINER', quality)
        };
    }

    // The spotter's Eyes does the work Evaluation does for a coordinator, and
    // his Timing does the work Communication does. These two helpers are the
    // only place that mapping lives.
    function evalOf(m) {
        if (m.attr.evaluation !== undefined) return m.attr.evaluation;
        if (m.attr.eyes !== undefined) return m.attr.eyes;
        return m.attr.diagnosis !== undefined ? m.attr.diagnosis : 50;
    }
    function commOf(m) {
        if (m.attr.communication !== undefined) return m.attr.communication;
        if (m.attr.timing !== undefined) return m.attr.timing;
        return 50;
    }

    // How many observations before an estimate is worth saying out loud.
    // A good coordinator draws the conclusion from three plays, a poor one
    // needs closer to ten (DESIGN.md 26.7).
    function needed(ev) { return Math.round(clamp(3 + (75 - ev) * 0.09, 2, 10)); }
    // How many snaps pass between knowing and saying (DESIGN.md 5.2).
    function speakDelay(comm) { return Math.round(clamp((80 - comm) * 0.08, 0, 7)); }

    // How badly this evaluator misreads a given matchup, as a standard
    // deviation in the same units as the edge the engine produces.
    function biasFor(ev) {
        var t = clamp((85 - ev) / 60, 0, 1);
        return clamp(14 * Math.pow(t, 1.6), 0.3, 16);
    }

    var COOLDOWN = 8; // snaps before the same matchup is raised again

    // ---------- the belief store ----------

    function newBeliefs(member, side, opts) {
        opts = opts || {};
        var ev = evalOf(member);
        return {
            member: member,
            side: side,                    // 'O' if this store watches our offense, 'D' if the offense we face
            obs: {},
            plays: 0,
            scouting: opts.scouting || {}, // key -> a fuzzy pre-game estimate
            scoutWeight: opts.scoutWeight || 0,
            pulled: {},                    // playerId -> true, pulled for stamina and not yet back
            asked: {},                     // playerId -> snap number a substitution was last raised
            reported: {},                  // playerId -> true, spotter has already said this
            covSeen: {},                   // coverage -> how many times it has been shown
            atChange: false,
            threshold: needed(ev),
            delay: speakDelay(commOf(member)),
            // The bias is drawn once per key per game and never averages away,
            // which is what makes a poor evaluator persistently wrong about a
            // particular player rather than merely noisy about all of them.
            // The curve is steep on purpose. Real matchup edges between two
            // receivers on the same roster are only worth eight or ten points,
            // so a bias that stays in double figures across the whole range
            // buries the signal and every coordinator guesses. A good one has
            // to be nearly unbiased before his read means anything.
            biasSd: biasFor(ev),
            noiseSd: clamp((85 - ev) * 0.05, 0.5, 4)
        };
    }

    function entry(store, key, rng) {
        var e = store.obs[key];
        if (!e) {
            e = store.obs[key] = { n: 0, sum: 0, bias: rng.normal(0, store.biasSd),
                                   ready: -1, last: -99, evidence: [] };
            var pri = store.scouting[key];
            if (pri !== undefined && store.scoutWeight > 0) {
                e.n = store.scoutWeight;
                e.sum = pri * store.scoutWeight;
            }
        }
        return e;
    }

    function file(store, key, value, rng, ev) {
        var e = entry(store, key, rng);
        e.n++;
        e.sum += clamp(value, -35, 35) + rng.normal(0, store.noiseSd);
        if (ev) { e.evidence.push(ev); if (e.evidence.length > 4) e.evidence.shift(); }
        if (e.n >= store.threshold && e.ready < 0) e.ready = store.plays;
    }

    function estimate(store, key) {
        var e = store.obs[key];
        if (!e || !e.n) return 0;
        return e.sum / e.n + e.bias;
    }

    // Everything a staff member can learn from one snap. The events are the
    // only channel; no true attribute is read here.
    function observe(store, res, rng) {
        store.plays++;
        if (!res || res.type === 'penalty') return;
        var ev = res.events || [], i, e;
        for (i = 0; i < ev.length; i++) {
            e = ev[i];
            // The belief is about the man, not about the coverage he happened
            // to be facing, so the observation is the matchup edge rather than
            // the raw separation the scheme produced (DESIGN.md 5.3).
            if (e.kind === 'target' && e.role) {
                file(store, 'pass:' + e.role, e.edge !== undefined ? e.edge : e.sep, rng, e);
            }
        }
        if (res.type === 'pass') {
            if (res.outcome === 'sack') file(store, 'prot', -18, rng, null);
            else if (res.pressured) file(store, 'prot', -9, rng, null);
            else file(store, 'prot', 5, rng, null);
            if (res.outcome === 'scramble') file(store, 'qbrun', 6 + res.yards, rng, null);
            else file(store, 'qbrun', -2, rng, null);
            if (res.screen) file(store, 'screen', (res.yards - 4) * 1.2, rng, null);
        } else if (res.type === 'run' && res.poa) {
            file(store, 'run:' + res.poa, (res.yards - 4) * 1.2, rng, null);
        }
    }

    // Called at every change of possession: players pulled for stamina who are
    // fresh again go back to the first unit (DESIGN.md 18.3).
    function changeOfPossession(store) { store.atChange = true; }

    // ---------- turning beliefs into hunches ----------

    // A coordinator names a man by his position, which is the voice
    // DESIGN.md 5.3 writes into its own examples and the voice the play by
    // play now shares. Both are built from the one table in players.js so
    // the coach never hears the same man called two things by two people,
    // and so the two cannot drift apart (found by the milestone review;
    // this file used to carry its own copy saying "our back" where the play
    // by play said "running back").
    var ROLES = ['WR1', 'WR2', 'WR3', 'TE1', 'TE2', 'RB1', 'RB2'];

    function sideSay(prefix) {
        var out = {}, i, r;
        var slots = (root.AF && root.AF.players && root.AF.players.SLOT_SAY) ||
                    (typeof require === 'function' ? require('./players.js').SLOT_SAY : {});
        for (i = 0; i < ROLES.length; i++) { r = ROLES[i]; if (slots[r]) out[r] = prefix + slots[r]; }
        return out;
    }

    var OFF_SAY = sideSay('our ');
    var DEF_SAY = sideSay('their ');
    var POA_SAY = { inside: 'between the tackles', offtackle: 'off tackle', outside: 'on the edge', draw: 'on the draw' };

    function roleSay(store, role) { return (store.side === 'O' ? OFF_SAY : DEF_SAY)[role] || role; }

    function confidenceWord(store, e, est) {
        var ev = evalOf(store.member), strength = Math.abs(est);
        if (e.n >= store.threshold * 2 && ev >= 62 && strength >= 8) return 'sure';
        if (e.n >= store.threshold + 1 && strength >= 5) return 'likely';
        return 'guess';
    }

    function lead(conf) {
        if (conf === 'sure') return 'I am sure of this. ';
        if (conf === 'likely') return 'I think ';
        return 'I am guessing, but ';
    }

    // Is this key ready to be spoken this snap?
    function releasable(store, key) {
        var e = store.obs[key];
        if (!e || e.ready < 0) return false;
        if (store.plays - e.ready < store.delay) return false;
        if (store.plays - e.last < COOLDOWN) return false;
        return true;
    }

    function markSaid(store, key) { var e = store.obs[key]; if (e) e.last = store.plays; }

    // Pick a play from the call sheet that puts this role in the progression.
    // A concept that reads him first is worth more than one that gets to him
    // second, and one that never looks at him is no use at all.
    function playForRole(opts, role) {
        if (!opts.playbook || !opts.plays) return null;
        var best = null, bestScore = -1, i, pl, c, idx, score;
        for (i = 0; i < opts.playbook.length; i++) {
            pl = opts.playbook[i];
            c = opts.plays.CONCEPTS[pl.concept];
            if (!c || c.type !== 'pass' || !c.reads) continue;
            idx = c.reads.indexOf(role);
            if (idx < 0 || idx > 1) continue;
            score = (idx === 0 ? 40 : 15) + pl.exec;
            if (score > bestScore) { bestScore = score; best = pl; }
        }
        return best;
    }

    function playForPoa(opts, poa) {
        if (!opts.playbook || !opts.plays) return null;
        var best = null, i, pl, c;
        for (i = 0; i < opts.playbook.length; i++) {
            pl = opts.playbook[i];
            c = opts.plays.CONCEPTS[pl.concept];
            if (!c || c.type !== 'run' || c.poa !== poa) continue;
            if (!best || pl.exec > best.exec) best = pl;
        }
        return best;
    }

    // Offensive coordinator: which of our matchups is worth attacking.
    function matchupHunches(store, sit, opts, out) {
        var key, e, est, conf, rec, best = null, bestEst = 0;
        for (key in store.obs) {
            if (key.indexOf('pass:') !== 0 && key.indexOf('run:') !== 0) continue;
            if (!releasable(store, key)) continue;
            est = estimate(store, key);
            if (Math.abs(est) < 4) continue;
            if (Math.abs(est) > Math.abs(bestEst)) { bestEst = est; best = key; }
        }
        if (!best) return;
        e = store.obs[best];
        est = bestEst;
        conf = confidenceWord(store, e, est);
        var isPass = best.indexOf('pass:') === 0;
        var what = isPass ? best.slice(5) : best.slice(4);
        var text;
        if (isPass) {
            rec = est > 0 ? playForRole(opts, what) : null;
            text = est > 0
                ? lead(conf) + roleSay(store, what) + ' can win his matchup. I would go at him.'
                : lead(conf) + roleSay(store, what) + ' is not winning out there. I would look elsewhere.';
        } else {
            rec = est > 0 ? playForPoa(opts, what) : null;
            text = est > 0
                ? lead(conf) + 'we are moving the ball ' + (POA_SAY[what] || what) + '. Stay with it.'
                : lead(conf) + 'there is nothing ' + (POA_SAY[what] || what) + ' right now.';
        }
        markSaid(store, best);
        out.push({ source: store.member.role, kind: 'matchup', target: what, confidence: conf,
                   recommendation: rec ? rec.id : null, evidence: e.evidence.slice(),
                   urgency: 'cued', text: text, positive: est > 0, key: best });
    }

    // Defensive coordinator: what the offense is doing to us and what to do
    // about it. This is the counter loop of DESIGN.md 8.3, run off beliefs.
    function adjustmentHunches(store, sit, opts, out) {
        var candidates = [];

        function consider(key, adjustment, text, floor) {
            if (!releasable(store, key)) return;
            var est = estimate(store, key);
            if (est < floor) return;
            candidates.push({ key: key, est: est, e: store.obs[key], adjustment: adjustment, text: text });
        }

        consider('pass:WR1', 'BRACKET', 'their X receiver is beating us. I want two defenders on him.', 5);
        consider('pass:WR2', 'HELP', 'their Z receiver is getting loose. I want a safety over him.', 5);
        consider('pass:TE1', 'HELP', 'their tight end is working the middle. I want help inside.', 5);
        consider('run:inside', 'LOAD', 'they are running downhill on us. I want another man in the box.', 5);
        consider('run:offtackle', 'LOAD', 'they are getting off tackle. I want another man in the box.', 5);
        consider('run:outside', 'CONTAIN', 'they keep getting to the edge. I want the ends to stay wide.', 5);
        consider('screen', 'CONTAIN', 'they are throwing screens under our rush. I want to stay home.', 4);
        consider('qbrun', 'SPY', 'their quarterback keeps escaping. I want a linebacker on him.', 4);
        if (!candidates.length) return;
        candidates.sort(function (a, b) { return b.est - a.est; });
        var top = candidates[0];
        var conf = confidenceWord(store, top.e, top.est);
        markSaid(store, top.key);
        out.push({ source: store.member.role, kind: 'adjustment', target: top.key, confidence: conf,
                   recommendation: top.adjustment, evidence: top.e.evidence.slice(),
                   urgency: 'cued', text: lead(conf) + top.text, positive: true, key: top.key });
    }

    // Both coordinators watch their own side's live state. DESIGN.md 18.3 says
    // this is their job, so reading stamina and health here is the one place a
    // staff member looks at a number, and it is a number about his own player.
    function substitutionHunches(store, sit, opts, out) {
        if (!opts.ownOnField || !opts.ownRoster) return;
        var ev = evalOf(store.member);
        // A good coordinator pulls a man before he gets beaten, a poor one
        // after the sack (DESIGN.md 18.3). The floor sits just above where a
        // starter who has played a whole half actually gets to, or the
        // substitution flow never fires at all.
        var floor = clamp(45 + (ev - 50) * 0.30, 32, 68);
        var i, p, backup;
        for (i = 0; i < opts.ownOnField.length; i++) {
            p = opts.ownOnField[i];
            if (!p || p.live.out) continue;
            // Nobody pulls a quarterback or a kicker because he is winded.
            if (p.pos === 'QB' || p.pos === 'K' || p.pos === 'P') continue;
            if (store.pulled[p.id]) continue;
            if (store.asked[p.id] !== undefined && store.plays - store.asked[p.id] < 6) continue;
            if (p.live.stamina > floor) continue;
            backup = nextMan(opts.ownRoster, p);
            if (!backup) continue;
            store.asked[p.id] = store.plays;
            out.push({ source: store.member.role, kind: 'substitution', target: p, confidence: 'sure',
                       recommendation: { out: p.id, into: backup.id }, evidence: [],
                       urgency: 'must',
                       text: p.name + ' is gassed. I want to get ' + backup.name + ' in for him.' });
            return; // one substitution question at a time
        }
    }

    function nextMan(roster, p) {
        var ids = roster.depth[p.pos] || [], i, cand;
        for (i = 0; i < ids.length; i++) {
            cand = roster.byId[ids[i]];
            if (cand && cand !== p && !cand.live.out && cand.live.stamina > 70) return cand;
        }
        return null;
    }

    // Spoken when the unit next takes the field on a change of possession,
    // never in the middle of a drive (DESIGN.md 18.3).
    function recoveredHunches(store, sit, opts, out) {
        if (!store.atChange || !opts.ownRoster) return;
        var id, p;
        for (id in store.pulled) {
            p = opts.ownRoster.byId[id];
            if (!p) { delete store.pulled[id]; continue; }
            if (p.live.out) { delete store.pulled[id]; continue; }
            if (p.live.stamina >= 85) {
                delete store.pulled[id];
                out.push({ source: store.member.role, kind: 'recovered', target: p, confidence: 'sure',
                           recommendation: { into: p.id }, evidence: [], urgency: 'batched',
                           text: p.name + ' has his legs back. He goes back with the first unit.' });
            }
        }
    }

    // The spotter reports facts, not opinions (DESIGN.md 18.2). Eyes decides
    // what he notices, Timing when, Accuracy whether it is true, Voice how
    // specific the wording is.
    function spotterHunches(store, sit, opts, out) {
        if (!opts.watch || !opts.watch.length || !opts.rng) return;
        var rng = opts.rng, m = store.member;
        var eyes = m.attr.eyes, acc = m.attr.accuracy, voice = m.attr.voice;
        var pNotice = clamp(0.05 + (eyes - 40) * 0.0035, 0.02, 0.30);
        if (!rng.chance(pNotice)) return;
        var pool = [], i, p;
        for (i = 0; i < opts.watch.length; i++) {
            p = opts.watch[i];
            if (!p || p.live.out || store.reported[p.id]) continue;
            if (p.live.health === 'hurt' || p.live.stamina < 55) pool.push(p);
        }
        var wrong = rng.chance(clamp((85 - acc) * 0.005, 0.02, 0.45));
        if (!pool.length) {
            // A low accuracy spotter reports limps that are not there.
            if (!wrong) return;
            p = rng.pick(opts.watch);
        } else {
            p = rng.pick(pool);
            if (wrong) {
                var other = rng.pick(opts.watch);
                if (other) p = other;
            }
        }
        if (!p || store.reported[p.id]) return;
        store.reported[p.id] = true;
        var hurt = p.live.health === 'hurt';
        var text;
        if (voice >= 65) {
            text = p.name + (hurt ? ' is favoring a leg on the plant foot.' : ' is blowing hard between snaps.');
        } else if (voice >= 40) {
            text = p.name + (hurt ? ' looks hurt to me.' : ' looks tired.');
        } else {
            text = 'Something is off with one of them out there. I think it is ' + p.name + '.';
        }
        out.push({ source: 'SPOT', kind: 'observation', target: p, confidence: acc >= 65 ? 'likely' : 'guess',
                   recommendation: null, evidence: [], urgency: 'cued', text: text });
    }

    // The trainer's first read on an injury, spoken with the play result.
    function injuryHunches(member, injuries, out) {
        var i, inj, sure;
        out = out || [];
        for (i = 0; i < injuries.length; i++) {
            inj = injuries[i];
            sure = member.attr.diagnosis >= 60;
            out.push({ source: 'TRAINER', kind: 'injury', target: inj.player,
                       confidence: sure ? 'likely' : 'guess', recommendation: null, evidence: [],
                       urgency: 'must',
                       text: inj.player.name + (inj.severe
                           ? (sure ? ' has a bad ankle. He is done for tonight.' : ' is down. I do not like it. He is out for now.')
                           : (sure ? ' got his bell rung but he can go.' : ' is banged up. I think he can go.')) });
        }
        return out;
    }

    // The one entry point. Returns the Hunch objects that are ready now, in the
    // shape the contract in CLAUDE.md describes.
    function hunches(store, sit, opts) {
        opts = opts || {};
        var out = [];
        var role = store.member.role;
        if (role === 'OC' || role === 'DC') {
            substitutionHunches(store, sit, opts, out);
            recoveredHunches(store, sit, opts, out);
            if (opts.active) {
                if (role === 'OC') matchupHunches(store, sit, opts, out);
                else adjustmentHunches(store, sit, opts, out);
            }
        } else if (role === 'SPOT') {
            spotterHunches(store, sit, opts, out);
        }
        store.atChange = false;
        return out;
    }

    // What the coordinator currently believes, as a plain map of key to
    // estimate, for the automatic coaches to call plays from. Only keys that
    // have crossed the observation threshold are included, so a coach who has
    // not seen enough is calling blind, which is the point.
    function beliefMap(store) {
        var out = {}, key, e;
        for (key in store.obs) {
            e = store.obs[key];
            if (e.ready < 0) continue;
            out[key] = estimate(store, key);
        }
        return out;
    }

    // Shells that look like each other from the sideline. A coordinator who
    // misreads a coverage does not invent a wild one; he calls a one-high look
    // the wrong one-high look, or a two-high look the wrong two-high look.
    var CONFUSED_WITH = {
        C0: ['C1'], C1: ['C3', 'C0'], C3: ['C1'],
        C2: ['C4', 'C2M'], C4: ['C2', 'C2M'], C2M: ['C2', 'C4']
    };

    // What the staff believes this defense calls in this situation. This is
    // tendency tracking, not a peek at the call sheet: it is a count of what
    // the defense has lined up in on this kind of down, filtered through the
    // eyes of the man watching. Reading the shell correctly is the single most
    // valuable thing a coordinator does, because it is what the scheme matrix
    // pays out on (DESIGN.md 26.2), and it is only worth anything because the
    // defense has situational habits to read (DESIGN.md 8.3).
    function noteCoverage(store, bucket, coverage, rng) {
        var seen = coverage;
        var pMiss = clamp((80 - evalOf(store.member)) * 0.006, 0.02, 0.5);
        if (rng && rng.chance(pMiss)) {
            var alts = CONFUSED_WITH[coverage];
            if (alts && alts.length) seen = rng.pick(alts);
        }
        if (!store.covSeen[bucket]) store.covSeen[bucket] = {};
        store.covSeen[bucket][seen] = (store.covSeen[bucket][seen] || 0) + 1;
    }

    // The offense can see two defenders on its best receiver, or a safety
    // walking down. Whether the coordinator notices is his eyes, so this goes
    // through the same evaluation filter as everything else.
    function noteAdjustment(store, adjustment, rng) {
        if (!adjustment || adjustment === 'NONE') return;
        if (!store.adjSeen) store.adjSeen = {};
        var pSee = clamp(0.35 + (evalOf(store.member) - 40) * 0.008, 0.2, 0.95);
        if (rng && !rng.chance(pSee)) return;
        store.adjSeen[adjustment] = (store.adjSeen[adjustment] || 0) + 1;
    }

    function likelyCoverage(store, bucket) {
        var tally = store.covSeen[bucket];
        if (!tally) return null;
        var best = null, bv = -1, total = 0, k;
        for (k in tally) { total += tally[k]; if (tally[k] > bv) { bv = tally[k]; best = k; } }
        // He needs as many looks as he needs observations to commit to a
        // matchup, and he will not call a tendency he has not actually seen
        // repeat: a defense that mixes it up gives him nothing to work with.
        if (bv < Math.max(3, store.threshold)) return null;
        if (bv / total < 0.34) return null;
        return best;
    }

    var api = { STAFF_BANDS: STAFF_BANDS, ROLE_ATTRS: ROLE_ATTRS, PERSONALITIES: PERSONALITIES,
                makeStaff: makeStaff, makeStaffGroup: makeStaffGroup,
                newBeliefs: newBeliefs, observe: observe, hunches: hunches,
                changeOfPossession: changeOfPossession, injuryHunches: injuryHunches,
                beliefMap: beliefMap, estimate: estimate, noteCoverage: noteCoverage,
                likelyCoverage: likelyCoverage, noteAdjustment: noteAdjustment, confidenceWord: confidenceWord,
                evalOf: evalOf, commOf: commOf, needed: needed, speakDelay: speakDelay,
                roleSay: roleSay, OFF_SAY: OFF_SAY, DEF_SAY: DEF_SAY, POA_SAY: POA_SAY };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.AF = root.AF || {};
    root.AF.staff = api;
})(typeof window !== 'undefined' ? window : globalThis);
