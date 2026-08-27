// rng.js - Seeded random number generator (Accessible Football engine)
// Plain script: attaches to window.AF in the browser, exports in Node.
// No browser dependencies.
//
// Every game is replayable from its seed. Nothing in the engine may call
// Math.random(); everything goes through an Rng instance.

(function (root) {
    'use strict';

    // mulberry32: small, fast, good enough for a game, fully deterministic.
    function Rng(seed) {
        this.seed = seed >>> 0;
        this.state = this.seed || 0x9e3779b9;
    }

    Rng.prototype.next = function () {
        var t = (this.state += 0x6d2b79f5) >>> 0;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    // Uniform float in [lo, hi)
    Rng.prototype.uniform = function (lo, hi) {
        return lo + (hi - lo) * this.next();
    };

    // Integer in [lo, hi] inclusive
    Rng.prototype.int = function (lo, hi) {
        return lo + Math.floor(this.next() * (hi - lo + 1));
    };

    // True with probability p
    Rng.prototype.chance = function (p) {
        return this.next() < p;
    };

    // Approximately normal (mean, sd) via sum of three uniforms.
    // Bounded: never further than 3 sd from the mean, which is what we want
    // for game outcomes (an edge moves the middle, it does not create miracles).
    Rng.prototype.normal = function (mean, sd) {
        var u = this.next() + this.next() + this.next();
        return mean + (u - 1.5) * 2 * sd;
    };

    // Pick one element of an array
    Rng.prototype.pick = function (arr) {
        return arr[Math.floor(this.next() * arr.length)];
    };

    // Weighted pick: items is [{item, w}, ...]
    Rng.prototype.weighted = function (items) {
        var total = 0, i;
        for (i = 0; i < items.length; i++) total += items[i].w;
        var r = this.next() * total;
        for (i = 0; i < items.length; i++) {
            r -= items[i].w;
            if (r <= 0) return items[i].item;
        }
        return items[items.length - 1].item;
    };

    // Derive a child generator (for example one per game from a season seed)
    Rng.prototype.child = function (salt) {
        return new Rng((this.seed * 31 + (salt >>> 0) + 7) >>> 0);
    };

    var api = { Rng: Rng };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.AF = root.AF || {};
    root.AF.Rng = Rng;
})(typeof window !== 'undefined' ? window : globalThis);
