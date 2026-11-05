# trick-lab: feet research (real technique, other games, shoe scale)

Written 2026-11-04 by a research agent (opus) for the feet model in `src/sim/feet.ts`. Adopted in ADR-20: section 5.1's continuous formulas are now `STANCE` and `MOTION`. Items in section 4 that were not adopted are listed in ADR-20 and PERF-BUDGET.md.

> **2026-11-04, ADR-24: the lab renders the rider goofy.** Everything below is written for a regular rider (toe side +Z, yaw -90 across the board). The app mirrors it across z = 0: toe side -Z, heel side +Z, rider facing -Z, front foot the right shoe; every z and every yaw below is negated in `src/sim/feet.ts`, and `ART.stance` is `rollSign = 1`, `yawSign = 1`. Descriptions relative to the rider (heel-side corner, outside edge, behind the heels, backside) hold as written.
>
> **2026-11-04, ADR-25: a Stance control switches goofy (the default) and regular.** Regular is drawn from the goofy numbers: the board turns 180 degrees on the pad (nose at -X) and the feet mirror along X (x to -x, yaw to 180 - yaw), so the camera stays on the heel side. The numbers below are not re-entered for it.

## 0. Frame, conventions and the deck numbers used below

App frame (board rest frame): nose +X, up +Y, toe-side edge +Z, heel-side edge -Z. Regular stance: left foot forward near +X, right foot on the tail at -X, rider faces +Z. Yaw follows `FootPose.yaw` in feet.ts: 0 points the toe at the nose, -90 points it across the board at the toe side, -45 is the diagonal toward the toe-side pocket of the nose, -135 would point the toe toward the tail-toe corner. All foot positions are the sole's bottom centre, as in feet.ts.

Deck facts from `src/asset/spec.ts` that the numbers below are measured against:

| Feature | x (m) | Note |
| --- | --- | --- |
| Nose tip | +0.4095 | |
| Nose kick starts ("where the nose starts to curve up", the flick spot) | +0.235 | kick length 0.1745 |
| Front truck centre (`BOLTS_X`) | +0.208 | with a standard 54 mm (2.125 in) bolt pattern the inner bolts are near +0.181 and the outer near +0.235 (my estimate, the app may differ) |
| Tail truck centre | -0.208 | |
| Tail kick starts | -0.235 | kick length 0.162, tip angle 19 degrees |
| Tail tip | -0.397 | |
| Rail (half width) | 0.1016 | about 0.0955 at x = -0.30 on the tail |

A 0.285 m shoe set across a 0.203 m deck overhangs by about 8 cm in total, so "toes hanging off" and "heel hanging off" are both normal and the question is only where the overhang goes. When a foot is across (yaw -90) its toe tip is at z + 0.1425 and its heel at z - 0.1425.

### Direction checks (stated unambiguously in this frame)

- **Kickflip.** The front foot leaves the board diagonally forward and toward the heel side, off the heel-side corner of the nose: direction roughly (+X, -Z) plus up. The board rolls so the toe-side edge rises and the grip turns toward the heel side (-Z) first. Wikipedia: for a regular rider the board "spins clockwise if viewed from the front". Seen from +X looking back toward -X, the viewer's right is -Z, so clockwise means the top goes toward -Z: a negative rotation about +X. This matches `ART.stance.rollSign = -1` and the comment in artDirection.ts. Braille: the board flips "toward the front foot's heel-side corner".
- **Heelflip (in the app since 2026-11-04 (ADR-30), Z sign flipped in the goofy frame).** The front heel kicks "forward and outwards, away from the rider's toe side (diagonal)", heel last off the board, off the toe-side corner of the nose: direction (+X, +Z) plus up. The board spins "clockwise from the perspective of a view from behind" (from -X looking +X, right is +Z), so the grip turns toward +Z first: a positive rotation about +X, the opposite of the kickflip. Flick is signed since 2026-11-04 (ADR-30): a negative flick is a heelflip. In the app's goofy frame (toe side -Z) the kick is (+X, -Z) plus up and the grip turns toward -Z first.
- **Backside pop shove-it.** The back foot scoops the tail backward, behind the rider: the tail (-X) swings toward the heel side (-Z). That is clockwise seen from above, a negative rotation about +Y, matching `yawSign = -1`. Varial flip = kickflip + backside 180 shove. 360 flip = kickflip + backside 360 shove. Both are what the app's positive flick plus positive scoop produce.
- **Frontside pop shove-it (in the app since 2026-11-04 (ADR-30), Z sign flipped in the goofy frame).** The back foot pushes the tail forward, in front of the rider: tail toward +Z ("think about the tail going forward", Shred School). Hardflip = kickflip + frontside shove, in the app from 2026-11-04 (a negative scoop; in the goofy frame the tail goes toward -Z) until ADR-41 (2026-11-05) removed it: see item 16.

## 1. Real technique per trick (regular stance)

Quantitative data on foot placement in the literature is thin. The biomechanics papers give forces and phase timing for the ollie; coaching sources give placement in words ("just behind the bolts", "45 degrees"). Every distance below that is not quoted from a source is my conversion of the words into this deck's geometry, marked "est.".

### 1.1 What the biomechanics says (applies to every popped trick)

