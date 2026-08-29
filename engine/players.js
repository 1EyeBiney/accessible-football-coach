// players.js - Attributes, positions, roster generation (Accessible Football engine)
// Plain script, no browser dependencies. See DESIGN.md section 4.
//
// Attribute keys (all 1-99):
//   every player: spd (speed), str (strength), awr (awareness),
//                 tgh (toughness), dis (discipline)
//   QB: arm, acc (accuracy), dec (decision), pkt (pocket)
//   RB: vis (vision), elu (elusiveness), pow (power), hnd (hands)
//   WR/TE: rte (route), hnd (hands), rel (release), blk (blocking)
//   OL: pbk (pass block), rbk (run block), anc (anchor)
//   DL: prs (pass rush), rst (run stop), shd (shed)
//   LB: tak (tackle), cov (coverage), blz (blitz), rdd (read)
//   DB: cov (coverage), bsk (ball skills), tak (tackle), prss (press)
//   K/P: leg, kacc (kick accuracy), nrv (nerve)

(function (root) {
    'use strict';

    var COMMON = ['spd', 'str', 'awr', 'tgh', 'dis'];

    var POSITIONS = {
        QB: { side: 'O', attrs: ['arm', 'acc', 'dec', 'pkt'],
              overall: { acc: 0.3, dec: 0.3, arm: 0.2, pkt: 0.1, awr: 0.1 } },
        RB: { side: 'O', attrs: ['vis', 'elu', 'pow', 'hnd'],
              overall: { vis: 0.2, elu: 0.25, pow: 0.15, spd: 0.25, hnd: 0.05, awr: 0.1 } },
        WR: { side: 'O', attrs: ['rte', 'hnd', 'rel', 'blk'],
              overall: { rte: 0.3, hnd: 0.2, rel: 0.15, spd: 0.25, awr: 0.1 } },
        TE: { side: 'O', attrs: ['rte', 'hnd', 'rel', 'blk'],
              overall: { rte: 0.2, hnd: 0.2, blk: 0.25, str: 0.15, spd: 0.1, awr: 0.1 } },
        OL: { side: 'O', attrs: ['pbk', 'rbk', 'anc'],
              overall: { pbk: 0.35, rbk: 0.35, anc: 0.1, str: 0.1, awr: 0.1 } },
        DL: { side: 'D', attrs: ['prs', 'rst', 'shd'],
              overall: { prs: 0.35, rst: 0.3, shd: 0.1, str: 0.15, awr: 0.1 } },
        LB: { side: 'D', attrs: ['tak', 'cov', 'blz', 'rdd'],
              overall: { tak: 0.3, rdd: 0.25, cov: 0.15, blz: 0.1, spd: 0.1, awr: 0.1 } },
        DB: { side: 'D', attrs: ['cov', 'bsk', 'tak', 'prss'],
              overall: { cov: 0.35, spd: 0.25, bsk: 0.15, tak: 0.1, prss: 0.05, awr: 0.1 } },
        K:  { side: 'S', attrs: ['leg', 'kacc', 'nrv'],
              overall: { kacc: 0.5, leg: 0.35, nrv: 0.15 } },
        P:  { side: 'S', attrs: ['leg', 'kacc', 'nrv'],
              overall: { leg: 0.5, kacc: 0.35, nrv: 0.15 } }
    };

    // Two-platoon roster of 40 (DESIGN.md section 25)
    var ROSTER_SHAPE = { QB: 2, RB: 3, WR: 5, TE: 2, OL: 8, DL: 6, LB: 5, DB: 7, K: 1, P: 1 };

    // Talent bands by level (DESIGN.md 4.1): starter range and star ceiling.
    var BANDS = {
        HS:   { lo: 25, hi: 55, star: 65 },
        SC:   { lo: 40, hi: 65, star: 72 },
        FCS:  { lo: 48, hi: 72, star: 80 },
        G5:   { lo: 55, hi: 80, star: 87 },
        P5:   { lo: 62, hi: 88, star: 94 },
        NFL:  { lo: 68, hi: 94, star: 99 }
    };

    function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

    function overall(p) {
        var w = POSITIONS[p.pos].overall, sum = 0, tot = 0, k;
        for (k in w) { sum += (p.attr[k] || 40) * w[k]; tot += w[k]; }
        return Math.round(sum / tot);
    }

    // Invented names only. Nothing here maps to a real person.
    var FIRST = ['Aiden', 'Blake', 'Caleb', 'Dante', 'Eli', 'Finn', 'Gavin', 'Hayes', 'Isaac', 'Jalen',
        'Kobe', 'Landon', 'Mason', 'Nico', 'Owen', 'Preston', 'Quinn', 'Reid', 'Silas', 'Trent',
        'Uriah', 'Vince', 'Wyatt', 'Xavier', 'Zane', 'Amir', 'Brody', 'Cyrus', 'Dominic', 'Emmett',
        'Felix', 'Grady', 'Holden', 'Ivan', 'Jonah', 'Kellan', 'Lucas', 'Miles', 'Nolan', 'Otis',
        'Pierce', 'Rhett', 'Sawyer', 'Tobias', 'Wade', 'Corbin', 'Desmond', 'Elliot', 'Graham', 'Jace'];
    var LAST = ['Abbott', 'Baxter', 'Calloway', 'Dawson', 'Ellison', 'Fletcher', 'Garrison', 'Holloway',
        'Ingram', 'Jennings', 'Kessler', 'Lockhart', 'Mercer', 'Nichols', 'Osborne', 'Prescott', 'Quigley',
        'Rutledge', 'Sheffield', 'Thornton', 'Underwood', 'Vance', 'Whitaker', 'Yates', 'Ziegler',
        'Ashby', 'Bramble', 'Crane', 'Dunmore', 'Everly', 'Fairbanks', 'Goodwin', 'Hartwell', 'Irving',
        'Jarrett', 'Kimball', 'Langford', 'Marlow', 'Norwood', 'Overton', 'Pruitt', 'Ramsey', 'Stroud',
        'Tillman', 'Vaughn', 'Waverly', 'Ackerman', 'Beckett', 'Copeland', 'Driscoll'];

    // Generate one player.
    //   rng: Rng
    //   pos: position key
    //   level: band key
    //   quality: -1..+1 shifts the team's mean inside the band
    //   depth: 0 for a starter, 1 for the first backup, and so on (backups are weaker)
    function makePlayer(rng, pos, level, quality, depth) {
        var band = BANDS[level];
        var mid = (band.lo + band.hi) / 2;
        var span = (band.hi - band.lo) / 2;
        var base = mid + quality * span * 0.6 - depth * span * 0.45 + rng.normal(0, span * 0.35);
        base = clamp(base, band.lo - 12, band.star);
        var p = { id: null, name: rng.pick(FIRST) + ' ' + rng.pick(LAST), pos: pos,
                  year: rng.pick(['FR', 'SO', 'JR', 'SR']), attr: {},
                  // live state, reset each game
                  // benched: pulled by his coordinator to get his legs back
                  // (DESIGN.md 18.3). Not an injury; he comes back.
                  live: { stamina: 100, health: 'ok', hurtMods: null, conf: 0, out: false, benched: false } };
        var keys = COMMON.concat(POSITIONS[pos].attrs), i;
        for (i = 0; i < keys.length; i++) {
            p.attr[keys[i]] = Math.round(clamp(base + rng.normal(0, 7), 5, 99));
        }
        // Positional shaping so linemen are strong and slow, receivers fast, and so on.
        var a = p.attr;
        if (pos === 'OL' || pos === 'DL') { a.spd = Math.round(clamp(a.spd - 18, 5, 99)); a.str = Math.round(clamp(a.str + 10, 5, 99)); }
        if (pos === 'WR' || pos === 'DB') { a.spd = Math.round(clamp(a.spd + 8, 5, 99)); a.str = Math.round(clamp(a.str - 10, 5, 99)); }
        if (pos === 'RB') { a.spd = Math.round(clamp(a.spd + 5, 5, 99)); }
        if (pos === 'QB') { a.spd = Math.round(clamp(a.spd - 5, 5, 99)); }
        if (pos === 'K' || pos === 'P') { a.spd = Math.round(clamp(a.spd - 10, 5, 99)); a.str = Math.round(clamp(a.str - 10, 5, 99)); }
        // Hidden traits
        p.hidden = { potential: Math.round(clamp(base + rng.normal(8, 10), 10, 99)),
                     workEthic: rng.int(20, 90), injuryProne: rng.int(0, 100) < 15 };
        p.ovr = overall(p);
        return p;
    }

    // Generate a two-platoon roster. Returns { players: [], depth: { QB: [ids...], ... } }
    function makeRoster(rng, level, quality, nameStub) {
        var players = [], depth = {}, pos, n, i, idCounter = 0;
        for (pos in ROSTER_SHAPE) {
            n = ROSTER_SHAPE[pos];
            depth[pos] = [];
            for (i = 0; i < n; i++) {
                // How deep on the chart this slot is, in "starter units":
                // e.g. 5 OL start, so OL index 5 is depth 1; 3 WR start, so WR index 3 is depth 1.
                var starters = { QB: 1, RB: 1, WR: 3, TE: 1, OL: 5, DL: 4, LB: 3, DB: 4, K: 1, P: 1 }[pos];
                var d = Math.floor(i / starters);
                var p = makePlayer(rng, pos, level, quality, d);
                p.id = (nameStub || 'p') + '-' + (++idCounter);
                players.push(p);
            }
        }
        var roster = { players: players, depth: depth, byId: {} };
        rebuildDepth(roster);
        return roster;
    }

    // Depth chart = every position sorted by overall, healthy first.
    function rebuildDepth(roster) {
        var byPos = {}, i, p;
        for (i = 0; i < roster.players.length; i++) {
            p = roster.players[i];
            if (!byPos[p.pos]) byPos[p.pos] = [];
            byPos[p.pos].push(p);
        }
        var pos;
        for (pos in byPos) {
            byPos[pos].sort(function (a, b) {
                var ao = a.live.out ? -1000 : 0, bo = b.live.out ? -1000 : 0;
                return (b.ovr + bo) - (a.ovr + ao);
            });
            roster.depth[pos] = byPos[pos].map(function (x) { return x.id; });
        }
        roster.byId = {};
        for (i = 0; i < roster.players.length; i++) roster.byId[roster.players[i].id] = roster.players[i];
        return roster;
    }

    function resetLive(roster) {
        var i;
        for (i = 0; i < roster.players.length; i++) {
            roster.players[i].live = { stamina: 100, health: 'ok', hurtMods: null, conf: 0, out: false, benched: false };
        }
        rebuildDepth(roster);
    }

    // Effective attribute: base adjusted by stamina, injury, and confidence.
    // DESIGN.md 18.1. The engine only ever reads effective attributes.
    function eff(p, key) {
        var v = p.attr[key];
        if (v === undefined) v = 40;
        var st = p.live.stamina;
        v = v * (0.78 + 0.22 * (st / 100));
        if (p.live.hurtMods && p.live.hurtMods[key]) v -= p.live.hurtMods[key];
        v += p.live.conf; // confidence is a small +/- swing, capped elsewhere
        return clamp(v, 1, 99);
    }

    // ---------- what a player is called (DESIGN.md 4, status note) ----------

    // The engine models position groups, not alignment: OL1 through OL5 come
    // off the depth chart in order, and the defensive lineup takes the top
    // few at each group. Spoken position labels are therefore an authored
    // convention over the lineup slot, the same standing as the scheme
    // matrix, and they exist because a bare name is the one thing a blind
    // coach cannot anchor - there is no jersey number and no replay to hang
    // it on (ISSUES.md, from play).
    //
    // The offensive line convention is not arbitrary: engine/resolve.js pairs
    // inside runs to OL3, OL2 and OL4 and off-tackle runs to OL5 and OL4,
    // which is the interior three and then the right edge, so left tackle
    // through right tackle is how the run game already uses these slots.
    // The receiver and corner conventions fall out of zoneDefender the same
    // way: the X receiver's defender is DB1, the Z receiver's is DB2.
    var SLOT_SAY = {
        QB1: 'quarterback', RB1: 'running back', RB2: 'fullback',
        TE1: 'tight end', TE2: 'second tight end',
        WR1: 'X receiver', WR2: 'Z receiver', WR3: 'slot receiver',
        OL1: 'left tackle', OL2: 'left guard', OL3: 'center',
        OL4: 'right guard', OL5: 'right tackle'
    };

    // The defensive front is the weakest case and is worth being plain
    // about: these players are taken in depth order and engine/resolve.js
    // re-sorts them by attribute on every snap, so the label is a convention
    // rather than where a man lines up.
    //
    // Indexed by depth, deliberately, and not by how many of the group are
    // on the field. Keying it to the count read better on paper - a three-man
    // front really does have a nose tackle where a four-man front has two
    // tackles - but it meant the same player was a sam linebacker on one
    // snap and a mike on the next, purely because the defense changed
    // personnel around him. A label whose whole job is to let a coach learn
    // who his players are has to stay put.
    var DEF_SLOT_SAY = {
        DL: ['left end', 'nose tackle', 'defensive tackle', 'right end', 'defensive lineman'],
        LB: ['mike linebacker', 'will linebacker', 'sam linebacker', 'outside linebacker', 'linebacker'],
        DB: ['left corner', 'right corner', 'strong safety', 'free safety', 'nickel back', 'dime back', 'defensive back']
    };

    // The label for one man in a defensive group. Falls back to the group's
    // own plain word so a roster deeper than the table still speaks
    // something true rather than nothing.
    function defSlotSay(group, index) {
        var row = DEF_SLOT_SAY[group];
        if (row && row[index]) return row[index];
        return group === 'DL' ? 'defensive lineman' : group === 'LB' ? 'linebacker' : 'defensive back';
    }

    var LAST_NAME = /\s+(\S+)$/;

    // A player's last name, which is what the play by play uses: at speech
    // rate a full name on every event is a lot of words for one fact.
    function lastName(p) {
        var m = LAST_NAME.exec(p.name || '');
        return m ? m[1] : (p.name || '');
    }

    // The one place a player becomes speech. mode is 'both' (the default:
    // position and last name), 'position', or 'name'. A player with no slot
    // to go on - anyone off the field - falls back to his name, since a
    // position we cannot vouch for is worse than none.
    //
    // slotOf, when given, is the snapshot of who was standing where on the
    // snap being described. It has to win over live.slot: a line about a
    // play from ten snaps ago must name the men as they were then, not as
    // they are now (found by the milestone review).
    //
    // Name-only mode says the whole name, not the last name. Fifty surnames
    // are shared out across eighty men who dress, so about two sentences a
    // game came out as "Fletcher beat Fletcher" with nothing to tell them
    // apart. In both-mode the position does that work and the last name is
    // enough; with the position gone, it is not.
    function sayPlayer(p, mode, slotOf) {
        if (!p) return '';
        var slot = (slotOf && slotOf[p.id]) || (p.live && p.live.slot);
        if (mode === 'name') return p.name || '';
        if (!slot) return lastName(p);
        if (mode === 'position') return slot;
        return slot + ' ' + lastName(p);
    }

    // An event sentence keeps the shape it was written in ('$1 beat $2') and
    // the players it names, so it can be said again in a different naming
    // mode. Without this, pressing A would re-read the body of a line
    // already in the log but not the matchups in its tail, which is worse
    // than not re-reading it at all.
    function fillTemplate(tmpl, words) {
        return String(tmpl).replace(/\$(\d)/g, function (m, i) { return words[Number(i) - 1] || ''; });
    }

    // Word grades for the interface (DESIGN.md 4.3)
    function grade(v) {
        if (v >= 85) return 'elite';
        if (v >= 72) return 'very good';
        if (v >= 60) return 'good';
        if (v >= 45) return 'average';
        if (v >= 32) return 'below average';
        return 'poor';
    }

    var api = { POSITIONS: POSITIONS, ROSTER_SHAPE: ROSTER_SHAPE, BANDS: BANDS, COMMON: COMMON,
                makePlayer: makePlayer, makeRoster: makeRoster, rebuildDepth: rebuildDepth,
                resetLive: resetLive, eff: eff, overall: overall, grade: grade, clamp: clamp,
                SLOT_SAY: SLOT_SAY, DEF_SLOT_SAY: DEF_SLOT_SAY, defSlotSay: defSlotSay,
                lastName: lastName, sayPlayer: sayPlayer, fillTemplate: fillTemplate };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.AF = root.AF || {};
    root.AF.players = api;
})(typeof window !== 'undefined' ? window : globalThis);
