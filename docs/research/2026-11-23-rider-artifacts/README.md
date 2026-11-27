# High's rider in the product shots: rough edges and clipping (2026-11-23)

The owner, on 2026-11-23: the rider in the product image "still has rough edges and obvious clippings making it look unrealistic". This folder is the evidence, gathered from pictures already made, before any fix. Scope agreed with the owner: the product shots first (the README card and the hero shots), the game later; these existing pictures are enough evidence; the fix's size is decided after reading this.

## Sources

- `docs/screenshots/card@2x.png` (the README and social card, commit 7b3616c, 2026-11-22).
- The hero shots of 2026-11-22 from `scripts/shot/capture.js` (`set=final`, scale 2, 3200 x 1800): hero-kickflip, hero-heelflip, hero-glow, hero-glow-360. They were written to a temporary folder and are not in the project; rerun the script to make them again.
- Every picture is High, dark theme, reduced motion, the rider seen from behind or behind and to one side. The rider's front, the face up close and the game's own cameras were not looked at.

The close-ups were cut with `crop.py` here (nearest-neighbour enlargement, so the pixels are the render's own): `python crop.py <shot> <out> x0 y0 x1 y1 <scale>`, coordinates in the shot's own pixels.

| File | Shot | Region (x0 y0 x1 y1) | Enlarged |
| --- | --- | --- | --- |
| 00-card-rider.png | card@2x | 1520 90 2120 860 | 1.1 |
| 01-hem-dark-line.png | hero-glow@2x | 1420 260 1980 840 | 1.4 |
| 02-crotch-slivers.png | hero-heelflip@2x | 1220 620 1720 1000 | 1.5 |
| 02b-crotch-slivers-kickflip.png | hero-kickflip@2x | 1200 560 1880 900 | 1.4 |
| 03-blocky-jeans.png | hero-glow-360@2x | 1400 600 2020 1000 | 1.5 |
| 04-sleeve-hole.png | hero-glow-360@2x | 1580 150 2000 760 | 1.5 |
| 05-head-neck.png | hero-kickflip@2x | 1480 40 1800 440 | 1.8 |

## What is wrong

Seen on the card at its normal size: 1, 3 and 4. The others need the close-ups or the larger hero shots.

1. **A black line along the tee's bottom edge** (01, 00, 02b, 04). Where the tee meets the jeans a near-black strip runs along the hem, worst at the hips, in every shot. Likely cause: since ADR-106 the cloth is drawn on both faces, so the gap under the lifted hem shows the tee's inside, and that inside faces away from the sun and is in the rider's own shadow, so it renders almost black. ADR-106 traded a see-through grey band for this dark one.
2. **Thin slivers poking out at the crotch and the seat** (02, 02b, and the bottom of 01 and 03). Small dark or light triangles stick out below the seat of the jeans, against the sky. Likely cause: the crotch stretch the deformation probe recorded as a bad baseline (docs/research/2026-11-13-rider-deform.md): the named crotch edges stretch about 2.5 times in the crouch and up to 3.8 times at the tuck, and the fly's triangles shrink to 22 percent of their area. `CROTCH` was left for the owner to decide (ADR-101, the review's B2); it is still open.
3. **A blocky, cornered outline on the jeans** (03, 00). The thighs and the seat show straight segments and corners instead of curves, plain against the bright haze. Likely cause: the jeans' mesh is coarse for how far it stretches in a crouch (seat and inner thighs stretch 2 to 3.8 times, same probe), so each triangle edge becomes a visible straight line at product-shot size. The rider is 28,532 triangles of a 32,000 budget, so there is little room to add detail.
4. **Sleeves cut off hard, with a dark hole where the arm goes in** (04, 05, 00). The sleeve ends in a sharp edge with no thickness, and you can see into it to a dark inside. There is also a dent or crease in the tee's back near the armpit (05). Likely cause: the same as 1 for the dark inside (both faces, the inside shaded dark); the dent is probably the shoulder's skinning as the arm is raised.
5. **Head and neck** (05). A small dark speck by the jaw under the beanie, and a hard edge at the hairline. Minor; not looked into.

The causes above are read from the ADRs and the probe, not checked with a test build.

## Ways to fix it, for the owner to choose

- **Patch the current rider.** Shade the cloth's inside like its outside, or a little darker, instead of near black (1, 4); work on `CROTCH` and the crotch weights, the open B2 (2); add detail to the jeans where they bend most (3), which would need the triangle budget raised by an ADR. Smallest change and the download stays about the same. Risk: ADR-101 and ADR-106 show fixes here trade one flaw for another (a longer tee made a leotard from the front, a pulled-in hem opened a slit over the fly), and the crotch was already tried without success.
- **Rebuild the rider model.** A new source in Blender with cloth made for these poses: denser where it bends, sleeves and a hem with real thickness, and possibly corrective shapes for the crouch and the tuck (the pipeline has none today). The most realistic result, but a large job: High's first visit is 2,217 of 2,300 KB, so a heavier rider would need that limit raised, the frame-time targets must still hold, and every rider test and the probe's baseline start again.
- **Choose shots that hide it.** Pick poses and angles for the product shots where the crotch and the hem are least visible (the riding stance or the catch, not the crouch or the tuck; a front or side view). Fastest and fixes the product image only, not the game.

## Patched rider in the same cameras

The [heelflip comparison](06-patched-heelflip.png) shows the denim seam against the tucked leg. The pale and dark triangles visible under the original seat disappear in the updated shot. The [shirt and head comparisons](07-shirt-and-head.png) show how the waistband fills the gap below the tee, the cuffs wrap toward the arms, and the hair fades into the skin under the beanie.

Seven High-tier WebGPU captures covered the README card, the kickflip from two rear angles, the heelflip, the 360 flip, the light-theme glow shot, and a front view of the varial flip. Projecting the profile shot back onto the mesh identified the tiny dark point above the shoulder as the visible eye. Its outer corner was fitted inside the lids in the Blender source. A sliver of the eye is still visible from that angle.