- **Ollie phase timing from video** (Heinen, Brockie, ten Broek, van der Kruk, Moore, TU Delft, engrXiv preprint, Fig. 1, one skater from a YouTube clip): preparation 0.013 s, pre-pop 0.129 s (back leg pushes, front foot unloads, front wheels leave the ground while the front foot starts sliding forward), pop 0.181 s (tail hits the ground, front foot still sliding, back foot barely in contact), 0.187 s (back foot no longer in contact), 0.303 s (front foot reaches the nose), 0.431 s (back foot contacts the board again), 0.543 s (board levelled by the front foot), 0.676 s (highest point, knees tucked, feet firmly on the deck), 0.904 s (back wheels touch), 1.097 s (landing). Taking airtime as 0.187 s to 0.904 s (0.717 s), as fractions of airtime: back foot off the tail at about 0.0, front foot at the nose at 0.16, back foot back on the tail at 0.34, board level at 0.50, feet on the deck at the peak 0.68, wheels down at 1.0. Single skater, single clip: treat as indicative.
- The same paper's optimal-control result: "The back foot initially moves to the pocket of the skateboard, the point with the lowest velocity of the tail during rotation", and just before impact "the front foot ... releases pressure as the back foot pushes down".
- **Forces** (Frederick, Determan, Whittlesey, Hamill 2006, J Appl Biomech 22(1):33-40, 7 top amateur or pro skaters, 45.7 cm platform): ollie-up vertical peak 2.22 +/- 0.22 body weights "resulting from rapidly rotating the tail of the board into the ground"; landing impact peak 4.74 +/- 0.46 BW within the first 30 to 80 ms. Determan et al. 2006 (kickflip, abstract via search snippet only, not read in full): landing peak about 4.61 +/- 1.19 BW, with high in-shoe pressure under the hallux and metatarsal heads (the ball of the foot), which supports "pop from the ball of the back foot".
- **Board pitch at the pop**: about 45 degrees when the front foot's side hits near the bolts, 60 degrees or more as it slides to the pocket (frame-by-frame analysis of a pro ollie, eed3si9n.com, an estimate from video, not a measurement); "the board presses against the front foot at about 60 degrees" (whythetrick, popular explainer).
- **Muscle synergies** (Sci Rep 2024, 7 skaters, ollie, kickflip, 360 flip, Vicon 200 Hz): one shared "jump" synergy active mainly in the first third of the take-off, then trick-specific synergies (board rotation) peak after it. Supports: pop first, flick or scoop immediately after, inside the first quarter of the flight. Learning time reported: ollie several months, kickflip at least a year, 360 flip several years.
- **Feet in an ollie stay on the board**: in an ollie the board rises to the feet (front foot drags it, back foot re-contacts the tail at about a third of the airtime, both on the deck at the peak). The feet only leave the board by a visible gap in flip and shove tricks ("lift both feet at least 2 inches above the board", Empire 360 flip tip).

### 1.2 Ollie

- **Back foot**: ball of the foot centred on the tail, "hanging off the edge just a little bit" (Braille), on the ball with the heel raised (Braille, Vans). Angle: sources disagree; most say perpendicular, one pro breakdown shows it "out-toed 45 degrees" (toes turned toward the tail), Braille's heelflip setup turns the back heel "a few degrees toward the front foot" (also out-toed). Est.: x -0.30 to -0.32, z about -0.03 (heel overhangs the heel side, toes near the toe-side rail), yaw -95 to -110, heel up 10 to 15 degrees.
- **Front foot**: "just down from the front bolts", near the centre, perpendicular (Braille); "just behind the front bolts, slightly angled" (Vans via search); "a few inches behind the front bolts", toe lined up with the edge (surfertoday); further back for higher ollies (Braille). Est.: x 0.08 to 0.12, z -0.01 to -0.03, yaw -80 to -90.
- **Pop**: back foot snaps straight down with the ankle ("don't stomp", "don't let the back foot be an anvil", Braille). Pop straight down; an angled pop rotates the board (Voicetube via search).
- **Slide**: front shoe rolls onto its outside edge ("the outside-center of the foot and the side of the shoe, not the toes", Braille; "the outer or top side of the shoe slides towards the nose", Wikipedia) and drags +X to the nose pocket (x about 0.25 to 0.30), reaching it at about 0.16 of airtime (Heinen). For a left front foot set across, the outside (pinky) edge faces +X, so the shoe banks with its +X edge down.
- **Level**: front foot pushes forward and down while the back leg lifts (Wikipedia, Braille), level at about 0.5 of airtime; back foot back on the tail at about 0.34.
- **Land**: both feet over the bolts, knees bend; impact 30 to 80 ms.
- **Mistakes and what they look like**: dragging with the toes or a flat foot (board does not rise at the nose); back foot staying down (board stays down, tail-heavy); no slide (nose never comes up, board stays pitched or flat); leaning back on landing (board shoots forward).

### 1.3 Kickflip

- **Front foot**: "behind the bolts at about a 45-degree angle", then "pivot the front heel toward the back foot so it hangs off the board's edge", toes "pointing diagonally ... towards the toe-side pocket of the nose" (Braille). "A bit behind the bolts ... slightly turned with your toes toward the nose" (skatedeluxe). 45 degrees "just behind the bolts" (wikiHow via search); 30 to 45 degrees, "an inch or two behind the front bolts" (search summary, one source). Est.: yaw -45 (range -40 to -60), x 0.12 to 0.15, z -0.03 to -0.05 (ball of the foot near the centreline, heel 3 to 4 cm over the heel-side rail).
- **Back foot**: "middle of the tail, with the ball of your foot on the tail's tip and your heel slightly raised" (Braille); "on the toe side" and the common error is "placing their back foot too far on the heel side of the board ... the board can start to roll away" (SkateIQ). Est.: x -0.32 to -0.35, z -0.02 to 0.0, yaw about -95, heel up 15 degrees.
- **Body**: chest open toward the nose, shoulders level and parallel to the board; turning the shoulders early or the chest to the toe side causes a down-flick and the board shoots away (Braille, Publish News via search).
- **Pop, then slide and flick almost at once**: "prepare to pop and flick ... almost immediately after your tail hits the floor" (Sidewalk). The front foot drags +X "over the grip towards the nose" (skatedeluxe), then leaves "diagonally forward and towards the heel side" (Wikipedia) off the heel-side corner of the nose, "up and out, not down" (Braille). The flicking part is the outside of the forefoot, the pinky-toe side ("the flick comes from the baby toe on the edge of the deck", wikiHow via search; "the toe side of your shoe should slide off the nose in a slight angle", skatedeluxe). The board starts to rotate "after the toes of your front foot have left the nose" (skatedeluxe). Est.: slide 0.08 to 0.12 m to x about 0.24 to 0.27 (the start of the nose kick), flick exit direction about (0.6, 0.3, -0.74), foot travel 0.15 to 0.25 m off the corner, flick window about 0.05 to 0.22 of airtime.
- **Air**: knees up, both feet lifted a few cm clear so the board can turn (Braille, SkateIQ: feet that stay low end up under the board).
- **Catch**: sources disagree on which foot first. Sidewalk: catch with the back foot first "once you can see the griptape"; Braille's drill catches with the front foot. Then both feet on the bolts.
- **Mistakes**: flick down (most common per Braille; the board goes down and away, the foot ends under the board); flick with the whole leg or too far forward (board flies out ahead, nollie.pages.dev and a transcript on lilys.ai); late flick (board flips diagonally, Publish News via search); planting the front foot too soon (missed flick, SkateIQ); back foot on the heel side (board rolls away, SkateIQ); not jumping high enough (board hits the feet or lands half-flipped); front foot too far outside makes the flip easier but weaker, more inside is more powerful (skatedeluxe reply).

