// help_text.js - The help arrays by mode and the key description table that
// the keyboard explorer reads. (Accessible Football)
// Plain script, no browser dependencies. Implements DESIGN.md 21.5.
//
// This file owns every word of help and every key description. A key that is
// not described here is a bug: CLAUDE.md requires every key to be in the help
// text and reachable from explore mode.
//
// A help array is a flat list of { text, heading }. A heading line ends in the
// words Heading Level 2 so the structure is audible even though there are no
// real heading elements, and H and Shift H jump between them (DESIGN.md 21.5).

(function (root) {
    'use strict';

    function h(text) { return { text: text + '. Heading Level 2', heading: true }; }
    function l(text) { return { text: text, heading: false }; }

    var NAV = l('Use up and down arrow to move through this help. H moves to the next heading, Shift H to the previous one. Escape or Enter closes help and puts you back where you were.');

    var GLOBAL = [
        h('Keys that work everywhere'),
        l('F1 opens and closes this help.'),
        l('F12 turns the keyboard explorer on and off. While it is on, every key you press is described and nothing happens.'),
        l('Tab reads the situation: down, distance, where the ball is, the quarter, the clock and the score.'),
        l('Shift Tab reads the seed of this game. Give that number with anything you report, because the seed replays the whole game.'),
        l('C repeats the last thing you were told.'),
        l('P changes the pacing between fast, medium, slow and manual. On manual, the game waits for the spacebar before anything happens on its own.'),
        l('V switches between full and terse. Terse gives you one line a play.'),
        l('I turns the play hints on and off. A hint is the short note your coordinator adds about what a concept beats and what it loses to. It is separate from V, so you can keep the full play by play and still stop being taught the playbook you already know.'),
        l('A sets how players are announced, cycling position and name, position only, and name only. Position and name is the default, so you hear "nose tackle Webb beat right guard Jones". Position only drops the names, for when every name in the league is noise. Name only gives the whole name and no position, for when you know your own roster cold. Pressing A also says the last play again in the setting you just chose, so you can hear the difference.'),
        l('A word on what the positions mean. On defense a position stays with a man all game, so it is something to learn him by, even though where he lines up is a convention rather than a real alignment. On offense it is the job on the field, so a back filling in while your starter gets his legs back really is called the running back while he is out there.'),
        l('Escape goes back one step and tells you where you have ended up.'),
        l('Q quits. You will be asked to confirm.'),
        l('Five keys belong to the browser and not to the game: F5 reloads the page, F6 moves to the address bar, F11 is full screen, control R reloads, and control F opens the browser find bar. The game does not handle any of them. F5 and control R reload the page, but the crash copy means Resume on the main menu can bring the game back, and G saves the real thing to a file.')
    ];

    var MENU = [
        h('Moving around a menu'),
        l('Up and down arrow move through the list. The list wraps, so going up from the top brings you to the bottom.'),
        l('Enter chooses the item you are on.'),
        l('Control and Enter together jump to the last real choice and take it, which saves time once you know a screen.'),
        l('Escape backs out.')
    ];

    var GAME = [
        h('Calling a play'),
        l('The game opens with the coin toss: call it in the air with H for heads or T for tails. If you win, Enter takes the ball, or F offers deferring to the second half or kicking off.'),
        l('Kickoffs are a call like any other. Kicking, Enter takes the deep kick and F offers a squib, a pooch, or an onside kick. Receiving, Enter takes the regular return and F offers the hands team. When your coordinator handles a side for you, he only stops you for a kickoff when an onside kick is genuinely in play.'),
        l('After your own touchdown, the try is your call: Enter kicks the extra point, F offers going for two, which is a real snap from the three. When your coordinator handles the offense on the stop-me setting, he only stops you when the score genuinely makes two worth a thought.'),
        l('Their fourth down is your call too. When they show the punt unit, Enter sets up the return and F offers going for the block or punting safe; the block is a real chance at the kick, paid for in return yards, and a fake gains against a committed rush. When they show the field goal unit, Enter rushes the kick and F offers field goal safe. And when they keep the offense out there, you call a defense like any other snap. On the stop-me setting your coordinator only interrupts for a kick when the block is genuinely worth the gamble.'),
        l('Your coordinator suggests a formation and a play as soon as the last one is over. You do not have to ask.'),
        l('A referee whistle marks the ball ready for play. Everything before the whistle belongs to the last play; everything after it belongs to the next one.'),
        l('After the whistle you hear the down and distance, then a short tone, then the call. On defense the call starts with what personnel the offense is showing, which is the same look your coordinator builds his call from.'),
        l('There are three sounds around a play, and they always come in the same order. A low short blip is the snap: you have committed to a call and what follows it is what happened. The referee whistle is the ball ready for play. A higher short tone is the set tone, between the down and distance and the call itself.'),
        l('Enter accepts what he suggested.'),
        l('F opens the formation list if you want something else. Pick a formation, then pick a play from the call sheet for this down and distance.'),
        l('N calls no huddle. It keeps the same personnel and denies the defense a clean substitution, but your players tire faster and you get less information.'),
        l('U opens the substitution list for the players on the field. Arrow through them and press Enter to send the next man in.'),
        l('D expands the play you are on to hear how many times you have called it and how often it has worked.'),
        h('Calling a defense'),
        l('The same keys work on defense. Your coordinator suggests a front, a coverage, a pressure and an adjustment, and Enter accepts all four.'),
        l('F opens the front list if you want to build the call yourself. You go front, then coverage, then pressure, then adjustment.'),
        h('Fourth down'),
        l('On your own fourth down you hear a recommendation, punt or field goal or go for it, the same suggest and accept flow as any other play. Enter takes it.'),
        l('F opens your other options: the other kicking or going choices for this down, plus a fake of whichever kick is recommended, if one is on the table. A fake is a real play with real risk dressed up as a kick, not a safer version of going for it.'),
        h('Listening to your staff'),
        l('When somebody has something for you, you hear a short sound rather than a speech. There are three sounds: one for your offensive coordinator, one for your defensive coordinator, and one for the spotter.'),
        l('Spacebar plays whatever report is waiting.'),
        l('M reads the three matchups your coordinator feels strongest about, best first.'),
        l('T reads what your staff has worked out about what this opponent likes to call on this down and distance.'),
        l('R reads the low priority notes that have been collecting.'),
        l('X examines the current setup: who is on the field, who is resting, who is hurt, and what your coordinator is thinking.'),
        l('Z is the other half of X. It says what the other team had on the field on the last snap: their front and how many linemen, linebackers and defensive backs they were in when you have the ball, or the formation and personnel they showed when you are on defense. On the first snap of a new drive it reaches back to the last time you faced that unit, and says so honestly; only before you have faced them at all does it say there is no look yet.'),
        l('S says the last play again, with anything that followed it, the touchdown or the turnover included. It is different from C: C repeats the last thing you were told, and asking about the situation or the other team overwrites that, so S is the key that always has the play.'),
        l('B changes how much your staff tells you, between everything, important only, and injuries and substitutions only. Injuries and substitution requests always get through.'),
        l('I turns the play hints on and off. A hint is the short clause your coordinator adds about what a concept beats and loses to, on the suggestion and on the call sheet. Turn it off once you know the playbook; it is separate from V, so you can keep the full play by play and stop the tutoring.'),
        h('Answering a substitution request'),
        l('When a coordinator wants somebody out, the play cannot be called until you answer.'),
        l('Y takes him out now. That counts as a substitution and lets the defense reset too.'),
        l('N leaves him in.'),
        l('L waits for the next time you change personnel, which folds it into a substitution you were making anyway and costs you nothing.'),
        l('K waits for the next dead ball.'),
        h('Handing a side to your coordinator'),
        l('O cycles who calls the offense: you, your coordinator, or your coordinator stopping you for the ones that matter.'),
        l('E does the same for the defense.'),
        l('The third setting is the one most coaches use. The game runs itself and stops you on third and fourth down, in the red zone, in the last two minutes, and when a coordinator is sure about something.'),
        h('Saving'),
        l('G saves the whole game to a file on your disk. Shift G opens your file picker to load one back, at the point it was saved.'),
        l('The game also keeps a copy in your browser after every decision, in case of a crash. The main menu offers it as Resume.')
    ];

    var MENU_SCREENS = [
        h('The main menu'),
        l('New game starts a fresh game against a team you choose.'),
        l('Resume picks up the copy the game keeps in your browser in case of a crash.'),
        l('Load save file opens your file picker.'),
        l('Help opens this text.')
    ];

    var TEAM = [
        h('Choosing a team'),
        l('Each program is described in words, never in numbers. You hear the kind of team it is, what it is good at, and what it is short of.'),
        l('Up and down move between the programs. Enter takes the job.')
    ];

    var PREGAME = [
        h('Before kickoff'),
        l('Your coordinators tell you what they think going in. These are hunches, and they can be wrong.'),
        l('O and E set who calls each side of the ball.'),
        l('L sets the play clock: off, relaxed, standard or fast. Off is the right choice for a first game.'),
        l('B sets how much your staff tells you.'),
        l('Enter starts the game.')
    ];

    var VIEWER = [
        h('Lists and tables'),
        l('Up and down move through a list. Left and right move across a table.'),
        l('In a table you hear the row, the column, and the value on every move.'),
        l('When you reach an edge the game says so rather than going quiet.'),
        l('Escape closes and puts you back where you were.')
    ];

    var HELP_BY_MODE = {
        boot: [NAV].concat(GLOBAL),
        menu: [NAV].concat(MENU_SCREENS, MENU, GLOBAL),
        team: [NAV].concat(TEAM, MENU, GLOBAL),
        pregame: [NAV].concat(PREGAME, GLOBAL),
        game: [NAV].concat(GAME, GLOBAL),
        viewer: [NAV].concat(VIEWER, GLOBAL),
        halftime: [NAV].concat([h('Halftime'), l('Your staff gives you three things they have learned, two things the other side has changed, and your biggest personnel problem. Then you pick one thing to change. Up and down move, Enter chooses.')], GLOBAL),
        final: [NAV].concat([h('After the game'), l('You hear the score and a short word on each of your assistants. Enter returns to the menu. G saves the finished game to a file, if you want to come back to that review later.')], GLOBAL)
    };

    function helpFor(mode) { return HELP_BY_MODE[mode] || HELP_BY_MODE.game; }

    // ---------- the keyboard explorer table (DESIGN.md 21.5) ----------

    // Every key the game uses, described for the mode the coach is in. F12
    // turns this on; while it is on nothing executes.
    var COMMON_KEYS = {
        F1: 'Help. Opens the list of keys for where you are.',
        F12: 'Keyboard explorer. You are using it now. Press it again to turn it off.',
        Tab: 'Situation. Down, distance, ball, quarter, clock and score.',
        c: 'Repeat. Says the last thing you were told again.',
        p: 'Pacing. Cycles fast, medium, slow and manual.',
        v: 'Verbosity. Switches between full and terse.',
        i: 'Play hints. Turns your coordinator\'s note about what a concept beats on and off.',
        a: 'Announce players by. Cycles position and name, position only, and name only.',
        Escape: 'Back. Goes back one step and tells you where you are.',
        q: 'Quit. Asks you to confirm first.',
        ArrowUp: 'Up. Moves back one item in a list.',
        ArrowDown: 'Down. Moves on one item in a list.',
        ArrowLeft: 'Left. Moves left in a table or lowers a value. No screen in this build uses it yet.',
        ArrowRight: 'Right. Moves right in a table or raises a value. No screen in this build uses it yet.',
        Enter: 'Choose. Takes the item you are on.',
        ' ': 'Spacebar. Plays a waiting report, or steps the game on when pacing is manual.',
        F5: 'Reload. This one belongs to the browser and it will throw away a game in progress.',
        F6: 'Address bar. This one belongs to the browser.',
        F11: 'Full screen. This one belongs to the browser.'
    };

    var MODE_KEYS = {
        game: {
            f: 'Formation. Opens the formation list so you can call your own play.',
            n: 'No huddle. Same personnel, quick snap, no clean substitution for the defense.',
            u: 'Substitutions. Opens the list of players on the field.',
            d: 'Detail. How often this play has been called and how often it has worked.',
            m: 'Matchups. The three your coordinator feels strongest about.',
            t: 'Tendencies. What the opponent likes to call on this down and distance.',
            r: 'Reports. The notes that have been collecting.',
            x: 'Examine. Who is on the field, who is resting, who is hurt.',
            z: 'Theirs. What the other team had on the field on the last snap.',
            s: 'Say the last play again, with anything that followed it.',
            b: 'Reports setting. Everything, important only, or injuries and substitutions only.',
            o: 'Offense. Who calls the offense.',
            e: 'Defense. Who calls the defense.',
            g: 'Save to a file. Shift G loads one back.',
            y: 'Yes. Answers a substitution request.',
            l: 'Later. Waits for the next personnel change.',
            k: 'Dead ball. Waits for the next dead ball.'
        },
        pregame: {
            o: 'Offense. Who calls the offense.',
            e: 'Defense. Who calls the defense.',
            l: 'Play clock. Off, relaxed, standard or fast.',
            b: 'Reports setting.',
            i: 'Play hints. On or off.',
            a: 'Announce players by. Position and name, position only, or name only.'
        },
        final: {
            g: 'Save the finished game to a file.'
        },
        viewer: {
            h: 'Heading. Moves to the next heading. Shift H moves to the previous one.'
        },
        help: {
            h: 'Heading. Moves to the next heading. Shift H moves to the previous one.'
        }
    };

    // code is the key name, for example ArrowUp or the letter itself.
    // Some keys mean something different depending on which decision the
    // coach is in the middle of, not just which screen he is on: F opens a
    // formation list on an offensive suggestion, a front list on a
    // defensive one, and a fourth-down options list on a special-teams one.
    // Checked before MODE_KEYS, so the step's own wording wins over the
    // generic per-screen one the explorer would otherwise give.
    var STEP_KEYS = {
        'offense-suggest': {
            f: 'Formation. Opens the formation list so you can call your own play.',
            n: 'No huddle. Same personnel, quick snap, no clean substitution for the defense.',
            d: 'Detail. How often this play has been called and how often it has worked.'
        },
        'defense-suggest': {
            f: 'Front. Opens the front list if you want to build the call yourself: front, then coverage, then pressure, then adjustment.'
        },
        'special-suggest': {
            f: 'Options. Opens your other choices for this fourth down: punt, field goal, going for it, and a fake if one is on the table.'
        },
        'toss-call': {
            h: 'Heads. Your call while the coin is in the air.',
            t: 'Tails. Your call while the coin is in the air.'
        },
        'toss-choice': {
            f: 'Options. Take the ball, defer to the second half, or kick off.'
        },
        'kickoff-call': {
            f: 'Options. Deep, squib, pooch or onside when you are kicking; regular return or hands team when you are receiving.'
        },
        'pat-call': {
            f: 'Options. Kick the extra point, or go for two.'
        },
        'defspecial-call': {
            f: 'Options. Against the punt unit: the return, the block, or punt safe. Against the field goal unit: rush the kick, or field goal safe.'
        }
    };

    // step is optional; a caller with no notion of a step (or a step this
    // table does not know about) falls back to the plain per-mode table.
    function getKeyDescription(code, shift, ctrl, mode, step) {
        var key = String(code);
        var lower = key.length === 1 ? key.toLowerCase() : key;
        if (ctrl && lower === 'Enter') return 'Control and Enter. Jumps to the last real choice and takes it.';
        if (shift && lower === 'h') return 'Shift H. Moves to the previous heading.';
        if (shift && lower === 'g') return 'Shift G. Opens your file picker to load a saved game.';
        if (shift && lower === 'Tab') return 'Shift Tab. Reads the seed of this game, for reporting anything you notice.';
        var stepTable = STEP_KEYS[step];
        if (stepTable && stepTable[lower]) return (shift ? 'Shift ' : '') + describeName(lower) + '. ' + stepTable[lower];
        var modeTable = MODE_KEYS[mode];
        if (modeTable && modeTable[lower]) return (shift ? 'Shift ' : '') + describeName(lower) + '. ' + modeTable[lower];
        if (COMMON_KEYS[lower]) return describeName(lower) + '. ' + COMMON_KEYS[lower];
        return describeName(lower) + '. This key does nothing here.';
    }

    function describeName(k) {
        if (k === ' ') return 'Spacebar';
        if (k === 'ArrowUp') return 'Up arrow';
        if (k === 'ArrowDown') return 'Down arrow';
        if (k === 'ArrowLeft') return 'Left arrow';
        if (k === 'ArrowRight') return 'Right arrow';
        if (k.length === 1) return k.toUpperCase();
        return k;
    }

    // Every key the help claims to document, so a test can check that nothing
    // is described in one place and missing from the other.
    function documentedKeys(mode) {
        var out = [], k;
        for (k in COMMON_KEYS) out.push(k);
        if (MODE_KEYS[mode]) for (k in MODE_KEYS[mode]) out.push(k);
        return out;
    }

    var api = { helpFor: helpFor, HELP_BY_MODE: HELP_BY_MODE,
                getKeyDescription: getKeyDescription, documentedKeys: documentedKeys,
                COMMON_KEYS: COMMON_KEYS, MODE_KEYS: MODE_KEYS, STEP_KEYS: STEP_KEYS, describeName: describeName };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.AF = root.AF || {};
    root.AF.help = api;
})(typeof window !== 'undefined' ? window : globalThis);
