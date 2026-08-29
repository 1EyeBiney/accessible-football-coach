// save.js - Serialising a game in progress to plain JSON and rebuilding it.
// (Accessible Football engine) Plain script, no browser dependencies.
// Implements DESIGN.md 21.10.
//
// This is the one place in the project that has to think about object
// identity. Most of the engine's live state is plain data, but a player
// object is referenced from many places at once: the roster that owns him,
// a hunch's target, an event's rusher or blocker or carrier or tackler, the
// evidence a belief store has filed. JSON.stringify does not know about
// sharing: parsing its own output back would turn every one of those
// references into its own private copy, and a substitution made through one
// copy (engine/controller.js answerSubstitution mutates h.target directly)
// would silently stop showing up anywhere else. That is exactly the kind of
// silent wrongness CLAUDE.md rules out.
//
// The fix is to serialise a player only once, in the roster that owns him,
// and everywhere else replace him with a tagged reference to his id
// ({ $p: id }). Loading rebuilds the two rosters first, builds one id-to-
// player map across both of them (ids are unique across a game because the
// roster generator stamps the team name into every id), and then walks the
// rest of the saved tree resolving every tag back into the live object.
//
// What is deliberately left out of the save, and why it is safe to:
//   game.controller / controller.game    the only cycle in the state; the
//                                         load side reattaches it by hand.
//   game.hooks, game.S, controller.deps, controller.queue
//                                         functions, module references, or
//                                         always-empty between actions; the
//                                         load side supplies fresh ones.
//   controller.forcedOffense/forcedDefense/forcedSpecial
//                                         only ever set for the duration of
//                                         one advance() call and cleared at
//                                         the end of it; never true state to
//                                         resume into.
// controller.suggestCache IS saved, on purpose: buildSuggestion() draws from
// game.rng, and dropping the cache would let a reload recompute a
// suggestion the coach had already been given, consuming random draws a
// moment sooner than an unbroken game would have and pulling every snap
// after it out of step with the seed.

