// main.js - Boot, load order, and the one keydown listener.
// (Accessible Football) Implements DESIGN.md 21.1, 21.2, 21.8.
//
// This file owns nothing except wiring. It gathers the engine modules off the
// global AF object in the order index.html loaded them, builds the application
// state, and installs the single window keydown handler that every key in the
// game goes through.

(function (root) {
    'use strict';

    var AF = root.AF;
    var app = null;
    var queue = null;
    var timer = null;

    function deps() {
        return { Rng: AF.Rng, players: AF.players, plays: AF.plays,
                 resolve: AF.resolve, staff: AF.staff, game: AF.game };
    }

    // The output side of the application: one voice, one set of chimes, one
    // visual mirror. The queue holds what is waiting so a burst of
    // announcements after a snap is spoken in priority order rather than all
    // at once (DESIGN.md 19.3, 21.3).
    function makeOut() {
        return {
            say: function (text, priority, source) {
                AF.ui.enqueue(queue, text, priority, source);
            },
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

    // Pacing is for what happens without the coach pressing a key: a side he
    // has handed to his coordinator, and the special teams (DESIGN.md 21.8,
    // 22). On manual he presses the spacebar and nothing moves without him.
    function scheduleAuto(spoken) {
        cancelAuto();
        if (!app || !app.game) return;
        var pending = AF.controller.pending(app.game);
        if (!pending || pending.kind !== 'auto') return;
        if (app.state.pacing === 'manual') return;
        var wait = AF.ui.pauseFor(spoken, app.state.pacing);
        if (wait < 0) return;
        timer = root.setTimeout(function () {
            timer = null;
            AF.screens.handleKey(app, { name: 'Enter', shift: false, ctrl: false, alt: false });
            var said = speakQueue();
            scheduleAuto(said);
        }, Math.max(300, wait));
    }

    function cancelAuto() {
        if (timer) { root.clearTimeout(timer); timer = null; }
    }

    // F5 and F6 pass through so the browser can still refresh and reach the
    // address bar. Everything else the game handles is stopped here
    // (DESIGN.md 21.2).
    var PASS_THROUGH = { F5: true, F6: true, F11: true };

    function onKeyDown(e) {
        if (PASS_THROUGH[e.key]) return;
        // The browser's own find and refresh combinations stay with the browser.
        if (e.ctrlKey && (e.key === 'r' || e.key === 'R' || e.key === 'f' || e.key === 'F')) return;
        var key = { name: e.key, shift: !!e.shiftKey, ctrl: !!e.ctrlKey, alt: !!e.altKey };
        e.preventDefault();
        // A key from the coach always takes precedence over anything the game
        // was about to do on its own.
        cancelAuto();
        try {
            AF.screens.handleKey(app, key);
            var said = speakQueue();
            scheduleAuto(said);
        } catch (err) {
            // A thrown error must never leave the coach in silence.
            AF.dom.announce('Something went wrong: ' + (err && err.message ? err.message : 'unknown error') +
                            '. Press Escape and try again.');
        }
    }

    function start() {
        queue = AF.ui.makeQueue();
        app = AF.screens.newApp(deps(), makeOut());
        AF.screens.boot(app);
        speakQueue();
        root.addEventListener('keydown', onKeyDown, true);
    }

    // The audio context has to be created inside the click on the start
    // button, so everything waits for that (DESIGN.md 21.1).
    function init() {
        if (!root.AF || !root.AF.dom) {
            root.setTimeout(init, 30);
            return;
        }
        AF = root.AF;
        AF.dom.start(start);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    root.AF = root.AF || {};
    root.AF.main = { restart: start, getApp: function () { return app; } };
})(typeof window !== 'undefined' ? window : globalThis);
