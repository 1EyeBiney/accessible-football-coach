// main.js - Boot, load order, the one keydown listener, and the two timers.
// (Accessible Football) Implements DESIGN.md 16.5.1, 21.1, 21.2, 21.8.
//
// This file owns nothing about football and nothing about screens. It gathers
// the engine modules off the global AF object in the order index.html loaded
// them, builds the application state, installs the single window keydown
// handler that every key goes through, and runs the two clocks the interface
// is responsible for: the pause before the game does something the coach did
// not ask for, and the play clock.

(function (root) {
    'use strict';

    var AF = root.AF;
    var app = null;
    var queue = null;
    var autoTimer = null;
    var clockTimer = null;
    var clockLeft = 0;

    function deps() {
        return { Rng: AF.Rng, players: AF.players, plays: AF.plays,
                 resolve: AF.resolve, staff: AF.staff, game: AF.game };
    }

    function makeOut() {
        return {
            say: function (text, priority, source) { AF.ui.enqueue(queue, text, priority, source); },
            tone: function (name) { AF.dom.tone(name); },
            panel: function (lines) { AF.dom.panel(lines); }
        };
    }

    // Everything produced by one keystroke is spoken as one utterance, in
    // priority order, through the one live region.
    //
    // This was originally a timer that spoke one line and waited for it to be
    // heard before the next. That is wrong for a live region: a screen reader
    // is already reading at its own speed, and the queue simply backed up. A
    // whole game produced three spoken lines and a backlog of four hundred.
    // One keystroke, one utterance, no backlog (DESIGN.md 21.3).
    function speakQueue() {
        var parts = [], item;
        while ((item = AF.ui.dequeue(queue))) parts.push(item.text);
        if (!parts.length) return '';
        var text = parts.join(' ');
        AF.dom.announce(text);
        return text;
    }

    // Called by ui/screens.js when a file picker or a crash-copy load
    // finishes outside any key press, so nothing else is waiting to drain the
    // queue and re-arm the timers the way onKeyDown does below.
    function announceNow() {
        var said = speakQueue();
        scheduleAuto(said);
        startPlayClock();
    }

    // ---------- the pause before the game moves on its own ----------

    // Pacing is for what happens without the coach pressing a key: a side he
    // has handed to his coordinator, and the special teams (DESIGN.md 21.8,
    // 22). On manual he presses the spacebar and nothing moves without him.
    function scheduleAuto(spoken) {
        cancelAuto();
        if (!app || !app.game) return;
        // Nothing auto-advances while the coach has something open. Without
        // this the timer presses Enter into a confirmation and throws the game
        // away, closes help mid-sentence, or fights the keyboard explorer.
        if (app.state.confirm || app.state.help || app.state.viewer || app.state.explore || app.state.loading) return;
        var pending = AF.controller.pending(app.game);
        if (!pending || pending.kind !== 'auto') return;
        if (app.state.pacing === 'manual') return;
        var wait = AF.ui.pauseFor(spoken, app.state.pacing);
        if (wait < 0) return;
        autoTimer = root.setTimeout(function () {
            autoTimer = null;
            AF.screens.handleKey(app, { name: 'Enter', shift: false, ctrl: false, alt: false, auto: true });
            var said = speakQueue();
            scheduleAuto(said);
        }, Math.max(400, wait));
    }

    function cancelAuto() {
        if (autoTimer) { root.clearTimeout(autoTimer); autoTimer = null; }
    }

    // ---------- the play clock (DESIGN.md 16.5.1) ----------

    // The controller says how many seconds the setting is worth and what a
    // delay of game costs; running the clock is the interface's job, because
    // only the interface knows about time passing. A soft tick starts at ten
    // seconds and a sharper one at five.
    function startPlayClock() {
        stopPlayClock();
        if (!app || !app.game) return;
        var secs = AF.controller.playClockSeconds(app.game);
        if (!secs) return;
        var p = AF.controller.pending(app.game);
        if (!p || (p.kind !== 'offense' && p.kind !== 'defense')) return;
        if (app.state.confirm || app.state.help || app.state.viewer || app.state.explore || app.state.loading) return;
        clockLeft = secs;
        clockTimer = root.setInterval(function () {
            clockLeft--;
            if (clockLeft <= 0) {
                stopPlayClock();
                AF.dom.tone('must');
                AF.controller.delayOfGame(app.game);
                AF.screens.emit(app, AF.controller.drain(app.game));
                AF.screens.promptNext(app);
                speakQueue();
                startPlayClock();
                return;
            }
            if (clockLeft <= 5) AF.dom.tone('clockLate');
            else if (clockLeft <= 10) AF.dom.tone('clock');
        }, 1000);
    }

    function stopPlayClock() {
        if (clockTimer) { root.clearInterval(clockTimer); clockTimer = null; }
    }

    // ---------- the one keydown listener (DESIGN.md 21.2) ----------

    // F5, F6 and F11 belong to the browser, and so do control R and control F,
    // so the coach is never trapped in the page. The one exception is the
    // keyboard explorer: while it is on it promises that every key is
    // described and nothing happens, so it describes these too rather than
    // letting them reload the page under a learner who is exploring.
    var BROWSER_KEYS = { F5: true, F6: true, F11: true };

    function isBrowserKey(e) {
        if (BROWSER_KEYS[e.key]) return true;
        if (e.ctrlKey) {
            var k = String(e.key).toLowerCase();
            if (k === 'r' || k === 'f' || k === 'w' || k === 't') return true;
        }
        return false;
    }

    function onKeyDown(e) {
        var exploring = app && app.state && app.state.explore;
        if (isBrowserKey(e) && !exploring) return;
        // A single character is normalised to lower case so that Caps Lock,
        // which is the NVDA laptop modifier and gets toggled by accident, does
        // not silence the entire game.
        var name = e.key;
        if (typeof name === 'string' && name.length === 1) name = name.toLowerCase();
        var key = { name: name, shift: !!e.shiftKey, ctrl: !!e.ctrlKey, alt: !!e.altKey, raw: e.key };
        e.preventDefault();
        // A key from the coach always takes precedence over anything the game
        // was about to do on its own.
        cancelAuto();
        stopPlayClock();
        try {
            var out = AF.screens.handleKey(app, key);
            var said = speakQueue();
            // Silence is a bug (DESIGN.md 21.3). A key nothing wanted still
            // gets an answer, so the coach can tell a key that did nothing
            // from a game that has stopped responding.
            if (!said) {
                said = AF.ui.sanitize(unhandledLine(key, out));
                AF.dom.announce(said);
            }
            scheduleAuto(said);
            startPlayClock();
        } catch (err) {
            AF.dom.announce(AF.ui.sanitize('Something went wrong. ' +
                (err && err.message ? err.message : 'Unknown error') +
                '. Press Escape and try again.'));
        }
    }

    function unhandledLine(key, out) {
        var where = out && out.layer && out.layer !== 'mode' ? out.layer : null;
        var pretty = AF.help.describeName(key.name);
        if (where === 'help') return pretty + ' does nothing in help. Escape closes it.';
        if (where === 'viewer') return pretty + ' does nothing in this list. Escape closes it.';
        if (where === 'confirm') return '';
        return pretty + ' does nothing here. F1 for help.';
    }

    function start() {
        queue = AF.ui.makeQueue();
        app = AF.screens.newApp(deps(), makeOut());
        AF.screens.boot(app);
        // The container's own label is announced by the screen reader when it
        // takes focus. Speaking straight away interrupts it and the coach
        // hears half of each. A short wait lets the label finish first.
        root.setTimeout(function () { speakQueue(); }, 700);
        root.addEventListener('keydown', onKeyDown, true);
    }

    function init() {
        if (!root.AF || !root.AF.dom) { root.setTimeout(init, 30); return; }
        AF = root.AF;
        AF.dom.start(start);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    root.AF = root.AF || {};
    root.AF.main = { restart: start, getApp: function () { return app; },
                     stopPlayClock: stopPlayClock, cancelAuto: cancelAuto,
                     announceNow: announceNow };
})(typeof window !== 'undefined' ? window : globalThis);