(function (root) {
    'use strict';

    var VERSION = 1;

    // ---------- the player tag ----------

    function isPlayer(v) {
        return !!v && typeof v === 'object' &&
               typeof v.id === 'string' && typeof v.pos === 'string' &&
               v.attr && typeof v.attr === 'object';
    }

    function isTag(v) {
        if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
        var keys = Object.keys(v);
        return keys.length === 1 && keys[0] === '$p';
    }

    // Deep-walks anything, replacing a player object with a tag pointing at
    // his id. Never called on a roster's own players array, which is the one
    // place the real data has to survive.
    function tagWalk(v, depth) {
        depth = depth || 0;
        if (depth > 80) throw new Error('save.js: object nested too deep, is something cyclic?');
        if (v === null || typeof v !== 'object') return v;
        if (isPlayer(v)) return { $p: v.id };
        if (Array.isArray(v)) {
            var out = [], i;
            for (i = 0; i < v.length; i++) out.push(tagWalk(v[i], depth + 1));
            return out;
        }
        var res = {}, k;
        for (k in v) if (Object.prototype.hasOwnProperty.call(v, k)) res[k] = tagWalk(v[k], depth + 1);
        return res;
    }

    // The inverse: replaces every tag with the real player from byId. A
    // missing id (should not happen; a corrupt or hand-edited file might)
    // resolves to null rather than throwing, so one bad reference does not
    // take down a whole load.
    function untagWalk(v, byId, depth) {
        depth = depth || 0;
        if (depth > 80) throw new Error('save.js: object nested too deep, is something cyclic?');
        if (v === null || typeof v !== 'object') return v;
        if (isTag(v)) return byId[v.$p] || null;
        if (Array.isArray(v)) {
            var out = [], i;
            for (i = 0; i < v.length; i++) out.push(untagWalk(v[i], byId, depth + 1));
            return out;
        }
        var res = {}, k;
        for (k in v) if (Object.prototype.hasOwnProperty.call(v, k)) res[k] = untagWalk(v[k], byId, depth + 1);
        return res;
    }

    function plainClone(v) { return JSON.parse(JSON.stringify(v)); }

    // ---------- roster and team ----------

    // The roster's players and depth chart are saved untagged: this is the
    // one true copy every tag elsewhere in the file points back into. byId is
    // not saved at all; it is rebuilt on load, the same as
    // engine/players.js does after generating a roster.
    function serializeTeam(team) {
        var tagged = tagWalk({
            name: team.name, programId: team.programId, level: team.level,
            playbook: team.playbook, style: team.style, staff: team.staff,
            autoCoach: team.autoCoach, live: team.live
        });
        tagged.roster = { players: plainClone(team.roster.players), depth: plainClone(team.roster.depth) };
        return tagged;
    }

    function rosterFromSaved(saved) {
        var byId = {}, i;
        for (i = 0; i < saved.players.length; i++) byId[saved.players[i].id] = saved.players[i];
        return { players: saved.players, depth: saved.depth, byId: byId };
    }

    function deserializeTeam(saved, byId) {
        var team = untagWalk({
            name: saved.name, programId: saved.programId, level: saved.level,
            playbook: saved.playbook, style: saved.style, staff: saved.staff,
            autoCoach: saved.autoCoach, live: saved.live
        }, byId);
        team.roster = rosterFromSaved(saved.roster);
        // A belief store's member is the same object as team.staff[role]
        // (engine/game.js resetBeliefs). It went through the tag walk like
        // everything else in .live, which leaves it a plain, disconnected
        // clone rather than a tag (staff members are not players and are
        // never tagged), so it is put back explicitly rather than trusted.
        team.live.beliefs.OC.member = team.staff.OC;
        team.live.beliefs.DC.member = team.staff.DC;
        team.live.beliefs.SPOT.member = team.staff.SPOT;
        return team;
    }

    // ---------- the whole run ----------

    // controller is the object engine/controller.js's newGame returns.
    function serialize(controller) {
        var c = controller, g = c.game;
        var payload = {
            version: VERSION,
            game: {
                teams: [serializeTeam(g.teams[0]), serializeTeam(g.teams[1])],
                rest: tagWalk({
                    score: g.score, stats: g.stats, log: g.log,
                    quarter: g.quarter, clock: g.clock, off: g.off, ball: g.ball,
                    down: g.down, dist: g.dist, timeouts: g.timeouts,
                    drivePlays: g.drivePlays, ot: g.ot, hunchLog: g.hunchLog,
                    finished: g.finished, final: g.final,
                    otRound: g.otRound, otIndex: g.otIndex, otFirst: g.otFirst,
                    guard: g.guard, receivedFirst: g.receivedFirst
                }),
                rng: { seed: g.rng.seed, state: g.rng.state }
            },
            controller: tagWalk({
                coach: c.coach, offenseMode: c.offenseMode, defenseMode: c.defenseMode,
                playClock: c.playClock, reportThreshold: c.reportThreshold,
                pending: c.pending, cued: c.cued, batched: c.batched,
                log: c.log, halftimeDone: c.halftimeDone, over: c.over,
                lastReport: c.lastReport, verbosity: c.verbosity,
                secondHalfPlan: c.secondHalfPlan, snapId: c.snapId,
                suggestCache: c.suggestCache, lastFormation: c.lastFormation,
                lastOffFormation: c.lastOffFormation, lastOffTeam: c.lastOffTeam,
                lastDefFront: c.lastDefFront
            })
        };
        return JSON.stringify(payload);
    }

    // deps is the same { Rng, players, plays, resolve, staff, game } bundle
    // every Node tool and main.js already builds; the file never carries
    // module references of its own.
    function deserialize(deps, json) {
        var payload = JSON.parse(json);
        if (!payload || payload.version !== VERSION) throw new Error('Unrecognised save file.');

        var savedTeams = payload.game.teams;
        var rosters = [rosterFromSaved(savedTeams[0].roster), rosterFromSaved(savedTeams[1].roster)];
        var byId = {}, i;
        for (i = 0; i < 2; i++) { var id; for (id in rosters[i].byId) byId[id] = rosters[i].byId[id]; }

        var teams = [deserializeTeam(savedTeams[0], byId), deserializeTeam(savedTeams[1], byId)];
        var rest = untagWalk(payload.game.rest, byId);

        var rng = new deps.Rng(payload.game.rng.seed);
        rng.state = payload.game.rng.state;

        var g = {
            rng: rng, teams: teams, score: rest.score, stats: rest.stats, log: rest.log,
            quarter: rest.quarter, clock: rest.clock, off: rest.off, ball: rest.ball,
            down: rest.down, dist: rest.dist, timeouts: rest.timeouts,
            hooks: null, drivePlays: rest.drivePlays, ot: rest.ot,
            S: deps.staff, hunchLog: rest.hunchLog, finished: rest.finished, final: rest.final,
            otRound: rest.otRound, otIndex: rest.otIndex, otFirst: rest.otFirst,
            guard: rest.guard, receivedFirst: rest.receivedFirst
        };

        var cc = untagWalk(payload.controller, byId);
        var c = {
            deps: deps, home: teams[0], away: teams[1], coach: cc.coach,
            offenseMode: cc.offenseMode, defenseMode: cc.defenseMode,
            playClock: cc.playClock, reportThreshold: cc.reportThreshold,
            pending: cc.pending, queue: [], cued: cc.cued, batched: cc.batched,
            log: cc.log, halftimeDone: cc.halftimeDone, over: cc.over,
            lastReport: cc.lastReport, verbosity: cc.verbosity,
            secondHalfPlan: cc.secondHalfPlan, game: g, snapId: cc.snapId,
            suggestCache: cc.suggestCache, lastFormation: cc.lastFormation,
            lastOffFormation: cc.lastOffFormation, lastOffTeam: cc.lastOffTeam,
            lastDefFront: cc.lastDefFront,
            forcedOffense: null, forcedDefense: null, forcedSpecial: null
        };
        g.controller = c;
        return c;
    }

    var api = { VERSION: VERSION, serialize: serialize, deserialize: deserialize,
                tagWalk: tagWalk, untagWalk: untagWalk };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.AF = root.AF || {};
    root.AF.save = api;
})(typeof window !== 'undefined' ? window : globalThis);
