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
    function SAVE() { return root.AF.save; }
    function DOM() { return root.AF.dom; }

    // The crash copy is one fixed key, holding at most the one run in
    // progress (DESIGN.md 21.10). It is not the real save; it exists so a
    // reload does not throw a game away by accident.
    var CRASH_KEY = 'accessible-football-crash-v1';

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

    // Only football goes into lastReport. C is the coach's only way back to a
    // line he missed, because he cannot scroll, so filling it with "Closed."
    // and "Pacing slow." would take away the key he needs most (DESIGN.md
    // 21.8).
    var REAL = { result: true, must: true, cued: true, batched: true };

    function say(app, text, priority, source) {
        if (!text) return;
        var clean = U().sanitize(text);
        priority = priority || 'result';
        var isReport = !!(REAL[priority] && !app.uiChatter);
        // Set here for the Node drivers that speak immediately; main.js sets
        // it again at speak time, which wins in the browser, so C never
        // offers a line still held behind the whistle boundary.
        if (isReport) app.state.lastReport = clean;
        app.lastSaid = clean;
        app.out.say(clean, priority, source || null, isReport);
    }

    // Wraps a bit of interface talk so it does not overwrite the last report.
    function chatter(app, text) {
        app.uiChatter = true;
        say(app, text, 'result');
        app.uiChatter = false;
    }

    // Where the coach actually is, right now, for every Escape and every
    // viewer close. A remembered noun goes stale the moment the game starts.
    function contextLine(app) {
        if (app.state.mode === 'game' && app.game) {
            var line = CTRL().situationLine(app.game);
            if (app.step === 'offense-suggest' || app.step === 'defense-suggest' || app.step === 'special-suggest') {
                return line + ' ' + (app.suggested ? app.suggested.text : '') + ' Enter accepts.';
            }
            if (app.step === 'sub-answer') return line + ' Your coordinator is still waiting on a substitution.';
            if (app.step === 'advance') return line + ' Press Enter to play on.';
            return line;
        }
        return 'You are at ' + (app.state.lastContext || 'the game') + '.';
    }

    function tone(app, name) { if (app.out.tone) app.out.tone(name); }

    // The ready-for-play boundary: everything said so far is the old play,
    // everything after belongs to the next one, and the interface plays the
    // referee whistle in the gap (ISSUES.md 2026-08-28). Optional on the out
    // object so the Node test drivers that predate it keep working.
    function boundary(app) { if (app.out.boundary) app.out.boundary(); }

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
        app.state.lastContext = 'the game';
        flush(app);
        boundary(app);
        promptNext(app);
    }

    // ---------- saving and loading a run (DESIGN.md 21.10) ----------

    // Best effort and silent: a crash copy that cannot be written is not
    // something to interrupt a game to complain about, and the real save
    // (the file on disk) is what the coach actually relies on.
    function autosave(app) {
        var S = SAVE(), dom = DOM();
        if (!S || !dom || !app.game) return;
        try { dom.crashSave(CRASH_KEY, S.serialize(app.game)); } catch (e) { /* best effort */ }
    }

    function clearCrashSave() {
        var dom = DOM();
        if (dom) dom.crashSave(CRASH_KEY, '');
    }

    // Rebuilds the game and interface state around a loaded controller. Only
    // the controller comes back from the file; every UI-navigation detail
    // (which submenu was open, a formation half-picked) resets to the top of
    // the current decision, which is exactly what the controller's own
    // pending() already describes.
    function enterLoadedGame(app, controller) {
        var C = CTRL();
        app.game = controller;
        app.chosen = { home: controller.game.teams[0], away: controller.game.teams[1] };
        app.offenseMode = controller.offenseMode;
        app.defenseMode = controller.defenseMode;
        app.playClock = controller.playClock;
        app.reportThreshold = controller.reportThreshold;
        app.state.verbosity = controller.verbosity;
        app.state.mode = controller.over ? 'final' : 'game';
        app.step = null;
        app.pickedFormation = null;
        app.pendingTempo = 'huddle';
        app.defCall = null;
        app.state.lastContext = 'the game';
        // A load replaces whatever screen the coach was on. Any confirmation,
        // help, or open list from before it belongs to a game that may no
        // longer exist and must not swallow the coach's next key (the same
        // reason Q clears state.help and state.viewer when it quits, below).
        app.state.confirm = null;
        app.state.help = null;
        app.state.viewer = null;
        if (controller.over) {
            var fin = C.final(controller);
            say(app, 'Resumed. Final. ' + fin.line + '.', 'result');
            fin.review.forEach(function (line) { say(app, line, 'batched'); });
            say(app, 'Press Enter to return to the menu.', 'batched');
        } else {
            say(app, 'Resumed. ' + C.situationLine(controller), 'result');
            boundary(app);
            promptNext(app);
        }
    }

    // The picker and the crash copy both finish outside the normal key
    // press, so nothing is waiting to drain the queue the way main.js does
    // after every key. AF.main.announceNow() is the same drain-and-speak the
    // pacing timer uses for the same reason, exposed for this one other
    // caller (main.js).
    function speakNow() {
        if (root.AF.main && root.AF.main.announceNow) root.AF.main.announceNow();
    }

    // The shared tail of both G and Shift G, and of the menu's Resume and
    // Load: open the picker, or read the crash copy, and either announce the
    // game as it stood or explain why it could not be loaded. state.loading
    // keeps the pacing timer and the play clock from firing blind while the
    // native dialog has the operating system's focus, not the page's.
    function loadFromFile(app) {
        var dom = DOM(), S = SAVE();
        if (!dom || !S) { say(app, 'Loading is not available.', 'result'); return; }
        // Guards a keystroke that lands between setting the flag below and
        // the native dialog actually taking focus from repeating the file
        // picker call and opening a second one.
        if (app.state.loading) { say(app, 'Already opening the file picker.', 'result'); return; }
        chatter(app, 'Opening your file picker.');
        try {
            app.state.loading = true;
            dom.loadFromDisk(function (text) {
                app.state.loading = false;
                finishLoad(app, text, 'the file');
                speakNow();
            }, function () {
                app.state.loading = false;
                say(app, 'Cancelled. ' + contextLine(app), 'result');
                speakNow();
            }, function () {
                app.state.loading = false;
                say(app, 'Could not read that file. ' + contextLine(app), 'result');
                speakNow();
            });
        } catch (e) {
            app.state.loading = false;
            say(app, 'Could not open the file picker. ' + contextLine(app), 'result');
        }
    }

    function loadFromCrash(app) {
        var dom = DOM(), S = SAVE();
        if (!dom || !S) { say(app, 'Loading is not available.', 'result'); return; }
        var text = dom.crashLoad(CRASH_KEY);
        if (!text) { say(app, 'There is no crash copy to resume.', 'result'); return; }
        finishLoad(app, text, 'the crash copy');
    }

    // Shared by G on the game screen and G on the final screen: a finished
    // game is still a run worth keeping, if only to hear the postgame staff
    // review again later.
    function saveToFile(app) {
        var S = SAVE(), dom = DOM(), wrote = false;
        if (S && dom) {
            try { wrote = dom.saveToDisk('accessible-football-save.json', S.serialize(app.game)); }
            catch (e) { wrote = false; }
        }
        say(app, wrote ? 'Game saved to a file.' : 'Could not save the game to a file.', 'result');
    }

    function finishLoad(app, text, source) {
        var S = SAVE(), controller;
        try { controller = S.deserialize(app.deps, text); }
        catch (e) {
            say(app, 'Could not read ' + source + '. It may not be an Accessible Football save file. ' + contextLine(app), 'result');
            return;
        }
        enterLoadedGame(app, controller);
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
            // Nothing left to resume once the game has a final.
            clearCrashSave();
            // Batched, so it sorts behind the postgame review rather than in
            // front of it. Spoken first, it invites the coach to press Enter
            // and lose the verdicts on his own assistants.
            say(app, 'Press Enter to return to the menu.', 'batched');
            return;
        }
        // The crash copy, refreshed at every decision point so a reload never
        // loses more than the current snap (DESIGN.md 21.10).
        autosave(app);
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
            // A delegated side, the other team's snap, or a kneel-out. The
            // coach presses spacebar, or the pacing timer does it for him.
            app.step = 'advance';
            if (app.state.pacing === 'manual') say(app, 'Press the spacebar to play on.', 'result');
            return;
        }
        if (p.kind === 'special') {
            var sc = C.specialTeamsChoices(app.game);
            app.step = 'special-suggest';
            app.suggested = sc;
            say(app, sc.text + ' Enter accepts, or F for your other options.', 'result', 'ST');
            return;
        }
        var side = p.kind === 'offense' ? 'offense' : 'defense';
        var s = C.suggestion(app.game, side);
        app.step = side === 'offense' ? 'offense-suggest' : 'defense-suggest';
        app.suggested = s;
        // Real defenses match personnel: before the coach's own defensive
        // call, say what the offense is showing, which is exactly what the
        // engine's own coordinator is handed (DESIGN.md 16.5, ISSUES.md
        // 2026-08-28 on defensive awareness).
        if (side === 'defense' && C.offenseShows) say(app, C.offenseShows(app.game), 'result');
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
        var kind = app.state.viewer ? app.state.viewer.kind : null;
        app.state.viewer = null;
        tone(app, 'close');
        // Escape from the call sheet goes back to the formation list, not out
        // of the flow altogether (DESIGN.md 16.5).
        if (kind === 'play') { openFormationList(app); return; }
        chatter(app, 'Closed.');
        say(app, contextLine(app), 'result');
    }

    // ---------- key handling ----------

    // The handlers are the interceptor stack of DESIGN.md 21.2, in order. Each
    // returns an object when it handled the key and null when it did not, and
    // an active layer swallows a key it does not want rather than letting it
    // fall through to the game.
    // The keys that reach the coach from anywhere, including from inside a
    // list or from help. These are the ones he needs most when he has lost his
    // place, and help calls them the keys that work everywhere, so they have
    // to actually work everywhere (DESIGN.md 21.8).
    function globalKey(app, state, key) {
        if (key.name === 'F1') {
            if (state.help) {
                state.help = null;
                tone(app, 'close');
                chatter(app, 'Exited help.');
                say(app, contextLine(app), 'result');
                return { say: 'closed' };
            }
            state.help = U().makeHelp(H().helpFor(exploreMode(state)), 'Help');
            tone(app, 'open');
            chatter(app, U().helpAnnounce(state.help));
            return { say: 'help' };
        }
        if (key.name === 'F12') {
            state.explore = true;
            chatter(app, 'Keyboard explorer on. Every key you press is described and nothing happens. F12 turns it off.');
            return { say: 'explore' };
        }
        if (key.name === 'c') { say(app, state.lastReport || 'Nothing said yet.', 'result'); return { say: 'repeat' }; }
        if (key.name === 'p') { chatter(app, U().cyclePacing(state)); return { say: 'pacing' }; }
        if (key.name === 'v') {
            var vsay = U().cycleVerbosity(state);
            if (app.game) CTRL().setVerbosity(app.game, state.verbosity);
            chatter(app, vsay);
            return { say: 'verbosity' };
        }
        if (key.name === 'Tab' && key.shift) {
            // The seed is how a coach reports a bug from play: it replays the
            // whole game (ISSUES.md 2026-08-28). Digits on purpose: a seed is
            // a number to write down, not prose, and the sanitiser leaves
            // numbers this large alone.
            say(app, app.game ? 'Seed ' + app.game.game.rng.seed + '.'
                              : 'No game running, so there is no seed.', 'result');
            return { say: 'seed' };
        }
        if (key.name === 'Tab') {
            say(app, app.game ? CTRL().situationLine(app.game) : contextLine(app), 'result');
            return { say: 'status' };
        }
        if (key.name === 'q') {
            chatter(app, U().askConfirm(state, 'Quit this game and go back to the menu?', function () {
                app.game = null; state.help = null; state.viewer = null; toMenu(app);
            }));
            return { say: 'quit' };
        }
        return null;
    }

    function handlers(app) {
        return {
            global: function (state, key) { return globalKey(app, state, key); },
            confirm: function (state, key) {
                var r = U().resolveConfirm(state, key);
                if (r.action) r.action();
                if (r.say) say(app, r.say, 'result');
                return { say: r.say || null };
            },
            explore: function (state, key) {
                if (key.name === 'F12') {
                    state.explore = false;
                    chatter(app, 'Keyboard explorer off.');
                    say(app, contextLine(app), 'result');
                    return { say: 'off' };
                }
                chatter(app, H().getKeyDescription(key.name, key.shift, key.ctrl, exploreMode(state), app.step));
                return { say: 'described' };
            },
            help: function (state, key) {
                var help = state.help;
                if (key.name === 'Escape' || key.name === 'Enter') {
                    state.help = null;
                    tone(app, 'close');
                    chatter(app, 'Exited help.');
                    say(app, contextLine(app), 'result');
                    return { say: 'closed' };
                }
                if (key.name === 'ArrowDown') { chatter(app, U().helpMove(help, 1)); return { say: 'moved' }; }
                if (key.name === 'ArrowUp') { chatter(app, U().helpMove(help, -1)); return { say: 'moved' }; }
                if (key.name === 'h') { chatter(app, U().helpHeading(help, key.shift ? -1 : 1)); return { say: 'heading' }; }
                return null;
            },
            viewer: function (state, key) {
                var v = state.viewer;
                if (key.name === 'Escape') { closeViewer(app); return { say: 'closed' }; }
                // DESIGN.md 16.5 puts both of these at the formation prompt.
                if (v.kind === 'formation' && key.name === 'n') {
                    app.pendingTempo = 'nohuddle';
                    state.viewer = null;
                    chatter(app, 'No huddle. Same personnel, and they do not get a clean substitution.');
                    if (app.suggested && app.suggested.play) callPlay(app, app.suggested.play.id, 'nohuddle');
                    return { say: 'nohuddle' };
                }
                if (v.kind === 'formation' && key.name === 'u') {
                    var pick = U().menuSelect(v.menu);
                    app.pickedFormation = pick ? pick.id : app.pickedFormation;
                    state.viewer = null;
                    openSubList(app);
                    return { say: 'subs' };
                }
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
        if (v.kind === 'special') {
            app.state.viewer = null;
            tone(app, 'close');
            afterSnap(app, CTRL().callSpecial(app.game, item.id));
            return { say: 'special' };
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
        // The keys that work everywhere are handled by the global layer above,
        // so that they also reach the coach from inside a list or from help.
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
            if (item.id === 'RESUME') { loadFromCrash(app); return { say: 'resume' }; }
            if (item.id === 'LOAD') { loadFromFile(app); return { say: 'load' }; }
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
            boundary(app);
            promptNext(app);
            return { say: 'chosen' };
        }
        return null;
    }

    function finalKey(app, state, key) {
        if (key.name === 'Enter') { app.game = null; toMenu(app); return { say: 'menu' }; }
        if (key.name === 'Escape') { say(app, 'The game is over. Press Enter for the menu.', 'result'); return { say: 'here' }; }
        if (key.name === 'Tab') { say(app, CTRL().final(app.game).line, 'result'); return { say: 'score' }; }
        if (key.name === 'g' && !key.shift) { saveToFile(app); return { say: 'save' }; }
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
            if (key.shift) { loadFromFile(app); return { say: 'load' }; }
            saveToFile(app);
            return { say: 'save' };
        }

        if (app.step === 'sub-answer') return subAnswerKey(app, key);
        if (app.step === 'advance') {
            if (key.name === 'Enter') { doAdvance(app); return { say: 'advance' }; }
            if (key.name === 'Escape') { say(app, contextLine(app), 'result'); return { say: 'here' }; }
            return null;
        }
        if (app.step === 'offense-suggest') return offenseKey(app, key);
        if (app.step === 'defense-suggest') return defenseKey(app, key);
        if (app.step === 'special-suggest') return specialKey(app, key);
        if (key.name === 'Escape') { say(app, contextLine(app), 'result'); return { say: 'here' }; }
        return null;
    }

    function subAnswerKey(app, key) {
        var map = { y: 'yes', n: 'no', l: 'change', k: 'dead' };
        if (key.name === 'Escape') {
            say(app, 'Your coordinator needs an answer first. Y takes him out now, N leaves him in, ' +
                     'L at the next personnel change, K at the next dead ball.', 'must');
            return { say: 'still waiting' };
        }
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
        if (key.name === 'Escape') { say(app, contextLine(app), 'result'); return { say: 'here' }; }
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
        if (key.name === 'Escape') { say(app, contextLine(app), 'result'); return { say: 'here' }; }
        return null;
    }

    // Fourth down, or after a score: the same Enter-accepts, F-for-more
    // grammar as offense and defense (DESIGN.md 8.4).
    function specialKey(app, key) {
        var C = CTRL();
        if (key.name === 'Enter') {
            afterSnap(app, C.callSpecial(app.game, app.suggested.recommendation.toUpperCase()));
            return { say: 'called' };
        }
        if (key.name === 'f') { openSpecialList(app); return { say: 'special-list' }; }
        if (key.name === 'Escape') { say(app, contextLine(app), 'result'); return { say: 'here' }; }
        return null;
    }

    function openSpecialList(app) {
        var choices = CTRL().specialTeamsChoices(app.game);
        var menu = U().makeMenu(choices.options.map(function (o) { return { id: o.id, text: o.text }; }),
                                'Your options. Escape goes back.');
        app.state.viewer = { kind: 'special', menu: menu };
        tone(app, 'open');
        say(app, U().menuAnnounce(menu), 'result');
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
        if (!sheet.length) {
            chatter(app, 'Nothing on the sheet for that formation on this down. Pick another.');
            openFormationList(app);
            return;
        }
        var menu = U().makeMenu(sheet.map(function (p) { return { id: p.id, text: p.text }; }),
                                'The call sheet for this down and distance. Escape goes back to the formations.');
        app.state.viewer = { kind: 'play', menu: menu };
        tone(app, 'open');
        chatter(app, U().menuAnnounce(menu));
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
        if (s.player.live.benched) { say(app, s.player.name + ' is already off.', 'result'); return; }
        s.player.live.benched = true;
        var onOffense = app.game.game.off === app.game.coach;
        app.game.game.teams[app.game.coach].live.subbedSinceSnap = true;
        say(app, s.player.name + ' comes out, ' + s.replacement.name + ' goes in.' +
                 (onOffense ? ' That is a substitution, so they get to reset too.' : ''), 'result');
        // Rebuild, so arrowing back to the same name does not offer him again.
        openSubList(app);
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
            say(app, 'Press Enter to return to the menu.', 'batched');
            return;
        }
        boundary(app);
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
