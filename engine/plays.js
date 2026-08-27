// plays.js - Formations, play concepts, defensive calls, and the scheme matrix
// (Accessible Football engine). Plain script, no browser dependencies.
// See DESIGN.md sections 16 and 26.
//
// The scheme matrix is authored by hand with football reasoning. It is the
// reason different concepts exist: a concept can win a snap against the right
// coverage without a talent edge, and lose one against the wrong coverage
// with a talent edge. Values are roughly -12 to +12 and are added to the
// matchup math in resolve.js.

(function (root) {
    'use strict';

    // ---------- Offensive formations ----------
    // personnel: which depth-chart slots are on the field besides the five OL.
    var FORMATIONS = {
        SPREAD: { name: 'Spread', personnel: '11', gun: true,
                  roles: ['QB1', 'RB1', 'TE1', 'WR1', 'WR2', 'WR3'],
                  say: 'one back, one tight end, three receivers, shotgun' },
        TRIPS:  { name: 'Trips', personnel: '11', gun: true,
                  roles: ['QB1', 'RB1', 'TE1', 'WR1', 'WR2', 'WR3'],
                  say: 'three receivers to one side, shotgun' },
        IFORM:  { name: 'I Formation', personnel: '21', gun: false,
                  roles: ['QB1', 'RB1', 'RB2', 'TE1', 'WR1', 'WR2'],
                  say: 'two backs, one tight end, two receivers, under center' },
        HEAVY:  { name: 'Heavy', personnel: '22', gun: false,
                  roles: ['QB1', 'RB1', 'RB2', 'TE1', 'TE2', 'WR1'],
                  say: 'two backs, two tight ends, one receiver' }
    };

    // ---------- Offensive concepts ----------
    // type: run | pass | special
    // reads: progression of receiver roles (pass)
    // depth: short | int | deep  (air yards band)
    // ttt: time to throw in seconds (pass)
    // poa: inside | offtackle | outside | draw (run)
    // risk: outcome spread multiplier (1 = normal)
    // yac: how much run-after-catch the concept allows (0..1)
    // pa: play action (freezes linebackers, adds time to throw)
    // vsCov: modifier by coverage; vsPress: by pressure; vsBox: by box weight (runs)
    // complexity: 1 easy, 3 hard (learning and decay, DESIGN.md 16.2)
    var CONCEPTS = {
        IZONE: { name: 'Inside Zone', type: 'run', poa: 'inside', risk: 0.8, complexity: 1,
                 forms: ['SPREAD', 'TRIPS', 'IFORM', 'HEAVY'], tags: ['1st', '2nd', 'short', 'goal'],
                 desc: 'A downhill run between the tackles. Good against light boxes, bad against a loaded box.',
                 vsBox: { light: 8, normal: 0, loaded: -8 }, vsCov: {}, vsPress: { R4: 0, R5: -2, R6: -4, ZB: -1 } },
        OZONE: { name: 'Outside Zone', type: 'run', poa: 'outside', risk: 1.2, complexity: 2,
                 forms: ['SPREAD', 'IFORM', 'HEAVY'], tags: ['1st', '2nd'],
                 desc: 'A stretch run to the edge. Good against slow fronts and heavy boxes, bad against contain.',
                 vsBox: { light: 4, normal: 2, loaded: -3 }, vsCov: {}, vsPress: { R4: 0, R5: 1, R6: 2, ZB: 0 } },
        POWER: { name: 'Power', type: 'run', poa: 'offtackle', risk: 0.9, complexity: 2,
                 forms: ['IFORM', 'HEAVY'], tags: ['1st', '2nd', 'short', 'goal'],
                 desc: 'A pulling guard leads the back off tackle. Good against undisciplined fronts, bad against a stout interior.',
                 vsBox: { light: 6, normal: 2, loaded: -6 }, vsCov: {}, vsPress: { R4: 0, R5: -2, R6: -5, ZB: -2 } },
        COUNTER: { name: 'Counter', type: 'run', poa: 'offtackle', risk: 1.3, complexity: 3,
                 forms: ['IFORM', 'HEAVY', 'SPREAD'], tags: ['1st', '2nd'],
                 desc: 'A misdirection run that punishes fast-flowing linebackers. Slow to develop.',
                 vsBox: { light: 3, normal: 4, loaded: -4 }, vsCov: {}, vsPress: { R4: 2, R5: 3, R6: -2, ZB: 1 } },
        DRAW:  { name: 'Draw', type: 'run', poa: 'draw', risk: 1.3, complexity: 2,
                 forms: ['SPREAD', 'TRIPS'], tags: ['2nd', 'long'],
                 desc: 'A fake pass that hands off late. Good against pass-rush fronts and blitzes on long downs.',
                 vsBox: { light: 8, normal: 2, loaded: -8 }, vsCov: {}, vsPress: { R4: 0, R5: 4, R6: 6, ZB: 2 } },
        SNEAK: { name: 'Quarterback Sneak', type: 'run', poa: 'inside', risk: 0.4, complexity: 1,
                 forms: ['IFORM', 'HEAVY'], tags: ['short', 'goal'], qbRun: true,
                 desc: 'The quarterback follows the center for a yard. For a yard or less.',
                 vsBox: { light: 4, normal: 2, loaded: 0 }, vsCov: {}, vsPress: { R4: 0, R5: 0, R6: 0, ZB: 0 } },
        QUICK: { name: 'Quick Game', type: 'pass', depth: 'short', ttt: 1.7, risk: 0.7, yac: 0.5, complexity: 1,
                 forms: ['SPREAD', 'TRIPS', 'IFORM'], reads: ['WR1', 'WR3', 'RB1'], tags: ['1st', '2nd', 'short', 'two'],
                 desc: 'Slants and flats thrown on rhythm. Beats blitzes and soft coverage, struggles against press with help.',
                 vsCov: { C0: 8, C1: 2, C2: -3, C3: 4, C4: 5, C2M: -5 }, vsPress: { R4: 0, R5: 4, R6: 8, ZB: 2 } },
        STICK: { name: 'Stick', type: 'pass', depth: 'short', ttt: 1.9, risk: 0.7, yac: 0.4, complexity: 1,
                 forms: ['SPREAD', 'TRIPS'], reads: ['TE1', 'WR3', 'RB1'], tags: ['1st', '2nd', 'short', 'med'],
                 desc: 'The tight end sits in the soft spot of the zone. Beats zone, loses to tight man.',
                 vsCov: { C0: -2, C1: -3, C2: 5, C3: 6, C4: 4, C2M: -4 }, vsPress: { R4: 0, R5: 3, R6: 5, ZB: 3 } },
        CURLFLAT: { name: 'Curl and Flat', type: 'pass', depth: 'int', ttt: 2.4, risk: 0.9, yac: 0.3, complexity: 1,
                 forms: ['SPREAD', 'TRIPS', 'IFORM', 'HEAVY'], reads: ['WR1', 'RB1', 'WR2'], tags: ['2nd', 'med'],
                 desc: 'A high-low read on the flat defender. Beats cover three, loses to man.',
                 vsCov: { C0: -4, C1: -4, C2: 2, C3: 7, C4: 3, C2M: -5 }, vsPress: { R4: 0, R5: 0, R6: -3, ZB: 1 } },
        MESH:  { name: 'Mesh', type: 'pass', depth: 'short', ttt: 2.3, risk: 1.0, yac: 0.8, complexity: 3,
                 forms: ['SPREAD', 'TRIPS'], reads: ['WR3', 'WR2', 'RB1'], tags: ['2nd', 'med', 'two'],
                 desc: 'Two crossers rub the man defenders. Beats man, average against zone. Hard to learn.',
                 vsCov: { C0: 9, C1: 8, C2: 0, C3: 1, C4: 0, C2M: 6 }, vsPress: { R4: 0, R5: 1, R6: 2, ZB: -1 } },
        VERTS: { name: 'Four Verticals', type: 'pass', depth: 'deep', ttt: 3.0, risk: 1.6, yac: 0.4, complexity: 2,
                 forms: ['SPREAD', 'TRIPS'], reads: ['WR3', 'WR1', 'TE1'], tags: ['long', 'two'],
                 desc: 'Everyone runs deep. Beats cover three in the seams and cover one, loses to two deep safeties.',
                 vsCov: { C0: 6, C1: 4, C2: -6, C3: 8, C4: -8, C2M: -6 }, vsPress: { R4: 0, R5: -4, R6: -9, ZB: -2 } },
        POSTDIG: { name: 'Post and Dig', type: 'pass', depth: 'int', ttt: 2.7, risk: 1.2, yac: 0.4, complexity: 2,
                 forms: ['SPREAD', 'TRIPS', 'IFORM'], reads: ['WR2', 'WR1', 'RB1'], tags: ['2nd', 'med', 'long'],
                 desc: 'A deep post clears the safety and the dig comes underneath. Beats two-high zones, loses to a lurking linebacker in man.',
                 vsCov: { C0: 0, C1: 3, C2: 6, C3: 2, C4: 5, C2M: -3 }, vsPress: { R4: 0, R5: -3, R6: -7, ZB: -2 } },
        PASHOT: { name: 'Play Action Shot', type: 'pass', depth: 'deep', ttt: 3.0, risk: 1.7, yac: 0.3, pa: true, complexity: 2,
                 forms: ['IFORM', 'HEAVY', 'SPREAD'], reads: ['WR1', 'TE1', 'WR2'], tags: ['1st', 'long'],
                 desc: 'A run fake and a deep throw. Beats one-high coverage and aggressive linebackers, loses to a patient two-deep shell.',
                 vsCov: { C0: 5, C1: 8, C2: -6, C3: 6, C4: -7, C2M: -4 }, vsPress: { R4: 0, R5: -4, R6: -10, ZB: -3 } },
        PABOOT: { name: 'Play Action Boot', type: 'pass', depth: 'int', ttt: 2.7, risk: 1.1, yac: 0.6, pa: true, complexity: 2,
                 forms: ['IFORM', 'HEAVY'], reads: ['TE1', 'WR1', 'RB2'], tags: ['1st', '2nd', 'med'],
                 desc: 'The quarterback rolls away from the run fake. Beats fast-flowing defenses, loses to contain and a spy.',
                 vsCov: { C0: 2, C1: 5, C2: 1, C3: 5, C4: -2, C2M: 0 }, vsPress: { R4: 0, R5: 2, R6: -3, ZB: -4 } },
        RBSCREEN: { name: 'Running Back Screen', type: 'pass', depth: 'short', ttt: 2.6, risk: 1.4, yac: 1.0, complexity: 2,
                 forms: ['SPREAD', 'TRIPS', 'IFORM'], reads: ['RB1'], tags: ['2nd', 'long'], screen: true,
                 desc: 'Let the rush come, then throw over it with linemen out front. Beats pressure, loses to contain and a patient rush.',
                 vsCov: { C0: 3, C1: 2, C2: 0, C3: 1, C4: 2, C2M: 1 }, vsPress: { R4: -3, R5: 5, R6: 9, ZB: -4 } },
        WRSCREEN: { name: 'Receiver Screen', type: 'pass', depth: 'short', ttt: 1.4, risk: 1.1, yac: 1.0, complexity: 1,
                 forms: ['SPREAD', 'TRIPS'], reads: ['WR1'], tags: ['1st', '2nd', 'short'], screen: true,
                 desc: 'A quick throw outside with receivers blocking. Beats off coverage and blitzes, loses to press.',
                 vsCov: { C0: 5, C1: -2, C2: -3, C3: 5, C4: 6, C2M: -4 }, vsPress: { R4: 0, R5: 4, R6: 7, ZB: 1 } },
        // Clock plays
        SPIKE: { name: 'Spike', type: 'special', tags: ['two'], forms: ['SPREAD', 'TRIPS', 'IFORM', 'HEAVY'], complexity: 1,
                 desc: 'Stops the clock at the cost of a down.', vsCov: {}, vsPress: {} },
        KNEEL: { name: 'Kneel', type: 'special', tags: ['kill'], forms: ['IFORM', 'HEAVY'], complexity: 1,
                 desc: 'Runs the clock out.', vsCov: {}, vsPress: {} }
    };

    // ---------- Defensive fronts ----------
    // dl, lb, db: personnel on the field. box: base defenders near the line.
    var FRONTS = {
        OVER:   { name: 'Four-three over', dl: 4, lb: 3, db: 4, box: 7, say: 'four linemen, three linebackers' },
        UNDER:  { name: 'Four-three under', dl: 4, lb: 3, db: 4, box: 7, edgeStrong: true, say: 'four linemen, three linebackers, strength to the tight end' },
        THREE4: { name: 'Three-four', dl: 3, lb: 4, db: 4, box: 7, say: 'three linemen, four linebackers' },
        NICKEL: { name: 'Nickel', dl: 4, lb: 2, db: 5, box: 6, say: 'five defensive backs' },
        DIME:   { name: 'Dime', dl: 4, lb: 1, db: 6, box: 5, say: 'six defensive backs' },
        GOAL:   { name: 'Goal line', dl: 5, lb: 3, db: 3, box: 8, say: 'five linemen, three linebackers, three backs' }
    };

    // ---------- Coverages ----------
    // man: true for man coverage. deep: safeties kept deep. boxAdd: safeties rolled down.
    var COVERAGES = {
        C0:  { name: 'Cover zero', man: true,  deep: 0, boxAdd: 2, say: 'man coverage, no safety help' },
        C1:  { name: 'Cover one', man: true,  deep: 1, boxAdd: 1, say: 'man coverage, one deep safety' },
        C2:  { name: 'Cover two', man: false, deep: 2, boxAdd: 0, say: 'zone, two deep safeties, corners in the flats' },
        C3:  { name: 'Cover three', man: false, deep: 1, boxAdd: 1, say: 'zone, three deep, four under, one safety down' },
        C4:  { name: 'Cover four', man: false, deep: 2, boxAdd: 0, say: 'quarters zone, four deep, three under' },
        C2M: { name: 'Two man', man: true,  deep: 2, boxAdd: 0, say: 'man underneath with two deep safeties' }
    };

    // ---------- Pressure packages ----------
    var PRESSURES = {
        R4: { name: 'Four-man rush', rushers: 4, say: 'four rushers' },
        R5: { name: 'Five-man pressure', rushers: 5, say: 'five rushers' },
        R6: { name: 'Six-man blitz', rushers: 6, say: 'six rushers, all out' },
        ZB: { name: 'Zone blitz', rushers: 5, dropsLineman: true, disguise: true, say: 'a lineman drops, a linebacker comes' }
    };

    // ---------- Adjustments ----------
    var ADJUSTMENTS = {
        NONE:    { name: 'No adjustment', say: 'no adjustment' },
        BRACKET: { name: 'Bracket the X receiver', target: 'WR1', say: 'two defenders on their top receiver' },
        HELP:    { name: 'Safety help over the X', target: 'WR1', say: 'safety shaded over their top receiver' },
        SPY:     { name: 'Spy the quarterback', say: 'a linebacker watches the quarterback' },
        CONTAIN: { name: 'Contain the edge', say: 'ends stay wide, nothing gets outside' },
        LOAD:    { name: 'Load the box', say: 'a safety comes down to stop the run' }
    };

    // Air-yard bands for pass depth
    var DEPTH_YARDS = { short: [2, 8], int: [10, 16], deep: [22, 42] };

    // Build the play list: every legal (formation, concept) pair.
    function buildPlaybook() {
        var plays = [], f, c;
        for (c in CONCEPTS) {
            for (f = 0; f < CONCEPTS[c].forms.length; f++) {
                plays.push({ id: c + '@' + CONCEPTS[c].forms[f], concept: c, formation: CONCEPTS[c].forms[f],
                             name: CONCEPTS[c].name + ' from ' + FORMATIONS[CONCEPTS[c].forms[f]].name,
                             exec: 50, calls: 0, success: 0, yards: 0 });
            }
        }
        return plays;
    }

    // Box weight for a defensive call against an offensive personnel group.
    // Returns 'light' | 'normal' | 'loaded' and the box count.
    function boxWeight(front, coverage, adjustment, personnel) {
        var box = FRONTS[front].box + COVERAGES[coverage].boxAdd + (adjustment === 'LOAD' ? 1 : 0);
        // Blockers available: 5 OL + tight ends + fullback
        var blockers = 5 + (personnel === '11' ? 1 : personnel === '21' ? 2 : personnel === '22' ? 3 : 0);
        var diff = box - blockers; // 0 means even numbers
        var weight = diff <= 0 ? 'light' : (diff === 1 ? 'normal' : 'loaded');
        return { box: box, blockers: blockers, weight: weight };
    }

    var api = { FORMATIONS: FORMATIONS, CONCEPTS: CONCEPTS, FRONTS: FRONTS, COVERAGES: COVERAGES,
                PRESSURES: PRESSURES, ADJUSTMENTS: ADJUSTMENTS, DEPTH_YARDS: DEPTH_YARDS,
                buildPlaybook: buildPlaybook, boxWeight: boxWeight };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.AF = root.AF || {};
    root.AF.plays = api;
})(typeof window !== 'undefined' ? window : globalThis);
