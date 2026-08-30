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
    //
    // game.ball is stored offense-relative (game.js setPossession), so the
    // half the ball is in belongs to the offense below fifty and to the
    // defense above it. "Our" has to be resolved against the coach, not
    // against the offense: on defense after a kickoff the ball sits on the
    // other team's own twenty-five, and calling that "our own twenty-five"
    // says the opposite of what happened (ISSUES.md, from play).
    //
    // offIdx and coachIdx are the team indices. Pass coachIdx as null for a
    // game nobody is coaching, which is the harness: it keeps the old
    // offense-relative wording so headless output is unchanged.
    function spotWords(ball, offIdx, coachIdx) {
        if (ball === 50) return 'midfield';
        var nearSide = ball < 50;
        var ours = coachIdx === null || coachIdx === undefined
            ? nearSide
            : (nearSide ? offIdx : 1 - offIdx) === coachIdx;
        return (ours ? 'our own ' : 'their ') + words(nearSide ? ball : 100 - ball);
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
            // Whether the coordinator explains himself. Verbosity is about how
            // much detail the play by play carries; hints are about whether a
            // coach still learning gets told what a concept beats. Different
            // questions, so they are different settings (ISSUES.md, from play).
            hints: opts.hints || 'on',
            // How a player is named in the play by play: 'both' (position
            // and last name), 'position', or 'name'. A bare name is the one
            // thing a blind coach cannot anchor, so position and name is the
            // default (ISSUES.md, from play).
            naming: opts.naming || 'both',
            // Pacing lives on the interface, but a preference only survives a
            // save if the controller carries it, because the controller is
            // what engine/save.js writes. It was the one setting without a
            // mirror, so P reset to medium on every load.
            pacing: opts.pacing || 'medium',
            secondHalfPlan: null
        };
        c.game = deps.game.startGame(deps, opts.home, opts.away, opts.seed);
        c.game.controller = c;
        c.game.naming = c.naming;
        // The coach answers his own substitution questions rather than having
        // the automatic coach answer them for him (DESIGN.md 18.3).
        c.game.teams[c.coach].autoCoach = false;
        c.game.teams[1 - c.coach].autoCoach = true;
        c.snapId = 0;
        c.suggestCache = {};
        // Per-team memory of what each offense last showed and each defense
        // last ran, for the Z key across changes of possession.
        c.seenOffFormation = {};
        c.seenFront = {};
        // The career's decision count (DESIGN_PROPOSALS.md proposal 4).
        c.decisions = { coach: 0, staff: 0 };
        // Before the toss there is no down and distance worth speaking.
        if (c.game.pendingToss) say(c, 'The teams are on the field.', 'result', null);
        else say(c, situationLine(c), 'result', null);
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
        // The opening ceremonies and every kickoff (DESIGN.md 8.4, ISSUES.md
        // 2026-08-28). The toss is asked once and always: it is the coach's
        // moment whatever his delegation settings. Kickoff calls are gated
        // like the fourth down: always in full control, only when the
        // decision genuinely matters (an onside window) when the coordinator
        // stops him for the big ones, never when everything is delegated.
        // A flag on the last snap: the engine only defers when the human's
        // defense owns the choice, so this is always his question - unless
        // he has handed the defense over entirely, in which case the rule
        // answers for his coordinator on the next advance.
        if (c.game.pendingPenalty) {
            if (c.defenseMode === 'COORD') return { kind: 'auto', reason: 'penalty' };
            return { kind: 'penalty' };
        }
        if (c.game.pendingToss) return { kind: 'cointoss' };
        if (c.game.pendingTossChoice) return { kind: 'tosschoice' };
        // The try after a touchdown (ISSUES.md, from play: the computer was
        // kicking the extra point for the coach). His own scores only, gated
        // like the kickoff: always in full control, only when a two-point
        // try is genuinely live when the coordinator stops him for the big
        // ones, never when everything is delegated. Unlike the dead kickoff
        // below, a try at zero on the clock still matters - the point can
        // decide the game - so there is no clock escape.
        if (c.game.pendingTry) {
            var ti = c.game.pendingTry.offIdx;
            if (ti !== c.coach) return { kind: 'auto', reason: 'try' };
            if (c.offenseMode === 'COORD') return { kind: 'auto', reason: 'try' };
            if (c.offenseMode === 'KEY' && !c.deps.game.twoPointSituation(c.game, ti)) {
                return { kind: 'auto', reason: 'try' };
            }
            return { kind: 'pat' };
        }
        // The halftime briefing comes before the second-half kickoff call.
        if (c.game.quarter === 3 && !c.halftimeDone) return { kind: 'halftime' };
        if (c.game.pendingKickoff) {
            // A kickoff deferred by a score at zero on the clock still runs,
            // but nobody plays after it, so it is never worth a question
            // (found by the milestone review: the old synchronous code ran
            // the same dead kick silently).
            if (c.game.clock <= 0) return { kind: 'auto', reason: 'kickoff' };
            var ki = c.game.pendingKickoff.kickIdx;
            var kside = ki === c.coach ? 'kick' : 'receive';
            var kmode = c.offenseMode;
            if (kmode === 'COORD') return { kind: 'auto', reason: 'kickoff' };
            if (kmode === 'KEY' && !c.deps.game.onsideSituation(c.game, ki)) {
                return { kind: 'auto', reason: 'kickoff' };
            }
            return { kind: 'kickoff', side: kside };
        }
        // The overtime rotation is a bookkeeping step waiting behind the try
        // (engine/game.js otStep). The dead possession's state is stale until
        // it runs - the ball is past the goal line - and asking anything on
        // it produced a phantom call prompt whose answer the rotation then
        // silently swallowed (found by the session 6 audit).
        if (c.game.ot && c.game.otRotate) return { kind: 'auto', reason: 'overtime' };
        if (victoryFormationComing(c)) return { kind: 'auto', reason: 'victory formation' };
        if (c.game.down === 4) {
            if (c.game.off !== c.coach) {
                // The other sideline's decision is public the moment its
                // unit trots out: fourthDownDecision draws nothing, so
                // reading it here is watching the field, not the call
                // sheet (DESIGN.md 24.1; ISSUES.md 2026-08-29, from
                // Brian's play notes - "the computer once it decided to
                // punt, just punted the ball").
                var od = c.game.ot ? c.deps.game.otFourthDownDecision(c.game, c.game.off)
                                   : c.deps.game.fourthDownDecision(c.game, c.game.off);
                if (od === 'punt' || od === 'fg') {
                    var dmode = c.defenseMode;
                    if (dmode === 'COORD') return { kind: 'auto', reason: 'special teams' };
                    // The stop-me setting interrupts only when the call
                    // genuinely matters: a punt in the desperation window,
                    // where the block is the recommended gamble. A field
                    // goal's standard call is already the rush, so there is
                    // nothing routine to stop for.
                    if (dmode === 'KEY' &&
                        !(od === 'punt' && c.deps.game.defSpecialCall(c.game, c.coach, 'punt') === 'BLOCK')) {
                        return { kind: 'auto', reason: 'special teams' };
                    }
                    return { kind: 'defspecial', unit: od };
                }
                // They are staying on the field: the normal defensive call
                // flow below applies, which is what fixes "the play just
                // ran" - the coach's defense was silently skipped on every
                // opponent go-for-it.
            } else {
                var stMode = c.offenseMode; // it is his possession
                if (stMode === 'COORD') return { kind: 'auto', reason: 'special teams' };
                if (stMode === 'KEY' && !worthStopping(c)) return { kind: 'auto', reason: 'special teams' };
                return { kind: 'special' };
            }
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

    // One line of the play by play, in the settings in force right now.
    //
    // The engine writes both a full and a terse form at snap time and the
    // verbosity setting picks between them at read time, so V takes effect
    // on the next line spoken rather than on the next snap. Naming has three
    // settings rather than two, and storing six renderings of every line to
    // get the same behaviour would be silly, so a line that still carries
    // its result is rebuilt from that result instead. Entries with no result
    // - kickoffs, free kicks, turnovers on downs, and anything loaded from a
    // save old enough not to have kept one - fall back to what was stored.
    function renderEntry(c, entry) {
        // A two-point try carries its snap's result but is not an ordinary
        // play line: its down-and-distance head would be a lie, so it goes
        // through the try's own renderer.
        if (entry.kind === 'pat' && entry.res && c.deps.game.describeTry) {
            return c.deps.game.describeTry(entry.res, entry.made, c.deps.plays, {
                off: entry.team, coach: c.coach,
                players: c.deps.players, naming: c.naming
            });
        }
        if (entry.res && entry.res.concept && c.deps.game.describeBoth) {
            var both = c.deps.game.describeBoth(entry.res, c.deps.plays, {
                off: entry.team, coach: c.coach,
                players: c.deps.players, naming: c.naming
            });
            return (c.verbosity === 'terse' && both.terse) ? both.terse : both.full;
        }
        return (c.verbosity === 'terse' && entry.terse) ? entry.terse : entry.text;
    }

    // ---------- the lines the interface speaks ----------

    function situationLine(c) {
        var g = c.game;
        var us = g.teams[c.coach].name, them = g.teams[1 - c.coach].name;
        // Only call it overtime when it actually is overtime. The quarter
        // counter runs past four at the end of regulation whether the game is
        // tied or not.
        // A quarter takes an ordinal, not a count: this said "three quarter,
        // twelve minutes" in every situation line in the game (found by the
        // milestone review). ORDINAL is the same table the down uses.
        var qtr = g.ot ? 'overtime' : (ORDINAL[Math.min(4, g.quarter)] + ' quarter');
        var scorePart = qtr + ', ' + clockWords(g.clock) + '. ' +
               us + ' ' + words(g.score[c.coach]) + ', ' + them + ' ' + words(g.score[1 - c.coach]) + '.';
        // Between plays of the ordinary kind, down and distance are real.
        // During the ceremonies they are stale leftovers - the ball past the
        // goal line after a touchdown, the untouched opening state before
        // the toss - and speaking them fabricates a possession that does not
        // exist (found by the milestone review).
        if (g.pendingToss || g.pendingTossChoice) {
            return 'Before the kickoff. ' + scorePart;
        }
        if (g.pendingPenalty) {
            return 'A flag is down on the play. ' + scorePart;
        }
        if (g.pendingTry) {
            return g.teams[g.pendingTry.offIdx].name + ' lining up for the try. ' + scorePart;
        }
        if (g.pendingKickoff) {
            return g.teams[g.pendingKickoff.kickIdx].name + ' kicking off. ' + scorePart;
        }
        // The spot is spoken with the possession named outright - "Riverton
        // ball, own twenty one" - because a pronoun makes the listener work
        // out whose ball it is before the yard line means anything. Own and
        // opponent are relative to the team just named, so there is nothing
        // left to resolve (ISSUES.md, from play).
        var toGo = g.dist >= (100 - g.ball) ? 'goal' : words(g.dist);
        var offName = g.teams[g.off].name;
        var spotPart = g.ball === 50 ? offName + ' ball at midfield'
            : offName + ' ball, ' + (g.ball < 50 ? 'own ' + words(g.ball) : 'opponent ' + words(100 - g.ball));
        return ORDINAL[Math.min(4, g.down)] + ' and ' + toGo + '. ' + spotPart + '. ' + scorePart;
    }

    // Just the down, distance and spot, for the head of every call prompt.
    // The full situationLine stays for Tab and for possession changes; this
    // one is short on purpose, because it is heard on every snap.
    function shortSituation(c) {
        var g = c.game;
        var toGo = g.dist >= (100 - g.ball) ? 'goal' : words(g.dist);
        return ORDINAL[Math.min(4, g.down)] + ' and ' + toGo + ' at ' + spotWords(g.ball, g.off, c.coach) + '.';
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

    // Z: what the other team had on the field on the last snap. X is the
    // coach's own setup; this is its mirror, and it is the question Brian says
    // he actually asks once a play is over (ISSUES.md, from play).
    //
    // This is a retrospective, not a pre-snap read, which is why it may name
    // the offense's formation where offenseShows deliberately will not: the
    // formation is hidden until the line, and by now the coach has heard the
    // snap it was run on. Same guard as offenseShows either way - a look only
    // counts when it was a look at the unit the coach is facing now.
    // When the look is not from this possession, Z remembers anyway: the
    // stamps are per-possession so a unit seen before the turnover is never
    // reported as this snap's, but the coach's memory is not per-possession,
    // and "no look yet" in the fourth quarter against a team he has watched
    // all night was a lie of omission. The wording never claims to be last
    // snap (approved by Brian, session 5 audit item).
    function opponentUnit(c) {
        var PL = c.deps.plays, g = c.game;
        if (offenseIsCoach(c)) {
            var seenF = c.seenFront && c.seenFront[1 - g.off];
            if (c.lastRunFront && c.lastDefTeam === 1 - g.off) {
                return 'They were in ' + frontSay(PL, c.lastRunFront) + '.';
            }
            if (seenF) return 'The last time you had the ball, they were in ' + frontSay(PL, seenF) + '.';
            return 'No look at their defense yet.';
        }
        var seenO = c.seenOffFormation && c.seenOffFormation[g.off];
        if (c.lastOffFormation && c.lastOffTeam === g.off) {
            var form = PL.FORMATIONS[c.lastOffFormation];
            return 'Last snap they were in ' + form.name + ', ' +
                   words(Number(form.personnel)) + ' personnel: ' + form.say + '.';
        }
        if (seenO) {
            var form2 = PL.FORMATIONS[seenO];
            return 'The last time they had the ball, they showed ' +
                   words(Number(form2.personnel)) + ' personnel from the ' + form2.name + '.';
        }
        return 'No look at their offense yet.';
    }

    function frontSay(PL, front) {
        var f = PL.FRONTS[front];
        return f.name + ': ' + words(f.dl) + ' linemen, ' +
               words(f.lb) + (f.lb === 1 ? ' linebacker, ' : ' linebackers, ') +
               words(f.db) + ' defensive backs';
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
        // A look only counts when it was a look at the team that has the
        // ball now: after a turnover, lastOffFormation belongs to the other
        // team, and the engine's own coordinator was quietly reading the
        // wrong team's personnel for one snap while the spoken line
        // correctly said there was no look yet (ISSUES.md, session 3 audit;
        // fixed in the same seed-breaking pass as the defensive fourth
        // down). The per-team memory is the honest fallback.
        var lookForm = (c.lastOffFormation && c.lastOffTeam === g.off) ? c.lastOffFormation
                     : (c.seenOffFormation[g.off] || 'SPREAD');
        var personnel2 = PL.FORMATIONS[lookForm].personnel;
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
            : c.deps.game.defenseLineup(team, c.lastDefFront || 'NICKEL', c.deps.plays, c.deps.players);
        var on = c.deps.game.onFieldList(lu), out = [], i, p, next;
        for (i = 0; i < on.length; i++) {
            p = on[i];
            next = nextOnChart(team.roster, p);
            // The substitution list is the one place a coach maps a name to a
            // position, so it has to speak the same vocabulary the play by
            // play does. It used to say the raw group code, which a screen
            // reader reads out as the letters D and L (found by the
            // milestone review).
            out.push({ player: p, replacement: next,
                       text: c.deps.players.sayPlayer(p, 'both') + ', ' + staminaWord(p) +
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

    // ---------- the toss and the kickoff (DESIGN.md 8.4, ISSUES.md 2026-08-28) ----------

    function callToss(c, heads) {
        if (!c.game.pendingToss) return fail(c, 'There is no toss to call.');
        c.forcedToss = { call: heads ? 'heads' : 'tails', team: c.coach };
        return advance(c);
    }

    var TOSS_OPTIONS = [
        { id: 'RECEIVE', text: 'Take the ball.' },
        { id: 'DEFER', text: 'Defer to the second half.' },
        { id: 'KICK', text: 'Kick off.' }
    ];

    function tossChoices(c) {
        return { recommendation: 'RECEIVE',
                 text: 'You win the toss. Take the ball.',
                 options: TOSS_OPTIONS.slice() };
    }

    function callTossChoice(c, id) {
        if (!c.game.pendingTossChoice) return fail(c, 'There is no toss choice to make.');
        var ok = TOSS_OPTIONS.some(function (o) { return o.id === id; });
        if (!ok) return fail(c, 'That is not a toss choice.');
        c.forcedTossChoice = { choice: id };
        return advance(c);
    }

    var KICK_OPTIONS = [
        { id: 'DEEP', text: 'Kick it deep.' },
        { id: 'SQUIB', text: 'Squib kick. No return, but they start in better field position.' },
        { id: 'POOCH', text: 'Pooch kick. High and short, fair caught, no return.' },
        { id: 'ONSIDE', text: 'Onside kick. A real gamble to keep the ball.' }
    ];
    var RECEIVE_OPTIONS = [
        { id: 'RETURN', text: 'Regular return.' },
        { id: 'HANDS', text: 'Hands team, in case they kick onside. It costs you the return game.' }
    ];

    // The kicking or receiving call, in the fourth-down grammar: a
    // recommendation with plain wording, Enter accepts, F for the list.
    // Deterministic, like specialTeamsChoices: the situational math draws
    // from nothing.
    function kickoffChoices(c) {
        var g = c.game, GM = c.deps.game;
        if (!g.pendingKickoff) return null;
        var ki = g.pendingKickoff.kickIdx;
        var onside = GM.onsideSituation(g, ki);
        if (ki === c.coach) {
            return { side: 'kick',
                     recommendation: onside ? 'ONSIDE' : 'DEEP',
                     text: onside ? 'You need the ball back. Onside kick.' : 'Kick it deep.',
                     options: KICK_OPTIONS.slice() };
        }
        return { side: 'receive',
                 recommendation: onside ? 'HANDS' : 'RETURN',
                 text: onside ? 'They may try an onside kick here. Hands team.' : 'Regular return.',
                 options: RECEIVE_OPTIONS.slice() };
    }

    function callKickoff(c, id) {
        var g = c.game;
        if (!g.pendingKickoff) return fail(c, 'There is no kickoff to call.');
        var ki = g.pendingKickoff.kickIdx;
        if (ki === c.coach) {
            if (!KICK_OPTIONS.some(function (o) { return o.id === id; })) return fail(c, 'That is not a kickoff call.');
            c.forcedKick = { call: id };
        } else {
            if (!RECEIVE_OPTIONS.some(function (o) { return o.id === id; })) return fail(c, 'That is not a return call.');
            c.forcedReceive = { call: id };
        }
        return advance(c);
    }

    // The try (DESIGN.md 8.4, same grammar as everything else). Deterministic,
    // like kickoffChoices: nothing here draws from the seed, so no cache.
    var PAT_OPTIONS = [
        { id: 'KICK', text: 'Kick the extra point.' },
        { id: 'TWO', text: 'Go for two. A real snap from the three yard line.' }
    ];

    function patChoices(c) {
        var g = c.game;
        if (!g.pendingTry) return null;
        var ti = g.pendingTry.offIdx;
        var two = c.deps.game.twoPointSituation(g, ti);
        return { recommendation: two ? 'TWO' : 'KICK',
                 text: two ? 'The score says the kick is not enough. Go for two.'
                           : 'Kick the extra point.',
                 options: PAT_OPTIONS.slice() };
    }

    function callPat(c, id) {
        var g = c.game;
        if (!g.pendingTry) return fail(c, 'There is no try to call.');
        if (!PAT_OPTIONS.some(function (o) { return o.id === id; })) return fail(c, 'That is not a try call.');
        c.forcedPat = { call: id === 'TWO' ? 'two' : 'kick' };
        return advance(c);
    }

    // The defense's answer to the kicking unit it is shown (DESIGN.md 8.4;
    // ISSUES.md 2026-08-29). Deterministic; no cache needed.
    var PUNT_DEF_OPTIONS = [
        { id: 'RETURN', text: 'Set up the return.' },
        { id: 'BLOCK', text: 'Go for the block. Everyone comes; it costs you the return, and a fake gains against it.' },
        { id: 'SAFE', text: 'Punt safe. Nobody rushes, and a fake gains nothing.' }
    ];
    var FG_DEF_OPTIONS = [
        { id: 'BLOCK', text: 'Rush the kick.' },
        { id: 'SAFE', text: 'Field goal safe. Nobody rushes, and a fake gains nothing.' }
    ];

    function defSpecialChoices(c) {
        var p = c.pending;
        if (!p || p.kind !== 'defspecial') return null;
        var unit = p.unit;
        var rec = c.deps.game.defSpecialCall(c.game, c.coach, unit);
        var shown = unit === 'fg' ? 'They show the field goal unit.' : 'They show the punt unit.';
        var recSay = rec === 'BLOCK' ? (unit === 'fg' ? 'Rush the kick.' : 'You need the ball back. Go for the block.')
                                     : 'Set up the return.';
        return { unit: unit, recommendation: rec,
                 text: shown + ' ' + recSay,
                 options: (unit === 'fg' ? FG_DEF_OPTIONS : PUNT_DEF_OPTIONS).slice() };
    }

    function callDefSpecial(c, id) {
        var p = c.pending;
        if (!p || p.kind !== 'defspecial') return fail(c, 'There is no kick to defend.');
        var opts = p.unit === 'fg' ? FG_DEF_OPTIONS : PUNT_DEF_OPTIONS;
        if (!opts.some(function (o) { return o.id === id; })) return fail(c, 'That is not a call against this unit.');
        c.forcedDefSpecial = { call: id };
        return advance(c);
    }

    // The flag decision, spoken as both futures - which is the information
    // a real coach gets from the referee before choosing (ISSUES.md
    // 2026-08-29, from Brian's play notes). Deterministic; no cache.
    function penaltyFutureSay(c, fut) {
        var g = c.game;
        if (fut.turnover) return 'they turn it over';
        if (fut.td) return 'the touchdown stands';
        if (fut.safety) return 'a safety';
        if (fut.downs) return 'turnover on downs, your ball';
        return ORDINAL[Math.min(4, fut.down)] + ' and ' +
               (fut.dist >= (100 - fut.ball) ? 'goal' : words(fut.dist)) +
               ' at ' + spotWords(fut.ball, g.off, c.coach);
    }

    function penaltyChoices(c) {
        var g = c.game;
        if (!g.pendingPenalty) return null;
        var pp = g.pendingPenalty, res = pp.res;
        var f = c.deps.game.penaltyFutures(g, res);
        var rec = c.deps.game.penaltyRule(g, res);
        // The snap itself has not been spoken yet - its log line waits on
        // this decision - so the prompt carries it.
        var both = c.deps.game.describeBoth(res, c.deps.plays,
            { off: pp.offIdx, coach: c.coach, players: c.deps.players, naming: c.naming });
        var playLine = (c.verbosity === 'terse' && both.terse) ? both.terse : both.full;
        var acceptSay = 'Accept: ' + penaltyFutureSay(c, f.accept) + ', replay the down.';
        var declineSay = 'Decline: the play stands, ' + penaltyFutureSay(c, f.decline) + '.';
        return { recommendation: rec === 'decline' ? 'DECLINE' : 'ACCEPT',
                 text: playLine + ' Flag on the offense, ' + res.penalty.kind + '. ' +
                       acceptSay + ' ' + declineSay + ' ' +
                       (rec === 'decline' ? 'I would let it stand.' : 'I would take the penalty.'),
                 options: [ { id: 'ACCEPT', text: acceptSay },
                            { id: 'DECLINE', text: declineSay } ] };
    }

    function callPenalty(c, id) {
        if (!c.game.pendingPenalty) return fail(c, 'There is no flag to rule on.');
        if (id !== 'ACCEPT' && id !== 'DECLINE') return fail(c, 'That is not a call on a flag.');
        c.forcedPenalty = { call: id === 'DECLINE' ? 'decline' : 'accept' };
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
        if (c.forcedToss) {
            var ft = c.forcedToss;
            hooks.coinToss = function () { return ft; };
        }
        if (c.forcedTossChoice) {
            var ftc = c.forcedTossChoice;
            hooks.tossChoice = function () { return ftc; };
        }
        if (c.forcedKick) {
            var fk = c.forcedKick;
            hooks.kickoffKick = function () { return fk.call; };
        }
        if (c.forcedReceive) {
            var fr = c.forcedReceive;
            hooks.kickoffReceive = function () { return fr.call; };
        }
        if (c.forcedPat) {
            var fp = c.forcedPat;
            hooks.patCall = function () { return fp.call; };
        }
        if (c.forcedDefSpecial) {
            var fds = c.forcedDefSpecial;
            hooks.defSpecial = function () { return fds.call; };
        }
        if (c.forcedPenalty) {
            var fpn = c.forcedPenalty;
            hooks.penaltyCall = function () { return fpn.call; };
        }
        g.hooks = hooks;
        c.lastOffFormation = null;
        // The decision count for the career (DESIGN_PROPOSALS.md proposal 4,
        // accepted 2026-08-28): how much of the job the coach did himself
        // against how much his staff did for him. A forced call on his side
        // is his; his side resolving without one is theirs. The opponent's
        // decisions belong to nobody here.
        var hadForcedOffense = !!c.forcedOffense, hadForcedDefense = !!c.forcedDefense;
        var hadForcedSpecial = !!(c.forcedSpecial || c.forcedKick || c.forcedReceive);
        var hadForcedPat = !!c.forcedPat;
        var hadForcedDefSpecial = !!c.forcedDefSpecial;
        var hadForcedPenalty = !!c.forcedPenalty;
        // Whose offense is about to run this snap. Recorded before the step
        // because a turnover flips g.off inside it, and a look at one team's
        // personnel must never be reported as a look at the other's (found by
        // the whistle audit: after an interception, offenseShows spoke the
        // coach's own formation as the opponent's).
        var offBefore = g.off;

        var wasPenaltyStep = !!g.pendingPenalty;
        var wasKickoffStep = !!g.pendingKickoff;
        // The try resolves before the kickoff in stepGame's chain, so a step
        // with both pending is a try step, not a kickoff step.
        var wasTryStep = !!g.pendingTry;
        var tryWasCoachs = wasTryStep && g.pendingTry.offIdx === c.coach;
        if (wasTryStep) wasKickoffStep = false;
        var wasTossStep = !!(g.pendingToss || g.pendingTossChoice);
        var downBefore = g.down;
        var logBefore = g.log.length;
        var res = deps.game.stepGame(g, deps);
        c.forcedOffense = null; c.forcedDefense = null; c.forcedSpecial = null;
        c.forcedToss = null; c.forcedTossChoice = null; c.forcedKick = null; c.forcedReceive = null;
        c.forcedPat = null; c.forcedDefSpecial = null; c.forcedPenalty = null;
        g.hooks = null;
        c.snapId++;
        c.suggestCache = {};
        // A snap that deferred behind a flag still ran, and the call that
        // put it on the field still counts; the ruling itself is counted on
        // the step that resolves it, below.
        var deferredBehindFlag = !wasPenaltyStep && !!g.pendingPenalty;
        if (wasPenaltyStep) {
            // The flag ruling is the coach's defense's decision.
            if (hadForcedPenalty) c.decisions.coach++;
            else c.decisions.staff++;
        } else if (res || deferredBehindFlag) {
            // A real snap: the coach's team was on one side of it.
            if (offBefore === c.coach) {
                if (hadForcedOffense || (downBefore === 4 && hadForcedSpecial)) c.decisions.coach++;
                else c.decisions.staff++;
            } else {
                if (hadForcedDefense) c.decisions.coach++;
                else c.decisions.staff++;
            }
        } else if (wasTryStep) {
            // The try is a decision only on the coach's own score; the
            // opponent's belongs to nobody, like any snap the other
            // sideline runs.
            if (tryWasCoachs) {
                if (hadForcedPat) c.decisions.coach++;
                else c.decisions.staff++;
            }
        } else if (wasKickoffStep) {
            // Every kickoff carries one decision for the coach's team: the
            // kick call when it kicks, the return call when it receives. The
            // toss itself is not counted - it is always the coach's moment,
            // with no staff alternative to weigh it against.
            if (hadForcedSpecial) c.decisions.coach++;
            else c.decisions.staff++;
        } else if (!wasTossStep && before.quarter === g.quarter &&
                   downBefore === 4 && offBefore === c.coach) {
            // A punt or a field goal resolves without a snap result, but it
            // was still a fourth-down decision on the coach's possession and
            // the career tally must not count "go for it" while dropping the
            // punt the same key answered (found by the milestone review).
            // The quarter guard keeps a clock rollover at a stale fourth
            // down from counting as a decision nobody made.
            if (hadForcedSpecial || hadForcedOffense) c.decisions.coach++;
            else c.decisions.staff++;
        } else if (!wasTossStep && before.quarter === g.quarter &&
                   downBefore === 4 && offBefore !== c.coach) {
            // The mirror: the opponent's punt or field goal carries one
            // decision for the coach's defense - the return, the block, or
            // the safe call (ISSUES.md 2026-08-29).
            if (hadForcedDefSpecial) c.decisions.coach++;
            else c.decisions.staff++;
        }

        // 1. everything the step logged, in order. One step can log several
        // things - the play, the touchdown, the extra point; a kickoff
        // returned all the way plus its extra point - and speaking only the
        // last entry silently dropped the rest, so a coach heard "extra
        // point is good" with no word that a kickoff had just been returned
        // on him (found by the milestone review; the one-line form predates
        // it). Terse still gives one line per play where a terse form exists.
        if (res && res.formation) { c.lastFormation = res.formation; c.lastOffFormation = res.formation; c.lastOffTeam = offBefore; }
        // The front that actually ran, for the Z key. c.lastDefFront is set
        // inside buildSuggestion and is only the front the coordinator
        // *suggested*; reporting that as what was on the field would be a
        // claim about the other team the coach never earned.
        if (res && res.call && res.call.front) { c.lastRunFront = res.call.front; c.lastDefTeam = 1 - offBefore; }
        // And the per-team memory behind them, which survives changes of
        // possession: what each team's offense last showed and each defense
        // last ran, so Z can still answer on the first snap of a new drive.
        if (res && res.formation) c.seenOffFormation[offBefore] = res.formation;
        if (res && res.call && res.call.front) c.seenFront[1 - offBefore] = res.call.front;
        var spoken = [], li, entry, lineText;
        for (li = logBefore; li < g.log.length; li++) {
            entry = g.log[li];
            lineText = renderEntry(c, entry);
            if (!lineText) continue;
            c.log.push(lineText);
            spoken.push(lineText);
            say(c, lineText, 'result', null);
        }
        if (spoken.length) c.lastReport = spoken.join(' ');

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

    var NAMING = ['both', 'position', 'name'];

    function setNaming(c, mode) {
        c.naming = NAMING.indexOf(mode) >= 0 ? mode : 'both';
        // The engine reads it off the game when it resolves a snap.
        if (c.game) c.game.naming = c.naming;
        return c.naming;
    }

    // The last snap, said again in whatever settings are in force now. This
    // is what the rebuildable event sentences are for: changing how players
    // are announced and then hearing the setting named back at you tells you
    // nothing about what it sounds like (found by the milestone review).
    // Null when no snap has happened yet, so the caller can stay quiet.
    function lastPlayLine(c) {
        var g = c.game, i;
        if (!g || !g.log) return null;
        for (i = g.log.length - 1; i >= 0; i--) {
            if (g.log[i].kind === 'play') return renderEntry(c, g.log[i]);
        }
        return null;
    }

    // The most recent action on the field, for the S key: the last snap,
    // kick, or punt, plus every consequence line that followed it - the
    // touchdown, the extra point, the safety and its free kick, the
    // turnover on downs. C cannot do this job, because C repeats the last
    // report and Z, X and Tab all overwrite it: a coach who checks anything
    // after a play loses the play (ISSUES.md, from play). Rendered through
    // renderEntry so the naming and verbosity in force now apply.
    //
    // The extra point and the free kick are deliberately consequences, not
    // actions: a coach asking for the last play after a touchdown wants the
    // touchdown, not the kick that trailed it, so S starts at the snap and
    // carries the whole scoring sequence with it.
    // The toss counts as an action so S never claims nothing has happened
    // moments after the coin was announced (found by the session 6 audit).
    var ACTION_KINDS = { play: true, kickoff: true, punt: true, fg: true, toss: true };

    function lastAction(c) {
        var g = c.game, i, start = -1;
        if (!g || !g.log) return null;
        // A flagged snap has no log entry yet - its line waits on the
        // ruling - so S must speak the snap under the flag, not the play
        // before it (found by the milestone review).
        if (g.pendingPenalty) {
            var pres = g.pendingPenalty.res;
            var pboth = c.deps.game.describeBoth(pres, c.deps.plays,
                { off: g.pendingPenalty.offIdx, coach: c.coach,
                  players: c.deps.players, naming: c.naming });
            return ((c.verbosity === 'terse' && pboth.terse) ? pboth.terse : pboth.full) +
                   ' A flag is down on the play.';
        }
        for (i = g.log.length - 1; i >= 0; i--) {
            if (ACTION_KINDS[g.log[i].kind]) { start = i; break; }
        }
        if (start < 0) return null;
        var parts = [];
        for (i = start; i < g.log.length; i++) {
            var line = renderEntry(c, g.log[i]);
            if (line) parts.push(line);
        }
        return parts.length ? parts.join(' ') : null;
    }

    function setHints(c, on) {
        c.hints = on === 'off' ? 'off' : 'on';
        return c.hints;
    }

    function setPacing(c, mode) {
        c.pacing = mode;
        return c.pacing;
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
                situationLine: situationLine, shortSituation: shortSituation,
                examine: examine, suggestion: suggestion,
                offenseShows: offenseShows, opponentUnit: opponentUnit, renderEntry: renderEntry,
                callSheet: callSheet, formations: formations, substitutionList: substitutionList,
                callOffense: callOffense, callDefense: callDefense,
                specialTeamsChoices: specialTeamsChoices, callSpecial: callSpecial,
                patChoices: patChoices, callPat: callPat,
                defSpecialChoices: defSpecialChoices, callDefSpecial: callDefSpecial,
                penaltyChoices: penaltyChoices, callPenalty: callPenalty,
                callToss: callToss, tossChoices: tossChoices, callTossChoice: callTossChoice,
                kickoffChoices: kickoffChoices, callKickoff: callKickoff,
                answerSubstitution: answerSubstitution, advance: advance,
                halftime: halftime, halftimeChoice: halftimeChoice,
                reports: reports, batchedReports: batchedReports, chimes: chimes,
                matchups: matchups, tendencies: tendencies, postgameReview: postgameReview,
                playClockSeconds: playClockSeconds, delayOfGame: delayOfGame,
                setMode: setMode, setReportThreshold: setReportThreshold,
                setVerbosity: setVerbosity, setHints: setHints, setPacing: setPacing,
                setNaming: setNaming, NAMING: NAMING, lastPlayLine: lastPlayLine,
                lastAction: lastAction, final: final,
                words: words, clockWords: clockWords, spotWords: spotWords, staminaWord: staminaWord };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.AF = root.AF || {};
    root.AF.controller = api;
})(typeof window !== 'undefined' ? window : globalThis);
