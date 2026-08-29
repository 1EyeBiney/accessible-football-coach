// dom.js - The only file in the project that touches document.
// (Accessible Football) Implements DESIGN.md 21.1, 21.3, 21.11.
//
// It owns the focus trap, the single live region every word goes through, the
// visual mirror for anyone watching over the coach's shoulder, and the chimes,
// which are synthesised with oscillators so there are no audio files to ship.
//
// Nothing in here decides anything about football or about the interface. It
// is asked to speak, and it speaks.

(function (root) {
    'use strict';

    var el = {};
    var audio = null;
    var muted = false;
    // True only while the native file picker is open. The focus trap below
    // exists to pull focus back into the container from anything else on the
    // page; the picker is the one deliberate exception DESIGN.md 21.10
    // carves out, so the trap has to stand down for it rather than fight the
    // browser for focus the moment the hidden file input takes it.
    var trapSuspended = false;

    function grab() {
        el.init = document.getElementById('initBtn');
        el.container = document.getElementById('game-container');
        el.live = document.getElementById('aria-announce');
        el.mirror = document.getElementById('mirror');
        el.panel = document.getElementById('panel');
    }

    // The audio context has to be created inside a user gesture or the browser
    // will not allow sound at all (DESIGN.md 21.1).
    function start(onReady) {
        grab();
        el.init.addEventListener('click', function () {
            try {
                var Ctx = window.AudioContext || window.webkitAudioContext;
                if (Ctx) { audio = new Ctx(); prime(); }
            } catch (e) { audio = null; }
            primeClips();
            el.init.style.display = 'none';
            el.container.hidden = false;
            el.container.focus();
            if (onReady) onReady();
        });
        // Keep focus inside the container. If anything steals it, take it back.
        document.addEventListener('focusin', function (e) {
            if (el.container.hidden || trapSuspended) return;
            if (!el.container.contains(e.target) && e.target !== el.container) {
                el.container.focus();
            }
        });
    }

    // A short quiet sound on boot so the first real one does not stutter.
    function prime() {
        if (!audio) return;
        var g = audio.createGain();
        g.gain.value = 0.0001;
        g.connect(audio.destination);
        var o = audio.createOscillator();
        o.connect(g);
        o.start();
        o.stop(audio.currentTime + 0.02);
    }

    // One voice. Everything spoken in the whole game comes through here
    // (DESIGN.md 21.3). The text arrives already sanitised by ui/core.js.
    function announce(text) {
        if (!el.live) return;
        // Writing the same string twice in a row can be dropped by a screen
        // reader, so alternate a hair space to force it to speak.
        var t = String(text || '');
        if (el.live.textContent === t) t = t + ' ';
        el.live.textContent = t;
        if (el.mirror) el.mirror.textContent = t;
    }

    // The visual panel for a sighted onlooker. It is aria-hidden, so the
    // screen reader never sees it and never double reads.
    function panel(lines) {
        if (!el.panel) return;
        el.panel.textContent = (lines || []).join('\n');
    }

    // ---------- chimes (DESIGN.md 19.2, 21.11) ----------

    // One distinct sound per source so the coach knows who wants him before
    // the words start, and a separate one for anything that must be answered.
    var TONES = {
        OC:      { freq: 660, type: 'sine',     dur: 0.12 },
        DC:      { freq: 440, type: 'sine',     dur: 0.12 },
        SPOT:    { freq: 880, type: 'triangle', dur: 0.10 },
        TRAINER: { freq: 330, type: 'square',   dur: 0.18 },
        must:    { freq: 250, type: 'square',   dur: 0.22 },
        up:      { freq: 720, type: 'sine',     dur: 0.05 },
        down:    { freq: 560, type: 'sine',     dur: 0.05 },
        open:    { freq: 620, type: 'triangle', dur: 0.08 },
        close:   { freq: 380, type: 'triangle', dur: 0.08 },
        edge:    { freq: 300, type: 'sine',     dur: 0.06 },
        tick:    { freq: 900, type: 'sine',     dur: 0.03 },
        clock:   { freq: 520, type: 'square',   dur: 0.06 },
        clockLate: { freq: 700, type: 'square', dur: 0.09 },
        score:   { freq: 780, type: 'triangle', dur: 0.30 },
        // The set tone: between the down and distance and the rest of the
        // call prompt. Synthesised, so its length is known exactly and the
        // speaker can time the next utterance right off its end.
        set:     { freq: 480, type: 'triangle', dur: 0.15 },
        // The snap cue: between the call the coach just made and what
        // happened on the play. Low and short, so it reads as the ball being
        // put in play rather than as another prompt, and well clear of the
        // set tone above it (ISSUES.md, from play).
        snap:    { freq: 200, type: 'square',   dur: 0.10 }
    };

    function tone(name) {
        if (!audio || muted) return;
        var spec = TONES[name];
        if (!spec) return;
        var now = audio.currentTime;
        var g = audio.createGain();
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.16, now + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, now + spec.dur);
        g.connect(audio.destination);
        var o = audio.createOscillator();
        o.type = spec.type;
        o.frequency.setValueAtTime(spec.freq, now);
        o.connect(g);
        o.start(now);
        o.stop(now + spec.dur + 0.02);
    }

    function setMuted(v) { muted = !!v; }

    // ---------- recorded clips (ISSUES.md 2026-08-28, the referee whistle) ----------

    // The three patterns proven on the accessible golf project, ported rather
    // than copied. One: every file gets its Audio element once, at the start
    // click, so playing is rewind and play with nothing fetched at the
    // trigger. Two: a grab bag pops a shuffled index per play, so no clip
    // repeats until all have been heard. Three: the caller's continuation is
    // gated on the clip's ended event with a fired-once guard and a failsafe
    // timeout, never on a duration guess, because we always know when our own
    // clip ends and never know when the screen reader finishes speaking.
    //
    // The shuffle draws from its own Rng seeded off the clock: cosmetic sound
    // choice must never touch the game's seeded stream (CLAUDE.md, no
    // Math.random and every game replayable), and this stream deciding
    // nothing about football is the point of keeping it separate.
    var CLIPS = {
        whistle: { path: 'audio/ref/whistle_referee_', count: 8, pool: null, bag: [], last: -1 }
    };
    var cosmeticRng = null;

    function primeClips() {
        if (typeof Audio === 'undefined') return;
        var R = root.AF && root.AF.Rng;
        cosmeticRng = R ? new R((Date.now() % 2147483647) || 1) : null;
        var k, set, i;
        for (k in CLIPS) {
            set = CLIPS[k];
            set.pool = [];
            for (i = 1; i <= set.count; i++) {
                try { set.pool.push(new Audio(set.path + i + '.mp3')); }
                catch (e) { /* a missing file costs the clip, never the game */ }
            }
        }
    }

    function refillBag(set) {
        var i, j, t;
        set.bag = [];
        for (i = 0; i < set.pool.length; i++) set.bag.push(i);
        if (cosmeticRng) {
            for (i = set.bag.length - 1; i > 0; i--) {
                j = cosmeticRng.int(0, i);
                t = set.bag[i]; set.bag[i] = set.bag[j]; set.bag[j] = t;
            }
        }
        // Never the same clip twice in a row across a refill.
        if (set.bag.length > 1 && set.bag[set.bag.length - 1] === set.last) {
            t = set.bag[set.bag.length - 1];
            set.bag[set.bag.length - 1] = set.bag[0];
            set.bag[0] = t;
        }
    }

    // Fire and forget with a continuation: onDone always runs exactly once,
    // whether the clip finishes, fails to play, or does not exist at all, so
    // the game never stalls behind a sound (the golf yield pattern).
    var activeClip = null;

    function playClip(kind, onDone) {
        var done = false;
        function finish() { if (!done) { done = true; if (onDone) onDone(); } }
        var set = CLIPS[kind];
        if (!set || !set.pool || !set.pool.length || muted) { finish(); return; }
        if (!set.bag.length) refillBag(set);
        var idx = set.bag.pop();
        set.last = idx;
        var clip = set.pool[idx];
        try {
            clip.currentTime = 0;
            clip.onended = finish;
            activeClip = clip;
            var p = clip.play();
            if (p && p.catch) p.catch(finish);
            // Failsafe in case ended is swallowed; the whistles run a second
            // or two, so four covers the longest without holding a stall long.
            setTimeout(finish, 4000);
        } catch (e) { finish(); }
    }

    // A key from the coach silences whatever clip is sounding. The paused
    // clip fires no ended event; its caller's continuation is already
    // invalidated by the generation bump, and the failsafe timeout cleans up
    // the once-guard harmlessly.
    function stopClips() {
        if (!activeClip) return;
        try { activeClip.pause(); } catch (e) { /* already stopped */ }
        activeClip = null;
    }

    // ---------- saving to disk (DESIGN.md 21.10) ----------

    // The real save is a file on the coach's disk, because browsers clear
    // local storage. The file picker is the one standard control the game
    // uses, because there is no other way to read a file.
    function saveToDisk(name, json) {
        try {
            var blob = new Blob([json], { type: 'application/json' });
            var url = URL.createObjectURL(blob);
            // A download needs an anchor and there is no other way to start
            // one from a static page (DESIGN.md 21.10). It exists for one tick
            // only, is hidden from the screen reader, and is kept out of the
            // tab order so it can never take focus from the container.
            var a = document.createElement('a');
            a.href = url;
            a.download = name;
            a.setAttribute('aria-hidden', 'true');
            a.setAttribute('tabindex', '-1');
            a.style.position = 'fixed';
            a.style.left = '-9999px';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            if (el.container && !el.container.hidden) el.container.focus();
            setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
            return true;
        } catch (e) { return false; }
    }

    // The native file picker is the one standard control the game uses,
    // because there is no other way to read a file and the native dialog is
    // fully accessible (DESIGN.md 21.10).
    //
    // Dismissing that dialog fires no event at all. Without the window focus
    // fallback below, the input is never removed, focus never comes back to
    // the container, and the coach is left in silence not knowing whether he
    // is still in the game. One input was also left in the document on every
    // attempt.
    // onError is optional; a caller that only wants to treat every failure as
    // a cancel can omit it, the way this function used to behave.
    function loadFromDisk(onLoaded, onCancel, onError) {
        var input = document.createElement('input');
        var settled = false;
        input.type = 'file';
        input.accept = 'application/json,.json';
        input.setAttribute('aria-hidden', 'true');
        input.setAttribute('tabindex', '-1');
        input.style.position = 'fixed';
        input.style.left = '-9999px';
        document.body.appendChild(input);
        trapSuspended = true;

        function cleanup() {
            trapSuspended = false;
            window.removeEventListener('focus', onWindowFocus, true);
            if (input.parentNode) input.parentNode.removeChild(input);
            if (el.container && !el.container.hidden) el.container.focus();
        }
        function cancel() {
            if (settled) return;
            settled = true;
            cleanup();
            if (onCancel) onCancel();
        }
        function onWindowFocus() {
            // The dialog has closed. Give the change event a moment to arrive;
            // if it does not, the coach cancelled.
            setTimeout(function () { if (!input.files || !input.files.length) cancel(); }, 400);
        }

        input.addEventListener('change', function () {
            var f = input.files && input.files[0];
            if (!f) { cancel(); return; }
            settled = true;
            var reader = new FileReader();
            reader.onload = function () { cleanup(); onLoaded(String(reader.result)); };
            reader.onerror = function () { cleanup(); if (onError) onError(); else if (onCancel) onCancel(); };
            reader.readAsText(f);
        });
        window.addEventListener('focus', onWindowFocus, true);
        input.click();
    }

    // Local storage is the crash copy, never the real save.
    function crashSave(key, json) {
        try { window.localStorage.setItem(key, json); return true; } catch (e) { return false; }
    }
    function crashLoad(key) {
        try { return window.localStorage.getItem(key); } catch (e) { return null; }
    }

    function copyToClipboard(text) {
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text);
                return true;
            }
        } catch (e) { /* fall through */ }
        return false;
    }

    var api = { start: start, announce: announce, panel: panel, tone: tone, setMuted: setMuted,
                playClip: playClip, stopClips: stopClips,
                saveToDisk: saveToDisk, loadFromDisk: loadFromDisk,
                crashSave: crashSave, crashLoad: crashLoad, copyToClipboard: copyToClipboard,
                TONES: TONES };
    root.AF = root.AF || {};
    root.AF.dom = api;
})(typeof window !== 'undefined' ? window : globalThis);