### 1.4 Heelflip (in the app since 2026-11-04 (ADR-30), Z sign flipped in the goofy frame)

- **Front foot**: same distance up the board as an ollie or kickflip, toes "slightly hanging off the side of the board" (toe-side edge), pressure on the ball "almost enough to curl your big toe over the edge" (Braille). Est.: x 0.10 to 0.13, z +0.01 to +0.03, yaw -85 to -90.
- **Back foot**: tail pocket, closer to the heel side, on the ball, heel turned a few degrees toward the front foot (Braille). Est.: x -0.32, z -0.03, yaw about -100.
- **Kick**: forward and out off the toe-side corner of the nose, heel last (Wikipedia), mostly the pinky-toe side with the heel (Braille). Exit direction est. (0.6, 0.3, +0.74).
- **Mistakes**: board lands behind you from slouching (jumping forward); back foot not lifted high enough.

### 1.5 Pop shove-it, backside

- **Back foot**: on the tail with "the toes slightly off the edge" (Braille), "toes ... slightly hanging off" (skatethestates), "on the toe side of the tail, angled slightly forward. Avoid the tip, since the board may flip" (Shred School), not hanging over the end of the tail (Sidewalk). Wikipedia: for backside the back foot's toes hang off the front (toe-side) edge. Est.: x -0.29 to -0.31, z 0.0 to +0.02 (toe tip 3 to 5 cm past the toe-side rail), yaw -85 to -90.
- **Front foot**: "flat on the board right behind the bolts" (Braille); "a bit before the bolts", angled (Shred School); some say slightly in front of the middle with heel on the board and toes off (search summary). Est.: x 0.10 to 0.13, z -0.02 to 0.0, yaw -85 to -90.
- **Pop and scoop**: pop the tail and "scoop it around" at the same time (skatethestates); the back foot scoops backward, behind the rider (Wikipedia, MasterClass via search): tail toward -Z, foot path starts -Z with some -Y (pressing down as it pops), then lifts. Est.: foot travel 0.10 to 0.15 m in about the first 0.1 of airtime, ending just past the heel-side rail (z about -0.10 to -0.13).
- **Front foot**: does not drag up like an ollie; lifts and stays out of the way as the board passes 90 degrees (Sidewalk), "the point of control" that guides the shove (Braille), sometimes "up and out in front of you" (search summary). Est.: straight up 5 to 8 cm, slight +Z.
- **Catch**: front foot reaches for the grip "just before the board reaches 180", then the back foot (skatethestates, Sidewalk); both feet on the bolts.
- **Mistakes**: board lands in front or is hard to catch from pushing the board away from the body (skatethestates); spin too fast goes past 180, too slow short of 180 (skatethestates); weak spin from not pushing down on the tail while scooping (Shred School); back foot on the very tip flips the board (Shred School); feet planted, landing on one foot (Shred School).

### 1.6 Pop shove-it, frontside (in the app since 2026-11-04 (ADR-30), Z sign flipped in the goofy frame)

- Back foot set toward the heel side of the tail, toes pointed (Shred School: it "hangs off the heel side of the tail"); front foot "a little bit before the bolts, with your toe hanging off slightly", kept flat (a poked-out heel gives an unintended heelflip). Scoop: "point your toe and slice it down and forward", tail toward +Z, while hopping back a little. Exit direction est. (0, -0.3, +0.95).

### 1.7 Varial flip (kickflip + backside 180 shove)

- **Front foot**: "right underneath the top bolts", 45 degrees, "more towards the heelside" makes the board flip faster (Braille); "a bit further toward the nose", "a little more centered" (Shred School). Est.: x 0.14 to 0.17, z -0.04 to -0.05, yaw -45.
- **Back foot**: on the tail, toes hanging off (Braille). Est.: x -0.32, z 0.0, yaw -90.
- **Scoop**: "doesn't need to be that powerful", "a small nudge", pop "straight down, with a slight nudge" (Braille). Est.: 0.06 to 0.10 m toward -Z in the first 0.08 of airtime.
- **Flick**: "really flick your front foot forward off the board, like a karate kick", "more in front of you" (Braille); "off of the kickflip spot, right where the nose starts to curve up", "the edge of the nose", leg motion more like a heelflip (Shred School). Est. exit direction (0.8, 0.3, -0.5), more forward than a kickflip.
- **Back foot after the scoop**: "lift it super high" (Braille), "higher than you might think" (Shred School).
- **Mistakes**: flat pop (needs a steep, near-vertical pop); flick too hard (board flies away); flick too central or too little contact (board levels into a flat shove or nose-dives); board grabs the front foot and drifts ahead; bailing with the board landing on the foot (Shred School).

### 1.8 360 flip (tre flip: kickflip + backside 360 shove)

