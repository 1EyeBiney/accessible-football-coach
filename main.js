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
    var whistleTimer = null;
    // Bumped by every keypress and every cancel; a whistle continuation that
    // comes back to a stale generation does nothing, so a clip that was
    // already playing when the coach acted can never fire an action into
    // whatever he is doing now.
    var whistleGen = 0;

    function deps() {
        return { Rng: AF.Rng, players: AF.players, plays: AF.plays,
                 resolve: AF.resolve, staff: AF.staff, game: AF.game };
    }

    function makeOut() {
        return {
            say: function (text, priority, source, report) { AF.ui.enqueue(queue, text, priority, source, report); },
            tone: function (name) { AF.dom.tone(name); },
            panel: function (lines) { AF.dom.panel(lines); },
            boundary: function (kind) { AF.ui.queueBoundary(queue, kind); }
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
    //
    // Segments: a whistle boundary in the queue ends the utterance early.
    // What sits behind the boundary (the next play's prompt) is spoken by
    // proceed() after the referee whistle has actually finished playing.
    function speakSegment() {
        var items = AF.ui.dequeueSegment(queue);
        if (!items.length) return '';
        var text = items.map(function (item) { return item.text; }).join(' ');
        // The repeat buffer is set when football is actually spoken, not when
        // it was queued, so C never offers a line still waiting behind the
        // whistle (found by the whistle audit).
        var report = items.filter(function (item) { return item.report; })
                          .map(function (item) { return item.text; }).join(' ');
        if (report && app) app.state.lastReport = report;
        AF.dom.announce(text);
        return text;
    }

    // What happens after an utterance: if a boundary is holding more speech,
    // schedule the boundary's sound - the recorded whistle, or the short
    // synthesised set tone - and release the next utterance off the sound's
    // actual end. Otherwise arm the ordinary timers. We always know when our
    // own sound finishes and never know when the screen reader does (the
    // golf yield pattern, ISSUES.md 2026-08-28).
    function proceed(said) {
        if (AF.ui.queueHasItems(queue)) {
            if (AF.ui.lastBoundaryKind(queue) === 'set') scheduleSetTone(said);
            else scheduleWhistle(said);
            return;
        }
        scheduleAuto(said);
        startPlayClock();
    }

    // The guard shared by both boundary continuations. Today nothing can
    // open a confirmation, help, a viewer, the explorer, or the picker
    // except a keypress, and every keypress bumps the generation. The guard
    // is here for the first future feature that opens one from a timer or a
    // controller event: the held segment must then stay queued for the next
    // keypress rather than speak over what is open.
    function uiIsOpen() {
        return !!(app && (app.state.confirm || app.state.help || app.state.viewer ||
                          app.state.explore || app.state.loading));
    }

    // The pause before the whistle is HALF the pacing estimate for what was
    // just said, so the whistle lands on the tail of the result rather than
    // leaving a dead gap after it - Brian would rather the whistle impinge
    // on the announcement than wait for a guess at its end, and a fast
    // screen reader voice makes the full estimate a long overshoot. P still
    // scales it. Manual pacing gates game advancement, not the speech the
    // coach's own action produced, so it borrows the medium estimate.
    function scheduleWhistle(said) {
        cancelWhistle();
        var mode = app.state.pacing === 'manual' ? 'medium' : app.state.pacing;
        var wait = AF.ui.pauseFor(said, mode) * 0.5;
        whistleTimer = root.setTimeout(function () {
            whistleTimer = null;
            var gen = ++whistleGen;
            AF.dom.playClip('whistle', function () {
                if (gen !== whistleGen) return;
                if (uiIsOpen()) return;
                proceed(speakSegment());
            });
        }, Math.max(300, wait));
    }

    // The set tone between the down and distance and the rest of the call
    // prompt. The line before it is a few words, so half its estimate is a
    // short beat; the tone itself is synthesised with a known length, so the
    // next utterance is timed right off its end rather than off a guess.
    function scheduleSetTone(said) {
        cancelWhistle();
        var mode = app.state.pacing === 'manual' ? 'medium' : app.state.pacing;
        var wait = AF.ui.pauseFor(said, mode) * 0.5;
        whistleTimer = root.setTimeout(function () {
            whistleTimer = null;
            var gen = ++whistleGen;
            AF.dom.tone('set');
            var toneMs = ((AF.dom.TONES && AF.dom.TONES.set && AF.dom.TONES.set.dur) || 0.15) * 1000;
            whistleTimer = root.setTimeout(function () {
                whistleTimer = null;
                if (gen !== whistleGen) return;
                if (uiIsOpen()) return;
                proceed(speakSegment());
            }, toneMs + 120);
        }, Math.max(250, wait));
    }

    function cancelWhistle() {
        if (whistleTimer) { root.clearTimeout(whistleTimer); whistleTimer = null; }
        whistleGen++;
        // A key from the coach silences a whistle still in the air, not just
        // its continuation: his key takes precedence over everything.
        if (AF.dom.stopClips) AF.dom.stopClips();
    }

    // Called by ui/screens.js when a file picker or a crash-copy load
    // finishes outside any key press, so nothing else is waiting to drain the
    // queue and re-arm the timers the way onKeyDown does below.
    function announceNow() {
        proceed(speakSegment());
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
            // The ready-for-play whistle precedes an auto-advanced snap too,
            // and the snap waits for the clip to finish. The guards run again
            // inside the continuation because a second or two has passed and
            // the coach may have opened something in it.
            var gen = ++whistleGen;
            AF.dom.playClip('whistle', function () {
                if (gen !== whistleGen) return;
                if (!app || !app.game) return;
                if (app.state.confirm || app.state.help || app.state.viewer || app.state.explore || app.state.loading) return;
                var p = AF.controller.pending(app.game);
                if (!p || p.kind !== 'auto') return;
                AF.screens.handleKey(app, { name: 'Enter', shift: false, ctrl: false, alt: false, auto: true });
                proceed(speakSegment());
            });
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
                var expired = AF.controller.pending(app.game);
                if (expired && expired.kind === 'defense') {
                    // The play clock belongs to the offense (DESIGN.md
                    // 16.5.1). A coach stalling on his own defensive call
                    // cannot draw a flag on his opponent; the ball is snapped
                    // and his defense is caught in the call his coordinator
                    // suggested. Found by the whistle audit: the old branch
                    // handed the stalling coach five free yards.
                    AF.ui.enqueue(queue, AF.ui.sanitize(
                        'The ball is snapped. Your defense goes with the call your coordinator suggested.'),
                        'result', 'DC', true);
                    AF.screens.handleKey(app, { name: 'Enter', shift: false, ctrl: false, alt: false, auto: true });
                    proceed(speakSegment());
                    return;
                }
                // delayOfGame drains its own queue and returns what was said;
                // draining again afterwards gets an empty list and silently
                // loses the penalty announcement (the same trap ui/screens.js
                // documents on emit, found here by the whistle audit).
                AF.screens.emit(app, AF.controller.delayOfGame(app.game));
                AF.ui.queueBoundary(queue);
                AF.screens.promptNext(app);
                proceed(speakSegment());
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
        // was about to do on its own, including a whistle still in the air.
        cancelAuto();
        stopPlayClock();
        cancelWhistle();
        try {
            var out = AF.screens.handleKey(app, key);
            var said = speakSegment();
            // Silence is a bug (DESIGN.md 21.3). A key nothing wanted still
            // gets an answer, so the coach can tell a key that did nothing
            // from a game that has stopped responding.
            if (!said) {
                said = AF.ui.sanitize(unhandledLine(key, out));
                AF.dom.announce(said);
            }
            proceed(said);
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
        root.setTimeout(function () { speakSegment(); }, 700);
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
