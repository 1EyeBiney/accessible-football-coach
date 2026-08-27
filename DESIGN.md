# Accessible Football: Coach Career Simulator

Game design document, draft 8. Started August 26, 2026.

This is a living document. It is written so that a screen reader user can move through it by headings (H key in NVDA and JAWS). Every major section is a level 2 heading, and sub-topics are level 3. There are no tables in this document on purpose; anything that would normally be a table is written as a list or a paragraph so it reads cleanly.

Sections marked "Open question" are decisions we still need to make before coding. Sections marked "Decided" are settled unless we reopen them.

## 1. The pitch

You are a football coach. You start at a small high school and try to work your way up through college and, if you are good enough and a little lucky, to the NFL. The game is played entirely by keyboard and is designed for screen reader users first, not adapted for them afterward.

The game has two loops. The between-game loop is the coach's week: you decide how to split your limited time and attention across the responsibilities of your job, and your staff does the same. The game-day loop is play calling: your assistant coaches feed you their read of the matchups on the field, you call plays, and the opponent adapts when you lean on the same weakness too long.

The simulation underneath is deterministic math with dice. An AI language model is used for texture, never for the rules: it turns numbers into scouting reports, plays the voice of your assistants in your headset, runs press conferences, and voices recruits, boosters, athletic directors, and general managers.

## 2. Accessibility principles (Decided)

The game is keyboard only. There is no mouse requirement anywhere, ever. Every screen has a documented set of keystrokes, and the same keys mean the same thing on every screen.

The game is screen reader first. Information is presented as short spoken lines, arrow-key lists, and, for tabular data, the golf scorecard grid pattern where every cursor move speaks the row header, column header, and value (section 21.6). Nothing is ever presented as a visual table the user has to find their way around. When a screen has a lot of information, the most important item is first.

Everything important is spoken in plain language. The player should never need to remember a number to play well. Numbers exist inside the engine, and some appear on scouting reports, but decisions are driven by what your staff tells you.

Verbosity is adjustable. A terse mode gives one line per play ("Slant to X, gain of 7, first down"). A full mode gives the assistant's commentary and the play-by-play narration. The player can switch modes at any time.

The game must be usable to teach with. The interaction model is the one proven in Accessible Golf (section 21): the whole game lives inside one focused application container, every keystroke is handled by the game, and every result is spoken through a single live region. The screen reader stays in focus mode for the entire session, so what students practice is keyboard command fluency, listening to live announcements, and navigating list and grid patterns by arrow keys, rather than standard form controls. That is a deliberate trade, decided in favor of the golf model because it works and because the coach never has to fight the virtual buffer.

Decided: this is a web application, a single static page with plain JavaScript and no framework, exactly as Accessible Golf is built. It runs from a folder or from GitHub Pages, works in any browser with NVDA or JAWS, and needs no install.

## 3. Career ladder (Decided in outline)

The coach moves through six levels. Each level changes three things: the talent band of the players, the responsibilities that fill the coach's week, and the size of the staff.

Level 1, High school. Small staff, often two or three assistants who also teach classes. Parents, the athletic director, and the school board matter. Players are developed, not recruited. You may help seniors get looked at by colleges, which builds relationships that pay off later.

Level 2, Small college (Division 3, NAIA, junior college). First real recruiting, though it is mostly local. Small budgets. Your first full-time coordinator.

Level 3, FCS. Real recruiting, scholarships, a scouting budget, a boosters relationship, and a first taste of the transfer portal.

Level 4, Group of Five FBS. National recruiting, NIL collectives, television money, bowl eligibility, and coaches being poached from your staff.

Level 5, Power conference. Everything at level 4 but bigger, plus a fan base and media that can end your career after two bad seasons.

Level 6, NFL. Recruiting is replaced by the draft and free agency. The salary cap, the general manager, and the owner become the pressures. The talent gap between teams is small, so preparation and staff quality decide games.

### 3.1 League structure (Decided)

The world is deliberately small so a career feels like a climb through real rungs rather than a sprawl of hundreds of teams. Working numbers, to be tuned:

High school: a pool of 10 teams. This is the coach's entire world at level 1. Everyone plays everyone, so a season is 9 games, and the coach stays in this group until they earn a college job. The ten programs have sizes (three small, four medium, three large), and high school has its own ladder: a coach who does well at a small school gets offers from larger ones, and a coach who is fired can drop to a smaller one (section 17). Team names are authored, invented town names plus mascots (section 14).

Small college: 3 conferences of about 8 teams each. Teams are named for the city where the college sits, such as "Terre Haute" or "Marion," never the school. Conference play plus a couple of crossover games, and a small playoff. Small colleges never play major colleges in the regular season. The one exception is the postseason: the top three small colleges are matched against major college teams of comparable strength (matched on roster attribute totals, so a small college champion meets a middling major team rather than a random one), and a small college that wins one of those games earns a large prestige bonus and a jump in the coach's reputation. It is the small college coach's best shot at getting noticed. There is no full bowl list at any level; the major tier has a playoff and nothing else (section 20.2).

FCS, Group of Five, and Power conference are collapsed into the design as the major college tier: 4 or 5 conferences of about 10 teams each, again named by city only. Within the tier, conferences differ in prestige and talent band, so moving from a weak conference to a strong one is itself a promotion. Whether this tier stays as one level with prestige tiers inside it, or splits back into the three levels listed above, is an open question to settle when we build the career ladder.

NFL: 32 teams named by city or region only ("Indianapolis," "New England," "Los Angeles" twice), in two conferences of four divisions, with a 17-game schedule and the current playoff format. No nicknames, no logos.

All high school and college players are randomly generated. NFL players are also generated, but the generator is calibrated on real roster shapes and stat distributions so the league feels right (see section 13).

### 3.2 Job movement

Job movement. At the end of each season the game generates job openings based on how other coaches did. Offers come based on your record, your reputation, your relationships (the AD you helped at level 1 may be running a college by level 3), and your coaching tree. You can also be fired. Taking a lateral move or a step down is allowed and sometimes smart. The full end-of-season phase is in section 17.

Starting above high school is a perk bought with legacy points from earlier runs (section 15).

## 4. Player attributes and talent bands (Decided in outline)

### 4.1 One scale, six bands

Every attribute is on a 1 to 99 scale everywhere in the game. What changes by level is the band of talent you see. Working numbers, to be tuned:

High school: most starters 25 to 55, a star 55 to 65.
Small college: 40 to 65, a star to 72.
FCS: 48 to 72, a star to 80.
Group of Five: 55 to 80, a star to 87.
Power conference: 62 to 88, a star to 94.
NFL: 68 to 94, a star to 99.

The point of one scale is that the coach learns one system. A gap between two players means the same thing at every level. What changes is how big the gaps are. In high school a 20-point edge is common; in the NFL a 6-point edge is the whole game plan.

### 4.2 Keep the attribute list short

Madden-style forty attributes per player would be impossible to hold in your head and would make scouting reports unreadable. Working list, to be tuned:

Every player: Speed, Strength, Awareness, Toughness (injury resistance and playing hurt), Discipline (penalties).

Quarterback: Arm, Accuracy, Decision, Pocket.
Running back: Vision, Elusiveness, Power, Hands.
Receiver and tight end: Route, Hands, Release, Blocking.
Offensive line: Pass block, Run block, Anchor.
Defensive line: Pass rush, Run stop, Shed.
Linebacker: Tackle, Coverage, Blitz, Read.
Defensive back: Coverage, Ball skills, Tackle, Press.
Kicker and punter: Leg, Accuracy, Nerve.

Each player also has hidden traits that only show through scouting or time: potential, work ethic, injury history, and character. These drive development and off-field events.

### 4.3 How attributes are shown to the player

Decided: the coach never needs raw numbers to make a decision. Matchup advice comes from assistants as hunches in plain language (see section 6).

Open question: when a scouting report reveals a player's attributes, do we show numbers, letter grades, or words? Options are the raw number (70), a letter grade (B), or a word (good). My lean is a word on the short report and the number available on the detailed player card for anyone who wants it. The word scale would be something like: poor, below average, average, good, very good, elite. This keeps the game readable in one line per player while not hiding the number from someone who wants to dig.

## 5. Your staff (Decided in outline)

The staff is the heart of the design. Your assistants are the ones who read the field, and their judgment is only as good as they are.

### 5.1 Staff roles

Offensive coordinator, defensive coordinator, special teams coordinator, position coaches (as many as the level allows), a strength coach, a recruiting coordinator at college levels, and a scouting department that grows from one part-time scout in high school to a full department in the NFL. Levels 1 and 2 collapse many of these into a couple of people who wear several hats.

Three more people exist at every level and have attributes of their own: the spotter, who watches the field during games and reports what he sees (section 18.2); the trainer, who handles injuries and the medical report (section 18.4); and the boss, the athletic director at school levels and the general manager in the NFL, who is not on your staff but is the person you negotiate with (section 17.4). From small college up there is also a Head of Football Operations, who runs the program's NIL pool and recruiting logistics (section 20.5).

### 5.2 Staff attributes

Working list:

Evaluation: how accurately this person reads talent, both on your roster and on the other sideline. This is the attribute behind hunches and scouting reports.
Scheme: how well they know their side of the ball. Affects play design quality and the counters they suggest.
Teaching: how fast players under them develop.
Recruiting: how persuasive they are with recruits and their families (college), or with agents and free agents (NFL).
Communication: how clearly and how early they get information to you during a game. A low communication assistant may notice a weakness on the second drive and not tell you until the fourth.
Loyalty and ambition: how likely they are to leave for a better job, and how much they push for their own ideas over yours.

Each staff member also has a personality that shapes their voice when the AI speaks for them: cautious, aggressive, old school, analytics minded, and so on.

### 5.3 Hunches instead of numbers (Decided)

During a game your assistants suggest plays based on matchups, but they do not give you numbers. They give you hunches, and hunches can be wrong.

Under the hood the engine knows the true edge between two players. What the assistant tells you is filtered through their Evaluation attribute, their Communication attribute, and how much has been learned from scouting and film. Examples of what you might hear:

