# Can the hardflip be built from public sources?

Research date: 2026-11-05. Question from the owner: is there enough trusted public information (research, data, coaching) for agents to implement a realistic hardflip without filling gaps by guessing? If not, remove it. Answer: **no**, so ADR-41 removed it. This file is the evidence ADR-41 cites.

Method: two research agents (one on coaching sources, one on physics and high-speed footage) plus a numerical check in a scratch script. YouTube tutorials were read as auto-captions, not watched; coaches often say "like that" while gesturing, so spatial detail is lost. Nothing below is a measurement taken for this project.

## Verdict in one paragraph

The sources agree on the outline: a kickflip with a frontside shove, the board coming up between the legs, the legs opening, the front foot catching first. They disagree on almost every number an implementation needs (front-foot angle, back-foot position, how much the back foot does, flick strength, weighting, how vertical the board goes) and none gives positions, angles or timings. Skaters also recognise two styles of hardflip with different board paths, so there is no single "realistic hardflip" to build. The app's own version (ADR-35) flicked straight forward off the nose, which most sources contradict.

## 1. The board's path

- **Two recognised styles.** Skateology, "Hardflip (1000 fps slow motion)", uploaded 2011-01-05, https://www.youtube.com/watch?v=aMCuW4PdoDQ (Redlake N3, 1,000 fps, 1280 x 720). The creator's description: "I wanted to show the two major styles of hardflips, which are the ones that are popped basically straight up with little or no flick with the front foot (like Dylan at 1:12) and the other looks more like a frontside shuv-it kickflip (like Kurt at 0:29)." Braille (Jeremy Vest, 2020-07-24) names "vertical / through the legs" and "horizontal / front shove style" hardflips; skatedeluxe (undated) says the board either "goes vertical and in between your legs" or stays horizontal. Sidewalk (about 2013, undated) calls a shove-it "that goes through your legs" a fake hardflip.
- **One published kinematic formula, not physical.** Carlisle, Hammer, Hingtgen, Martins, "Skateboard Tricks and Topological Flips", arXiv:2108.06307v1, 2021-08-13 (preprint, no journal). The hardflip is "a simultaneous half kickflip ... and a 180 degree rotation about the x-axis" (the board's transverse axis), U(t)K(t/2): the nose rises, is vertical at mid-trick and comes over to where the tail was. The authors state these product curves are "not physical" (they satisfy Euler's equations for no choice of inertia) and model only endpoints and topology. Their code (https://github.com/holomorpheus/topological-flips, `flip_list.py`, 2024-07-25) defines both `hardflip = fs*kf` (frontside shove times kickflip, which is what `boardPose.ts` draws) and `muskahardflip = ui*hk` (the vertical variant), with no prose on the label.
- **No measurement.** No source gives measured orientation over time, which end rises, or when the board is most vertical. The 2026-11-05 data-sources report (section 10) already found no public angular-velocity curves for any coupled trick.
- **Inertia exists, the initial spin does not.** The complete-board inertia tensor (S09 in data-sources.md: roll 0.009627, pitch 0.111683, yaw 0.116865 kg m^2, CAD-computed) is corroborated in order by the PRL 2020 tennis-racket paper's estimate (Mardešić et al., Phys. Rev. Lett. 125, 064301). Pitch is the unstable intermediate axis.
- **Numerical check (ours, unreviewed).** With that inertia, a torque-free board's path is fixed by its angular velocity when the feet let go, which nobody has measured. Treating the two large inertias as equal, no free path from a level board reaches one full flip plus a half shove grip up. From the app's 32.5 degree nose-up pop, near-torque-free paths exist for only one of the two flip-and-shove pairings, and they lift the long axis 40 to 56 degrees. A wider Euler-equation search by the physics agent found its best matches (6 to 8 degrees off) needed pitch rates near 30 rad/s, with the nose at 70 to 90 degrees. Real flight is not torque-free while the feet touch the board, so these hint that a free-flight hardflip couples strongly to pitch but do not define a path.

## 2. The feet (coaching sources)

Read: Braille (2012-04-20, 2018-03-20, 2020-05-22 videos; blog by Chloe Holmes 2019-03-15), Shred School (2015-12-25), Ride Channel (Ryan Decenzo 2014-08-17, Spencer Nuzzi 2016-01-13, Aldrin Garcia 2012-01-20, Derrick Wilson 2014-03-16), CCS with Jimmy Carlin (2013-07-17), Jonny Giger (2021-07-06), Skate Hacks (2019-05-12), Tom's Tutorials (2022-08-18), Sidewalk (undated), skatedeluxe (undated), SurferToday (2021-03-19, updated 2024-08-15, quoting Welinder and Whitley, *Mastering Skateboarding*). wikiHow and Dose were too weak to count; Red Bull and MasterClass did not load.

| Point | Consensus | Numbers in the sources |
| --- | --- | --- |
| Front foot position | Partly: behind the kickflip spot, near the centre (two put it at the bolts) | None |
| Front foot angle | No: Braille about 80 degrees against 45 for a kickflip; Tom's Tutorials and Jonny Giger the same as a kickflip | Braille only, contested |
| Back foot | Partly: ball of the foot near the tip of the tail; centre, toe edge or heel edge all appear | None |
| Flick direction | Partly: sideways and up in 9 of the 12 that state one ("straight to the side... not straight off the nose", Braille 2018); "behind you" in three, undefined; toward the nose only in Sidewalk | None |
| Flick strength and timing | No: "a lot less" than a kickflip against "really hard"; "right when you pop" | None |
| Scoop direction | Yes: down, then forward (frontside) | None |
| How much the back foot does | No: "the whole trick is basically in your back foot" (Braille 2018) against "nothing really happens to your back foot" (Carlin) | None |
| Board between the legs | Yes | None |
| How vertical | No: style-dependent ("not 100 vertical neither 100 horizontal", Giger) | None |
| Legs open, back knee bends | Yes; weight forward or back conflicts | None |
| Front foot catches first | Yes (10 sources) | None |
| Shove finished at the catch | Partly: several catch it short of 180 and straighten it | None |
| Failure modes | Yes: board hits the front leg, primo, full flip with half the spin, board goes behind | None |

The app's ADR-35 front foot (flick lean (0.90, 0.30, 0.30), straight forward off the nose, toes turned to about 37 degrees) was written "from memory, not re-read" (RESEARCH-FEET.md item 16). The forward flick is contradicted by the majority; the toe turn is supported by Braille only.

## 3. What it would take to bring it back

Measured footage, not more reading. Either the 240 fps two-view capture in `docs/CAPTURE-PROTOCOL.md` (capture both styles, label which), or digitising Skateology 1:12 and 2:14 (vertical style) and 0:29 (shove style) with the creator's permission and the timebase checks in data-sources.md section 4. Then choose one style on purpose, fit the board's orientation as a rotation path (not two independent Euler angles), and fit the feet from the same trials.

The Berrics "Trickipedia: Hardflip" clips and "Bryan Herman Hardflip at the STI Lab (shot at 1000FPS)" were named as further footage leads but not opened.

## 4. What stayed in the app

The sliders can still make a kickflip with a frontside scoop. It lands or fails as before and reads "Unnamed (1 kickflip, 1 frontside half shove)". Its board and feet motion is byte-identical to the removed hardflip's (checked 2026-11-05 on 1,530 input combinations in both stances), so nothing else moved; the motion is as unverified as it was and should be refit with the hardflip if footage arrives.
