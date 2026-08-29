// ui_core_test.js - The interface logic that does not touch the page.
// Covers the announce queue and its ordering, menu wrap, grid edges, the
// interceptor priority that stops a key leaking from one mode into another,
// the speech sanitiser, and the Focus allocation rule from DESIGN.md 21.9,
// which is tested even though the weekly screen is not built yet.

'use strict';

var path = require('path');
var U = require(path.join(__dirname, '..', 'ui', 'core.js'));
var HELP = require(path.join(__dirname, '..', 'ui', 'help_text.js'));

module.exports = function (t) {
    // ---------- the sanitiser (DESIGN.md 21.3, CLAUDE.md) ----------
    t.eq(U.sanitize('3rd and 7'), 'third and seven', 'down and distance is spoken as words');
    t.eq(U.sanitize('1st and 10'), 'first and ten', 'first and ten is spoken as words');
    t.ok(U.sanitize('a loss of -3').indexOf('minus') >= 0, 'a minus sign becomes the word minus');
    t.ok(U.sanitize('working 62%').indexOf('percent') >= 0, 'a percent sign becomes the word percent');
    t.eq(U.sanitize('**bold** and _under_'), 'bold and under', 'markdown characters are stripped');
    t.eq(U.sanitize(null), '', 'nothing sanitises to nothing rather than throwing');
    t.eq(U.numberWords(0), 'zero', 'zero has a word');
    t.eq(U.numberWords(17), 'seventeen', 'the teens have words');
    t.eq(U.numberWords(42), 'forty two', 'the tens have words');

    // ---------- the announce queue (DESIGN.md 19.3) ----------
    var q = U.makeQueue();
    U.enqueue(q, 'a batched note', 'batched');
    U.enqueue(q, 'the play result', 'result');
    U.enqueue(q, 'a substitution request', 'must');
    t.eq(U.dequeue(q).text, 'the play result', 'the result is spoken first');
    t.eq(U.dequeue(q).text, 'a substitution request', 'a must answer report comes next');
    t.eq(U.dequeue(q).text, 'a batched note', 'a batched note comes last');
    t.eq(U.dequeue(q), null, 'an empty queue gives back nothing');

    // Inside one priority, first in is first out.
    q = U.makeQueue();
    U.enqueue(q, 'first', 'result');
    U.enqueue(q, 'second', 'result');
    U.enqueue(q, 'third', 'result');
    t.eq(U.dequeue(q).text, 'first', 'the queue is stable inside a priority');
    t.eq(U.dequeue(q).text, 'second', 'the queue stays stable inside a priority');
    U.enqueue(q, 'urgent', 'must');
    t.eq(U.dequeue(q).text, 'third', 'a lower priority already waiting is not jumped by a later must');
    U.queueClear(q);
    t.eq(q.items.length, 0, 'the queue can be cleared');

    // Nothing empty ever gets queued.
    q = U.makeQueue();
    U.enqueue(q, '', 'result');
    U.enqueue(q, null, 'result');
    t.eq(q.items.length, 0, 'empty announcements are not queued');

    // ---------- pacing (DESIGN.md 21.8) ----------
    t.ok(U.pauseFor('a short line', 'fast') < U.pauseFor('a short line', 'slow'), 'slow pacing waits longer than fast');
    t.ok(U.pauseFor('a much longer line of speech than the other one', 'medium') > U.pauseFor('short', 'medium'),
         'a longer line gets a longer pause');
    t.eq(U.pauseFor('anything', 'manual'), -1, 'manual pacing waits for the coach instead of a timer');

    // ---------- menus wrap (DESIGN.md 21.4) ----------
    var menu = U.makeMenu([{ text: 'one' }, { text: 'two' }, { text: 'three' }], 'Pick one.');
    t.ok(U.menuAnnounce(menu).indexOf('Pick one.') === 0, 'the prompt is spoken on entry');
    t.ok(U.menuAnnounce(menu).indexOf('Pick one.') < 0, 'the prompt is not spoken again');
    t.eq(U.menuMove(menu, -1), 'three', 'going up from the top wraps to the bottom');
    t.eq(U.menuMove(menu, 1), 'one', 'going down from the bottom wraps to the top');
    t.eq(U.menuMove(menu, 1), 'two', 'down moves on one');
    t.eq(U.menuSelect(menu).text, 'two', 'select takes the item the cursor is on');
    var empty = U.makeMenu([], 'Nothing.');
    t.eq(U.menuSelect(empty), null, 'an empty menu selects nothing rather than throwing');
    t.ok(U.menuMove(empty, 1).length > 0, 'an empty menu still says something');

    // Control and Enter takes the last real choice, not the way out.
    var wizard = U.makeMenu([{ text: 'one' }, { text: 'two' }, { text: 'Back to the menu.' }], '');
    t.eq(U.menuFastForward(wizard).text, 'two', 'fast forward skips the way out');

    // ---------- grids speak their edges (DESIGN.md 21.6) ----------
    var grid = U.makeGrid(['Riverton', 'Fairview'], ['Points', 'Yards'], [[21, 310], [17, 288]], 'Score');
    var first = U.gridAnnounce(grid);
    t.ok(first.indexOf('Score') >= 0, 'a grid says what it is on entry');
    t.ok(first.indexOf('Riverton') >= 0 && first.indexOf('Points') >= 0 && first.indexOf('21') >= 0,
         'a cell is spoken as row, column and value');
    t.eq(U.gridMove(grid, -1, 0), 'Top edge.', 'the top edge is spoken');
    t.eq(U.gridMove(grid, 0, -1), 'Left edge.', 'the left edge is spoken');
    t.ok(U.gridMove(grid, 0, 1).indexOf('Yards') >= 0, 'moving right speaks the new column');
    t.eq(U.gridMove(grid, 0, 1), 'Right edge.', 'the right edge is spoken');
    t.ok(U.gridMove(grid, 1, 0).indexOf('Fairview') >= 0, 'moving down speaks the new row');
    t.eq(U.gridMove(grid, 1, 0), 'Bottom edge.', 'the bottom edge is spoken');

    // ---------- the interceptor stack (DESIGN.md 21.2) ----------
    // The point of the firewall is that a key pressed while help is open can
    // never reach the game and call a play.
    var reached = { help: 0, game: 0, viewer: 0, confirm: 0 };
    var hs = {
        confirm: function () { reached.confirm++; return { say: 'confirm' }; },
        explore: function () { return { say: 'explore' }; },
        help: function () { reached.help++; return { say: 'help' }; },
        viewer: function () { reached.viewer++; return { say: 'viewer' }; },
        mode: function () { reached.game++; return { say: 'game' }; }
    };
    var state = U.newState('game');
    U.dispatch(state, { name: 'ArrowDown' }, hs);
    t.eq(reached.game, 1, 'with nothing open a key reaches the game');

    state.help = U.makeHelp([{ text: 'a line' }], 'Help');
    U.dispatch(state, { name: 'ArrowDown' }, hs);
    t.eq(reached.help, 1, 'with help open the key reaches help');
    t.eq(reached.game, 1, 'with help open the key never reaches the game');

    state.viewer = { kind: 'roster' };
    U.dispatch(state, { name: 'ArrowDown' }, hs);
    t.eq(reached.help, 2, 'help sits above a viewer in the stack');
    t.eq(reached.viewer, 0, 'a viewer never sees a key while help is open');

    state.help = null;
    U.dispatch(state, { name: 'ArrowDown' }, hs);
    t.eq(reached.viewer, 1, 'with help closed the viewer gets the key');
    t.eq(reached.game, 1, 'a viewer still keeps the key away from the game');

    state.confirm = { prompt: 'Sure?', action: function () {} };
    U.dispatch(state, { name: 'ArrowDown' }, hs);
    t.eq(reached.confirm, 1, 'a pending confirmation sits at the very top');
    t.eq(reached.viewer, 1, 'nothing below a confirmation sees the key');

    // An active layer that does not want the key still swallows it.
    var swallowState = U.newState('game');
    swallowState.viewer = { kind: 'roster' };
    var swallowed = U.dispatch(swallowState, { name: 'z' }, {
        viewer: function () { return null; },
        mode: function () { throw new Error('the game must not see this key'); }
    });
    t.ok(swallowed.swallowed === true, 'an open viewer swallows a key it does not want');

    // ---------- confirmations (DESIGN.md 21.7) ----------
    var cstate = U.newState('game');
    var fired = 0;
    var prompt = U.askConfirm(cstate, 'Quit?', function () { fired++; });
    t.ok(prompt.indexOf('Y') >= 0, 'a confirmation says which key confirms');
    var yes = U.resolveConfirm(cstate, { name: 'y' });
    t.ok(yes.confirmed, 'Y confirms');
    if (yes.action) yes.action();
    t.eq(fired, 1, 'confirming runs the action');
    t.eq(cstate.confirm, null, 'the confirmation clears itself');
    U.askConfirm(cstate, 'Quit?', function () { fired++; });
    var no = U.resolveConfirm(cstate, { name: 'j' });
    t.ok(!no.confirmed, 'any other key cancels');
    t.eq(no.say, 'Action cancelled.', 'cancelling says so');
    t.eq(fired, 1, 'cancelling does not run the action');

    // ---------- help headings (DESIGN.md 21.5) ----------
    var help = U.makeHelp([
        { text: 'navigation line', heading: false },
        { text: 'First heading. Heading Level 2', heading: true },
        { text: 'a line', heading: false },
        { text: 'Second heading. Heading Level 2', heading: true },
        { text: 'another line', heading: false }
    ], 'Help');
    t.eq(U.helpMove(help, -1), 'Top of help.', 'the top of help is spoken');
    t.ok(U.helpHeading(help, 1).indexOf('First heading') >= 0, 'H moves to the next heading');
    t.ok(U.helpHeading(help, 1).indexOf('Second heading') >= 0, 'H keeps moving forward');
    t.eq(U.helpHeading(help, 1), 'No more headings.', 'running out of headings is spoken');
    t.ok(U.helpHeading(help, -1).indexOf('First heading') >= 0, 'Shift H moves back');
    help.index = help.lines.length - 1;
    t.eq(U.helpMove(help, 1), 'End of help.', 'the end of help is spoken');

    // Every help array ends its heading lines the way the design requires.
    var modes = ['boot', 'menu', 'team', 'pregame', 'game', 'viewer', 'halftime', 'final'], mi, lines, li;
    for (mi = 0; mi < modes.length; mi++) {
        lines = HELP.helpFor(modes[mi]);
        t.ok(lines.length > 3, 'the help for ' + modes[mi] + ' has something in it');
        for (li = 0; li < lines.length; li++) {
            if (lines[li].heading) {
                t.ok(/Heading Level 2$/.test(lines[li].text), 'a heading in ' + modes[mi] + ' announces itself as a heading');
            }
        }
    }

    // ---------- the keyboard explorer table (DESIGN.md 21.5) ----------
    t.ok(HELP.getKeyDescription('F1', false, false, 'game').indexOf('Help') >= 0, 'F1 is described');
    t.ok(HELP.getKeyDescription('ArrowUp', false, false, 'game').indexOf('Up arrow') >= 0, 'the arrows are described by name');
    t.ok(HELP.getKeyDescription('n', false, false, 'game').indexOf('No huddle') >= 0, 'a game key is described in game mode');
    t.ok(HELP.getKeyDescription('zzz', false, false, 'game').indexOf('does nothing') >= 0, 'an unused key says so rather than going quiet');
    t.ok(HELP.getKeyDescription(' ', false, false, 'game').indexOf('Spacebar') >= 0, 'the spacebar is described by name');
    // Every key the explorer knows about must appear somewhere in the help.
    var gameHelp = HELP.helpFor('game').map(function (x) { return x.text; }).join(' ').toLowerCase();
    var keys = ['n', 'u', 'm', 't', 'r', 'x', 'b', 'o', 'e'], ki, missing = [];
    for (ki = 0; ki < keys.length; ki++) {
        if (gameHelp.indexOf(' ' + keys[ki] + ' ') < 0) missing.push(keys[ki]);
    }
    t.eq(missing.length, 0, 'every in-game key is mentioned in the help text (missing: ' + missing.join(',') + ')');

    // ---------- the Focus allocation rule (DESIGN.md 21.9) ----------
    var alloc = U.makeAllocation([
        { id: 'practice', name: 'Practice' },
        { id: 'film', name: 'Film study' },
        { id: 'rest', name: 'Rest' }
    ], 100, 5);
    t.eq(U.allocSpare(alloc), 100, 'everything starts unallocated');
    t.ok(U.allocAnnounce(alloc).indexOf('Practice') >= 0, 'the allocation says which category you are on');
    var raised = U.allocAdjust(alloc, 1);
    t.ok(raised.indexOf('five percent') >= 0, 'raising moves the value by the step');
    t.eq(alloc.values.practice, 5, 'the value actually moved');
    t.eq(U.allocSpare(alloc), 95, 'the spare came down');
    // Spend the lot.
    var guard = 0;
    while (U.allocSpare(alloc) > 0 && guard++ < 100) U.allocAdjust(alloc, 1);
    t.eq(U.allocSpare(alloc), 0, 'the whole hundred can be spent');
    var before = alloc.values.practice;
    var refused = U.allocAdjust(alloc, 1);
    t.eq(refused, 'Nothing unallocated. Lower another category first.',
         'raising with nothing spare says so instead of taking points from elsewhere');
    t.eq(alloc.values.practice, before, 'the value did not move');
    // And nothing was quietly taken from a category the coach is not on.
    U.allocMove(alloc, 1);
    var filmBefore = alloc.values.film;
    U.allocAdjust(alloc, 1);
    t.eq(alloc.values.film, filmBefore, 'no silent change anywhere when there is nothing spare');
    // Film is still at zero, because every point went to practice, so
    // lowering it must refuse rather than going negative.
    t.ok(U.allocAdjust(alloc, -1).indexOf('already at zero') >= 0, 'lowering a category at zero says so');
    t.eq(alloc.values.film, 0, 'a category at zero never goes below it');
    // Go back to the category that has the points and lower that one.
    U.allocMove(alloc, -1);
    var practiceBefore = alloc.values.practice;
    U.allocAdjust(alloc, -1);
    t.eq(alloc.values.practice, practiceBefore - 5, 'lowering works');
    t.eq(U.allocSpare(alloc), 5, 'the points freed up become spare');
    t.ok(U.allocLine(alloc).indexOf('unallocated') >= 0, 'the whole allocation reads as one line');

    // ---------- pacing and verbosity toggles ----------
    var ts = U.newState('game');
    t.eq(ts.pacing, 'medium', 'pacing starts at medium');
    U.cyclePacing(ts);
    t.eq(ts.pacing, 'slow', 'pacing cycles');
    t.eq(ts.verbosity, 'full', 'verbosity starts full');
    U.cycleVerbosity(ts);
    t.eq(ts.verbosity, 'terse', 'verbosity switches to terse');

    // ---------- the whistle boundary (ISSUES.md 2026-08-28) ----------
    // A boundary splits the queue into utterances: the play result before it,
    // the next call after it, the referee whistle in the gap.
    var wq = U.makeQueue();
    U.enqueue(wq, 'the play result', 'result');
    U.queueBoundary(wq);
    U.enqueue(wq, 'the next suggestion', 'result');
    var seg1 = U.dequeueSegment(wq);
    t.eq(seg1.length, 1, 'the first utterance stops at the boundary');
    t.eq(seg1[0].text, 'the play result', 'and it is the play result');
    t.ok(U.queueHasItems(wq), 'the suggestion is still queued behind the whistle');
    var seg2 = U.dequeueSegment(wq);
    t.eq(seg2[0].text, 'the next suggestion', 'the second utterance is the suggestion');
    t.ok(!U.queueHasItems(wq), 'nothing is left after both segments');

    // Priority sorting never crosses a boundary: a high priority line queued
    // for the new play cannot jump back into the old play's utterance.
    var pq = U.makeQueue();
    U.enqueue(pq, 'a low priority note from the old play', 'batched');
    U.queueBoundary(pq);
    U.enqueue(pq, 'a must answer for the new play', 'must');
    t.eq(U.dequeueSegment(pq)[0].text, 'a low priority note from the old play',
         'a must for the new play never jumps in front of the old play');

    // A boundary in front of nothing is not a boundary: the whistle must
    // never blow in front of silence.
    var eq2 = U.makeQueue();
    U.queueBoundary(eq2);
    U.enqueue(eq2, 'only line', 'result');
    var only = U.dequeueSegment(eq2);
    t.eq(only[0].text, 'only line', 'a boundary on an empty queue creates no empty utterance');
    t.ok(!U.queueHasItems(eq2), 'and nothing is stranded behind it');

    // Two boundaries in a row collapse to one split.
    var dq = U.makeQueue();
    U.enqueue(dq, 'first', 'result');
    U.queueBoundary(dq);
    U.queueBoundary(dq);
    U.enqueue(dq, 'second', 'result');
    U.dequeueSegment(dq);
    t.eq(U.dequeueSegment(dq)[0].text, 'second', 'a doubled boundary still yields exactly two utterances');
    t.ok(!U.queueHasItems(dq), 'with nothing between them');

    // queueClear resets the segmentation with the items.
    var cq = U.makeQueue();
    U.enqueue(cq, 'x', 'result');
    U.queueBoundary(cq);
    U.enqueue(cq, 'y', 'result');
    U.queueClear(cq);
    t.eq(cq.segment, 0, 'clearing the queue resets the segment counter');
    t.ok(!U.queueHasItems(cq), 'and empties it');

    // The report flag rides on the item, so the speaker can set the C repeat
    // buffer from what was actually spoken rather than what was queued.
    var rq = U.makeQueue();
    U.enqueue(rq, 'football', 'result', 'OC', true);
    U.enqueue(rq, 'chatter', 'ui', null, false);
    var rItems = U.dequeueSegment(rq);
    t.ok(rItems[0].report === true && rItems[1].report === false,
         'the report flag distinguishes football from interface chatter at speak time');
};
