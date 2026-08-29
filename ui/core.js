// core.js - The interface logic that does not touch the page.
// (Accessible Football) Plain script, no browser dependencies.
// Implements DESIGN.md 21.2, 21.3, 21.4, 21.6, 21.7, 21.8, 21.9.
//
// This file owns the announce queue and its priorities, the speech sanitiser,
// the menu and grid state machines, the point allocation list, and the ordered
// interceptor stack that decides which part of the game sees a key. All of it
// is plain data and pure functions so it can be tested under Node, which is
// what CLAUDE.md requires. Only ui/dom.js touches document.

(function (root) {
    'use strict';

    function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

    // ---------- speech (DESIGN.md 21.3) ----------

    var ORDINALS = { '1st': 'first', '2nd': 'second', '3rd': 'third', '4th': 'fourth' };

    var NUM_WORD = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
        'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen',
        'eighteen', 'nineteen'];
    var TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

    function numberWords(n) {
        n = Math.round(Number(n));
        if (isNaN(n)) return '';
        if (n < 0) return 'minus ' + numberWords(-n);
        if (n < 20) return NUM_WORD[n];
        if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + NUM_WORD[n % 10] : '');
        if (n < 1000) return NUM_WORD[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' ' + numberWords(n % 100) : '');
        return String(n);
    }

    // Everything spoken goes through this first. A screen reader reads "3rd
    // and 7" acceptably, but "third and seven" is what a coach hears, and the
    // markdown characters and symbols have to go (DESIGN.md 21.3, CLAUDE.md).
    function sanitize(text) {
        if (text === null || text === undefined) return '';
        var s = String(text);
        s = s.replace(/[*_`#>|]/g, ' ');
        // Down and distance, and the ordinals on their own.
        s = s.replace(/\b(1st|2nd|3rd|4th)\b/gi, function (m) { return ORDINALS[m.toLowerCase()] || m; });
        // A number of yards or points reads better as a word.
        s = s.replace(/-(\d)/g, 'minus $1');
        s = s.replace(/%/g, ' percent');
        s = s.replace(/\bms\b/g, ' milliseconds');
        s = s.replace(/\b\d+\b/g, function (m) {
            var n = parseInt(m, 10);
            return (n >= 0 && n < 1000) ? numberWords(n) : m;
        });
        s = s.replace(/\s+/g, ' ').trim();
        return s;
    }

    // ---------- the announce queue (DESIGN.md 19.3, 21.3) ----------

    // One voice, one queue. Priority decides what is spoken first when several
    // things arrive at once: the play result, then anything that must be
    // answered, then the low priority notes. Cued reports are not queued at
    // all; they wait behind a chime until the coach asks (DESIGN.md 19.2).
    //
    // Segments: a boundary splits the queue into utterances. Everything before
    // a boundary is one utterance (the play result), everything after is the
    // next (the new call). The interface plays the ready-for-play whistle in
    // the gap. Priority sorting never crosses a boundary, so a late must-
    // answer report belonging to the new play cannot jump back into the old
    // one (ISSUES.md 2026-08-28, the referee whistle).
    var PRIORITY_ORDER = { result: 0, must: 1, batched: 2, ui: 3 };

    function makeQueue() {
        return { items: [], seq: 0, speaking: null, segment: 0, marks: {}, lastMark: null };
    }

    // report marks football the coach may ask to hear again with C, as
    // opposed to interface chatter. The speaker uses it to set the repeat
    // buffer when the line is actually spoken rather than when it is queued,
    // which matters once a whistle boundary can hold a line back: the repeat
    // key must never offer something the coach has not heard yet.
    function enqueue(q, text, priority, source, report) {
        if (!text) return q;
        q.items.push({ text: text, priority: priority || 'ui', source: source || null,
                       report: !!report, seq: q.seq++, segment: q.segment || 0 });
        q.items.sort(function (a, b) {
            if ((a.segment || 0) !== (b.segment || 0)) return (a.segment || 0) - (b.segment || 0);
            var pa = PRIORITY_ORDER[a.priority], pb = PRIORITY_ORDER[b.priority];
            if (pa === undefined) pa = 3;
            if (pb === undefined) pb = 3;
            if (pa !== pb) return pa - pb;
            return a.seq - b.seq;   // stable inside a priority
        });
        return q;
    }

    // Marks a boundary. kind names the sound that belongs in the gap:
    // 'whistle' (the default, a recorded clip) or 'set' (a short synthesised
    // tone between the down and distance and what the offense shows). A
    // boundary in front of nothing is not a boundary, so an empty segment is
    // never created and no sound ever plays in front of silence.
    function queueBoundary(q, kind) {
        var i, cur = q.segment || 0;
        for (i = 0; i < q.items.length; i++) {
            if ((q.items[i].segment || 0) === cur) {
                q.marks[cur] = kind || 'whistle';
                q.segment = cur + 1;
                return q;
            }
        }
        return q;
    }

    function dequeue(q) {
        if (!q.items.length) return null;
        var item = q.items.shift();
        q.speaking = item;
        return item;
    }

    // One utterance: every item of the earliest segment still queued. What
    // remains after a boundary stays queued for after the boundary's sound.
    // lastMark remembers which sound the just-drained segment owes, for the
    // speaker to read with lastBoundaryKind.
    function dequeueSegment(q) {
        if (!q.items.length) return [];
        var seg = q.items[0].segment || 0;
        var out = [];
        while (q.items.length && (q.items[0].segment || 0) === seg) {
            out.push(q.items.shift());
        }
        q.speaking = out[out.length - 1] || null;
        q.lastMark = q.marks[seg] || null;
        delete q.marks[seg];
        return out;
    }

    // The sound owed after the segment dequeueSegment just drained, when
    // more speech waits behind it: 'whistle', 'set', or null.
    function lastBoundaryKind(q) { return q.lastMark || null; }

    function queueHasItems(q) { return q.items.length > 0; }

    function queueClear(q) {
        q.items = []; q.speaking = null; q.segment = 0; q.marks = {}; q.lastMark = null;
        return q;
    }

    // ---------- pacing (DESIGN.md 21.8) ----------

    // Milliseconds per character. A screen reader at its default rate reads
    // roughly fifteen to eighteen characters a second, so anything under about
    // fifty five milliseconds a character means the next automatic line
    // interrupts the one before it half way through.
    var PACING = { fast: 45, medium: 70, slow: 100, manual: -1 };
    var PACING_ORDER = ['fast', 'medium', 'slow', 'manual'];

    // How long to wait before the next automatic thing happens, from the
    // length of what was just said. Manual waits for the spacebar instead.
    function pauseFor(text, mode) {
        var perChar = PACING[mode];
        if (perChar === undefined) perChar = PACING.medium;
        if (perChar < 0) return -1;
        return Math.min(20000, 600 + String(text || '').length * perChar);
    }

    // ---------- menus (DESIGN.md 21.4) ----------

    // A menu is an array of { text, action } plus an index. Up and Down wrap so
    // the list never dead-ends. The prompt is spoken once, on entry.
    function makeMenu(items, prompt) {
        return { items: items || [], index: 0, prompt: prompt || '', entered: false };
    }

    function menuAnnounce(menu) {
        if (!menu.items.length) return menu.prompt ? menu.prompt + ' Nothing here.' : 'Nothing here.';
        var text = menu.items[menu.index].text;
        if (!menu.entered) { menu.entered = true; return (menu.prompt ? menu.prompt + ' ' : '') + text; }
        return text;
    }

    function menuMove(menu, delta) {
        if (!menu.items.length) return 'Nothing here.';
        var n = menu.items.length;
        menu.index = ((menu.index + delta) % n + n) % n;   // wrap in both directions
        menu.entered = true;
        return menu.items[menu.index].text;
    }

    function menuSelect(menu) {
        if (!menu.items.length) return null;
        return menu.items[menu.index];
    }

    // Ctrl plus Enter runs the last item that is not a way out, which
    // fast-forwards a setup wizard for a returning coach (DESIGN.md 21.4).
    function menuFastForward(menu) {
        var i;
        for (i = menu.items.length - 1; i >= 0; i--) {
            if (!/^(back|cancel|quit)/i.test(menu.items[i].text)) { menu.index = i; return menu.items[i]; }
        }
        return null;
    }

    // ---------- grids (DESIGN.md 21.6) ----------

    // Tabular data lives in a plain array, never in the page. Every move speaks
    // the row header, the column header and the value, and an edge says so
    // rather than going silent.
    function makeGrid(rowHeaders, colHeaders, cells, title) {
        return { rowHeaders: rowHeaders || [], colHeaders: colHeaders || [],
                 cells: cells || [], row: 0, col: 0, title: title || '', entered: false };
    }

    function gridCell(grid) {
        var r = grid.cells[grid.row] || [];
        var v = r[grid.col];
        return (v === undefined || v === null) ? 'blank' : String(v);
    }

    function gridAnnounce(grid) {
        var head = '';
        if (!grid.entered) { grid.entered = true; head = (grid.title ? grid.title + '. ' : '') + 'Use the arrow keys. Escape closes. '; }
        return head + (grid.rowHeaders[grid.row] || '') + ', ' + (grid.colHeaders[grid.col] || '') + ': ' + gridCell(grid);
    }

    function gridMove(grid, dr, dc) {
        var rows = grid.cells.length, cols = grid.colHeaders.length;
        var nr = grid.row + dr, nc = grid.col + dc;
        if (nr < 0) return 'Top edge.';
        if (nr >= rows) return 'Bottom edge.';
        if (nc < 0) return 'Left edge.';
        if (nc >= cols) return 'Right edge.';
        grid.row = nr; grid.col = nc; grid.entered = true;
        return gridAnnounce(grid);
    }

    // ---------- point allocation (DESIGN.md 21.9) ----------

    // The weekly Focus bar is a list, not a set of sliders. Raising a category
    // when nothing is spare does nothing except say so, because in an audio
    // interface silently taking points from a category the coach is not on is
    // worse than an extra keystroke.
    function makeAllocation(categories, total, step) {
        var values = {}, i;
        for (i = 0; i < categories.length; i++) values[categories[i].id] = 0;
        return { categories: categories, values: values, total: total || 100,
                 step: step || 5, index: 0, entered: false };
    }

    function allocSpare(a) {
        var used = 0, k;
        for (k in a.values) used += a.values[k];
        return a.total - used;
    }

    function allocCurrent(a) { return a.categories[a.index]; }

    function allocAnnounce(a) {
        var cat = allocCurrent(a);
        var head = '';
        if (!a.entered) { a.entered = true; head = 'Set your week. Up and down choose, left and right change. '; }
        return head + cat.name + ', ' + numberWords(a.values[cat.id]) + ' percent. ' +
               numberWords(allocSpare(a)) + ' unallocated.';
    }

    function allocMove(a, delta) {
        var n = a.categories.length;
        a.index = ((a.index + delta) % n + n) % n;
        a.entered = true;
        return allocAnnounce(a);
    }

    function allocAdjust(a, dir) {
        var cat = allocCurrent(a);
        var spare = allocSpare(a);
        if (dir > 0) {
            if (spare <= 0) return 'Nothing unallocated. Lower another category first.';
            var up = Math.min(a.step, spare);
            a.values[cat.id] += up;
        } else {
            if (a.values[cat.id] <= 0) return cat.name + ' is already at zero.';
            a.values[cat.id] -= Math.min(a.step, a.values[cat.id]);
        }
        return cat.name + ', ' + numberWords(a.values[cat.id]) + ' percent. ' +
               numberWords(allocSpare(a)) + ' unallocated.';
    }

    function allocLine(a) {
        var i, parts = [];
        for (i = 0; i < a.categories.length; i++) {
            parts.push(a.categories[i].name + ' ' + numberWords(a.values[a.categories[i].id]));
        }
        return parts.join(', ') + '. ' + numberWords(allocSpare(a)) + ' unallocated.';
    }

    // ---------- the interceptor stack (DESIGN.md 21.2) ----------

    // One key handler, a stack of interceptors in priority order, each of which
    // returns early so nothing below it sees the key. This is the input
    // firewall: while the help viewer is open, an arrow key cannot reach the
    // game and call a play.
    //
    // A state is a plain object:
    //   { confirm, explore, help, viewer, mode, ... }
    // and a handler is a function (state, key) returning either null, meaning
    // it did not handle the key, or { say, done, action } meaning it did.

    // The stack, top first. confirm, help and viewer swallow anything they do
    // not want, which is the input firewall. global and mode fall through, so
    // the quick status keys reach the coach from inside a list or from help:
    // they are the keys he needs most when he has lost his place.
    var INTERCEPTORS = ['confirm', 'explore', 'global', 'help', 'viewer', 'mode'];
    var FALLS_THROUGH = { global: true, mode: true };

    function newState(mode) {
        return { mode: mode || 'boot', confirm: null, explore: false, help: null,
                 viewer: null, pacing: 'medium', verbosity: 'full', lastReport: '',
                 lastContext: '',
                 // True while the native file picker or save dialog is open. No
                 // real keydown reaches the page while it has focus, but the
                 // pacing timer and the play clock are our own code and would
                 // otherwise fire blind into whatever is waiting when it closes
                 // (DESIGN.md 21.10, 21.8).
                 loading: false };
    }

    // key is { name, shift, ctrl, alt }
    function dispatch(state, key, handlers) {
        var i, name, h, out;
        for (i = 0; i < INTERCEPTORS.length; i++) {
            name = INTERCEPTORS[i];
            if (!layerActive(state, name)) continue;
            h = handlers[name];
            if (!h) continue;
            out = h(state, key);
            if (out) { out.layer = name; return out; }
            // An active layer swallows the key even when it does nothing with
            // it, which is the whole point of the firewall.
            if (!FALLS_THROUGH[name]) return { say: null, swallowed: true, layer: name };
        }
        return { say: null, swallowed: false, layer: null };
    }

    function layerActive(state, name) {
        if (name === 'confirm') return !!state.confirm;
        if (name === 'explore') return !!state.explore;
        if (name === 'help') return !!state.help;
        if (name === 'viewer') return !!state.viewer;
        return true;  // global and the mode branch are always there
    }

    // ---------- confirmations (DESIGN.md 21.7) ----------

    function askConfirm(state, prompt, action) {
        state.confirm = { prompt: prompt, action: action };
        return prompt + ' Press Y or Enter to confirm. Any other key cancels.';
    }

    function resolveConfirm(state, key) {
        var c = state.confirm;
        state.confirm = null;
        if (!c) return { say: null };
        if (key.name === 'y' || key.name === 'Enter') return { say: null, action: c.action, confirmed: true };
        return { say: 'Action cancelled.', confirmed: false };
    }

    // ---------- help viewer (DESIGN.md 21.5) ----------

    // Help is a flat array of lines, some of which are headings. A heading line
    // ends in the words Heading Level 2 so the structure is audible without any
    // real heading elements, and H moves between them.
    function makeHelp(lines, title) {
        return { lines: lines || [], index: 0, title: title || 'Help' };
    }

    function helpAnnounce(help) {
        return help.lines.length ? help.lines[help.index].text : 'Nothing here.';
    }

    function helpMove(help, delta) {
        var n = help.lines.length;
        if (!n) return 'Nothing here.';
        var next = help.index + delta;
        if (next < 0) return 'Top of help.';
        if (next >= n) return 'End of help.';
        help.index = next;
        return help.lines[help.index].text;
    }

    function helpHeading(help, dir) {
        var i = help.index + dir;
        while (i >= 0 && i < help.lines.length) {
            if (help.lines[i].heading) { help.index = i; return help.lines[i].text; }
            i += dir;
        }
        return dir > 0 ? 'No more headings.' : 'No earlier headings.';
    }

    // ---------- pacing and verbosity toggles ----------

    function cyclePacing(state) {
        var i = PACING_ORDER.indexOf(state.pacing);
        state.pacing = PACING_ORDER[(i + 1) % PACING_ORDER.length];
        return 'Pacing ' + state.pacing + '.';
    }

    function cycleVerbosity(state) {
        state.verbosity = state.verbosity === 'full' ? 'terse' : 'full';
        return 'Verbosity ' + state.verbosity + '.';
    }

    var api = {
        sanitize: sanitize, numberWords: numberWords,
        makeQueue: makeQueue, enqueue: enqueue, dequeue: dequeue, queueClear: queueClear,
        queueBoundary: queueBoundary, dequeueSegment: dequeueSegment, queueHasItems: queueHasItems,
        lastBoundaryKind: lastBoundaryKind,
        PRIORITY_ORDER: PRIORITY_ORDER, PACING: PACING, PACING_ORDER: PACING_ORDER, pauseFor: pauseFor,
        makeMenu: makeMenu, menuAnnounce: menuAnnounce, menuMove: menuMove, menuSelect: menuSelect,
        menuFastForward: menuFastForward,
        makeGrid: makeGrid, gridAnnounce: gridAnnounce, gridMove: gridMove, gridCell: gridCell,
        makeAllocation: makeAllocation, allocAnnounce: allocAnnounce, allocMove: allocMove,
        allocAdjust: allocAdjust, allocSpare: allocSpare, allocLine: allocLine, allocCurrent: allocCurrent,
        newState: newState, dispatch: dispatch, INTERCEPTORS: INTERCEPTORS,
        FALLS_THROUGH: FALLS_THROUGH, layerActive: layerActive,
        askConfirm: askConfirm, resolveConfirm: resolveConfirm,
        makeHelp: makeHelp, helpAnnounce: helpAnnounce, helpMove: helpMove, helpHeading: helpHeading,
        cyclePacing: cyclePacing, cycleVerbosity: cycleVerbosity
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.AF = root.AF || {};
    root.AF.ui = api;
})(typeof window !== 'undefined' ? window : globalThis);
