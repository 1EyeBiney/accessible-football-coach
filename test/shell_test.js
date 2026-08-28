// shell_test.js - Drives the whole interface without a browser.
// Loads every file index.html loads, in the same order, then sends keystrokes
// and checks what comes back. This is how the shell gets tested at all, since
// nothing visual counts as verification for the person this is built for.
//
// Covers DESIGN.md 21.1 through 21.9 as they are actually wired together, plus
// the play call flow of 16.5 and the report loop of 19.

'use strict';

var path = require('path');
var root = path.join(__dirname, '..');

// The engine and interface files attach themselves to a global AF object, the
// same way they do in the browser. ui/dom.js is loaded but never called; the
// driver supplies its own output side.
function load() {
    global.AF = {};
    ['engine/rng.js', 'engine/players.js', 'engine/plays.js', 'engine/resolve.js',
     'engine/staff.js', 'engine/game.js', 'engine/controller.js', 'engine/save.js',
     'ui/core.js', 'ui/help_text.js', 'ui/screens.js'].forEach(function (f) {
        delete require.cache[require.resolve(path.join(root, f))];
        require(path.join(root, f));
    });
    return global.AF;
}

// A stand-in for ui/dom.js's file and storage side, so the shell can be
// driven through G, Shift G, and Resume without a browser. A "file" is one
// slot, the way a coach only has one file open at a time; a picker with
// nothing saved yet cancels, the same as dismissing the real dialog.
function fakeDom() {
    var crash = {}, savedFile = null;
    return {
        saveToDisk: function (name, json) { savedFile = json; return true; },
        loadFromDisk: function (onLoaded, onCancel) {
            if (savedFile === null) { onCancel(); return; }
            onLoaded(savedFile);
        },
        crashSave: function (key, json) { crash[key] = json || null; return true; },
        crashLoad: function (key) { return crash[key] || null; },
        copyToClipboard: function () { return true; },
        announce: function () {},
        panel: function () {},
        tone: function () {},
        setMuted: function () {}
    };
}

function driver(AF, dom) {
    var spoken = [], tones = [];
    AF.dom = dom || fakeDom();
    var app = AF.screens.newApp({
        Rng: AF.Rng, players: AF.players, plays: AF.plays,
        resolve: AF.resolve, staff: AF.staff, game: AF.game
    }, {
        say: function (text, priority, source) { spoken.push({ text: text, priority: priority, source: source }); },
        tone: function (name) { tones.push(name); },
        panel: function () {}
    });
    return {
        app: app, spoken: spoken, tones: tones, dom: AF.dom,
        key: function (name, shift, ctrl) {
            AF.screens.handleKey(app, { name: name, shift: !!shift, ctrl: !!ctrl, alt: false });
            return this;
        },
        since: function (n) { return spoken.slice(n).map(function (s) { return s.text; }).join(' '); },
        all: function () { return spoken.map(function (s) { return s.text; }).join(' '); },
        count: function () { return spoken.length; }
    };
}

