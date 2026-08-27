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
            el.init.style.display = 'none';
            el.container.hidden = false;
            el.container.focus();
            if (onReady) onReady();
        });
        // Keep focus inside the container. If anything steals it, take it back.
        document.addEventListener('focusin', function (e) {
            if (el.container.hidden) return;
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
        score:   { freq: 780, type: 'triangle', dur: 0.30 }
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
    function loadFromDisk(onLoaded, onCancel) {
        var input = document.createElement('input');
        var settled = false;
        input.type = 'file';
        input.accept = 'application/json,.json';
        input.setAttribute('aria-hidden', 'true');
        input.style.position = 'fixed';
        input.style.left = '-9999px';
        document.body.appendChild(input);

        function cleanup() {
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
            reader.onerror = function () { cleanup(); if (onCancel) onCancel(); };
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
                saveToDisk: saveToDisk, loadFromDisk: loadFromDisk,
                crashSave: crashSave, crashLoad: crashLoad, copyToClipboard: copyToClipboard,
                TONES: TONES };
    root.AF = root.AF || {};
    root.AF.dom = api;
})(typeof window !== 'undefined' ? window : globalThis);
