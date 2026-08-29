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
        if (d.app.step === 'toss-call') { d.key('h'); continue; }
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
        if (d4.app.step === 'toss-call') { d4.key('h'); continue; }
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
        if (d5.app.step === 'toss-call') { d5.key('h'); continue; }
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
        if (d6.app.step === 'toss-call') { d6.key('h'); continue; }
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
        if (d8.app.step === 'toss-call') { d8.key('h'); continue; }
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
        if (d9.app.step === 'toss-call') { d9.key('h'); continue; }
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
        if (d10.app.step === 'toss-call') { d10.key('h'); continue; }
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
        if (d11.app.step === 'toss-call') { d11.key('h'); continue; }
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
    // A load brings the saved settings back, and pacing changes whether the
    // game advances on its own. Saying which settings came back is the "no
    // silent changes to values the user is not on" rule applied to a load
    // (found by the audit: pacing used to change under him in silence).
    var resumedLine = d12.since(n).toLowerCase();
    t.ok(resumedLine.indexOf('pacing') >= 0, 'and says what pacing it came back on');
    t.ok(resumedLine.indexOf('play hints') >= 0, 'and whether the play hints are on');
    t.ok(resumedLine.indexOf('offense:') >= 0, 'and who is calling each side');

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
        if (d14.app.step === 'toss-call') { d14.key('h'); continue; }
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

    // ---------- F opens the fourth down options, same grammar as offense and defense ----------
    var d16 = driver(AF);
    AF.screens.boot(d16.app);
    d16.key('Enter').key('Enter').key('Enter');
    var g10 = 0;
    while (d16.app.step !== 'special-suggest' && d16.app.state.mode !== 'final' && g10++ < 6000) {
        if (d16.app.step === 'toss-call') { d16.key('h'); continue; }
        if (d16.app.state.viewer) { d16.key('Escape'); continue; }
        if (d16.app.step === 'sub-answer') { d16.key('n'); continue; }
        if (d16.app.state.mode === 'halftime') { d16.key('Enter'); continue; }
        d16.key('Enter');
    }
    if (d16.app.step === 'special-suggest') {
        t.eq(d16.app.game.game.down, 4, 'the special-teams step really is the coach\'s own fourth down');
        n = d16.count();
        d16.key('f');
        t.ok(d16.app.state.viewer !== null, 'F opens a list of options on fourth down');
        t.ok(d16.since(n).length > 0, 'opening the list says something rather than going quiet');
        var opts = d16.app.state.viewer.menu.items;
        t.ok(opts.length >= 2, 'the fourth down list has more than one choice on it');
        d16.key('ArrowDown');   // move off the first item deliberately
        n = d16.count();
        d16.key('Enter');
        t.eq(d16.app.state.viewer, null, 'choosing from the fourth down list closes it');
        t.ok(d16.app.state.mode === 'game' || d16.app.state.mode === 'final', 'choosing from the list moves the game on');
    } else {
        t.ok(false, 'a full game never reached a fourth down the coach faced, which should not happen inside six thousand snaps');
    }

    // ---------- a key with no meaning on fourth down is reported, not silently swallowed ----------
    // Found by the accessibility auditor: a key like D, which means
    // something on offense, reaches specialKey on a fourth down and is not
    // handled there. main.js's own unhandledLine() is what turns that into
    // a real "does nothing here" for a live coach; this checks the contract
    // handleKey owes it, since main.js itself is never loaded by this driver.
    var d17 = driver(AF);
    AF.screens.boot(d17.app);
    d17.key('Enter').key('Enter').key('Enter');
    var g11 = 0;
    while (d17.app.step !== 'special-suggest' && d17.app.state.mode !== 'final' && g11++ < 6000) {
        if (d17.app.step === 'toss-call') { d17.key('h'); continue; }
        if (d17.app.state.viewer) { d17.key('Escape'); continue; }
        if (d17.app.step === 'sub-answer') { d17.key('n'); continue; }
        if (d17.app.state.mode === 'halftime') { d17.key('Enter'); continue; }
        d17.key('Enter');
    }
    if (d17.app.step === 'special-suggest') {
        var raw = AF.screens.handleKey(d17.app, { name: 'd', shift: false, ctrl: false, alt: false });
        t.eq(raw.swallowed, false, 'a key with no meaning on fourth down is not swallowed, so main.js\'s own fallback can report it');
        t.eq(raw.say, null, 'specialKey itself says nothing for a key it does not recognise, leaving the announcement to that fallback');
    }

    // ---------- F12 describes F correctly for the step the coach is actually in ----------
    // Also found by the auditor: the explorer was mode-aware but not
    // step-aware, so F on a fourth-down suggestion described the offensive
    // formation list, which is not what it does there.
    var d18 = driver(AF);
    AF.screens.boot(d18.app);
    d18.key('Enter').key('Enter').key('Enter');
    var g12 = 0;
    while (d18.app.step !== 'special-suggest' && d18.app.state.mode !== 'final' && g12++ < 6000) {
        if (d18.app.step === 'toss-call') { d18.key('h'); continue; }
        if (d18.app.state.viewer) { d18.key('Escape'); continue; }
        if (d18.app.step === 'sub-answer') { d18.key('n'); continue; }
        if (d18.app.state.mode === 'halftime') { d18.key('Enter'); continue; }
        d18.key('Enter');
    }
    if (d18.app.step === 'special-suggest') {
        d18.key('F12');
        n = d18.count();
        d18.key('f');
        var described = d18.since(n).toLowerCase();
        t.ok(described.indexOf('fourth down') >= 0 || described.indexOf('options') >= 0,
             'F12 then F on a fourth down describes the fourth down options list, not the formation list');
        t.ok(described.indexOf('formation list') < 0, 'F12 then F on a fourth down does not describe the offensive formation list');
    }

    // ---------- the whistle boundary, the seed key, and the defensive look ----------
    // (ISSUES.md 2026-08-28.) The out object gains an optional boundary
    // callback: screens must place it between a play's result and the next
    // play's prompt so main.js can put the referee whistle in the gap.
    var events = [];
    var d19 = driver(AF);
    d19.app.out.boundary = function (kind) { events.push('[boundary ' + (kind || 'whistle') + ']'); };
    d19.app.out.lead = function (kind) { events.push('[lead ' + (kind || 'snap') + ']'); };
    var origSay = d19.app.out.say;
    d19.app.out.say = function (text, priority, source) {
        events.push(text);
        origSay(text, priority, source);
    };
    AF.screens.boot(d19.app);
    d19.key('Enter').key('Enter').key('Enter');
    t.ok(events.indexOf('[boundary whistle]') >= 0, 'entering the game places a whistle boundary before the first prompt');

    // T means tails at the toss, not tendencies: the review caught the info
    // key eating the documented toss call, so the regression test presses T,
    // never H.
    t.eq(d19.app.step, 'toss-call', 'the game opens at the toss call');
    var nT = d19.count();
    d19.key('t');
    t.ok(!d19.app.game.game.pendingToss, 'T calls tails and the toss resolves');
    t.ok(d19.since(nT).indexOf('comes up') >= 0, 'and the coin is announced');

    // Play a stretch of snaps; every one that produced a result and a next
    // prompt must have the chain: result, whistle boundary, down and
    // distance, set boundary, then the rest of the prompt.
    var g19 = 0, sawSnap = false;
    while (d19.app.state.mode === 'game' && g19++ < 120) {
        if (d19.app.step === 'toss-call') { d19.key('h'); continue; }
        events.length = 0;
        if (d19.app.state.viewer) { d19.key('Escape'); continue; }
        if (d19.app.step === 'sub-answer') { d19.key('n'); continue; }
        var stepBefore = d19.app.step;
        d19.key('Enter');
        if (d19.app.state.mode !== 'game') break;
        if ((stepBefore === 'offense-suggest' || stepBefore === 'defense-suggest') &&
            (d19.app.step === 'offense-suggest' || d19.app.step === 'defense-suggest')) {
            sawSnap = true;
            var b = events.indexOf('[boundary whistle]');
            var s19 = events.indexOf('[boundary set]');
            var ld = events.indexOf('[lead snap]');
            t.ok(b > 0, 'a snap places the whistle boundary after the result, not before it');
            t.ok(s19 > b + 1, 'the down and distance sits between the whistle and the set tone');
            t.ok(/at (our own|their|the fifty)/.test(events[s19 - 1]),
                 'and the line before the set tone is the down and distance');
            t.ok(s19 < events.length - 1, 'the rest of the prompt comes after the set tone');
            // The snap cue is a lead, not a boundary: it is owed before the
            // result rather than after it, so it lands ahead of everything
            // the snap produced (ISSUES.md, from play).
            t.eq(ld, 0, 'the snap cue is the first thing a committed call produces');
            t.ok(ld < b, 'and it comes before the whistle that ends the play');
            break;
        }
        if (d19.app.state.mode === 'halftime') { d19.key('Enter'); }
    }
    t.ok(sawSnap, 'the driver reached a snap with a result and a following prompt');

    // Shift Tab reads the seed as a number a coach can write down.
    var n19 = d19.count();
    d19.key('Tab', true);
    var seedLine = d19.since(n19);
    t.ok(/Seed \d+/.test(seedLine), 'Shift Tab speaks the seed as digits');
    t.eq(String(d19.app.game.game.rng.seed), (seedLine.match(/Seed (\d+)/) || [])[1],
         'and it is the seed this game was built from');

    // Before a defensive call, the coach hears the personnel the offense is
    // showing, which is the same look chooseDefense is handed.
    var d20 = driver(AF);
    AF.screens.boot(d20.app);
    d20.key('Enter').key('Enter').key('Enter');
    var g20 = 0, sawDefLook = false;
    while (d20.app.state.mode === 'game' && g20++ < 400) {
        if (d20.app.step === 'toss-call') { d20.key('h'); continue; }
        if (d20.app.state.viewer) { d20.key('Escape'); continue; }
        if (d20.app.step === 'sub-answer') { d20.key('n'); continue; }
        if (d20.app.state.mode === 'halftime') { d20.key('Enter'); continue; }
        var m = d20.count();
        d20.key('Enter');
        if (d20.app.step === 'defense-suggest') {
            var prompt = d20.since(m).toLowerCase();
            if (prompt.indexOf('personnel') >= 0) { sawDefLook = true; break; }
        }
    }
    t.ok(sawDefLook, 'a defensive prompt says what personnel the offense is showing');

    // After a turnover, the last formation seen belongs to the coach's own
    // offense; reporting it as the opponent's would be a false claim spoken
    // as fact (found by the whistle audit). White-box on purpose: driving a
    // real interception on demand is not deterministic, the field logic is.
    var C20 = AF.controller, g20b = d20.app.game;
    g20b.lastOffFormation = 'SPREAD';
    g20b.lastOffTeam = g20b.game.off;
    t.ok(C20.offenseShows(g20b).indexOf('personnel') > 4,
         'a look at the team that has the ball now is reported');
    g20b.lastOffTeam = 1 - g20b.game.off;
    t.eq(C20.offenseShows(g20b), 'No look at their personnel yet.',
         'a look at the other team, as after a turnover, is never reported as a look at this one');

    // ---------- Z, I, and the keys that must always answer ----------
    // (ISSUES.md, from play.) Z is the mirror of X: what they had on the
    // field. It answers on both sides of the ball and never says nothing.
    var nz = d20.count();
    d20.key('z');
    var zLine = d20.since(nz);
    t.ok(zLine.length > 0, 'Z always answers');
    t.ok(/they|look/i.test(zLine), 'and what it says is about the other team');
    t.ok(!/undefined/.test(zLine), 'Z never speaks undefined');

    // S is the key that always has the play. Z just overwrote the C repeat
    // buffer, which is exactly the situation the key exists for.
    var ns = d20.count();
    d20.key('s');
    var sLine = d20.since(ns);
    t.ok(sLine.length > 0, 'S answers after Z has spoken');
    t.ok(/against|for |Incomplete|Sack|Penalty|kickoff|punt|field goal|Scramble|Thrown|Dropped/i.test(sLine),
         'and what it says is football that happened, not a report about the other team');
    d20.key('c');
    t.ok(true, 'and C still repeats without throwing');

    // The same white-box guard Z shares with the defensive look: a unit seen
    // on the other side of a change of possession is not a look at this one.
    g20b.lastRunFront = 'NICKEL';
    g20b.lastDefTeam = 1 - g20b.game.off;
    if (g20b.game.off === g20b.coach) {
        t.ok(/nickel/i.test(C20.opponentUnit(g20b)), 'on offense Z names the front they actually ran');
        g20b.lastDefTeam = g20b.game.off;
        t.eq(C20.opponentUnit(g20b), 'No look at their defense yet.',
             'and a front from before a change of possession is not reported as theirs now');
    } else {
        t.ok(/personnel|yet/.test(C20.opponentUnit(g20b)), 'on defense Z reports their offense');
        g20b.lastOffFormation = null;
        t.eq(C20.opponentUnit(g20b), 'No look at their offense yet.',
             'and with nothing seen it says so rather than guessing');
    }

    // I turns the hints off, and it is independent of V: a coach can keep
    // the full play by play and stop being taught.
    var d21 = driver(AF);
    AF.screens.boot(d21.app);
    d21.key('Enter').key('Enter').key('Enter');
    t.eq(d21.app.state.hints, 'on', 'play hints start on');
    var ni = d21.count();
    d21.key('i');
    t.eq(d21.app.state.hints, 'off', 'I turns them off');
    t.ok(/hints off/i.test(d21.since(ni)), 'and says so');
    t.eq(d21.app.game.hints, 'off', 'the controller keeps its own mirror, so a save carries it');
    t.eq(d21.app.state.verbosity, 'full', 'and turning hints off does not touch verbosity');
    d21.key('i');
    t.eq(d21.app.state.hints, 'on', 'I turns them back on');

    // And the hint actually leaves the spoken prompt. Two drivers play the
    // same game, one with hints on and one with them off, and the offensive
    // prompt is compared word for word: the concept's description is the
    // only difference, and nothing else about the call changes.
    function promptAt(hints) {
        var d = driver(AF);
        AF.screens.boot(d.app);
        d.key('Enter').key('Enter');
        if (hints === 'off') d.key('i');
        // The pre-game screen mixes the clock into the seed, so the two runs
        // have to be pinned to the same game to be comparable at all.
        d.app.pregameSeed = 4242;
        d.key('Enter');
        var guard = 0;
        while (d.app.state.mode === 'game' && guard++ < 400) {
            if (d.app.step === 'toss-call') { d.key('h'); continue; }
            if (d.app.state.viewer) { d.key('Escape'); continue; }
            if (d.app.step === 'sub-answer') { d.key('n'); continue; }
            if (d.app.state.mode === 'halftime') { d.key('Enter'); continue; }
            if (d.app.step === 'offense-suggest') {
                var sug = AF.controller.suggestion(d.app.game, 'offense');
                if (sug && sug.describe) {
                    var m = d.count();
                    d.key('x');                    // any info key, to re-read nothing
                    return { prompt: d.spoken.filter(function (s) {
                                 return s.source === 'OC' && /Enter accepts/.test(s.text);
                             }).pop(), describe: sug.describe, seed: d.app.game.game.rng.seed };
                }
            }
            d.key('Enter');
        }
        return null;
    }
    var pOn = promptAt('on'), pOff = promptAt('off');
    t.ok(pOn && pOn.prompt, 'a game with hints on reaches an offensive prompt');
    t.ok(pOff && pOff.prompt, 'and so does one with hints off');
    if (pOn && pOff && pOn.prompt && pOff.prompt) {
        t.eq(pOn.seed, pOff.seed, 'the two games are the same game, so the prompts are comparable');
        t.ok(pOn.prompt.text.indexOf(pOn.describe) >= 0, 'with hints on the prompt carries the concept description');
        t.ok(pOff.prompt.text.indexOf(pOff.describe) < 0, 'with hints off it does not');
        t.eq(pOff.prompt.text, pOn.prompt.text.replace(' ' + pOn.describe, ''),
             'and the description is the only difference: the call itself is untouched');
    } else {
        t.ok(false, 'both prompts are needed to compare');
        t.ok(false, '(placeholder)');
        t.ok(false, '(placeholder)');
        t.ok(false, '(placeholder)');
    }

    // ---------- A: how players are announced ----------
    var d22 = driver(AF);
    AF.screens.boot(d22.app);
    d22.key('Enter').key('Enter').key('Enter');
    t.eq(d22.app.state.naming, 'both', 'players are announced by position and name to begin with');
    var na = d22.count();
    d22.key('a');
    t.eq(d22.app.state.naming, 'position', 'A moves on to position only');
    t.ok(/position only/i.test(d22.since(na)), 'and says which setting it landed on');
    t.eq(d22.app.game.naming, 'position', 'the controller keeps its mirror, so a save carries it');
    t.eq(d22.app.game.game.naming, 'position', 'and the game carries it, which is what a snap reads');
    d22.key('a');
    t.eq(d22.app.state.naming, 'name', 'then name only');
    d22.key('a');
    t.eq(d22.app.state.naming, 'both', 'and wraps back round');

    // The mode reaches what is actually spoken, and reaches lines already in
    // the log: a coach who presses A hears the change on the next line, not
    // on the next snap.
    var g22 = 0, playLine = null;
    while (d22.app.state.mode === 'game' && g22++ < 400) {
        if (d22.app.step === 'toss-call') { d22.key('h'); continue; }
        if (d22.app.state.viewer) { d22.key('Escape'); continue; }
        if (d22.app.step === 'sub-answer') { d22.key('n'); continue; }
        if (d22.app.state.mode === 'halftime') { d22.key('Enter'); continue; }
        // Not just any snap: one whose events actually name somebody. A
        // false start or a clean pocket names nobody, so all three settings
        // would read it identically and the check would pass vacuously.
        var logged = d22.app.game.game.log;
        var found = null, li22;
        for (li22 = logged.length - 1; li22 >= 0; li22--) {
            var en = logged[li22];
            if (en.kind === 'play' && en.res && en.res.events &&
                en.res.events.some(function (e) { return e.tmpl && e.refs && e.refs.length; })) {
                found = en; break;
            }
        }
        if (found) { playLine = found; break; }
        d22.key('Enter');
    }
    t.ok(playLine !== null, 'the driver reached a snap that named somebody');
    if (playLine) {
        var C22 = AF.controller, ctrl22 = d22.app.game;
        C22.setNaming(ctrl22, 'both');
        var sBoth = C22.renderEntry(ctrl22, playLine);
        C22.setNaming(ctrl22, 'position');
        var sPos = C22.renderEntry(ctrl22, playLine);
        C22.setNaming(ctrl22, 'name');
        var sName = C22.renderEntry(ctrl22, playLine);
        t.ok(sBoth !== sPos && sPos !== sName && sBoth !== sName,
             'one line already in the log reads three different ways');
        t.ok(sBoth.length > sPos.length && sBoth.length > sName.length,
             'and position and name together is the longest of the three');
        // The tail of the line is the matchups, and it has to follow the
        // setting too: re-reading the body but not the tail would be worse
        // than not re-reading at all.
        t.ok(/\(/.test(sBoth) && /\(/.test(sName), 'the line carries its matchups in both modes');
        t.ok(sBoth.slice(sBoth.indexOf('(')) !== sName.slice(sName.indexOf('(')),
             'and the matchups are named by the setting, not baked in when the snap resolved');
        C22.setNaming(ctrl22, 'both');
    } else {
        t.ok(false, '(placeholder)'); t.ok(false, '(placeholder)');
        t.ok(false, '(placeholder)'); t.ok(false, '(placeholder)');
    }

    // ---------- the keys the help promises ----------
    // documentedKeys was written so a test could check that nothing is
    // described in one place and missing from another, and nothing called it.
    // Every key the game screen actually handles must reach a real
    // description rather than the "does nothing here" fallback, because the
    // keyboard explorer is how a learner finds out what a key is for.
    var H = AF.help;
    var GAME_KEYS = ['Tab', 'x', 'z', 's', 'm', 't', 'b', 'r', ' ', 'o', 'e', 'g',
                     'c', 'p', 'v', 'i', 'a', 'q', 'Escape', 'Enter', 'F1', 'F12'];
    GAME_KEYS.forEach(function (k) {
        var desc = H.getKeyDescription(k, false, false, 'game', null);
        t.ok(!/does nothing here/.test(desc), 'the explorer describes ' + H.describeName(k) + ' on the game screen');
    });

    // And every documented key carries real words, not an empty string.
    var docs = H.documentedKeys('game');
    t.ok(docs.indexOf('z') >= 0 && docs.indexOf('i') >= 0 && docs.indexOf('a') >= 0,
         'the new keys are in the documented set');
    t.ok(docs.every(function (k) {
        var d = (H.MODE_KEYS.game && H.MODE_KEYS.game[k]) || H.COMMON_KEYS[k];
        return typeof d === 'string' && d.length > 5;
    }), 'every documented key has a description worth hearing');

    // The prose help and the key tables must not drift apart: a key the
    // tables document should be findable in the words a coach reads with F1.
    var gameProse = H.helpFor('game').map(function (x) { return x.text; }).join(' ');
    t.ok(/\bZ\b/.test(gameProse), 'Z is written into the game help prose');
    t.ok(/\bI\b/.test(gameProse), 'I is written into the game help prose');
    t.ok(/\bA\b/.test(gameProse), 'A is written into the game help prose');

    // The look survives a save and a load, so a resumed game does not claim
    // ignorance it did not have.
    g20b.lastOffTeam = g20b.game.off;
    var roundTrip = AF.save.deserialize(d20.app.deps, AF.save.serialize(g20b));
    t.eq(roundTrip.lastOffTeam, g20b.lastOffTeam, 'lastOffTeam round-trips through a save');
};
