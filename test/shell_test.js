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
     'engine/staff.js', 'engine/game.js', 'engine/controller.js',
     'ui/core.js', 'ui/help_text.js', 'ui/screens.js'].forEach(function (f) {
        delete require.cache[require.resolve(path.join(root, f))];
        require(path.join(root, f));
    });
    return global.AF;
}

function driver(AF) {
    var spoken = [], tones = [];
    var app = AF.screens.newApp({
        Rng: AF.Rng, players: AF.players, plays: AF.plays,
        resolve: AF.resolve, staff: AF.staff, game: AF.game
    }, {
        say: function (text, priority, source) { spoken.push({ text: text, priority: priority, source: source }); },
        tone: function (name) { tones.push(name); },
        panel: function () {}
    });
    return {
        app: app, spoken: spoken, tones: tones,
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
    t.ok(d4.since(n).indexOf('Back at') >= 0, 'closing a list says where the coach has ended up');
};