"Coach, I think our X can beat their right corner deep. I'd take a shot."
"Their left guard looks slow off the ball. Run right at him."
"I'm not sure yet, give me a couple more series on their nickel."
"They just moved the safety over to X. That tight end seam is open now."

A high Evaluation coordinator is right most of the time and tells you early. A low Evaluation one is confident and wrong more often than you would like, and the game should let you learn that about him over a season and decide whether to keep listening.

Assistants also have confidence, and their language reflects it. "I'm sure" from a good coordinator who has film on this team means something. "Maybe" from a rookie coordinator on a team you did not scout means very little.

The head coach is not powerless. You can call any play you want, and if you ignore your assistant and it works, the game notices. Over time a coach who consistently overrides a coordinator damages that relationship, which shows up in Loyalty.

### 5.4 Staff have their own weeks

Every staff member has their own energy budget for the week, same as the head coach (see section 7). You can direct how each one spends it or leave them on their own defaults. A coordinator left alone spends time the way their personality dictates. A good delegator sets a few priorities and trusts the staff. A micromanager sets every value himself and pays for it in his own energy, because managing the staff is one of the categories on his own bar. The three delegation levels are in section 22.

## 6. Scouting (Decided in outline)

Scouting is how the team learns what the other side actually has. Without scouting, the opponent's players are a fog: you know positions and roughly how good the team is, and nothing else. Your assistants' hunches during a game come from what they can see live, which is slow and unreliable.

### 6.1 What scouts do

A scout spends energy on specific players or units on other teams. Spending energy on a player reveals that player's attributes, at first roughly and then precisely with more time. A partially scouted player might read "corner, fast, hands unknown, coverage looks average." A fully scouted one shows every attribute.

Scouting is per player, not per team, so the scout has to choose. A scouting department in the NFL can cover an opponent's entire two-deep by game week. One part-time scout in high school can look at maybe three players on the next opponent, so the head coach has to decide which three matter.

Scouting has a shelf life. A player scouted in week two has developed or been hurt by week nine, so old reports get fuzzy again over time.

### 6.2 Scout focus areas

Each scout has a focus you can set, and their own attributes make them better at some than others:

Opponent scouting: next opponent's players and tendencies. This is what feeds game-day hunches.
Self scouting: your own tendencies as the other side sees them. A self scout warns you that you have run the same play on third and short six weeks in a row.
Recruiting evaluation (college): finding and grading high school players and transfer portal players. This is how a program learns what a recruit actually is (section 20.4).
Draft evaluation (NFL): grading college players ahead of the draft.
Pro personnel (NFL): grading free agents and other teams' players for trades.

A scout also has a personality, which shows in their reports through the AI voice: some overrate speed, some love big school names, some are contrarian.

### 6.3 Film study versus scouting

Film study is the head coach's and coordinators' own version of scouting, spent from their own energy. It reveals tendencies (what the opponent does on third and long, how they defend the red zone) rather than individual attributes. Scouts tell you who they have; film tells you what they do. The best game plans use both, and a coach with no scouting department can still learn a lot from film at the cost of everything else on his bar.

## 7. The week between games (Decided in outline)

### 7.1 The energy bar

Between games the coach has a single bar of 100 points to split across categories. The bar is split across categories in steps of five, and the total can never exceed 100. Following the zero-standard-input rule (section 21), the allocation screen is not a set of form sliders; it is an arrow-key list where Up and Down choose a category and Left and Right change it (section 21.9). Raising a category when nothing is unallocated does nothing except announce "Nothing unallocated. Lower another category first." The game never moves points the coach is not looking at.

Open question: what to call the bar. Candidates:

Focus. "Where is your focus this week?" Short, natural, and the word already implies you cannot focus on everything.
Hours. "You have 100 hours this week." Concrete, but invites arguments about realism.
Bandwidth. Accurate but a little corporate.
Prep. Fits game week but does not fit the offseason.
Attention. Works everywhere but is a longer word to hear repeatedly.

My lean is Focus, with the screen titled "This week's focus." Decide before coding, because the word will appear everywhere.

### 7.2 Categories

Categories change by level. The head coach's sliders, working list:

Game plan and film: study the next opponent's tendencies. Raises the quality and timing of game-day hunches and unlocks counters.
Practice: install plays and drill weaknesses. Small short-term boosts to a unit for this game, and long-term development.
Player development: individual work with players. Slow but permanent attribute growth, weighted by the player's potential and your staff's Teaching.
Staff management: directing your assistants and scouts, and keeping them happy. Low investment here means your staff runs on their own defaults.
Recruiting (college) or Personnel (NFL): calls, visits, evaluation meetings.
Program and politics: the athletic director, boosters, the owner, the media, the community. This is job security.
Family and rest: the coach's own health and personal life. Ignoring it too long causes events that cost you elsewhere.

Each assistant and scout has a shorter list tuned to their role. A defensive coordinator's sliders might be film, practice, player development, and recruiting his side of the ball.

### 7.3 Events driven by the sliders (Decided)

The first job of the weekly bar is to drive predictable systems: practice raises Execution, film narrows what you know about the opponent, development raises attributes, recruiting raises interest, politics raises the boss's patience. The coach should be able to predict the main effect of a change before making it. Randomness is seasoning on top of that, not the mechanism.

Every investment also has a real tradeoff, not just an opportunity cost. Harder practice raises Execution and slightly raises injury exposure in practice. More film gives better opponent knowledge but takes time from player development. More recruiting raises attention from recruits but leaves the coach less available to his own players, which shows in morale. More rest lowers burnout but means something football-related did not get done that week.

On top of the predictable effects, every category has a pool of events, good and bad. At the end of each week the game rolls for events, and the allocation changes the odds.

Investing in a category makes its good events more likely and its bad events less likely. Neglecting a category makes its bad events more likely, and after several weeks of neglect the bad events get worse.

Examples of the kind of thing in each pool:

Game plan and film: you spot a tell in the opponent's formation (a free hunch of high confidence); you find nothing and wasted the time; your coordinator disagrees with your plan and asks for a meeting.
Practice: a backup takes a big step forward; a starter tweaks a hamstring in a full-contact drill; the team looks flat and you learn nothing.
Player development: a player asks to switch positions; a player's confidence jumps after a one-on-one session; a player feels ignored and his effort drops.
Staff management: a coordinator comes to you with a counter you had not thought of; two assistants are feuding; a rival program calls your offensive coordinator and you hear about it in time to counter.
Recruiting: a recruit commits; a recruit's mother is not impressed and he cools on you; a rival flips your best commit.
Program and politics: the booster club funds a new weight room; a parent complains to the school board about playing time; the AD gives you a private warning about your record.
Family and rest: nothing happens (which is the good outcome); you get sick for a week and lose part of next week's bar; a family event that you handled well raises your morale.

Events are written as short scenes. Some are just news. Some ask for a decision with two or three choices, and the choice has consequences down the line. The AI voice writes the scene from a structured event record, so the scene reads differently each time, but the mechanical outcome is fixed by the engine.

### 7.4 The offseason

The offseason is a longer version of the same system with different categories: hiring and firing staff, recruiting or the draft, contract decisions, scheme changes, and your own job search. Details to be designed after the in-season week is working.

## 8. Game day (Decided in outline)

### 8.1 Pre-game

Before kickoff you get the game plan screen, which your coordinators assemble from scouting, film, and the week's practice. It is a list, not a grid, sorted by what your staff thinks matters most. Each line is a hunch with a confidence: "OC: I like our X against their corner. Confident." "DC: Their right tackle is slow. I want to bring pressure from that side. Somewhat confident." "Scouting: their quarterback has not been scouted. We are guessing."

You can set a game plan lean here (run heavy, pass heavy, balanced, aggressive on fourth down, and so on), which shapes what the coordinator suggests during the game.

### 8.2 Play calling

On each play the game announces the situation in one line: down, distance, field position, clock, score. Then your coordinator offers a suggestion with a one-line reason. You can accept it with one key, open the call sheet to choose your own, or ask the assistant for an alternative.

The play menu is the call sheet (section 16.4), opened to the section for the current situation, so you hear the handful of plays that fit this down and distance rather than the whole sheet. Choosing your own play goes personnel group, then formation, then play, then tempo (section 16.5). Each play is one line and includes the matchup it attacks when the staff has an opinion: "Slant to X. OC likes this against their corner."

A single key (working key: M for matchups) reads the current hunches for the personnel on the field, top three, best first. Another key (working key: S for situation) repeats the situation line. Another (working key: T for tendencies) reads what film study told you about what the opponent does in this situation.

Results are one line in terse mode. Full mode adds the play-by-play and the assistant's reaction.

### 8.3 The counter loop (Decided)