- **Back foot**: "at the end of the tail with your toes hanging over the edge", "slightly curling the toes ... around the edge of the tail" (Braille); "in the cup on the tail, not at the tail's tip as in a kickflip" (Empire); toes hanging off slightly (SkateIQ). Est.: x -0.29 to -0.31 (pocket, not tip), z +0.01 to +0.03, yaw -85 to -90.
- **Front foot**: kickflip position, 45 degrees, "a little under the front screws" (Empire); moved back toward the middle (search summary); 30 to 45 degrees with the heel slightly off (search summary). Est.: x 0.09 to 0.12, z -0.02 to -0.03, yaw -45 to -60.
- **Scoop**: the power of the trick: "a very hard scoop" (Braille), back foot kicked backward so it is "almost under the board for a split second" (Empire, "backward ankle scoop"), "down and straight back" (search summary). Est.: 0.15 to 0.25 m toward -Z with a -Y component, in the first 0.12 to 0.15 of airtime, ending well past the heel-side rail.
- **Flick**: light, "just floating above the board", "more off the side of it as it begins spinning from your scoop" (Braille); "you don't need to flick as hard as a kickflip" (Red Bull via search). Est.: 0.06 to 0.12 m, direction about (0.35, 0.35, -0.87).
- **Body**: lean slightly back (Braille); lift both feet at least 2 inches (5 cm) above the board (Empire).
- **Catch**: front foot first when the rotation is "almost complete", then the back foot "a fraction of a second" later (Empire, Braille).
- **Mistakes**: leaning forward lands you in front of the board or on the nose (Braille); over-focusing on the front foot over-flips or under-spins (Braille); weak or wrongly angled scoop gives a plain kickflip with little spin (search summary); over-flick over-rotates (SkateIQ).

### 1.9 The other app tricks (fewer sources; mostly extrapolation)

- **360 shove-it**: as the backside pop shove-it with a harder, longer scoop that drags the tail around (the Shred School shove-it page warns that the board coming off the back foot laterally turns a shove into a 360); front foot lifts higher to clear a full turn. Est. scoop 0.18 to 0.22 m.
- **Double kickflip**: kickflip setup, harder and longer flick, higher pop, feet tucked higher and caught later. Est. flick travel 0.25 to 0.30 m, hover 10 to 12 cm. (No dedicated source read; flagged as an estimate.)
- **Double tre**: 360 flip setup with a harder flick; highest feet. Estimate only.

### 1.10 Bad-input motions the app should show

| Input problem | What the feet look like in real life | Source |
| --- | --- | --- |
| Weak flick | Front foot slides up but leaves near the rail and down; the board half-flips (lands on its side or primo) | Braille, SkateIQ |
| Flick down instead of up and out | Foot ends under the board, board pushed down and away | Braille, nollie.pages.dev |
| Flick too far forward or whole-leg | Board flies out ahead of the rider | lilys.ai transcript, nollie.pages.dev |
| Late flick | Board flips diagonally | Publish News (via search) |
| Over-scoop | Board goes past 180 (lands sideways), back foot swung wide and behind | skatethestates, SkateIQ |
| Under-scoop on a 360 flip | Back foot short, board kickflips with little spin | search summary |
| No slide (ollie) | Nose never lifts, board stays tail-down or flat | Braille |
| Back foot on the heel side | Board rolls away, inconsistent flick | SkateIQ |
| Back foot on the very tip (shove-it) | Board flips | Shred School |
| Low pop | Feet barely leave the deck, board hits the feet | general; also the app's own rule |
| Feet not lifted | Board hits the shins, feet under the board | SkateIQ, Braille |

## 2. Other skate games, simulators and teaching tools (ideas only, described generically)

