// screens.js - The screens of the first playable and the keys that work on
// each of them. (Accessible Football)
// Plain script, no browser dependencies. Implements DESIGN.md 8.2, 14.2,
// 16.5, 19, 21, 22, 23.
//
// This file owns what the coach can do and what he hears back. It talks to
// engine/controller.js for football and to ui/core.js for menus, grids and the
// announce queue. It never touches the page; ui/dom.js does that.
//
// Screens in the first playable, and only these:
//   boot     the one button that starts the audio and takes focus
//   menu     new game, resume, load, help
//   team     two authored high school programs, described in words
//   pregame  the coordinators' hunches, delegation, the play clock
//   game     the play call flow, the report loop, halftime, the final

(function (root) {
    'use strict';

    function U() { return root.AF.ui; }
    function H() { return root.AF.help; }
    function CTRL() { return root.AF.controller; }

    // ---------- the two authored programs (DESIGN.md 14.1, 14.2) ----------

    // Fixed seeds, so the same two programs come up every time and a coach can
    // learn them. Described in words only: no numbers anywhere (14.2).
    var PROGRAMS = [
        { id: 'RIVERTON', name: 'Riverton', seed: 20260826, quality: 0.15, execMean: 55,
          runLean: 0.58, aggression: 0.25, staffQuality: 0.3,
          say: 'Riverton. A settled programme that runs the ball and expects to win. ' +
               'The line is the strength of the team and the quarterback is steady rather than special. ' +
               'The staff has been here a while and knows what it is doing.' },
        { id: 'FAIRVIEW', name: 'Fairview', seed: 19980412, quality: -0.1, execMean: 48,
          runLean: 0.38, aggression: 0.5, staffQuality: -0.2,
          say: 'Fairview. A young side that throws it about and gives up as many as it scores. ' +
               'There is real speed on the outside and very little of it up front. ' +
               'The staff is inexperienced and you will hear that in what they tell you.' }
    ];

    function makeProgram(deps, prog, stub) {
        var rng = new deps.Rng(prog.seed);
        var team = deps.game.makeTeam(deps, {
            name: prog.name, stub: stub, rng: rng, level: 'HS', quality: prog.quality,
            execMean: prog.execMean, runLean: prog.runLean, aggression: prog.aggression,
            staffQuality: prog.staffQuality
        });
        team.programId = prog.id;
        return team;
    }

    // ---------- the application ----------

    function newApp(deps, out) {
        var app = {
            deps: deps,
            out: out,                      // { say(text, priority, source), tone(name), panel(lines) }
            state: U().newState('boot'),
            menu: null,
            grid: null,
            alloc: null,
            game: null,                    // the controller
            chosen: null,
            playClock: 'OFF',
            reportThreshold: 'everything',
            offenseMode: 'ME',
            defenseMode: 'ME',
            // where we are inside the play call: null, formation, play, subs,
            // front, coverage, pressure, adjustment
            step: null,
            pickedFormation: null,
            pendingTempo: 'huddle',
            defCall: null,
            lastSaid: ''
        };
        return app;
    }

    function say(app, text, priority, source) {
        if (!text) return;
        var clean = U().sanitize(text);
        app.state.lastReport = clean;
        app.lastSaid = clean;
        app.out.say(clean, priority || 'result', source || null);
    }

    function tone(app, name) { if (app.out.tone) app.out.tone(name); }

    // ---------- screen transitions ----------

    function toMenu(app) {
        app.state.mode = 'menu';
        app.menu = U().makeMenu([
            { id: 'NEW', text: 'New game.' },
            { id: 'RESUME', text: 'Resume the crash copy.' },
            { id: 'LOAD', text: 'Load a saved game from a file.' },
            { id: 'HELP', text: 'Help.' }
        ], 'Accessible Football. Main menu.');
        say(app, U().menuAnnounce(app.menu), 'result');
        app.state.lastContext = 'the main menu';
    }

    function toTeam(app) {
        app.state.mode = 'team';
        app.menu = U().makeMenu(PROGRAMS.map(function (p) {
            return { id: p.id, text: p.say };
        }).concat([{ id: 'BACK', text: 'Back to the main menu.' }]), 'Choose a programme.');
        say(app, U().menuAnnounce(app.menu), 'result');
        app.state.lastContext = 'the team choice';
    }

    function toPregame(app, programId) {
        var deps = app.deps;
        var mine = PROGRAMS.filter(function (p) { return p.id === programId; })[0];
        var theirs = PROGRAMS.filter(function (p) { return p.id !== programId; })[0];
        var home = makeProgram(deps, mine, 'H');
        var away = makeProgram(deps, theirs, 'A');
        app.chosen = { home: home, away: away };
        app.state.mode = 'pregame';
        app.pregameSeed = (mine.seed % 100000) + Date.now() % 1000;
        var lines = [];
        lines.push('You are the head coach at ' + home.name + '. Tonight you play ' + away.name + '.');
        lines.push('Your offensive coordinator is ' + home.staff.OC.name + ', ' + home.staff.OC.personality + '.');
        lines.push('Your defensive coordinator is ' + home.staff.DC.name + ', ' + home.staff.DC.personality + '.');
        lines.push('Your spotter is ' + home.staff.SPOT.name + ' and your trainer is ' + home.staff.TRAINER.name + '.');
        lines.push('Nobody has scouted them, so everything you hear tonight your staff works out as it goes.');
        lines.push(modeLine(app));
        lines.push('Press Enter to kick off. O and E set who calls each side. L sets the play clock. B sets how much your staff tells you.');
        say(app, lines.join(' '), 'result');
        app.state.lastContext = 'the pre-game screen';
    }

    function modeLine(app) {
        var M = CTRL().MODES;
        return 'Offense: ' + M[app.offenseMode] + '. Defense: ' + M[app.defenseMode] +
               '. Play clock ' + app.playClock.toLowerCase() + '. Reports ' + app.reportThreshold + '.';
    }

    function toGame(app) {
        var C = CTRL();
        app.game = C.newGame({
            deps: app.deps, home: app.chosen.home, away: app.chosen.away,
            seed: app.pregameSeed, coachTeam: 0,
            offenseMode: app.offenseMode, defenseMode: app.defenseMode,
            playClock: app.playClock, reportThreshold: app.reportThreshold
        });
        app.state.mode = 'game';
        app.step = null;
        flush(app);
        promptNext(app);
    }

    // ---------- the between-play loop (DESIGN.md 19.3) ----------

    // Speak a list of announcements the controller handed back, in the order
    // it gave them, then a chime for each source with something still waiting.
    //
    // Every action on the controller drains its own queue and returns what was
    // said, so the list has to be passed straight to here. Calling drain again
    // afterwards gets an empty list and silently loses the play result, which
    // is exactly what happened the first time this was wired up.
    function emit(app, list) {
        var C = CTRL(), i;
        list = list || [];
        for (i = 0; i < list.length; i++) {
            if (list[i].priority === 'must') tone(app, 'must');
            say(app, list[i].text, list[i].priority, list[i].source);
        }
        var ch = C.chimes(app.game);
        for (i = 0; i < ch.length; i++) tone(app, ch[i]);
        app.out.panel([app.lastSaid]);
    }

    // For the one case where nothing returned a list: the game has just been
    // built and the opening lines are sitting in the controller's queue.
    function flush(app) { emit(app, CTRL().drain(app.game)); }

    // Ask for whatever the game needs next.
    function promptNext(app) {
        var C = CTRL(), p = C.pending(app.game);
        app.step = null;
        if (p.kind === 'over') {
            app.state.mode = 'final';
            say(app, 'Press Enter to return to the menu.', 'result');
            return;
        }
        if (p.kind === 'substitution') {
            say(app, p.hunch.text + ' Y takes him out now, N leaves him in, L at the next personnel change, K at the next dead ball.', 'must', p.hunch.source);
            app.step = 'sub-answer';
            return;
        }
        if (p.kind === 'halftime') {
            openHalftime(app);
            return;
        }
        if (p.kind === 'auto') {
            // A delegated side, or the special teams. The coach presses
            // spacebar, or the pacing timer does it for him.
            app.step = 'advance';
            if (app.state.pacing === 'manual') say(app, 'Press the spacebar to play on.', 'result');
            return;
        }
        var side = p.kind === 'offense' ? 'offense' : 'defense';
        var s = C.suggestion(app.game, side);
        app.step = side === 'offense' ? 'offense-suggest' : 'defense-suggest';
        app.suggested = s;
        var line = s.text;
        if (app.state.verbosity === 'full' && s.describe) line += ' ' + s.describe;
        say(app, line + ' Enter accepts.', 'result', side === 'offense' ? 'OC' : 'DC');
    }

    function openHalftime(app) {
        var C = CTRL(), h = C.halftime(app.game);
        app.state.mode = 'halftime';
        app.halftimeReport = h;
        say(app, 'Halftime. What we learned: ' + h.learned.join(' ') +
                 ' What they changed: ' + h.changed.join(' ') +
                 ' Our biggest problem: ' + h.problem, 'result');
        app.menu = U().makeMenu(h.choices.map(function (x) { return { id: x.id, text: x.text }; }),
                                'Pick one thing for the second half.');
        say(app, U().menuAnnounce(app.menu), 'result');
        app.state.lastContext = 'halftime';
    }

    // ---------- viewers (DESIGN.md 21.2, 21.6) ----------

    function openViewer(app, kind, menu, context) {
        app.state.viewer = { kind: kind, menu: menu, context: context };
        tone(app, 'open');
        say(app, U().menuAnnounce(menu), 'result');
    }

    function closeViewer(app) {
        app.state.viewer = null;
        tone(app, 'close');
        say(app, 'Closed. Back at ' + (app.state.lastContext || 'the game') + '.', 'result');
    }

    // ---------- key handling ----------

    // The handlers are the interceptor stack of DESIGN.md 21.2, in order. Each
    // returns an object when it handled the key and null when it did not, and
    // an active layer swallows a key it does not want rather than letting it
    // fall through to the game.
    function handlers(app) {
        return {
            confirm: function (state, key) {
                var r = U().resolveConfirm(state, key);
                if (r.action) r.action();
                if (r.say) say(app, r.say, 'result');
                return { say: r.say || null };
            },
            explore: function (state, key) {
                if (key.name === 'F12') {
                    state.explore = false;
                    say(app, 'Keyboard explorer off. Back at ' + (state.lastContext || 'the game') + '.', 'result');
                    return { say: 'off' };
                }
                say(app, H().getKeyDescription(key.name, key.shift, key.ctrl, exploreMode(state)), 'result');
                return { say: 'described' };
            },
            help: function (state, key) {
                var help = state.help;
                if (key.name === 'Escape' || key.name === 'Enter') {
                    state.help = null;
                    tone(app, 'close');
                    say(app, 'Exited help. Back at ' + (state.lastContext || 'the game') + '.', 'result');
                    return { say: 'closed' };
                }
                if (key.name === 'ArrowDown') { say(app, U().helpMove(help, 1), 'result'); return { say: 'moved' }; }
                if (key.name === 'ArrowUp') { say(app, U().helpMove(help, -1), 'result'); return { say: 'moved' }; }
                if (key.name === 'h') { say(app, U().helpHeading(help, key.shift ? -1 : 1), 'result'); return { say: 'heading' }; }
                return null;
            },
            viewer: function (state, key) {
                var v = state.viewer;
                if (key.name === 'Escape') { closeViewer(app); return { say: 'closed' }; }
                if (v.grid) {
                    if (key.name === 'ArrowUp') return gridStep(app, v, -1, 0);
                    if (key.name === 'ArrowDown') return gridStep(app, v, 1, 0);
                    if (key.name === 'ArrowLeft') return gridStep(app, v, 0, -1);
                    if (key.name === 'ArrowRight') return gridStep(app, v, 0, 1);
                    return null;
                }
                if (key.name === 'ArrowUp') { tone(app, 'up'); say(app, U().menuMove(v.menu, -1), 'result'); return { say: 'moved' }; }
                if (key.name === 'ArrowDown') { tone(app, 'down'); say(app, U().menuMove(v.menu, 1), 'result'); return { say: 'moved' }; }
                if (key.name === 'Enter') return viewerChoose(app, v);
                return null;
            },
            mode: function (state, key) { return modeKey(app, state, key); }
        };
    }

    function gridStep(app, v, dr, dc) {
        var text = U().gridMove(v.grid, dr, dc);
        if (/edge\.$/.test(text)) tone(app, 'edge');
        say(app, text, 'result');
        return { say: 'moved' };
    }

    function exploreMode(state) {
        if (state.help) return 'help';
        if (state.viewer) return 'viewer';
        return state.mode;
    }

    // What a chosen item in an open viewer does.
    function viewerChoose(app, v) {
        var item = U().menuSelect(v.menu);
        if (!item) return { say: null };
        if (v.kind === 'formation') {
            app.pickedFormation = item.id;
            app.state.viewer = null;
            openPlayList(app);
            return { say: 'formation' };
        }
        if (v.kind === 'play') {
            app.state.viewer = null;
            tone(app, 'close');
            callPlay(app, item.id, app.pendingTempo);
            return { say: 'play' };
        }
        if (v.kind === 'subs') {
            doSubstitution(app, item);
            return { say: 'sub' };
        }
        if (v.kind === 'defpart') {
            app.state.viewer = null;
            nextDefensePart(app, item.id);
            return { say: 'defpart' };
        }
        return { say: null };
    }

    // ---------- the mode branch ----------

    function modeKey(app, state, key) {
        var C = CTRL();
        // Keys that work everywhere (DESIGN.md 21.8)
        if (key.name === 'F1') {
            state.help = U().makeHelp(H().helpFor(state.mode), 'Help');
            tone(app, 'open');
            say(app, U().helpAnnounce(state.help), 'result');
            return { say: 'help' };
        }
        if (key.name === 'F12') {
            state.explore = true;
            say(app, 'Keyboard explorer on. Every key you press is described and nothing happens. F12 turns it off.', 'result');
            return { say: 'explore' };
        }
        if (key.name === 'p') { say(app, U().cyclePacing(state), 'result'); return { say: 'pacing' }; }
        if (key.name === 'v') {
            var v = U().cycleVerbosity(state);
            if (app.game) CTRL().setVerbosity(app.game, state.verbosity);
            say(app, v, 'result');
            return { say: 'verbosity' };
        }
        if (key.name === 'c') { say(app, state.lastReport || 'Nothing said yet.', 'result'); return { say: 'repeat' }; }
        if (key.name === 'q') {
            say(app, U().askConfirm(state, 'Quit this game and go back to the menu?', function () {
                app.game = null; toMenu(app);
            }), 'result');
            return { say: 'quit' };
        }
        if (state.mode === 'menu') return menuScreenKey(app, state, key);
        if (state.mode === 'team') return teamScreenKey(app, state, key);
        if (state.mode === 'pregame') return pregameKey(app, state, key);
        if (state.mode === 'halftime') return halftimeKey(app, state, key);
        if (state.mode === 'final') return finalKey(app, state, key);
        if (state.mode === 'game') return gameKey(app, state, key);
        return null;
    }

    function menuScreenKey(app, state, key) {
        if (key.name === 'ArrowUp') { tone(app, 'up'); say(app, U().menuMove(app.menu, -1), 'result'); return { say: 'moved' }; }
        if (key.name === 'ArrowDown') { tone(app, 'down'); say(app, U().menuMove(app.menu, 1), 'result'); return { say: 'moved' }; }
        if (key.name === 'Enter') {
            var item = key.ctrl ? U().menuFastForward(app.menu) : U().menuSelect(app.menu);
            if (!item) return { say: null };
            if (item.id === 'NEW') { toTeam(app); return { say: 'new' }; }
            if (item.id === 'HELP') {
                state.help = U().makeHelp(H().helpFor('menu'), 'Help');
                say(app, U().helpAnnounce(state.help), 'result');
                return { say: 'help' };
            }
            if (item.id === 'RESUME' || item.id === 'LOAD') {
                say(app, 'Saving and loading are not built yet. Choose new game.', 'result');
                return { say: 'todo' };
            }
        }
        if (key.name === 'Escape') { say(app, 'You are at the main menu.', 'result'); return { say: 'here' }; }
        return null;
    }

    function teamScreenKey(app, state, key) {
        if (key.name === 'ArrowUp') { tone(app, 'up'); say(app, U().menuMove(app.menu, -1), 'result'); return { say: 'moved' }; }
        if (key.name === 'ArrowDown') { tone(app, 'down'); say(app, U().menuMove(app.menu, 1), 'result'); return { say: 'moved' }; }
        if (key.name === 'Escape') { toMenu(app); return { say: 'back' }; }
        if (key.name === 'Enter') {
            var item = key.ctrl ? U().menuFastForward(app.menu) : U().menuSelect(app.menu);
            if (!item) return { say: null };
            if (item.id === 'BACK') { toMenu(app); return { say: 'back' }; }
            toPregame(app, item.id);
            return { say: 'chosen' };
        }
        return null;
    }

    function pregameKey(app, state, key) {
        var M = CTRL().MODES, order = ['ME', 'COORD', 'KEY'];
        if (key.name === 'o') {
            app.offenseMode = order[(order.indexOf(app.offenseMode) + 1) % 3];
            say(app, 'Offense: ' + M[app.offenseMode] + '.', 'result');
            return { say: 'mode' };
        }
        if (key.name === 'e') {
            app.defenseMode = order[(order.indexOf(app.defenseMode) + 1) % 3];
            say(app, 'Defense: ' + M[app.defenseMode] + '.', 'result');
            return { say: 'mode' };
        }
        if (key.name === 'l') {
            var clocks = ['OFF', 'RELAXED', 'STANDARD', 'FAST'];
            app.playClock = clocks[(clocks.indexOf(app.playClock) + 1) % clocks.length];
            say(app, 'Play clock ' + app.playClock.toLowerCase() + '.', 'result');
            return { say: 'clock' };
        }
        if (key.name === 'b') { cycleThreshold(app); return { say: 'reports' }; }
        if (key.name === 'Tab') { say(app, modeLine(app), 'result'); return { say: 'status' }; }
        if (key.name === 'Escape') { toTeam(app); return { say: 'back' }; }
        if (key.name === 'Enter') { toGame(app); return { say: 'kickoff' }; }
        return null;
    }

    function cycleThreshold(app) {
        var t = ['everything', 'important', 'injuries'];
        app.reportThreshold = t[(t.indexOf(app.reportThreshold) + 1) % t.length];
        if (app.game) CTRL().setReportThreshold(app.game, app.reportThreshold);
        say(app, 'Reports: ' + app.reportThreshold + '.', 'result');
    }

    function halftimeKey(app, state, key) {
        if (key.name === 'ArrowUp') { tone(app, 'up'); say(app, U().menuMove(app.menu, -1), 'result'); return { say: 'moved' }; }
        if (key.name === 'ArrowDown') { tone(app, 'down'); say(app, U().menuMove(app.menu, 1), 'result'); return { say: 'moved' }; }
        if (key.name === 'Escape') {
            var h = app.halftimeReport;
            say(app, 'Still at halftime. ' + h.problem + ' Pick one thing for the second half.', 'result');
            return { say: 'here' };
        }
        if (key.name === 'Enter') {
            var item = U().menuSelect(app.menu);
            if (!item) return { say: null };
            app.state.mode = 'game';
            emit(app, CTRL().halftimeChoice(app.game, item.id));
            promptNext(app);
            return { say: 'chosen' };
        }
        return null;
    }

    function finalKey(app, state, key) {
        if (key.name === 'Enter') { app.game = null; toMenu(app); return { say: 'menu' }; }
        if (key.name === 'Escape') { say(app, 'The game is over. Press Enter for the menu.', 'result'); return { say: 'here' }; }
        if (key.name === 'Tab') { say(app, CTRL().final(app.game).line, 'result'); return { say: 'score' }; }
        return null;
    }

    // ---------- in the game ----------

    function gameKey(app, state, key) {
        var C = CTRL(), g = app.game;
        if (key.name === 'Tab') { say(app, C.situationLine(g), 'result'); return { say: 'status' }; }
        if (key.name === 'x') { say(app, C.examine(g), 'result'); return { say: 'examine' }; }
        if (key.name === 'm') { say(app, C.matchups(g).join(' '), 'result', 'OC'); return { say: 'matchups' }; }
        if (key.name === 't') { say(app, C.tendencies(g), 'result', 'OC'); return { say: 'tendencies' }; }
        if (key.name === 'b') { cycleThreshold(app); return { say: 'reports' }; }
        if (key.name === 'r') {
            var b = C.batchedReports(g), i;
            for (i = 0; i < b.length; i++) say(app, b[i].text, 'batched', b[i].source);
            return { say: 'reports' };
        }
        if (key.name === ' ') {
            var waiting = C.reports(g);
            if (waiting.length) {
                for (var j = 0; j < waiting.length; j++) say(app, waiting[j].text, 'cued', waiting[j].source);
                return { say: 'report' };
            }
            if (app.step === 'advance') { doAdvance(app); return { say: 'advance' }; }
            say(app, 'Nothing waiting.', 'result');
            return { say: 'nothing' };
        }
        if (key.name === 'o' || key.name === 'e') {
            var order = ['ME', 'COORD', 'KEY'], side = key.name === 'o' ? 'offense' : 'defense';
            var cur = side === 'offense' ? app.offenseMode : app.defenseMode;
            var next = order[(order.indexOf(cur) + 1) % 3];
            if (side === 'offense') app.offenseMode = next; else app.defenseMode = next;
            emit(app, C.setMode(g, side, next));
            return { say: 'mode' };
        }
        if (key.name === 'g') {
            var json = JSON.stringify({ note: 'Saving the full run is not built yet.', log: app.game.log });
            if (key.shift) { say(app, 'Loading is not built yet.', 'result'); return { say: 'todo' }; }
            say(app, root.AF.dom && root.AF.dom.saveToDisk('accessible-football-log.json', json)
                ? 'Play by play written to a file.' : 'Could not write the file.', 'result');
            return { say: 'save' };
        }

        if (app.step === 'sub-answer') return subAnswerKey(app, key);
        if (app.step === 'advance') {
            if (key.name === 'Enter') { doAdvance(app); return { say: 'advance' }; }
            return null;
        }
        if (app.step === 'offense-suggest') return offenseKey(app, key);
        if (app.step === 'defense-suggest') return defenseKey(app, key);
        if (key.name === 'Escape') { say(app, C.situationLine(g), 'result'); return { say: 'here' }; }
        return null;
    }

    function subAnswerKey(app, key) {
        var map = { y: 'yes', n: 'no', l: 'change', k: 'dead' };
        if (!map[key.name]) return null;
        emit(app, CTRL().answerSubstitution(app.game, map[key.name]));
        promptNext(app);
        return { say: 'answered' };
    }

    function offenseKey(app, key) {
        var C = CTRL();
        if (key.name === 'Enter') {
            callPlay(app, app.suggested.play.id, app.suggested.tempo);
            return { say: 'called' };
        }
        if (key.name === 'n') {
            app.pendingTempo = 'nohuddle';
            say(app, 'No huddle. Same personnel, and they do not get a clean substitution.', 'result');
            callPlay(app, app.suggested.play.id, 'nohuddle');
            return { say: 'nohuddle' };
        }
        if (key.name === 'f') { openFormationList(app); return { say: 'formations' }; }
        if (key.name === 'u') { openSubList(app); return { say: 'subs' }; }
        if (key.name === 'd') {
            var s = app.suggested;
            say(app, s.calls ? 'Called ' + s.calls + ' times, working ' + s.successRate + ' percent.'
                             : 'Not called yet this season.', 'result');
            return { say: 'detail' };
        }
        if (key.name === 'Escape') { say(app, C.situationLine(app.game) + ' ' + app.suggested.text, 'result'); return { say: 'here' }; }
        return null;
    }

    function defenseKey(app, key) {
        var C = CTRL();
        if (key.name === 'Enter') {
            afterSnap(app, C.callDefense(app.game, app.suggested.call));
            return { say: 'called' };
        }
        if (key.name === 'f') { openDefensePart(app, 'front'); return { say: 'fronts' }; }
        if (key.name === 'u') { openSubList(app); return { say: 'subs' }; }
        if (key.name === 'Escape') { say(app, C.situationLine(app.game) + ' ' + app.suggested.text, 'result'); return { say: 'here' }; }
        return null;
    }

    function openFormationList(app) {
        var forms = CTRL().formations(app.game);
        var menu = U().makeMenu(forms.map(function (f) { return { id: f.id, text: f.text }; }),
                                'Formations. N for no huddle, U for substitutions, Escape to go back.');
        app.state.viewer = { kind: 'formation', menu: menu };
        tone(app, 'open');
        say(app, U().menuAnnounce(menu), 'result');
    }

    function openPlayList(app) {
        var sheet = CTRL().callSheet(app.game, app.pickedFormation);
        if (!sheet.length) { say(app, 'Nothing on the sheet for that formation here.', 'result'); promptNext(app); return; }
        var menu = U().makeMenu(sheet.map(function (p) { return { id: p.id, text: p.text }; }),
                                'The call sheet for this down and distance.');
        app.state.viewer = { kind: 'play', menu: menu };
        say(app, U().menuAnnounce(menu), 'result');
    }

    function openSubList(app) {
        var list = CTRL().substitutionList(app.game, app.pickedFormation);
        var menu = U().makeMenu(list.map(function (s, i) { return { id: i, text: s.text, sub: s }; }),
                                'On the field. Enter sends the next man in. Escape goes back.');
        app.state.viewer = { kind: 'subs', menu: menu };
        tone(app, 'open');
        say(app, U().menuAnnounce(menu), 'result');
    }

    function doSubstitution(app, item) {
        var s = item.sub;
        if (!s || !s.replacement) { say(app, 'There is nobody behind him.', 'result'); return; }
        s.player.live.benched = true;
        app.game.game.teams[app.game.coach].live.subbedSinceSnap = true;
        say(app, s.player.name + ' comes out, ' + s.replacement.name + ' goes in. That is a substitution, so they get to reset too.', 'result');
    }

    var DEF_PARTS = ['front', 'coverage', 'pressure', 'adjustment'];

    function openDefensePart(app, part) {
        var PL = app.deps.plays;
        var tables = { front: PL.FRONTS, coverage: PL.COVERAGES, pressure: PL.PRESSURES, adjustment: PL.ADJUSTMENTS };
        var table = tables[part], items = [], k;
        for (k in table) items.push({ id: k, text: table[k].name + '. ' + (table[k].say || '') });
        app.defPart = part;
        app.defCall = app.defCall || {};
        var menu = U().makeMenu(items, 'Choose a ' + part + '.');
        app.state.viewer = { kind: 'defpart', menu: menu };
        tone(app, 'open');
        say(app, U().menuAnnounce(menu), 'result');
    }

    function nextDefensePart(app, id) {
        app.defCall[app.defPart] = id;
        var i = DEF_PARTS.indexOf(app.defPart);
        if (i < DEF_PARTS.length - 1) { openDefensePart(app, DEF_PARTS[i + 1]); return; }
        var call = app.defCall;
        app.defCall = null;
        afterSnap(app, CTRL().callDefense(app.game, call));
    }

    function callPlay(app, playId, tempo) {
        var said = CTRL().callOffense(app.game, playId, tempo || 'huddle');
        app.pendingTempo = 'huddle';
        app.pickedFormation = null;
        afterSnap(app, said);
    }

    function doAdvance(app) {
        afterSnap(app, CTRL().advance(app.game));
    }

    function afterSnap(app, said) {
        emit(app, said);
        if (app.game && CTRL().pending(app.game).kind === 'over') {
            app.state.mode = 'final';
            say(app, 'Press Enter to return to the menu.', 'result');
            return;
        }
        promptNext(app);
    }

    // ---------- the one entry point from main.js ----------

    function handleKey(app, key) {
        var out = U().dispatch(app.state, key, handlers(app));
        app.out.panel([app.lastSaid]);
        return out;
    }

    function boot(app) {
        say(app, 'Accessible Football. F1 is help, F12 describes any key you press without doing it.', 'result');
        toMenu(app);
    }

    var api = { PROGRAMS: PROGRAMS, newApp: newApp, boot: boot, handleKey: handleKey,
                toMenu: toMenu, toTeam: toTeam, toPregame: toPregame, toGame: toGame,
                promptNext: promptNext, flush: flush, emit: emit, makeProgram: makeProgram, say: say };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.AF = root.AF || {};
    root.AF.screens = api;
})(typeof window !== 'undefined' ? window : globalThis);