The opponent coaching staff tracks how you attack them. Each matchup has a hidden exploitation counter. When you attack a weakness and it works, the counter ticks. When it crosses a threshold (which depends on the opposing coordinator's Evaluation and Scheme), the opponent adjusts: bracket coverage on your X, a safety over the top, a running back kept in to chip the edge rusher.

Every adjustment costs them somewhere else. When they bracket X, the tight end seam or the backside receiver opens up. Your coordinator, depending on his Evaluation and Communication, notices and tells you, ideally on the next series and sometimes a quarter late. So the game-day skill is reading when the counter is coming, moving before it lands, and knowing which of your assistants to trust when they say they see the next opening.

You do the same thing on defense. Your defensive coordinator tracks what the opponent is leaning on and proposes adjustments, and you decide whether to make them and accept the cost.

### 8.4 Injuries, clock, and special teams

Injuries happen during play and are announced immediately with the assistant's first read ("Looks like an ankle, he's coming out"). The trainer's report comes after the game.

Clock management is a real part of the game. Timeouts, spikes, kneels, and hurry-up are all on the play menu, and the game warns you in the situation line when the clock matters.

Special teams are called by the special teams coordinator with the same suggestion-and-accept flow, and the coach can override.

## 9. Where the AI model fits (Decided)

The AI language model never decides outcomes and never decides what the opponent does. Those are the engine's job so that the game is fair, testable, and works offline.

The model writes text only. The game never generates spoken audio; the screen reader is the voice, and the machines this game is built for would not handle synthesized speech models anyway. If that changes it can be added later without touching the design. The model turns a structured scouting record into a report in the scout's voice. It turns the coordinator's structured hunch (player, matchup, confidence, timing) into the words you hear in the headset, in that coordinator's personality. It writes the event scenes from event records. It runs press conferences, recruit visits, and the meeting where the AD tells you your seat is warm. It writes the play-by-play in full mode.

Every AI-generated line has a plain fallback template so the game works without the model, just with flatter language. This matters for offline play, for cost, and for testing.

Open question: which model, and whether it runs locally or over the network. To decide when we know the platform.

## 10. What we are not building yet

No graphics of any kind, and no plan to add them later that would change the keyboard design.
No multiplayer in the first version.
No real teams, players, nicknames, or logos shipped with the game. See section 13 for how real data is used during development and how a user could bring their own.
No player mode. You are always the coach.

## 11. Open questions, collected

Attribute display on scouting reports: numbers, letter grades, words, or words with numbers on the detailed card.
The end-of-season prestige formula (section 20.2).
Whether the weekly practice script is a fixed ten plays or scales with the practice slider (section 16.3).
Working sizes to tune: playbook (4 formations, 24 plays) and call sheet (16 plays) at high school, and how they grow by level.
How many seasons of missed expectations each boss archetype tolerates, and how reputation thresholds map to levels (section 17.2).
Whether the major college tier is one level with prestige tiers inside it or three separate levels (FCS, Group of Five, Power).
Which AI model and whether it runs locally.
How long a season is at each level and how many seasons a career can run.
Whether the head coach can ever call plays on both sides of the ball or must delegate one side once the staff is big enough. Partly answered: the defense mirrors the offense (section 16.6) and either side can be handed to its coordinator for a stretch or a whole run.

## 12. Change log

Draft 8, August 27, 2026. Folded in the outside reviews and the coach's responses (ideas.txt): reports become sound cues with three chimes and a key to hear them; injured players do not re-enter; an optional play clock; the play call flow now starts with the coordinator's suggestion, speaks "sub" inside the play name, carries confidence wording, and exposes call counts and success rates; a substitution list off the formation prompt; recovered players announced at change of possession; the AI produces text only; formation-based practice at major college and NFL with film as the game-day lever; recruiting board filters; disk saves as the real save; the weekly bar drives predictable systems with real tradeoffs and no silent point stealing; prestige settled once at year's end with in-season recruiting banked; postseason is playoffs only with attribute-matched small college games; defense shares the interface but not the mechanics; delegation as a first-class system (section 22); halftime and the postgame staff review (section 23); the world beyond the player's team and the rule that computer coaches are never omniscient (section 24); earned coach identity traits (section 17.5); legacy perks as options with a loadout cap; the MVP and build order (section 25); and a proposed snap resolution model for discussion (section 26).

Draft 7, August 27, 2026. Decided the platform: a single-page web application in plain JavaScript, built on the Accessible Golf interaction model. Rewrote the accessibility principles in section 2 to match. Added section 21 documenting the golf patterns from the actual source (focus trap, one keydown listener with ordered interceptors, one announce function and live region, array-driven menus with wrap and fast-forward, help with audible headings, F12 keyboard explorer, 2D-array grids with edge announcements, two-key confirmations, TTS-aware pacing, repeat and quick status keys, sliders built as lists, localStorage saves, audio texture) and mapping each to the football screens.

Draft 6, August 26, 2026. Former players carry a relationship bonus in recruiting and in the NFL draft and free agency (section 20.9), with a coaching history on every player. Added the Came Up Together achievement. No NIL at small college; it begins at the major college tier. Small colleges only meet major colleges in bowl games, where the top three small colleges face major college teams near .500 for a prestige and reputation bonus (section 3.1).

Draft 5, August 26, 2026. The three large high schools are locked as starting points on a new profile and unlocked with legacy points. The spotter comes with the program at high school and is hireable above it (open question closed). Added section 20 on college recruiting: arriving at a program with open spots and an inherited prestige bucket that the coach's last high school season adds to; prestige and prestige points; why a recruit picks a school (points spent, NIL, fit from recruit traits, a hidden likes-the-coach booster); scouting recruits; NIL as a limited pool of contracts run by the Head of Football Operations, used both to land recruits and to keep players; the weekly recruiting board; and the transfer portal.

Draft 4, August 26, 2026. High school gets a ladder inside the ten programs (sizes). Added section 17 (end-of-season phase with review, verdict, offers, and decision; reputation and contracts; the bottom school always hires; the boss as an NPC with attributes), section 18 (live game state of stamina, health, and confidence; the spotter and his attributes; the substitution flow; the trainer), and section 19 (the between-play report loop with urgency levels, fixed order, and a report threshold). Added The Long Way achievement.

Draft 1, August 26, 2026. First version. Captures the career ladder, talent bands, short attribute list, staff attributes, hunches instead of numbers, scouting with per-player energy and scout focus areas, the 100-point weekly bar with sliders and slider-driven events, the counter loop, and the role of the AI model.

Draft 3, August 26, 2026. Added section 14 (choosing a high school: ten fixed authored programs with archetypes and jitter, the word-based team profile, rosters after year one), section 15 (runs and careers, legacy points, perks bought with legacy points in two families), and section 16 (playbook installed in preseason, play traits and Execution, the ten-play weekly practice script with growth and decay, the situational call sheet, personnel then formation then play then tempo with the substitution rule, defense mirrors offense). Play calling in 8.2 now points at the call sheet.

Draft 2, August 26, 2026. Added league structure (section 3.1): 10-team high school pool, 3 small college conferences, 4 or 5 major college conferences, 32-team NFL, all named by city only. Added section 13 on external data and legal posture, and the dev_data folder of nflverse reference data.

## 13. External data and legal posture (Decided)

### 13.1 What ships

The game ships with generated leagues only. Every player at every level is generated. Teams are identified by city or region, never by nickname or logo. Nothing in the shipped game names a real person or uses a real team's trademark.

### 13.2 What is used during development

Real NFL data from the nflverse project (CC-BY-4.0) is kept in the dev_data folder of the repository working copy, and that folder is in .gitignore so it is never committed or distributed. It is used for three things: roster shape (how many players per position, the age and experience curve, height and weight by position), attribute calibration (turning real stat distributions into a believable 1 to 99 spread per position for the NFL band), and schedule structure (17 games, byes, divisions, playoffs).

Rule for the generator: generate from distributions, never from individuals. A generated team must not be a real team with the names changed. The EA NCAA Football cases established that matching a real player's position, number, height, weight, and hometown can be a "likeness" even without the name, so the generator draws every trait independently from the population rather than copying rows.

### 13.3 Bring your own data

The game defines a plain, documented JSON import format for players, teams, and schedules. Anyone can populate it from any source, including public data they fetch themselves. The game does not download, map, or install real data, and the project does not publish converters from real sources into the import format. If the community writes converters, that is their work and their use, the same way Football Manager's community publishes real-name fixes that the publisher neither ships nor endorses.

### 13.4 Why this is the line

Statistics are facts and are not copyrightable in the United States; the nflverse license is permissive and only asks for attribution when redistributing, which we do not do. The real exposure is right of publicity (names and likenesses of real players, and Indiana's statute is among the broadest) and trademark (team names and logos). Both attach to what the product ships and to commercial use. Shipping generated leagues, keeping the import format neutral, and not building a one-click real-data installer keeps the project on the safe side of that line. If the game is ever sold rather than released free, that is the moment to consult an Indiana intellectual property attorney before release. Nothing in this section is legal advice.

### 13.5 Import format (to be designed)

To be written alongside the data model. It should be a small set of JSON files, one per entity type (players, teams, staff, schedules), with a version number and a schema file so that third-party tools can validate before importing.

## 14. Starting a run: choosing a high school (Decided in outline)

### 14.1 The ten programs

A run begins with the coach choosing one of ten high school programs. The ten are the same every run, with the same names, archetypes, and staffs, so a player learns them the way you learn the starting characters in any game with replayable runs. Attributes are jittered by a few points each run so no two runs are identical, but the identity of each program holds.

Each program is authored by hand with a deliberate archetype and a size. Size is the high school ladder: three small schools, four medium, three large. On a brand new profile the three large schools are locked as starting choices; they can be reached by promotion within a run, and unlocked as starting points with legacy points (section 15.3). The game recommends a small school for a first run. Working list of ten, to be refined:

Large. The powerhouse: the best roster in the group and a board that expects a title every year. The hottest seat and the top of the high school ladder.
Large. The air raid school: a real quarterback and receivers, a soft line, and an offensive coordinator who is the best assistant in the group but is already looking for his next job.
Large. The talented mess: good players, bad discipline, and a staff with low Teaching. The ceiling is high if the coach can fix the culture.
Medium. The trenches team: a very good offensive and defensive line, no quarterback, and a staff that has only ever run the ball.
Medium. The defense-first program: a stingy defense, an offense that cannot score, and a defensive coordinator who is better than the head coach was.
Medium. The rival's shadow: a decent team that plays in the shadow of the powerhouse and whose whole season is judged on that one game.
Medium. The steady program: average everywhere, nothing to fix and nothing to lean on. The honest middle.
Small. The senior class: a strong team of seniors and almost nothing behind them. Great year one, hard year two.
Small. The rebuild: a weak roster, a patient athletic director, and a community that will celebrate a .500 season.
Small. The bottom: the smallest school in the group, thin everywhere, injuries are the whole story, and a community that is loyal no matter what. This is the job that is always open (section 17.3).

### 14.2 The team selection screen

The selection screen is a list of ten programs. Each program opens to a profile written in words, not numbers, laid out so an experienced player can choose without opening a single player card. The profile has these parts, in this order:

Program summary: one paragraph of what this place is, written by the AI from the archetype record.
Offense by unit: quarterback, backfield, receivers, offensive line, each graded in words (poor, below average, average, good, very good, elite).
Defense by unit: defensive line, linebackers, secondary, same words.
Special teams: one grade.
Key players: the two or three players who define the team, one line each with position, class year, and what they do well.
Staff: each assistant by role with one line on what they are good at and one on what they are not. Assistants are fixed at this level, so this line matters: you are choosing your staff when you choose the school.
Tendencies: what this program has run, derived from the staff's Scheme preferences and the roster fit. "Run first, heavy sets, rarely throws deep."
Expectations: what the community and the athletic director expect this season and how much patience there is. This is the seat temperature, stated plainly.

Unit grades are computed from the true attributes of the likely starters, weighted by how much each position matters to the unit, and then adjusted by the relevant assistant's Scheme and Teaching. A good offensive line coach raises the line grade a notch because that unit will improve under him. The selection screen is an outside view and is allowed to be accurate; once the run begins, everything you learn about opponents goes through scouting and hunches as in sections 5 and 6.

From the profile, the coach can open the full roster (a list, one player per line, sortable by position or class year) and each player's card.

### 14.3 Rosters after year one

The preset roster defines the program at the start of the run. Seniors graduate every year and freshmen are generated, with the generator biased toward the program's identity so the trenches team keeps producing linemen and the air raid school keeps producing receivers. By the coach's third season the roster is mostly generated but still feels like the same school.

## 15. Legacy and perks (Decided in outline)

### 15.1 Runs end, careers accumulate

A run is one coaching career. It ends when the coach retires or when the coach is fired and no program calls. Getting fired does not end the run by itself: it puts the coach in the job market, and a coach with a reasonable record will find a lower or lateral job. A run ends when the market is silent. In high school the market is never fully silent, because the bottom school always hires (section 17.3), so a run can only end above high school or by retirement.

The first runs are expected to end in firing. That is by design, but the game has to make two things obvious when it happens: why the coach was fired, in the athletic director's own words, and what the run earned toward the next one.

### 15.2 Legacy points

At the end of every run the game tallies legacy points from the career. Working components:

Wins above expectation: each season, the wins the program expected versus the wins you got. Beating expectations at a rebuild is worth more than meeting them at a powerhouse.
Championships at each level, weighted by level.
Promotions: each step up the ladder.
Seasons survived, with a bonus for consecutive seasons at one program.
Players advanced: high school players who went on to college, college players drafted, weighted by where they went.
Staff developed: assistants who left you for head coaching jobs.

Achievements: named accomplishments that carry a legacy bonus and a title on the coach profile. Two to author first. The Long Way: fired from a high school job, took the bottom school, and went on to win the championship at the NFL level in the same run. Came Up Together: coached a player in high school, recruited him to your college, got him onto your NFL roster, and won the NFL championship with him on the team (section 20.9). Each should be worth more than any single season.

Legacy points are permanent and belong to the player, not the run. They are stored in a coach profile that persists across runs.

### 15.3 Perks

Between runs the player spends legacy points on perks from a list, and at the start of each run chooses a loadout from what is owned (Decided). Most of what legacy buys is options, not power, because raw-power perks create a backwards difficulty curve: the brand-new player gets the hardest game and the expert who has mastered it gets easier and easier runs.

Options (the bulk of the list): start at one of the three large high schools, which are locked on a new profile; start at small college or at a major college; unlock unusual programs and alternate starting conditions; unlock difficult coach backgrounds (a disgraced coach with low reputation and a chip on his shoulder, a former player with relationships but no experience); unlock new staff archetypes that can appear on your staff; unlock challenge runs (bottom school only, no scouting department, one-season contracts); and unlock career summaries and records from earlier runs.

Edges (a short list, capped): a few extra points on the weekly bar; an extra play in the weekly practice script; a larger call sheet; a scout who starts with more Evaluation; a slower decay rate on plays; one extra season of patience from a boss. Edges cost loadout points, and a run's loadout has a small cap (working number: ten loadout points, or at most three edges equipped), so the meta-game is a choice each run rather than permanent easy mode.

Perks are a flat list with a cost and a one-line description, and the profile screen shows what is owned, what is affordable, and what is equipped. Some perks are locked behind achievements as well as cost (you cannot buy "start at a major college" until you have been promoted to one), so the list also shows what unlocks each locked perk.

## 16. Playbook, practice, and the call sheet (Decided in outline)

This is the offensive side. The defensive side mirrors it exactly, with fronts and coverages in place of formations and plays, and the defensive coordinator suggesting in place of the offensive coordinator.

### 16.1 Preseason: installing the playbook

After choosing a program, the run opens in preseason. The coach reviews the roster and installs the playbook for the season: first the formations, then the plays within them. The playbook is deliberately small. Working sizes for high school: four formations and about twenty-four plays. Both grow with level and with the coordinator's Scheme.

Formations have personnel requirements. A three-receiver set needs three receivers worth playing, and the profile of the roster should push the coach toward sets that fit it. Installing a formation that the roster cannot staff is allowed, and it will show up as bad execution.

Formations are locked for the season once preseason ends. Adding one mid-season is allowed but costs practice: the new formation's plays start at low Execution and take slots in the weekly script to bring up. The point is that preseason choices are real choices.

### 16.2 Play attributes

Each play has fixed traits and one moving attribute.

Fixed traits, set when the play is authored: the formation it runs from, the personnel group, the situations it suits (short yardage, red zone, two minute, and so on), the matchup it attacks (edge versus corner, interior run, and so on), its complexity (how hard it is to learn and how fast it decays), and its risk profile (a deep shot has a wide outcome range; an inside zone has a narrow one).

The moving attribute is Execution, 1 to 99. Execution is how well this team runs this play right now. It rises with practice and game reps and erodes with neglect. A play's outcome in a game is driven by the player matchups on the field (sections 4 and 8), modified by Execution, the assistant's Scheme, and the play's risk profile.

### 16.3 The weekly practice script

Each week the coach picks ten plays to practice. Those ten are the practice script. Practice always improves the script's plays; the amount is rolled, weighted by the practice slider on the weekly bar, the coordinator's Teaching, the play's complexity, the quarterback's Awareness, and how close the play already is to its cap. The cap is set by the coordinator's Scheme and the level. Gains have diminishing returns near the cap, so a play at 85 gains slowly and a play at 40 gains fast.

Plays not on the script lose Execution each week, faster for complex plays. Plays called in a game count as reps: each call gives a small gain, so a play the coach leans on in games decays much slower than one that is neither practiced nor called. There is a floor: a play never decays below the Execution it had when it was installed, because the team still knows it, they are just rusty.

The ten-play script is the high school and small college model. At major college and NFL levels the coach instead chooses one formation to work on each week, and every play in that formation gets the practice gain. At those levels practice stops being the main lever on game day: film study is, because it is what finds the advantages the coach exploits during the game (section 6.3). The shift mirrors reality, where a high school coach installs plays and a pro coach installs game plans.

Open question: whether ten is fixed at the lower levels or whether the practice slider changes the script size. My lean is to keep ten fixed and let the slider affect quality, because a fixed number is easier to reason about and to teach.

### 16.4 The call sheet

The night before the game, after practice, film, and the medical report, the coach builds the call sheet: the plays that will be available in the game. It is smaller than the playbook (working size at high school: sixteen plays) and it is organized by situation the way a real laminated sheet is: openers, first and second down, third and short, third and medium, third and long, red zone, goal line, two minute, and fourth down. A play can appear in more than one situation.

The reason the sheet is situational is the screen reader. In a game the coach should hear the four to six plays that fit this down and distance, not the whole sheet every snap. The full sheet is always one keystroke away.

The ten practiced plays carry a small freshness bonus that week. Everything else on the sheet runs at its current Execution. Injured players change which formations can be staffed, so the medical report has to come before the sheet is built.

### 16.5 In-game play calling: personnel, formation, play, tempo

Decided in outline, with the mechanics to be tuned. After the previous play's result is spoken, the next snap begins immediately with the coordinator's suggestion; the coach never has to ask for it. The flow is:

The result of the last play, then any report sounds (section 19).
The coordinator's suggested formation and play, read as one line. If the suggested formation changes personnel, the word "sub" is spoken as part of the play name so the coach knows before deciding that this call gives the defense a free substitution. The line carries the coordinator's confidence in words ("I like it," "worth a shot," "I'm guessing") and, for a coach who wants it, a short description of what the play is and what it is good against, toggled by verbosity.
Enter accepts the suggestion as called. Otherwise the coach picks a formation from the call sheet and then a play within it. Any play line can be expanded with one key to hear how many times it has been called this season and its success rate, since the game tracks both.
No-huddle is a single key pressed at the formation prompt; it keeps the same personnel and denies the defense a clean substitution. Huddle is the default and needs no key.
Substitutions: after choosing a formation, one key opens the substitution list for that personnel group, arrows move through the players on the field, and one key swaps the selected player for the next man on the depth chart. Escape returns to the play prompt.

The situation line (down, distance, field position, clock, score) is always available on Tab and is spoken automatically at every change of possession and whenever the down or distance changes in a way the result line did not already make clear.

### 16.5.1 The play clock

The game has an optional play clock so the coach feels the pressure a real coach feels. Settings: off (the default for a first run), relaxed, standard, and fast, with the seconds per setting to be tuned. A soft tick begins at ten seconds and a sharper one at five. When it expires the offense takes a delay of game penalty: five yards, replay the down (Decided).

The substitution rule follows real football. The defense matches personnel, not formation. If the offense substitutes, or huddles, the defense substitutes freely and its coordinator picks a front and coverage off the personnel and formation it sees, plus what its tendency tracking says this offense does from that look. If the offense keeps the same personnel and goes no-huddle, a defense that tries to substitute anyway is rolling dice: a chance of a twelve-men flag, and otherwise a misalignment that lowers the defense's execution on that play. That gives the offense a real tool, and it costs the offense too, because no-huddle means the coach has less information and the players tire faster.

Calling the same play from the same look too often feeds the opponent's tendency counter (section 8.3) and is exactly what the coach's own self-scout will warn about.

### 16.6 Defense: same interface, its own mechanics

The defense uses the same interaction grammar as the offense so the coach learns one interface: a playbook installed in preseason, a weekly practice script, a situational sheet, a coordinator's suggestion accepted with one key, and the same substitution flow. But it is not the same system underneath. Offense initiates an action; defense combines personnel, front, coverage, pressure, and adjustment in response to what the offense shows. So the defensive playbook is fronts, coverages, pressures, and adjustments rather than plays, and the defensive engine resolves them on its own terms (section 26). Calling both sides doubles the decisions per game, which is why delegation (section 22) is a first-class system rather than a convenience.

## 17. The end of the season (Decided in outline)

### 17.1 The phase

After the last game, the run enters the end-of-season phase. It is one screen with a fixed order so the coach always knows what is coming:

Season review: the record, the program's expectation, and the gap between them. Championships, rivalry results, and players advanced are listed. Written by the AI from the season record in a neutral voice.
The boss's verdict: the athletic director or general manager meets with you. The outcome is one of fired, retained on the current contract, or retained with an extension offered. The verdict is written in the boss's voice and states the reason plainly, because a fired coach needs to understand why.
Offers: programs at the same level or a higher level that want to hire you. Each offer is shown in the same profile format as the team selection screen (section 14.2), plus the contract terms, so a possible new job is evaluated the same way the first job was chosen.
Decision: stay (if retained), accept an offer, or, if fired and nothing else is offered, take whatever safety net applies.

Then the offseason (section 7.4).

### 17.2 What drives the verdict and the offers

The boss's verdict is driven by the gap between expectation and result, the boss's Patience attribute, contract years remaining, and the relationship built through the program and politics slider over the season. A coach who beat expectations at a small school is safe and probably has offers. A coach who met expectations is safe. A coach who missed them is on the clock, and the number of seasons the clock allows is the boss's Patience.

Offers are driven by reputation, which is a single number the coach carries through the run. Reputation rises with wins above expectation, titles, and players advanced, and falls with firings and with leaving programs early. Higher-level programs need higher reputation before they will call. Relationships shortcut this: an athletic director who has moved up will call a coach he knows.

Contracts have a length in seasons and a buyout. Leaving before the end costs reputation and, at college and NFL levels, money that the new program has to be willing to pay.

### 17.3 The high school safety net (Decided)

If a coach is fired from a high school job, the bottom school (section 14.1) always has an opening. Nobody else wants that job. Taking it costs reputation and restarts the coach at the smallest, poorest program in the group with a patient community and a long climb. A run therefore cannot end inside high school; the coach can always keep coaching. Above high school the job market is honest, and a run can end.

### 17.4 The boss

The athletic director at school levels and the general manager in the NFL are computer characters with attributes, and the coach negotiates with them rather than controlling them. Working attributes:

Patience: how many seasons of missed expectations they will tolerate.
Ambition: how high they set expectations and how much they raise them after a good year.
Budget: how much they will spend on staff, scouting, and facilities.
Control: how much of the roster they keep for themselves. In the NFL a high Control general manager runs the draft and free agency and tells you who you have; a low Control one lets the coach drive personnel. At school levels this shows up as who hires and fires assistants.
Loyalty: whether they back you in public when things go badly.

The boss is who you negotiate contracts and extensions with, who you ask for budget, and who you argue with over personnel. At the NFL level the coach's personnel influence is a function of the general manager's Control and the coach's reputation, so a coach who wants to run his own roster has to earn it or find a general manager who gives it away.

### 17.5 Coach identity traits (Decided in outline)

The coach does not have a skill tree. Instead the game watches how the coach actually behaves over a run and awards identity traits that describe it. Working list:

Developer: players consistently outperform their potential under you.
Tactician: a strong record against teams with better rosters.
Players' coach: strong retention and strong former-player relationships.
Staff builder: your assistants improve and get promoted away.
Recruiter: classes consistently better than the program's prestige would predict.
Gambler: aggressive fourth-down and high-variance tendencies.
CEO: delegates effectively and builds organizations that run without you.

Traits are earned, not bought, and they are written on the coach's profile in words. They influence reputation and, more importantly, which jobs call: a Developer gets calls from programs with talent that has stalled, a Recruiter from programs with prestige and nothing to show for it, a CEO from the NFL. None of it is another screen of numbers.

## 18. Live game state, the spotter, and substitutions (Decided in outline)

### 18.1 Live state on every player

On top of the attributes in section 4, every player carries a small set of values that change during a game and reset between games:

Stamina: drains with every snap, faster in no-huddle and for linemen, and recovers on the sideline and while the other unit is on the field. Low stamina lowers effective attributes across the board.
Health: a player can be fine, playing hurt (reduced effectiveness at specific attributes, such as a corner with a bad ankle losing Speed), or out. Playing hurt is the interesting state because the coach may not know about it until someone tells him.
Confidence: rises with good plays and falls with bad ones. A corner who has been beaten twice plays worse for a while. A receiver on a hot streak plays better. Confidence is a short-term swing, not a permanent change.

The engine uses effective attributes (base attributes adjusted by live state) for every play. The coach never sees these numbers. He hears about them from people.

### 18.2 The spotter

The spotter is a staff position that exists at every level, from a parent in the press box with binoculars at a small high school to a full-time analyst in the NFL. The spotter watches the whole field and reports what he sees to the coach between plays. He does not suggest plays; he reports facts, and the coordinators turn facts into hunches. At high school the spotter comes with the program like the assistants do. From small college up, the spotter is a hireable position (Decided).

Spotter attributes:

Eyes: what he notices. A low Eyes spotter sees only the obvious, such as a player who stays down. A high Eyes spotter sees a corner favoring a leg, a linebacker who is a step late, a safety cheating toward your best receiver.
Timing: how soon after it happens you hear about it. A slow spotter tells you about the limp two series after it started.
Accuracy: whether what he reports is true. A low Accuracy spotter reports limps that are not there and misses ones that are. As with coordinators, the coach learns over a season how much to trust him.
Voice: how clearly he says it. The AI uses this to shape the wording; a low Voice spotter is vague ("something's off with their secondary"), a high Voice spotter is specific ("their left corner, number 24, is limping on the plant foot").

The spotter watches both teams. Reports about the opponent feed play calling (a limping corner is an edge). Reports about your own team feed substitutions (your right guard is gassed).

### 18.3 Substitutions

The offensive and defensive coordinators track the live state of their own side and tell the coach when a player needs to come out, based on stamina, health, and how the matchup is going. It is their job to watch the numbers; the coach only hears the recommendation.

A substitution report is a single line and a short choice: "Right guard is gassed, I want to get Miller in." The options are yes now, no, at the next personnel change, or at the next dead ball. Each is one key. The backup is chosen automatically from the depth chart; the coach can open the depth chart to pick someone else, but that is the slow path.

Substituting now counts as a substitution, so the defense gets its free substitution (section 16.5). Waiting for the next personnel change folds the swap into a substitution you were making anyway and gives the defense nothing extra. That is the trade: fresh legs now versus the defense resetting.

The coordinator's Evaluation attribute drives how early and how accurately he calls for a substitution. A good coordinator pulls a lineman one series before he gets beaten; a bad one tells you after the sack.

When a player who was pulled for stamina has recovered, the coordinator says so, and the player goes back to the first unit. That announcement is made when the unit next takes the field on a change of possession, not in the middle of a drive. A player who leaves a game because of an injury does not come back in that game (Decided); the trainer's report after the game says when he is available again.

### 18.4 The trainer and the medical report

The trainer handles injuries during the game and produces the medical report during the week. Trainer attributes: Diagnosis (how accurate the first read on an injury is), Treatment (how fast players return), and Prevention (how often injuries happen in practice).

In a game, an injury interrupts everything: the play result, then the trainer's first read ("looks like an ankle, he is out for now"), then the substitution. After the game the medical report gives the real diagnosis and the timeline, and the coach builds the call sheet for the next game around it (section 16.4).

## 19. Between plays: the report loop (Decided in outline)

### 19.1 The problem

Between every play the coach can receive information from several people: the spotter, both coordinators, the trainer, and the special teams coordinator. That is the point of the design, because all of it should shape what gets called and when. But a game is 120 to 140 snaps, and if three reports arrive between every play and each demands an answer, that is four hundred decisions a game and nobody finishes one. So reports have urgency, and only the urgent ones interrupt.

### 19.2 Urgency levels

Must answer. Injuries and substitution recommendations. Injuries are part of the play result and are spoken with it. Substitution recommendations are cued (below) and the play cannot be called until they are answered with one key.

Cued. Spotter observations and coordinator hunches are not read aloud automatically. When one is waiting after a play, the coach hears a short sound instead, and there are three distinct sounds: one for the offensive coordinator, one for the defensive coordinator, one for the spotter. One key plays the waiting report. Reports are not expected after most plays, and the coordinator for the side not on the field says little, so this is not a flood; it is an occasional chime that the coach can take or leave. A report that is not listened to still lives in the play menu: the matchup tag on plays and the M key (section 8.2) reflect it, so the coach can act on it by calling a play rather than by hearing it.

Batched. Low-priority notes such as stamina trending down across the line, a confidence swing, or the special teams coordinator's thoughts. These are collected and spoken at changes of possession, timeouts, and quarter breaks, or on demand with a key (working key: R for reports).

### 19.3 Order between plays

The between-play sequence is fixed so the coach always knows what is coming:

The play result.
Must-answer reports, each with its one-key choice.
Report sounds for anything cued, one chime per source, and one key to hear each.
The situation line.
The coordinator's suggestion.
The play call.

### 19.4 The report threshold

The coach sets a report threshold that applies to cued and batched reports: everything, important only, or injuries and substitutions only. The threshold does not silence must-answer reports. The threshold can be changed at any time during a game, and a coach who is behind late might turn everything on to find an edge, then turn it down again once the game is decided.

Staff attributes also filter reports before the threshold does. A low Communication coordinator speaks less and later. A low Eyes spotter simply notices less. So the same threshold produces a quieter game with a weak staff, which is realistic and is one more reason to invest in staff as the coach moves up.

## 20. College recruiting (Decided in outline)

Recruiting begins at small college and is the biggest new responsibility on the coach's week at that level. High school has none of this; the coach develops what walks in the door.

### 20.1 Arriving at a college

When the coach takes a college job, the program already exists. Its roster has open spots where players graduated, transferred, or left, and the previous staff may have left a partial recruiting class behind: some commits stay, some decommit when the coach changes, and the coach hears which within the first week. The number of openings is the number of scholarships to fill, and it is stated plainly on arrival.

The program also has a prestige bucket (section 20.2) that the coach inherits, and the coach's last high school season adds to it: a title or a big season at a large school brings more than a quiet year at a small one. A coach who arrives from a great year has a better first recruiting class than the program alone would earn.

### 20.2 Prestige

Every college program has prestige, a single number that is the program's standing in the eyes of recruits. It rises with wins, championships, players sent to the next level, and facilities, and it decays slowly when a program stops winning. Prestige belongs to the program, not the coach, and it stays behind when the coach leaves.

Prestige is settled once a year, at the end of the season, and during the season it does not move and does not matter. The end-of-season prestige formula (to be written) takes the season's record against the program's expectation, the conference result, the playoff result at the major tier, players sent to the next level, and the recruiting attention the staff spent during the season. That last item is how in-season recruiting works: the recruiting slider and the staff's recruiting focus during the season are banked, not spent, and the coach does not see their effect until the season is over and they turn into prestige. The full bowl calendar is not modeled; the major tier has a playoff and that is the only postseason that counts.

The prestige settled at year's end becomes prestige points, the spendable recruiting budget for the cycle that follows. Spending points on a recruit is the program making its case: official visits, the head coach in the living room, the highlight package, the campus tour. Points spent on one recruit are not available for another, so the coach chooses whom to chase, and a low-prestige program has to pick a few targets it can actually land rather than chasing stars.

### 20.3 Why a recruit picks a school

Each recruit keeps a board of the programs chasing him, with an interest level for each. The interest level for a program is the sum of four things:

Prestige points spent: the program's effort and standing, as above.
NIL: what the program's Head of Football Operations can put in front of the recruit (section 20.5). Some recruits weigh this heavily, some barely at all.
Fit: how the recruit's traits line up with the program. Working recruit traits: wants playing time early (favors programs with an opening at his position), wants to win now (favors high prestige and recent results), wants to stay close to home (favors programs in his region), wants a scheme that suits him (a receiver favors the air raid school), wants development (favors staff with high Teaching), and wants money (weights NIL). Fit is computed from the program's real strengths, weaknesses, and depth chart, so a program that is honest about itself recruits better than one that chases players who will not play.
Likes the coach: a small random booster per recruit per program, set when the recruit first hears from the program and not shown to the coach. It represents the personal connection that no spreadsheet predicts and can tip a close race either way.

A recruit commits when a program's interest crosses his commitment threshold, or on signing day to whichever program leads. Commits can flip until signing if another program's interest overtakes the leader by enough, which is where NIL late in the cycle does damage.

### 20.4 Scouting recruits

The coach does not see a recruit's true attributes. Recruits arrive as a name, a position, a size, a school, and a rough grade (a star rating in words: unknown, prospect, solid, standout, blue chip). Scouts with the recruiting evaluation focus (section 6.2) spend their energy on specific recruits and narrow the picture, first to unit-level words and then to individual attributes and potential. A program with one scout can properly evaluate maybe a dozen recruits a cycle, so the coach chooses whom to look at, and the rest are judged on the rough grade and the scout's gut.

Scouts have personalities that show in their reports. One overrates speed, one loves big school names, one is a contrarian who finds the overlooked kid. Over a couple of cycles the coach learns whose reports to trust, the same way he learns his coordinators.

### 20.5 NIL and the Head of Football Operations

From small college up, the program has a Head of Football Operations, who does for a college program what a general manager does for a pro team: manages the recruiting operation, runs the transfer portal, and secures the NIL pool. The Head of Football Operations is staff, hired and fired by the coach within the boss's Budget (section 17.4).

Working attributes: Fundraising (how large an NIL pool he can build from boosters), Network (how early he hears about recruits and portal entries), Organization (how many recruits the program can actively pursue at once without dropping any), and Closing (a bonus in the final week before a commitment).

NIL in the game is a limited pool of contracts, each with a size, secured by the Head of Football Operations in season and in the offseason from boosters. There is no NIL at small college (Decided); it begins at the major college tier, and the pool's size is set by his Fundraising and the boss's Budget. At small college, recruiting is prestige, fit, and the coach, which makes that level the place a coach learns to recruit before money enters the picture. The small college Head of Football Operations still exists and runs the board and the portal, just without a pool. Contracts are assigned to recruits to raise their interest, or to current players to keep them out of the transfer portal. The coach decides who gets what, and a contract committed to a recruit who signs elsewhere is not lost but was tied up during the cycle when it could have closed someone else.

NIL is also the retention tool. At the end of each season, players with playing time complaints, a scheme mismatch, or a better offer elsewhere consider the portal, and an NIL contract is the most direct answer. A program that spends its whole pool on recruits and nothing on the roster loses its best players to programs that did the opposite.

### 20.6 The weekly recruiting loop

Recruiting lives on the weekly bar as the Recruiting slider (section 7.2). Energy on recruiting goes into calls and visits to the recruits on the coach's board, and events in the recruiting pool (section 7.3) fire from it: a recruit commits, a recruit cools, a rival flips a commit, a parent is impressed or not. The Head of Football Operations and the recruiting-focused scouts spend their own bars on the same board.

The board itself is a list, one recruit per line: name, position, grade in words, the program's standing on his board (leading, close, behind, out), and what he cares about. Sorted by standing so the closest to committing are first. A major college board can run to dozens of names, so the board has filter hotkeys: one key cycles a position filter, another cycles a standing filter (leading, close, behind, all), and the filter in force is spoken when the list is entered. A coach with a small staff should be able to run recruiting in a few minutes a week from this one list; a coach with a full department can go deeper.

### 20.7 The transfer portal

The portal is recruiting with known quantities: players who have already played college football, whose attributes the coach's scouts can read from film rather than guess from high school tape. Portal players want playing time and NIL above everything, so a program with an opening and a contract can land a starter fast. The trade is that portal players arrive with less loyalty and leave the same way. Details of portal timing and rules are to be designed alongside the offseason (section 7.4).

### 20.8 Open questions for recruiting

How large a prestige bucket is at each college tier and how fast it decays.
Whether the transfer portal is in the first version or added after recruiting works.
How the small college bowl matchups are selected when fewer than three major college teams finish near .500.

### 20.9 Players who follow you (Decided)

Players a coach has coached before remember him. A high school player the coach developed carries a relationship with that coach, and when the coach recruits him to college the relationship is a large bonus to the recruit's interest, on top of everything in section 20.3. A small college coach can build a first class largely out of his old high school players, which is both realistic and the reason the high school years matter later in a run.

The relationship carries all the way up. When the coach is in the NFL and one of his former players is in the draft or in free agency, the coach can push the general manager to take him. How much weight that push has depends on the general manager's Control (section 17.4) and the coach's reputation, so a coach who wants to reunite with his guy has to have earned the say. A former player already on an NFL roster is also easier to sign in free agency, because he wants to play for a coach he trusts.

This is what makes the Came Up Together achievement (section 15.2) possible: the same player, coached at all three levels, on the roster for the NFL championship. Every stage of it has to be earned through the normal systems, which is what makes it an achievement rather than a gimmick.

The game keeps a coaching history on every player so it can recognize these relationships, and a former player's card shows the years he spent with the coach. Relationship strength depends on how the player's time under the coach went: a player who started and developed carries a strong bond, a player who sat carries a weak one, and a player the coach ran off carries a grudge.

## 21. Interaction model: the Accessible Golf pattern (Decided)

This section documents how Accessible Golf (https://1eyebiney.github.io/accessible-golf/, source in the ag folder) handles a screen reader, and how each piece carries over to the football game. It is written from the actual code (index.html, input_ag.js, ui_ag.js, audio_core.js, main_ag.js, data_ag.js), not from memory, so the football build can copy the mechanics exactly.

### 21.1 The focus trap

The page has `<body role="application">`. Inside it is one `<button id="initBtn" autofocus>` reading "Press Enter to Begin" and one `<div id="game-container" tabindex="0" aria-label="...">` that starts hidden. Pressing the button runs `initGame()`, which creates the Web Audio context (this has to happen inside a user gesture or the browser will not allow sound), hides the button, shows the container, and calls `.focus()` on it. From that moment the screen reader is in focus mode inside an application region, the virtual buffer is out of the picture, and every key goes to the game.

There are no standard inputs anywhere. No text fields, no selects, no range sliders, no links. The rule from the golf design document is "zero standard inputs," and it holds in the code. Football keeps that rule. The weekly focus sliders in section 7 are therefore not `<input type="range">` elements; they are a custom list where Up and Down choose a category and Left and Right move its value by five, with each change announced (section 21.9).

### 21.2 One keydown listener, ordered interceptors

All input is one `window.addEventListener('keydown', ...)` handler. The first line lets F5 and F6 through so the browser can still refresh and reach the address bar. Everything else the game handles calls `e.preventDefault()` and returns.

The handler is a stack of interceptors in priority order, each of which returns early so nothing below it can see the key. In golf the order is: pending confirmations (any key other than the confirm key cancels), Shift plus Up quick telemetry, F12 explore toggle, explore mode, the help viewer, the scorecard grid, the targeting grid, then the game mode branches (clubhouse menu, course, range, and so on). The golf changelog calls this the input firewall: opening the scorecard sets `viewingScorecard = true`, and while it is true arrow keys cannot leak through and swing a club.

Football uses the same structure. Working interceptor order: pending confirmation, explore mode, help viewer, any open list or grid viewer (roster, call sheet, scouting report, recruiting board, depth chart), then the mode branch (career hub menu, weekly planning, pre-game, in-game, end of season). Every viewer sets its own flag on open and clears it on Escape.

### 21.3 One voice: the announce function

Speech goes through one function, `window.announce(msg)`, in audio_core.js. It strips markdown characters, writes the text into `<div id="aria-announce" class="sr-only" aria-live="assertive" aria-atomic="true">`, and mirrors the same text into a visual marquee for sighted spectators. Every visual panel on the page (marquee, dashboard, caddy panel, help panel, scorecard, canvas) is `aria-hidden="true"`, so the screen reader hears exactly one channel and never double reads.

Two habits in the golf code matter for football. First, every state change announces something; silence is treated as a bug. Second, text is sanitized for speech before it is announced: "-" becomes "minus", "%" becomes " percent", "ms" becomes " milliseconds". Football will need the same for down and distance ("3rd and 7" reads better as "third and seven"), scores, and yard lines.

Football keeps the single live region and the single `announce` function. It adds one thing the golf game does not need: a queue with priorities for the between-play report loop (section 19), so injuries are spoken with the result, substitution requests come next, and cued reports wait behind their chimes until asked for. The queue feeds the same one live region.

### 21.4 Menus

A menu is a JavaScript array of `{ text, action }` objects plus an index. Up and Down move the index with modulo wrap so the list never dead-ends, and each move plays a short UI tick (different tones for up and down) and announces the item text. Enter runs the action. Escape steps back one state in the wizard. When a menu is first entered, the announcement is prefixed with a one-line prompt ("Select a Course.") and then the current item; on later moves only the item is spoken. Ctrl plus Enter scans the menu from the bottom for the first item that is not "Back" and runs it, which fast-forwards a setup wizard for a returning player.

Golf's clubhouse is a state machine (`clubhouseState`: root, course, size, roster, roster_type, settings, resume) that rebuilds the menu array on every transition. Football's career hub, team selection, end-of-season screen, and perk shop are all this pattern.

### 21.5 Help and the keyboard explorer

Help is a flat array of `{ text, heading }` lines. Opening it sets `viewingHelp = true`, shows a visual panel (aria-hidden, highlight synced to the spoken line), and announces line zero, which tells the user the navigation keys. Up and Down move one line. H jumps to the next heading and Shift plus H to the previous, and heading lines end with "Heading Level 2" in their text so the structure is audible even though there are no real heading elements. Escape or Enter closes it, announces "Exited Help Menu," and re-announces the context the user was in.

F12 toggles keyboard explore mode. While it is on, every keypress is intercepted and the game announces the key name and what it does, from a `getKeyDescription(code, shift, ctrl)` table that is aware of the current game mode. Nothing executes. This is how a new player learns the controls safely and it is the single most teachable feature in the golf game. Football copies both, and the help array is split by mode (career hub, week, game, viewers) so the coach hears only the keys that apply where they are, with a global section at the end.

### 21.6 Grids and lists

The scorecard is the golf pattern for tabular data. The data lives in a plain 2D array (`scorecardGrid`), not in the DOM. Arrows move a row and column cursor, and each move announces the cell as "row header, column header: value" (for example "Hole 4, Putts: 2"). Moving past an edge announces "Right edge." rather than saying nothing. Space flips between pages of columns, P swaps players, C copies the row's telemetry to the clipboard, Escape closes. A visual HTML table is kept in sync for sighted viewers and is aria-hidden.

Football has more tabular data than golf, so this pattern gets used a lot: the roster, the depth chart, the stat sheet, the recruiting board, and the scouting report on an opponent. The rule is one array per viewer, cursor announce on every move, edges spoken, header plus header plus value, and a page flip where there are too many columns to hear at once. Lists that are not tabular (the play menu, the call sheet section, the offers at the end of a season) use the menu pattern instead.

### 21.7 Confirmations

Destructive or irreversible actions use a two-key confirm. Pressing the key announces what will happen and asks for Y or Enter; any other key cancels and announces "Action cancelled." The pending state is checked at the top of the keydown handler so nothing else can run in between. Football uses this for firing an assistant, accepting a job offer, leaving a program early, cutting a player, and quitting without saving.

Quit itself is context sensitive: Q in a practice mode returns to the hub instantly, and Q in the middle of a round opens a save-or-abandon menu so progress is never lost by accident.

### 21.8 Pacing, repeat, and quick status

Anything that happens without the player pressing a key is paced to the screen reader. Golf delays a bot's turn by the character length of the last announcement times a per-character millisecond value (Fast 20, Medium 35, Slow 55), and a Manual mode waits for Spacebar before the bot swings. While waiting it plays a soft tick so the silence is not mistaken for a hang. There is also an 800 millisecond cooldown after an action so a new announcement does not clip the tail of the previous one.

Football has the same need in two places: the opponent's play when the coach has handed a side to a coordinator, and any auto-advancing sequence such as the week rolling to the next event. The pacing setting from golf (P key: fast, medium, slow, manual) carries over unchanged.

Three quick keys from golf carry over as they are. Tab gives a one-line status (in football: down, distance, ball on, clock, score). C repeats the last full report, which matters because a screen reader user cannot scroll back. X examines the current setup, front-loaded by importance and omitting anything at its default so the coach does not hear "neutral" six times.

### 21.9 Sliders without slider controls

The weekly focus bar (section 7) is the one screen where golf has no direct equivalent. It is built as a menu-pattern list where each row is a category and its value. Up and Down move between categories, Left and Right change the selected category by five points, and each change announces the category, its new value, and how many points remain unallocated ("Film study, 35 percent. 10 unallocated."). Because the total is fixed, raising a category when nothing is unallocated does nothing except announce "Nothing unallocated. Lower another category first." The game never changes a value the coach is not on, because in an audio interface a silent change elsewhere is worse than an extra keystroke. Enter accepts the plan, and Tab reads the whole allocation as one line.

### 21.10 Saves and recovery

Golf saves the full game state to localStorage in numbered slots, offers Resume from the hub, and recovers on refresh. Football uses localStorage the same way for crash recovery, with an autosave at the end of every week and every game, but localStorage is not the real save, because browsers clear it. The real save is a file on the player's disk. One key writes the whole run (and the coach profile) to a JSON file through the browser's download, and one key opens the browser's native file picker to load one. The file picker is the one standard control the game uses, because there is no other way to read a file, and the native dialog is fully accessible. The coach profile with legacy points and perks (section 15) is stored in the same file and in its own localStorage key that starting a new run never clears.

### 21.11 Audio texture

Golf pairs speech with non-speech sound: short synthesized ticks for menu moves, distinct tones for open and close, milestone tones, and external MP3 clips with a synthesized fallback if the file is missing. It also "primes" the audio context on boot with a short echo so the first real sound does not stutter. Football does not need a physics soundscape, but it should keep the UI ticks, a distinct sound for each report urgency level (section 19.2) so the coach knows before the words start whether this is an injury or a hunch, a crowd bed that swells and drops with the game, and the same priming trick.

### 21.12 Two practical notes from the golf source

The golf codebase splits into data, audio, physics, ui, input, and main files loaded in a fixed order by index.html, with each course as its own file that registers itself into a global array. Football should follow the same split from the start (data, engine, ui, input, main, plus one file per authored high school program and one per level) so a screen reader user can find things in the code by file name.

One of the golf files (main_ag.js) is saved as UTF-16 with Windows line endings. Browsers cope, but command line tools such as grep and git diff do not, and it makes searching the code painful. Every file in the football project should be saved as UTF-8 with Unix line endings, and the editor should be checked once at the start so this does not creep in.

## 22. Delegation (Decided)

Delegation is a first-class system, not a convenience. For every management system the coach can set one of three levels:

Automatic: the responsible staff member runs it on his own judgment and personality.
Priorities: the coach states one or two priorities in plain terms ("film and quarterback development") and the staff member allocates his own week around them.
Full control: the coach sets every value himself.

The same three levels apply to each side of the ball on game day:

I call everything.
The coordinator calls everything.
The coordinator calls normally but stops for the decisions that matter.

The third mode is expected to be the one most coaches live in. The game advances on its own until something worth a head coach's attention comes up: third or fourth down, the red zone, a two-minute situation, a major new matchup discovery, an injury, or a high-confidence adjustment from the coordinator. That turns a 130-snap game into perhaps 25 to 40 real coaching decisions without simplifying the simulation underneath, and it is how a coach can run both sides of the ball without the game taking two hours.

What is delegated still costs something. Managing staff is a category on the coach's own weekly bar (section 7.2), so a coach who sets everything by hand pays for it in his own time, and a coach who delegates well earns the CEO trait (section 17.5). Delegated decisions are made from the same imperfect information the coach would have had, filtered through the staff member's attributes, so delegation to a weak coordinator is a real risk.

## 23. Halftime and the postgame staff review (Decided in outline)

### 23.1 Halftime

Halftime is a distinct coaching phase, and a short one. The staff reports three things in a fixed order: three things your staff learned in the first half, two things the opponent changed, and your biggest personnel problem right now. Then the coach may make one or two strategic changes from a short list, such as keep attacking their corner, shift attention to the tight end, bring more pressure, protect the quarterback, or stay with the original plan. Those choices shape what the coordinators suggest in the second half. Halftime is the natural midpoint of the counter loop (section 8.3): the opponent has adjusted by now, and this is where the coach adjusts back.

### 23.2 The postgame staff review

After every game the coach hears a short review of each assistant's calls, in plain words and without numbers: "Offensive coordinator: his early read on their right corner proved accurate. His warning about inside pressure was wrong." Over a season those reviews accumulate into a track record the coach can read on the assistant's card: "usually dependable on receiver matchups; inconsistent evaluating offensive lines." This is how the coach learns whose hunches to trust without ever seeing the hidden Evaluation attribute, and it is what makes staff feel like people.

## 24. The world beyond the player's team (Decided in outline)

### 24.1 Computer coaches are never omniscient

Every decision a computer coach makes, on the field and off it, comes from the same imperfect information model the player's staff works with: scouting that costs effort and goes stale, hunches filtered through Evaluation, tendency tracking that needs observations before it is confident. The opponent's defensive coordinator does not read the true attributes of your receivers; he reads what his scouts told him and what he has seen. This one rule shapes the engine (section 26) more than any other, and it is what makes beating a good computer staff feel earned.

### 24.2 A lightweight simulation for every other team

Every team the player is not coaching still needs to live: games are played and results recorded, players develop and age and graduate, coaches recruit, staff turn over, and head coaches get fired and hired. None of that uses the full human-facing simulation. Each non-player team runs a lightweight version: game results from a fast resolution of the same engine with delegation set to automatic on both sides, development from the program's staff Teaching and player potential without the weekly bar, recruiting from prestige and fit without a board, and staff and coach movement from a yearly roll against results and expectations. The player's team is the only one that runs at full fidelity, and the two have to agree closely enough that a player who moves to a new program does not feel the world change under him.

## 25. Build order and the first playable (Decided)

The engine comes first, and it comes before the career. The first useful prototype is one high school team, one opponent, one roster, one offensive coordinator, one defensive coordinator, a small playbook on both sides, one weekly focus screen, scouting and film, one game in which the coach calls both offense and defense on every snap, the hunch system, the counter system, stamina and injuries, and a postgame report. No recruiting, no NIL, no NFL, no legacy system, no job market, no AI model.

The engine is a plain JavaScript module with no browser dependencies, so the same file runs inside the game page and inside a Node harness that plays thousands of snaps and prints the statistics (Decided). The harness is the first thing built, before any interface.

Practical decisions for the first playable (Decided):

Rosters are two-platoon, about forty players with separate offensive and defensive starters. Two-way players come later as a small-school hardship.
Special teams are in the engine in a simple form (punt distance from Leg, field goal chance from distance, Leg, and Nerve, kickoffs as a touchback or a short return) without the coordinator flow.
High school rules: twelve-minute quarters and the standard overtime shootout from the ten-yard line.
The engine uses a seeded random number generator so any game can be replayed exactly from its seed.
Files are plain scripts with a global namespace and a module.exports guard, the way Accessible Golf is built, because ES modules do not load from a file URL and the game must run by opening index.html. Engine files have no browser dependencies. Everything is UTF-8 with Unix line endings.
The weekly bar is called Focus.
The harness runs under Node (node harness.js) and prints plain text.
Code lives in the accessible_football folder; the coach runs git and creates the GitHub repository under 1EyeBiney when ready.

The test of that prototype is a feeling, and it is specific: the moment the coach thinks "my OC says their corner is vulnerable, but I think they are about to roll the safety over there, so I am going to hit the seam instead." If one game produces that thought, the game has its heart, and everything else in this document is what gives that game meaning over a career. If it does not, no amount of career structure will save it.

Inside that first playable, the order is: the snap resolution engine as a headless module with a simulation harness that plays thousands of snaps and reports whether the stats look like football; then the coordinator and opponent brains on top of it; then the audio interface from section 21 wrapped around one game; then the weekly screen.

## 26. Snap resolution model (Decided in shape, details for discussion)

This is the largest piece of the design and the reason the game exists. The shape is decided: one snap resolves as a chain of phases, each a bounded random draw shifted by the matchups, rather than a time-stepped simulation of players moving. The details below are the proposal to argue about. The requirement is a clear model of how one snap resolves, small enough to reason about and rich enough that different play concepts have real reasons to exist. The shape is: situation plus play concept plus execution plus the relevant player matchups plus the defensive call plus live state plus randomness gives a result.

### 26.1 The two calls

The offense calls a concept from a formation with a personnel group. The defense calls a front, a coverage, a pressure, and optionally an adjustment. Working libraries, to be tuned:

Offensive concepts, about fifteen: inside zone, outside zone, power, counter, draw, quarterback sneak, quick game (slants and flats, stick), curl and flat, mesh and crossers, four verticals, post and dig, play action deep shot, play action boot, running back screen, receiver screen. Plus the clock plays: spike, kneel.

Defensive fronts: four-man over, four-man under, three-man, nickel, dime, goal line. Coverages: cover zero, cover one, cover two, cover three, cover four, two-man. Pressures: four rushers, five, six, zone blitz. Adjustments: bracket a receiver, safety help over a receiver, spy the quarterback, contain the edge, load the box.

### 26.2 Why concepts exist: the scheme matrix

Each offensive concept has an authored profile against each coverage family and front, a number in a range like minus fifteen to plus fifteen, written by hand with football reasoning rather than derived from attributes. Four verticals is strong against cover three (the seams) and weak against cover four and cover two (deep help). The quick game is strong against blitzes and soft coverage and weak against press with help. Play action is strong against one-high looks and aggressive run-fitting linebackers and weak against two-high shells with patient linebackers. Screens are strong against pressure and weak against contain. Inside zone is strong against light boxes and weak against a loaded box. Power is strong against undisciplined fronts and weak against a stout interior. Draws are strong against pass-rush fronts.

The scheme modifier from this matrix is a separate input from the player matchup edge. That is the whole point: a coach who only chases the biggest matchup edge will run into a coverage built to take it away, and a coach who reads the defense can call a concept that beats the coverage even without a talent edge. The coordinator's Scheme attribute scales how much of the matrix bonus the offense actually gets, and Execution scales it again, so a poorly practiced counter to the right coverage still sputters.

### 26.3 Pass plays: pressure, target, throw, catch, run

Pressure. Each pass protection matchup (a lineman or back against a rusher) produces a net edge from pass block versus pass rush, adjusted by stamina and by the protection scheme (a chipping back, a tight end kept in). The sum gives a time to pressure. The concept has a time to throw: quick game under two seconds, intermediate about two and a half, deep shots over three, play action longer still. If pressure arrives first, the quarterback's Pocket and Decision decide what happens: a sack, a throwaway, a hurried throw with an accuracy penalty, or a scramble. A blitz shortens time to pressure but removes a defender from coverage, which loosens every receiver matchup and turns the quick game into the right answer.

Target. The concept defines a progression of two or three reads. Each read is a receiver against the defender the coverage assigns to him: a man defender in man coverage, the nearest zone defender in zone with a penalty to separation but a bonus to the defender's help, plus any bracket or safety help from an adjustment. Separation comes from the receiver's Route, Release, and Speed against the defender's Coverage, Press, and Speed, plus the scheme modifier and live state. The quarterback's Decision picks the best open read, with an error chance that grows under pressure and shrinks with Awareness; a bad decision is how interceptions start.

Throw and catch. Accuracy, and Arm on deep throws, against the separation and any hurry penalty gives completion, incompletion, breakup (the defender's Ball skills), or interception (a bad decision plus Ball skills). The receiver's Hands decides drops.

Run after catch. The receiver's Elusiveness and Speed against the nearest tackler's Tackle, with more tacklers nearby in zone than in man. The concept sets the ceiling: screens and crossers run, comebacks do not.

### 26.4 Run plays: blocking, the hole, the tackle, the breakaway

Blocking. The concept names a point of attack, which maps to specific blockers against specific defenders, and the defense's front and personnel set the box count. A light box is a bonus, a loaded box a penalty. The net of those matchups gives a blocking success level, which sets yards before contact.

The hole and the tackle. The back's Vision converts blocking success into a lane; his Elusiveness against the first defender's Tackle gives a broken-tackle chance; his Power gives yards after contact.

The breakaway. Speed against the pursuit of the second level, and how many deep defenders the coverage left. A one-high coverage puts an extra man in the box, which hurts the blocking, but leaves less deep help, which makes the breakaway bigger when it comes. That is a real tradeoff for the defense and it is why run concepts and coverages interact.

### 26.5 Events

Fumbles come from the intensity of contact against the carrier's Hands and Toughness and the defender's forced-fumble ability. Penalties come from the Discipline of the players involved and from the calls: pressure raises offside and holding chances, press coverage raises interference chances. Injuries come from contact type, Toughness, and stamina, with tired players hurt more often. Sacks come out of the pressure step. Every event names the players involved so the narration and the hunches can use them.

### 26.6 Randomness, execution, and live state

Every step draws from a bounded distribution rather than a coin flip, so an edge moves the middle of the outcome rather than deciding it, and the concept's risk profile sets the width: a deep shot has a wide spread, an inside zone a narrow one. Execution does two things: it scales the scheme modifier, and it sets the chance of a busted assignment, where a blocker misses his man or a receiver runs the wrong route and the play simply fails. Stamina scales every effective attribute on the field. Confidence adds a small swing. The engine only ever reads effective attributes; the coach only ever hears what his staff makes of the results.

### 26.7 What the engine hands back

A resolved snap returns the yards, the outcome type, the clock used, the players involved, and a list of matchup events: who beat whom, where pressure came from, which read was thrown to, whether help arrived. Those events are what the coordinators and the spotter observe. Hunches are built from observed events filtered through Evaluation, not from the true attributes, so a good coordinator draws the right conclusion from three plays and a bad one from ten. The opponent's staff sees the same events and runs its counter loop from them. That is how the rule in section 24.1 is kept: nobody reads the numbers; everybody reads the game.

### 26.8 Status of the first implementation

The engine described above exists as engine/resolve.js and engine/game.js, with the harness (harness.js) and the matrix check (matrix.js). See README.md and CHANGELOG.md for how to run them and what the numbers were on the first pass. The scheme matrix is doing its job in the check: Four Verticals gains three times as much against cover three as against two-man, the play action shot is a good call against one-high and a bad one against cover four, and the quick game is the answer to a six-man blitz while the deep shots get sacked. The counter loop exists in its first form: the defensive coach brackets or shades help to a receiver who has been exploited and loads the box against a run game that is winning. Coordinator hunches from observed events are the next piece.

### 26.9 Questions still open

How small the concept library can be while still making every concept worth calling somewhere.
How the scheme matrix and the matchup edge are weighted against each other at each level, since the whole coaching layer depends on neither one dominating.
What the simulation harness measures to decide that the engine "looks like football": completion rate by depth, yards per carry by box count, sack rate by protection edge, interception rate, and the shape of the yardage distributions.