- **One stick per foot (Session: Skate Sim, Skater XL).** Each analog stick is a foot. Ollie: back-foot stick pulled down (pop) and released, the front-foot stick pushed forward (the slide); kickflip: pop, then the front-foot stick pushed sideways, with the opposite side for a heelflip; nollie versions swap roles. Reviewers: "magically lifelike" on flat ground once it clicks, but "utterly overwhelming" for an hour or two, a "hard delay" between pop and flick, and confusion when the stance switches. What reviewers say helps: an on-screen controller where each stick is colour-coded to match its foot (the colours can be changed), and challenge demos where a translucent demo skater performs the trick next to the controller prompt, which you can slow down and study. Idea for us: colour-code each shoe and its motion trail consistently everywhere (scene, legend, text), and offer a demo ghost at reduced speed.
- **One gesture per trick (EA's skate series).** A single stick gesture encodes the pop and flick (down to six o'clock, then up toward one side for a kickflip). The original prototype was text-only and scored each attempt for accuracy and speed on a 1 to 5 scale; testers kept competing to beat their score. A later tutorial added an on-screen trick analyzer showing what the stick did for each trick, which players use to diagnose why a trick was misrecognized. Ideas: show the student their own motion next to the ideal one; give a small accuracy or timing score per foot.
- **Button combos (Tony Hawk's Pro Skater style).** Canned, motion-captured animations; a direction plus a button picks the trick. Great for naming tricks, no cause and effect at the feet. Our app sits at the other end, which is its teaching value.
- **Touch (Touchgrind Skate 2, Skate City).** Two fingers are the two feet on a fingerboard; reviewers praise the flip physics and call it "extremely tough to master". Skate City's menus show how tricks are performed rather than a control diagram.
- **VR (VR Skater, Virtual Skate).** VR Skater maps the board to the hands because headsets cannot track the feet; a newer demo gives each hand one foot in full 3D, like hand boarding. Insight: even in VR, designers abstract the feet into two independently driven points, which is what our two-shoe model is.
- **Replay and slow motion.** Session replays the last minute or so in real time or slow motion with an editor; Skate 3 and the 2025 skate. allow rewind, slow motion and trimming. Beginner guides recommend recording attempts in the replay editor to compare progress, and a trick-name display to tell similar tricks apart (backside 180 versus pop shove-it).
- **Trick teaching apps.** A 3D trick app on iOS has a step-by-step mode with an explanation per step, a continuous mode with a speed bar, a first-person view "to discover easily foot placements", goofy mode, and later added "useful areas of the feet colored in red during a trick". User complaints: the camera too far away to see the tips, clunky physics. Another 3D app offers adjustable speed and camera angles and a stance switch. Video apps offer a slow-motion button.
- **Motor learning.** An external focus (on the effect of the movement, here the board and its edge) beats an internal focus (on the body) for learning: Chua et al. 2021 meta-analysis, Hedges g about 0.58 for retention and transfer, across ages and skill levels; a 2025 meta-analysis suggests a proximal external focus (close to the body, for example the shoe on the board edge) suits novices. Implication: anchor arrows and highlights to the board (where the shoe meets the rail, which way the edge is pushed), not to knees or ankles.

## 3. Shoes at the scale that matters

- **Construction.** Vulcanized: thin, flexible sole, a rubber foxing tape wrapped around the sidewall, flat waffle tread, often a rubber toe cap or toe bumper; good board feel. Cupsole: a moulded cup stitched to the upper, typically 2 to 3 times thicker than a vulc sole (relative claim from a skate-shoe guide), stiffer and more padded. Both are flat-soled with a low drop.
- **Measured numbers (RunRepeat lab tests; their standard test size is a men's US 9, not stated on the page):**

| Model (both vulc) | Heel stack | Forefoot stack | Drop | Outsole rubber | Forefoot width | Heel width | Internal length |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Classic low-top skate shoe A | 18.7 mm | 12.7 mm | 6.0 mm | 5.5 mm | 99.2 mm | 68.1 mm | 267.5 mm |
| Classic low-top skate shoe B | 21.8 mm | 13.7 mm | 8.1 mm | 6.1 mm | 100.4 mm | 69.4 mm | 272.7 mm |

  Category ranges for skate shoes: heel stack 17.3 to 21.8 mm, forefoot 9.6 to 13.7 mm.
- **Length.** Foot length for US men's 9 to 10 is about 26 to 28 cm depending on the chart. Outer length of a skate shoe is internal length plus the toe cap, foxing and heel counter, about 1.5 to 2.5 cm (est.), so about 0.285 to 0.30 m for a US 9 to 10.
- **Against our shoe** (0.285 x 0.105, sole 0.024): length is at the short end and fine; 0.29 would be a US 9.5. The 0.105 m width is right for the widest point if the upper bulges a little over a 100 mm sole, but the footprint should taper to about 0.07 m at the heel. The 0.024 m sole is cupsole-thick; a vulc reads truer at about 0.019 at the heel and 0.013 at the forefoot (a 6 mm drop), with a visible foxing band of about 2 cm around the sidewall. `FOOT.soleHeight` would then be the heel value or the average; changing it means changing `SHOE` too (tested), so this is cosmetic and low priority.

## 4. Where feet.ts disagrees with real technique

1. **Feet hover 0.12 m above the board in every trick, the ollie included.** In an ollie the feet ride the board the whole way (front foot drags it, back foot is back on the tail at about 0.34, both feet on the deck at the peak). Only flips and shoves lift the feet, by about 5 to 10 cm. Scale `hover` with flick and scoop: about 0.01 at zero, about 0.08 at the presets, about 0.12 for doubles.
2. **Flick direction and shape.** feet.ts slides +X, then moves the foot purely -Z with toes pitched down 25 degrees. Real: the flick leaves diagonally (+X and -Z) and upward, off the heel-side corner of the nose, with the shoe rolled onto its outside edge. A toes-down dip reads as "flick down", which is the most-cited beginner mistake, so the correct motion currently looks like the wrong one. Suggest an exit vector near (0.6, 0.3, -0.74) and a roll (bank) of the shoe, not pitch.
3. **No roll axis on the shoe.** The slide and the flick are done with the side of the shoe (ollie: the outside edge drags toward the nose; kickflip: the pinky-toe side leaves the heel-side corner). `FootPose` has only yaw and pitch. Add `roll` (degrees about the shoe's own long axis, positive lateral edge down or whatever sign the shoe asset uses), about 25 to 35 degrees during the slide and flick. The back shoe across the tail also sits on a 15 to 18 degree slope at x -0.30 (the tail kick), which is a roll for a foot that points across the board.
4. **Ollie slide too short.** At flick 0, slide goes from x 0.10 to 0.20, which stops behind the front truck (0.208). Real ollies drag to the nose pocket (x about 0.25 to 0.30) by about 0.16 of airtime. For a kickflip (0.15 to 0.25) it is about right.
5. **Flick slightly late.** feet.ts flick 0.12 to 0.32. Sources: flick "almost immediately" after the tail hits; the board starts flipping as the toes leave the nose. Suggest about 0.05 to 0.22, with the slide 0.0 to 0.12.
6. **Pop timing and stance pitch.** The real pop happens before take-off (pre-pop to tail strike is about 50 ms in the Delft clip) and the back foot is on its ball with the heel raised before the pop. feet.ts has stance pitch 0 and a pop bump from 0 to 0.12. Suggest a stance heel-up of 10 to 15 degrees (pitch -10 to -15) and a shorter pop bump (0 to 0.05).
7. **Back foot turns toward the nose with scoop (yawTurn +20).** No source supports it. Sources put the back foot near perpendicular or slightly out-toed (toes toward the tail), with the shove setup shifting the foot toward the toe-side edge, which feet.ts already does with `zPocket`. Suggest yaw about -90 to -100 for all, with no scoop turn.
8. **Back foot z at zero scoop is toe-heavy.** z +0.02 puts the toe tip 6.7 cm past the toe-side rail on the tail, which looks like a shove-it setup. An ollie or kickflip has the ball near the centre and the heel overhanging: about -0.03 for an ollie and -0.01 for a kickflip, moving to +0.01 to +0.03 for a hard scoop.
9. **Scoop amplitude is small for hard scoops.** 0.12 m per normalised unit gives about 5 cm for the preset shove-it (0.9 rev/s) and 11 cm for the 360 flip. Real: 10 to 15 cm for a shove-it and 15 to 25 cm for a 360 flip, with a downward component and the foot ending past the heel-side rail. About 0.10 m per rev/s, capped near 0.25 m, matches the sources better (est.).
10. **Front stance ignores scoop.** Real: a 360 flip moves the front foot back toward the middle and the flick gets lighter; a varial flip moves it a little toward the nose and heel side. A small scoop term on `front.x` and a scoop-reduced flick amplitude would show that "the scoop does part of the flip's work" (in the app's physics the flick rate alone sets the roll, so this is purely about how the foot moves for a given rate).
11. **Done 2026-11-05 (ADR-36), catch timing:** the board's rotation now ramps up after the tail strike, runs free and stops in a catch at 0.64 to 0.76 of the airtime without changing `rollTotal` or `yawTotal`; a landed board is pressed onto its whole turn in the catch, the feet come down onto it (front 0.73, back 0.76) and ride it down. The catch window, the foot catch times and the tuck peaks are starting values, to refit from reference data. Was: real catches happen at or just after the peak (about 0.6 to 0.8 of airtime) and the feet then ride the board down, while the app rotated the board linearly until progress 1 (`roll = rollTotal * p`), so feet that touched it early would sit on a spinning board.
12. **Bail is the same for every failure.** Fine for a first pass. If refined: a flip failure ends with the board on its side or upside down and the rider stepping off to the heel side (current behaviour); a shove failure ends with the feet landing on a board at an angle and stepping off toward the side the tail swung to.
13. **Done 2026-11-04 (ADR-30):** flick and scoop are signed, so the heelflip, frontside shove-it, hardflip and inward heelflip are in the app (was: out of scope with unsigned inputs). The hardflip was removed again on 2026-11-05 (ADR-41).
14. **Done 2026-11-04 (ADR-33):** the kickflip front foot turns toward its flick heading through the flick window (0.7 of the way at the preset, 45 to about -19 degrees), so the little toe is the end that leaves the heel-side pocket; before, the sole stayed diagonal and the heel swung out instead. The sources give the contact, not the angle, so the amount is a visual estimate. ADR-32 fixed the board's pose order underneath it: the pitched nose no longer swings sideways while the board rolls.
15. **Done 2026-11-04 (ADR-34):** the heelflip's kick moves the heel, not the sole centre: it sweeps from the heel-side rail across the deck to the toe-side pocket of the nose (1.4 times the kickflip's flick distance, 27 cm at the preset) while the toes turn forward and out, and the stance puts the ball of the foot on the toe-side rail (centre z -0.033, a touch past the -0.01 to -0.03 estimate above). Before, the whole sole slid sideways with the toes across and the heel never reached the corner.
16. **Removed 2026-11-05 (ADR-41): the hardflip.** The sources were read for the first time on 2026-11-05 (`docs/research/2026-11-05/hardflip.md`): they disagree on the front-foot angle, the back foot, the flick and how vertical the board goes, give no numbers, and 9 of the 12 that state a flick direction say sideways and up, against the forward flick below. The name and preset are gone; the motion below still drives a kickflip with a frontside scoop, unnamed and unverified. Was: **Done 2026-11-04 (ADR-35), hardflip (no section above covers it):** as commonly coached (Braille Skateboarding and Shred School hardflip tutorials, from memory, not re-read for this change; est.): front foot in the kickflip spot but angled a little more toward the nose and a little more centred, the flick straight forward off the nose rather than out to the side, the back foot on the ball at the tail scooping frontside and lifting high, so the board comes round between the legs and flips near vertical. feet.ts: stance yaw -25 per unit of frontside factor times kickflip factor (about 37 degrees at the preset), flick lean (0.90, 0.30, 0.30) reached at the varial point and held for harder scoops; the back foot keeps the 1.6 frontside numbers. The varial heelflip keeps the backside leans mirrored, pending its own evidence.

## 5. Recommendations

### 5.1 Per-trick targets for the feet model

Positions in metres in the board rest frame (sole bottom centre), yaw in degrees in the feet.ts convention (0 toe at nose, -90 toe at toe side), vectors are unit directions in (x, y, z). Phase times are fractions of airtime (u = 0 at take-off). "f" and "s" are the normalised rates feet.ts already uses (rate / 2 rev/s). Every number is an estimate from the sources above unless quoted in section 1.

| Trick (inputs) | Front stance x, z, yaw | Back stance x, z, yaw, pitch | Front foot motion | Back foot motion | Phases | Hover peak |
| --- | --- | --- | --- | --- | --- | --- |
| Ollie (f 0, s 0) | 0.10, -0.01, -87 | -0.31, -0.03, -100, -12 | slide (1, 0.1, 0) 0.16 m, roll 30, then push (1, -0.3, 0) 0.02 m to level | pop (0, -1, 0) 0.01 m, then up with the tail; back on the tail at 0.34 | slide 0.00-0.16, level 0.16-0.50, both on deck 0.5-1.0 | 0.01 |
| Kickflip (1.9, 0) | 0.13, -0.035, -45 | -0.33, -0.01, -95, -15 | slide (1, 0.1, 0) 0.10 m to x 0.24; flick (0.60, 0.30, -0.74) 0.20 m, roll 30 | pop 0.00-0.04, lift (0.1, 1, 0) | slide 0.00-0.10, flick 0.06-0.22, tuck 0.25-0.6, catch 0.85 (or 0.7 with eased roll), land 1.0 | 0.08 |
| Pop shove-it BS (0, 0.9) | 0.12, -0.01, -88 | -0.30, +0.01, -90, -10 | lift (0, 1, 0.15) 0.07 m, no slide; front catches first | scoop (0, -0.3, -0.95) 0.10-0.13 m, ends z about -0.11, then lift | scoop 0.00-0.10, front lift 0.02-0.30, catch 0.85 front then back +0.05 | 0.07 |
| Varial flip (1.9, 0.9) | 0.155, -0.045, -45 | -0.32, 0.00, -90, -12 | slide 0.06 m; flick (0.80, 0.30, -0.52) 0.18 m, roll 25 | scoop (0, -0.4, -0.92) 0.08 m, then lift high | scoop 0.00-0.08, flick 0.05-0.20, catch 0.85 | 0.09 |
| 360 flip (1.9, 1.9) | 0.10, -0.025, -50 | -0.30, +0.02, -90, -15 | short slide 0.04 m; light flick (0.35, 0.35, -0.87) 0.10 m | hard scoop (0, -0.35, -0.94) 0.20 m, ends z about -0.18, then lift | scoop 0.00-0.14, flick 0.08-0.20, catch front 0.82, back 0.88 | 0.10 |
| 360 shove-it (0, 1.9) | 0.11, -0.01, -88 | -0.30, +0.02, -90, -12 | lift (0, 1, 0.1) 0.09 m | scoop (0, -0.3, -0.95) 0.20 m | scoop 0.00-0.14, catch 0.85 | 0.09 |
| Double kickflip (3.8, 0) | 0.12, -0.04, -45 | -0.34, -0.01, -95, -15 | slide 0.12 m; flick (0.55, 0.35, -0.76) 0.28 m, roll 35 | pop, lift high | flick 0.05-0.24, catch 0.9 | 0.12 |
| Double tre (3.8, 3.8) | 0.10, -0.03, -50 | -0.30, +0.025, -90, -15 | flick (0.35, 0.35, -0.87) 0.15 m | scoop 0.24 m | scoop 0.00-0.15, flick 0.08-0.22, catch 0.9 | 0.12 |
| Heelflip (in the app since 2026-11-04 (ADR-30), Z sign flipped in the goofy frame) | 0.11, +0.02, -88 | -0.32, -0.03, -100, -12 | slide 0.08 m; kick (0.60, 0.30, +0.74) 0.20 m, heel last | pop, lift | as kickflip | 0.08 |
| Frontside shove-it (in the app since 2026-11-04 (ADR-30), Z sign flipped in the goofy frame) | 0.12, +0.01, -90 | -0.33, -0.04, -90, -10 | lift, keep flat | scoop (0, -0.3, +0.95) 0.12 m | as BS shove-it | 0.07 |

Because feet.ts follows the inputs, these rows are best met by continuous terms rather than per-trick tables (est., fitted to the rows above):

- `front.x = 0.10 + 0.03 f - 0.03 s` (plus about 0.03 when s is about half of f, the varial case, or ignore it), `front.z = -0.01 - 0.03 f`, `front.yaw = -87 + 44 f - 6 s`.
- `back.x = -0.31 - 0.02 f + 0.01 s`, `back.z = -0.03 + 0.02 f + 0.06 s` capped at +0.03, `back.yaw = -95` (no scoop turn), stance `back.pitch = -12`.
- Slide distance `0.16 - 0.06 f` (min 0.04); slide window 0.00 to 0.16 at f 0, shrinking to 0.00 to 0.10.
- Flick distance about `0.10 m per rev/s of flick x (1 - 0.35 s)`, direction (0.60, 0.30, -0.74) rotated a little toward +X for mid scoop and toward -Z for high scoop if you want the varial and tre flavours; window 0.05 to 0.22; shoe roll about 30 degrees during slide and flick instead of the toe dip.
- Scoop distance about `0.10 m per rev/s of scoop`, capped near 0.25, direction (0, -0.3, -0.95), window 0.00 to `0.08 + 0.04 s`.
- Pop pitch bump 0.00 to 0.05.
- Hover `0.01 + 0.07 max(f, s)` up to 0.12; peak near 0.4 to 0.5.
- Catch: feet on the deck at 0.85 to 0.9 with the current linear roll; 0.7 to 0.8 if the flight eases the rotation.
- Bad inputs keep falling out of the same formulas: a weak flick gives a short flick vector that barely clears the rail; an over-scoop gives a back foot that swings far past the heel-side rail; a low pop shortens airtime so every phase compresses and the feet barely lift.

### 5.2 Ideas for the motion visual

1. **Foot paths as trails on the board.** Precompute each foot's path when the flight is created (sample `feetPoseAt` at, say, 48 steps; allocation outside `useFrame`), draw it as one line or thin ribbon per foot (two draw calls, or one with vertex colours), in the board rest frame. Arrowheads at the end of the slide, the flick and the scoop. Colour and dash pattern differ per foot (colour alone is not enough for colour-blind users) and match the shoe's accent. Optionally reveal the trail up to the current progress, which needs only a draw-range update, not an allocation.
2. **Contact highlights on the board, not the body.** A glow patch on the grip where the work happens: the tail pocket at the pop, the nose kick and heel-side corner at the flick, the toe-side tail edge at the scoop, plus a matching highlight on the part of the shoe doing it (ball of the back foot, outside forefoot of the front). This follows the external-focus evidence and the "useful areas coloured" idea from teaching apps, described generically. Colours come from `ART`.
3. **Ghost of the intended trick.** When the student's inputs are near a named trick, show translucent shoes (and optionally a ghost board) moving along the preset's motion next to the student's actual feet. A weak flick then visibly lags the ghost; an over-scoop visibly overshoots. Low and Medium could show only the ghost's trail to save draw calls.
4. **Phase scrubber and step mode.** Ticks on the playback scrubber for pop, slide, flick or scoop, catch and land, keyboard keys to step to the previous or next phase, and 0.25x slow motion. Each step updates `#scene-description` and announces the phase through the existing live region (store actions only), so screen-reader users get the same lesson.
5. **Top-down foot map in the DOM.** An SVG plan view of the deck in `src/ui/` with both footprints in stance and an arrow per foot for its motion (length proportional to distance, labelled "front foot: slides 10 cm toward the nose, flicks off the heel-side corner"). It doubles as the text equivalent, needs no canvas DOM, and can show the ideal arrow outline next to the actual one for bad inputs.

## Sources

Biomechanics
- Heinen, Brockie, ten Broek, van der Kruk, Moore, "Maximizing Ollie Height by Optimizing Control Strategy and Skateboard Geometry Using Direct Collocation" (TU Delft, engrXiv preprint): https://engrxiv.org/preprint/download/3171/version/4465/5768/4565
- Frederick, Determan, Whittlesey, Hamill, "Biomechanics of skateboarding: kinetics of the Ollie", J Appl Biomech 2006 (abstract): https://lida.sport-iat.de/ta/Record/4055429?lng=en and https://www.researchgate.net/publication/7021835_Biomechanics_of_Skateboarding_Kinetics_of_the_Ollie
- Determan et al., "Kinetics of the skateboarding kickflip" (abstract seen only in search results): https://www.researchgate.net/publication/242243896_Kinetics_of_the_Skateboarding_Kickflip
- "Muscle synergies are shared across fundamental subtasks in complex movements of skateboarding", Sci Rep 2024: https://pmc.ncbi.nlm.nih.gov/articles/PMC11150461
- Simulation study of the ollie jump (abstract only, not readable): https://www.researchgate.net/publication/354369693_Simulation_study_to_elucidate_the_mechanism_of_ollie_jump_in_skateboarding
- Frame-by-frame ollie analysis: https://eed3si9n.com/ollie/
- Chua, Jimenez-Diaz, Lewthwaite, Kim, Wulf 2021, external focus meta-analysis: https://digitalscholarship.unlv.edu/kns_fac_articles/424
- Wulf and Lewthwaite 2010: https://gwulf.faculty.unlv.edu/wp-content/uploads/2014/05/Wulf-Lewthwaite_2010.pdf
- Zang et al. 2025, PeerJ: https://peerj.com/articles/20012

Technique
- Wikipedia, Kickflip: https://en.wikipedia.org/wiki/Kickflip
- Wikipedia, Heelflip: https://en.wikipedia.org/wiki/Heelflip
- Wikipedia, Shove-it: https://en.wikipedia.org/wiki/Shove-it
- Wikipedia, Ollie: https://en.wikipedia.org/wiki/Ollie_(skateboarding)
- Braille, kickflip: https://www.brailleskateboarding.com/blogs/news/how-to-kickflip
- Braille, ollie higher: https://www.brailleskateboarding.com/blogs/news/how-to-ollie-higher/
- Braille, heelflip: https://www.brailleskateboarding.com/blogs/news/how-to-heelflip
- Braille, pop shove-it: https://brailleskateboarding.com/blogs/news/how-to-pop-shove-it-1
- Braille, varial kickflip: https://www.brailleskateboarding.com/blogs/news/how-to-varial-kickflip
- Braille, 360 flip: https://www.brailleskateboarding.com/blogs/news/how-to-360-flip/
- Sidewalk, kickflip: https://sidewalkmag.com/longform/intermediate-kickflip
- Sidewalk, pop shove-it: https://sidewalkmag.com/longform/beginner-pop-shove-it
- skatedeluxe, kickflip: https://skatedeluxe.com/blog/en/trick-tips/skateboard/flat/how-to-kickflip/
- SkateIQ, kickflip tips: https://skateiq.com/blogs/news/5-tips-for-consistent-kickflips
- SkateIQ, tre flip: https://skateiq.com/blogs/news/how-to-tre-flip-professional-skateboarders-step-by-step-guide
- Empire (Vans trick tips), 360 flip: https://thinkempire.com/blogs/news/empire-trick-tips-le-360-flip
- Shred School (Rad Rat), pop shove-it: https://radratvideo.com/how-to-pop-shove-it/
- Shred School, frontside shove-it: https://radratvideo.com/how-to-frontside-shove-it/
- Shred School, varial kickflip: https://radratvideo.com/how-to-varial-kickflip/
- skatethestates, pop shove-it: https://skatethestates.com/how-to-pop-shove-it/
- Board Blazers, kickflip: https://boardblazers.com/blogs/all/how-to-kickflip
- Seen only via search summaries (lower weight): https://kiwix.lema.org/wikihow_en_maxi_2023-03/Kickflip-on-a-Skateboard , https://www.redbull.com/us-en/how-to-tre-flip , https://nollie.pages.dev/skateboarding/kickflip/ , https://lilys.ai/notes/355446 , https://dev.publishnews.com.br/kickflip , https://www.surfertoday.com/skateboarding/how-to-ollie-higher-on-a-skateboard , https://www.vans.com/en-se/news/blog/how-to-ollie , https://masterclass.com/articles/how-to-do-an-ollie

Games and teaching tools
- Session: Skate Sim review (Nintendo World Report): https://nintendoworldreport.com/review/63094
- Session listing (each stick a foot): https://www.playstation.com/en-hk/games/session-skate-sim/
- Session beginner tips (trick display, replay): https://www.godisageek.com/2022/09/session-skate-sim-beginners-tips/ and https://www.thegamer.com/session-skate-sim-beginner-tips-tricks-guide/
- Skater XL review (Engadget): https://www.engadget.com/skater-xl-ps4-easy-day-studios-review-133011739.html
- Skater XL reviews (colour-coded sticks, demo shadow): https://www.thexboxhub.com/skater-xl-review-skatebored/ and https://checkpointgaming.net/reviews/2020/08/skater-xl-review-more-like-skater-xs/
- EA skate flick-it prototype: https://www.gamedeveloper.com/game-platforms/ea-s-blackwood-text-based-prototype-perfected-i-skate-i-s-control-scheme
- Skate 3 Skate School: https://www.engadget.com/2010-03-18-skate-3s-skate-school-as-taught-by-coach-frank.html
- skate. (2025) flick-it and replay: https://deltiasgaming.com/?p=367489 and https://www.operationsports.com/how-to-use-replay-in-skate
- Touchgrind Skate 2 reviews: https://www.tapsmart.com/games/review-touchgrind-skate-2/ and https://www.gamezebo.com/reviews/touchgrind-skate-2-review/
- Skate City reviews: https://gamecritics.com/c-j-salcedo/skate-city-review/ and https://www.commonsensemedia.org/game-reviews/skate-city
- VR Skater: https://roadtovr.com/skateboarding-sim-vr-skater-coming-psvr-2-summer-trailer/ and https://www.pushsquare.com/reviews/ps5/vr-skater
- Virtual Skate (hand per foot): https://store.steampowered.com/app/3708750
- 3D trick app listing: https://apps.apple.com/us/app/3d-skate-tricks-learn-easily/id1621168216
- Boardfeeling listing: https://apps.apple.com/us/app/id6474184543

Shoes
- RunRepeat lab test, classic vulc low-top A: https://runrepeat.com/vans-old-skool
- RunRepeat lab test, classic vulc B: https://runrepeat.com/vans-half-cab
- Decathlon, vulc versus cupsole construction: https://decathlon.ch/en/p/chaussures-basses-cupsoles-de-skateboard-adulte-crush-500/_/R-p-335046
- Shoe size and Brannock basis: https://akarinohon.com/text/taketori.cgi/en.wikipedia.org/wiki/Shoe_size