module.exports = function (t) {
    var AF = load();
    t.ok(AF.ui && AF.help && AF.screens && AF.controller, 'every file loads and registers itself on the global object');

    // ---------- boot into the main menu ----------
    var d = driver(AF);
    AF.screens.boot(d.app);
    t.ok(d.count() > 0, 'booting says something rather than starting in silence');
    t.ok(d.all().toLowerCase().indexOf('main menu') >= 0, 'booting lands on the main menu');
    t.eq(d.app.state.mode, 'menu', 'the mode is the menu after boot');

    // ---------- help opens, swallows keys, and closes back to context ----------
    var n = d.count();
    d.key('F1');
    t.ok(d.app.state.help !== null, 'F1 opens help');
    t.ok(d.since(n).length > 0, 'opening help says something');
    n = d.count();
    d.key('ArrowDown');
    t.ok(d.app.state.mode === 'menu', 'a key inside help does not change the game mode');
    n = d.count();
    d.key('h');
    t.ok(d.since(n).toLowerCase().indexOf('heading') >= 0, 'H moves to a heading and the heading announces itself');
    n = d.count();
    d.key('Escape');
    t.eq(d.app.state.help, null, 'Escape closes help');
    t.ok(d.since(n).indexOf('Exited help') >= 0, 'closing help says so');
    t.ok(d.since(n).toLowerCase().indexOf('main menu') >= 0, 'closing help re-announces where the coach is');

    // ---------- the keyboard explorer describes without doing ----------
    n = d.count();
    d.key('F12');
    t.ok(d.app.state.explore, 'F12 turns the explorer on');
    var modeBefore = d.app.state.mode;
    n = d.count();
    d.key('Enter');
    t.eq(d.app.state.mode, modeBefore, 'a key in explore mode does not do anything');
    t.ok(d.since(n).length > 0, 'a key in explore mode is described');
    n = d.count();
    d.key('n');
    t.ok(d.since(n).length > 0, 'every key in explore mode gets a description');
    d.key('F12');
    t.ok(!d.app.state.explore, 'F12 turns the explorer off again');

    // ---------- into a game ----------
    d.key('Enter');                       // New game
    t.eq(d.app.state.mode, 'team', 'choosing new game lands on the team choice');
    t.ok(d.all().indexOf('Riverton') >= 0, 'the programmes are described');
    var teamText = d.since(d.count() - 1);
    t.ok(!/\d/.test(teamText), 'a programme is described in words with no numbers (DESIGN.md 14.2)');
    d.key('Enter');                       // take the first programme
    t.eq(d.app.state.mode, 'pregame', 'choosing a programme lands on the pre-game screen');
    n = d.count();
    d.key('o');
    t.ok(d.since(n).indexOf('Offense') >= 0, 'O changes who calls the offense');
    d.key('o'); d.key('o');               // back round to calling it myself
    t.eq(d.app.offenseMode, 'ME', 'the delegation setting cycles back round');
    n = d.count();
    d.key('l');
    t.ok(d.since(n).indexOf('Play clock') >= 0, 'L sets the play clock');
    d.key('l'); d.key('l'); d.key('l');   // back to off
    t.eq(d.app.playClock, 'OFF', 'the play clock cycles back to off');

    d.key('Enter');                       // kick off
    t.eq(d.app.state.mode, 'game', 'the game starts');
    t.ok(d.app.game !== null, 'a controller exists');

    // ---------- the quick keys all answer ----------
    var quick = ['Tab', 'x', 'm', 't', 'r', 'c'];
    for (var qi = 0; qi < quick.length; qi++) {
        n = d.count();
        d.key(quick[qi]);
        t.ok(d.count() > n, 'the ' + quick[qi] + ' key says something rather than going quiet');
    }

    // ---------- play a whole game through the shell ----------
    var guard = 0, called = 0, answered = 0, viewersOpened = 0;
    while (d.app.state.mode !== 'final' && guard++ < 6000) {
        var step = d.app.step;
        if (d.app.state.viewer) {
            // Walk into a viewer, take something from it, and leave. The
            // substitution list deliberately stays open so a coach can make
            // several changes, so it needs an Escape to get out of.
            var wasSubs = d.app.state.viewer.kind === 'subs';
            d.key('ArrowDown');
            d.key('Enter');
            if (wasSubs && d.app.state.viewer) d.key('Escape');
            viewersOpened++;
            continue;
        }
        if (d.app.state.mode === 'halftime') { d.key('Enter'); continue; }
        if (step === 'sub-answer') { d.key(answered++ % 2 ? 'y' : 'n'); continue; }
        if (step === 'advance') { d.key('Enter'); continue; }
        if (step === 'offense-suggest') {
            called++;
            // Every so often open the formation list instead of accepting.
            if (called % 17 === 0) d.key('f');
            else if (called % 23 === 0) d.key('u');
            else d.key('Enter');
            continue;
        }
        if (step === 'defense-suggest') { d.key('Enter'); continue; }
        // Nothing pending we recognise: nudge it on.
        d.key('Enter');
    }
    t.ok(guard < 6000, 'a whole game plays through the shell without hanging');
    t.eq(d.app.state.mode, 'final', 'the game reaches the final screen');
    t.ok(called > 40, 'the coach called plenty of plays');
    t.ok(viewersOpened > 0, 'the formation and substitution lists were opened and used');
    t.ok(d.app.game.log.length > 80, 'a full game of snaps was played');

    // ---------- everything said was a real sentence ----------
    var i, s, emptyCount = 0, undef = 0;
    for (i = 0; i < d.spoken.length; i++) {
        s = d.spoken[i];
        if (typeof s.text !== 'string' || !s.text.length) emptyCount++;
        if (/undefined|NaN|\[object/.test(s.text)) undef++;
    }
    t.eq(emptyCount, 0, 'nothing spoken during a whole game was empty');
    t.eq(undef, 0, 'nothing spoken during a whole game was undefined, NaN, or an object');
    t.ok(d.spoken.length > 300, 'a whole game produced plenty to listen to');

    // Nothing spoken keeps a raw ordinal or a percent sign, because everything
    // goes through the sanitiser on the way out (CLAUDE.md).
    var rawOrdinals = d.spoken.filter(function (x) { return /\b\d(st|nd|rd|th)\b/.test(x.text); });
    t.eq(rawOrdinals.length, 0, 'no announcement kept a raw ordinal like 3rd');
    var rawPercent = d.spoken.filter(function (x) { return x.text.indexOf('%') >= 0; });
    t.eq(rawPercent.length, 0, 'no announcement kept a percent sign');

    // ---------- the final screen goes back to the menu ----------
    n = d.count();
    d.key('Tab');
    t.ok(d.since(n).length > 0, 'the final screen still answers the situation key');
    d.key('Enter');
    t.eq(d.app.state.mode, 'menu', 'Enter at the final returns to the main menu');

    // ---------- quitting asks first (DESIGN.md 21.7) ----------
    var d2 = driver(AF);
    AF.screens.boot(d2.app);
    d2.key('Enter').key('Enter').key('Enter');   // new game, first team, kick off
    t.eq(d2.app.state.mode, 'game', 'a second game starts');
    n = d2.count();
    d2.key('q');
    t.ok(d2.app.state.confirm !== null, 'Q asks before quitting');
    t.ok(d2.since(n).indexOf('confirm') >= 0, 'the confirmation says how to confirm');
    n = d2.count();
    d2.key('j');
    t.eq(d2.app.state.confirm, null, 'any other key cancels the quit');
    t.ok(d2.since(n).indexOf('cancelled') >= 0, 'cancelling says so');
    t.eq(d2.app.state.mode, 'game', 'cancelling leaves the coach in the game');
    d2.key('q');
    d2.key('y');
    t.eq(d2.app.state.mode, 'menu', 'confirming the quit goes back to the menu');

    // ---------- Escape always says where you are ----------
    var d3 = driver(AF);
    AF.screens.boot(d3.app);
    d3.key('Enter');                       // team choice
    n = d3.count();
    d3.key('Escape');
    t.ok(d3.since(n).length > 0, 'Escape from the team choice says something');
    t.eq(d3.app.state.mode, 'menu', 'Escape from the team choice goes back to the menu');
    n = d3.count();
    d3.key('Escape');
    t.ok(d3.since(n).toLowerCase().indexOf('main menu') >= 0, 'Escape at the main menu says where you are rather than going quiet');

    // ---------- a viewer keeps keys away from the game ----------
    var d4 = driver(AF);
    AF.screens.boot(d4.app);
    d4.key('Enter').key('Enter').key('Enter');
    // Get to an offense prompt.
    var g2 = 0;
    while (d4.app.step !== 'offense-suggest' && g2++ < 400) {
        if (d4.app.step === 'advance') d4.key('Enter');
        else if (d4.app.step === 'sub-answer') d4.key('n');
        else if (d4.app.step === 'defense-suggest') d4.key('Enter');
        else if (d4.app.state.mode === 'halftime') d4.key('Enter');
        else d4.key('Enter');
    }
    t.ok(d4.app.step === 'offense-suggest', 'the coach reaches an offensive call');
    var snapsBefore = d4.app.game.log.length;
    d4.key('f');
    t.ok(d4.app.state.viewer !== null, 'F opens the formation list');
    d4.key('m');    // a game key that must not reach the game while a list is open
    d4.key('t');
    d4.key('x');
    t.eq(d4.app.game.log.length, snapsBefore, 'no snap was played while a list was open');
    t.ok(d4.app.state.viewer !== null, 'the list is still open after keys it does not use');
    n = d4.count();
    d4.key('Escape');
    t.eq(d4.app.state.viewer, null, 'Escape closes the list');
    var closed = d4.since(n);
    t.ok(closed.indexOf('Closed') >= 0, 'closing a list says it closed');
    t.ok(/first|second|third|fourth/.test(closed), 'closing a list re-announces the live situation, not a remembered label');
    t.ok(closed.indexOf('Enter accepts') >= 0, 'closing a list reminds the coach what he still has to answer');

    // ---------- the keys that work everywhere really do ----------
    // These live above help and the viewers in the stack, because they are the
    // keys a coach needs most when he has lost his place (DESIGN.md 21.8).
    var d5 = driver(AF);
    AF.screens.boot(d5.app);
    d5.key('Enter').key('Enter').key('Enter');
    var g3 = 0;
    while (d5.app.step !== 'offense-suggest' && g3++ < 400) {
        if (d5.app.step === 'sub-answer') d5.key('n');
        else d5.key('Enter');
    }
    var resultLine = d5.spoken[d5.count() - 2] ? d5.spoken[d5.count() - 2].text : '';
    d5.key('f');
    t.ok(d5.app.state.viewer !== null, 'the formation list is open');
    n = d5.count();
    d5.key('Tab');
    t.ok(d5.since(n).length > 0, 'Tab answers from inside a list');
    n = d5.count();
    d5.key('c');
    t.ok(d5.since(n).length > 0, 'C answers from inside a list');
    t.ok(d5.app.state.viewer !== null, 'the quick keys do not close the list');
    n = d5.count();
    d5.key('F1');
    t.ok(d5.app.state.help !== null, 'F1 opens help from inside a list');
    n = d5.count();
    d5.key('F1');
    t.eq(d5.app.state.help, null, 'F1 closes help again');
    n = d5.count();
    d5.key('F12');
    t.ok(d5.app.state.explore, 'F12 turns the explorer on from inside a list');
    d5.key('F12');
    t.ok(!d5.app.state.explore, 'F12 turns it off again');
    t.ok(d5.app.state.viewer !== null, 'the list survived all of that');
    d5.key('Escape');

    // ---------- C repeats football, not interface chatter ----------
    var d6 = driver(AF);
    AF.screens.boot(d6.app);
    d6.key('Enter').key('Enter').key('Enter');
    var g4 = 0;
    while (d6.app.game.log.length < 3 && g4++ < 400) {
        if (d6.app.state.viewer) d6.key('Escape');
        else if (d6.app.step === 'sub-answer') d6.key('n');
        else d6.key('Enter');
    }
    d6.key('p');            // pacing, pure interface chatter
    d6.key('v');            // verbosity, likewise
    n = d6.count();
    d6.key('c');
    var repeated = d6.since(n);
    t.ok(repeated.indexOf('Pacing') < 0, 'C does not repeat the pacing setting');
    t.ok(repeated.indexOf('Verbosity') < 0, 'C does not repeat the verbosity setting');
    t.ok(repeated.length > 20, 'C repeats something of substance');

    // ---------- Shift and Caps Lock ----------
    // main.js lower-cases a single character before it reaches here, so the
    // handlers only ever see lower case with a shift flag. Shift plus H has to
    // work, because the first line of help promises it does.
    var d7 = driver(AF);
    AF.screens.boot(d7.app);
    d7.key('F1');
    d7.key('h');            // forward to the first heading
    d7.key('h');            // and the second
    n = d7.count();
    d7.key('h', true);      // shift H, back one heading
    t.ok(d7.since(n).toLowerCase().indexOf('heading') >= 0, 'Shift H moves back to the previous heading');

    // ---------- the substitution gate says why it will not let go ----------
    var d8 = driver(AF);
    AF.screens.boot(d8.app);
    d8.key('Enter').key('Enter').key('Enter');
    var g5 = 0, hitGate = false;
    while (g5++ < 3000 && d8.app.state.mode !== 'final') {
        if (d8.app.step === 'sub-answer') {
            n = d8.count();
            d8.key('Escape');
            t.ok(d8.since(n).indexOf('needs an answer') >= 0, 'the substitution gate explains itself rather than going quiet');
            t.eq(d8.app.step, 'sub-answer', 'the substitution gate does not let go until it is answered');
            d8.key('y');
            hitGate = true;
            break;
        }
        if (d8.app.state.viewer) { d8.key('Escape'); continue; }
        if (d8.app.state.mode === 'halftime') { d8.key('Enter'); continue; }
        d8.key('Enter');
    }
    t.ok(hitGate, 'a substitution was asked for at some point in the game');

    // ---------- G saves, Shift G loads it back (DESIGN.md 21.10) ----------
    var d9 = driver(AF);
    AF.screens.boot(d9.app);
    d9.key('Enter').key('Enter').key('Enter');   // new game, first team, kick off
    var g6 = 0;
    while (d9.app.game.log.length < 5 && g6++ < 400) {
        if (d9.app.state.viewer) { d9.key('Escape'); continue; }
        if (d9.app.step === 'sub-answer') { d9.key('n'); continue; }
        d9.key('Enter');
    }
    var scoreBefore = d9.app.game.game.score.slice();
    var snapsBefore = d9.app.game.log.length;
    n = d9.count();
    d9.key('g');
    t.ok(d9.since(n).indexOf('saved') >= 0, 'G says the game was saved');

    // A fresh driver, a fresh controller, sharing nothing with d9 except the
    // one saved file the fake picker hands back. d9's dom also carries d9's
    // own autosaved crash copy, which is exactly why this reaches for Load
    // (the file, item three) rather than Resume (the crash copy, item two):
    // the point of this scenario is the explicit save-to-file round trip.
    var d10 = driver(AF, d9.dom);
    AF.screens.boot(d10.app);
    t.eq(d10.app.game, null, 'the new driver starts with no game of its own');
    d10.key('ArrowDown');    // Resume
    d10.key('ArrowDown');    // Load save file
    n = d10.count();
    d10.key('Enter');
    t.eq(d10.app.state.mode, 'game', 'loading the file lands the second driver in the game');
    t.ok(d10.since(n).toLowerCase().indexOf('resumed') >= 0, 'loading announces that the game resumed');
    t.eq(d10.app.game.log.length, snapsBefore, 'the loaded game has exactly the snaps that were saved');
    t.eq(d10.app.game.game.score[0], scoreBefore[0], 'the loaded home score matches what was saved');
    t.eq(d10.app.game.game.score[1], scoreBefore[1], 'the loaded away score matches what was saved');

    // Playing on from the load reaches a real final, the same as any game.
    var g7 = 0;
    while (d10.app.state.mode !== 'final' && g7++ < 6000) {
        if (d10.app.state.viewer) { d10.key('Escape'); continue; }
        if (d10.app.step === 'sub-answer') { d10.key('n'); continue; }
        d10.key('Enter');
    }
    t.eq(d10.app.state.mode, 'final', 'a loaded game can be played all the way to its final');

    // ---------- Resume picks up the crash copy without a file ----------
    var d11 = driver(AF);
    AF.screens.boot(d11.app);
    d11.key('Enter').key('Enter').key('Enter');
    var g8 = 0;
    while (d11.app.game.log.length < 3 && g8++ < 400) {
        if (d11.app.state.viewer) { d11.key('Escape'); continue; }
        if (d11.app.step === 'sub-answer') { d11.key('n'); continue; }
        d11.key('Enter');
    }
    var snapsAtCrash = d11.app.game.log.length;
    // Nothing was saved to a file; the autosave after every decision is what
    // Resume reads.
    var d12 = driver(AF, d11.dom);
    AF.screens.boot(d12.app);
    d12.key('ArrowDown');   // Resume is the second item on the main menu
    n = d12.count();
    d12.key('Enter');
    t.eq(d12.app.state.mode, 'game', 'Resume lands in the game');
    t.eq(d12.app.game.log.length, snapsAtCrash, 'Resume picks up exactly where the crash copy left off');
    t.ok(d12.since(n).toLowerCase().indexOf('resumed') >= 0, 'Resume announces that the game resumed');

    // Note on a related finding: the accessibility auditor also flagged that
    // nothing cleared state.confirm on a load, which matters only for the
    // narrow race where a real keystroke sets a confirmation during the gap
    // between opening the native file picker and its callback firing.
    // enterLoadedGame now clears state.confirm/help/viewer defensively (the
    // fix is real and costs nothing), but that specific race needs an
    // asynchronous file picker to reproduce and this driver's fake one
    // resolves synchronously, so it is not exercised here. See REVIEW_NOTES.md.

    // ---------- loading a finished game announces the final, not a stale down and distance ----------
    var d14 = driver(AF);
    AF.screens.boot(d14.app);
    d14.key('Enter').key('Enter').key('Enter');
    var g9 = 0;
    while (d14.app.state.mode !== 'final' && g9++ < 6000) {
        if (d14.app.state.viewer) { d14.key('Escape'); continue; }
        if (d14.app.step === 'sub-answer') { d14.key('n'); continue; }
        if (d14.app.state.mode === 'halftime') { d14.key('Enter'); continue; }
        d14.key('Enter');
    }
    d14.key('g');
    var d15 = driver(AF, d14.dom);
    AF.screens.boot(d15.app);
    d15.key('ArrowDown'); d15.key('ArrowDown');   // Resume, then Load save file
    n = d15.count();
    d15.key('Enter');
    t.eq(d15.app.state.mode, 'final', 'loading a game that had already finished lands on the final screen, not the game screen');
    var finalSaid = d15.since(n);
    t.ok(finalSaid.toLowerCase().indexOf('final') >= 0, 'loading a finished game announces it as a final');
    t.ok(!/\d+(st|nd|rd|th) down/.test(finalSaid), 'loading a finished game does not read out a stale down and distance');
};
