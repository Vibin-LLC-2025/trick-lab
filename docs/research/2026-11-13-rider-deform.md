# The High rider's deformation, measured (2026-11-13)

From `npx tsx scripts/lib/riderDeform.ts` (ADR-101, the 2026-11-13 review's A5), after ADR-101's hem fix and atlas re-layout. **This is a bad baseline, recorded so later changes can be compared with it; passing these numbers is not acceptance.**

How it is measured: the real source (`assets/source/models/rider/rider-source.glb`) fitted onto the game's bind pose (`src/asset/riderFit.ts`), skinned on the CPU with the real pose code (`feet.ts`, `legs.ts`, `body.ts`) for a clean kickflip at 0.35 m in seven poses and both stances. Panels are chosen in the bind pose by region and place (metres from the hip joints' height; the rider faces -Z): the seat (jeans, behind, within 16 cm of the middle, 16 cm under to 6 cm over the hips), the fly (jeans, in front, within 5 cm of the middle), the inner thighs (jeans, within 9 cm of the middle, 10 to 38 cm under the hips) and the hem (the tee's lowest 3 cm). The named edges are the three the review measured (source vertices 13114 to 13460, 13459 to 13113, 13801 to 13396). "Stretch" and "Compress" are posed length over rest length, the most and the least over a panel's edges; the "baseline rest" columns divide by the rest lengths of the source as reviewed (SHA-256 `9d4d2eaf...6f541466`, kept as `scripts/lib/riderDeformBaseline.json`), so a regenerated mesh cannot hide strain behind a new rest length. "Area collapse" is the smallest posed over rest triangle area. "Hem inside" counts hem points more than 2 mm behind the nearest trouser point, outward from the pelvis (a rough count).

The hem's baseline-rest columns are large because the hem itself moved: the reviewed source's band was folded inside out, with very short edges. Read the hem against its own rest.

**What changed in the hem.** The reviewed source, posed the same way: hem stretch up to 3.04, compression down to 0.12, triangles down to 3 percent of their area, up to 41 points inside the trousers. After the fix: at most 1.38, at least 0.60, at least 54 percent, at most 21.

**What did not change.** The crotch: the named edges stretch 1.41 to 1.71 at rest and recovery, 3.74 and 3.79 at the tuck, the same before and after (the fix moved only the tee). The seat, fly and inner thighs stretch past 2 in every pose but riding and recovery, and the fly's triangles fall to 22 percent of their area in a regular crouch. `CROTCH` was not changed in this pass: nothing was tried that improved the named defect without stretching another panel, so the garment's fit goes to the owner (B2 of the review).

| Pose | Stance | Panel | Edges | Stretch | Compress | Stretch (baseline rest) | Compress (baseline rest) | Area collapse | Hem inside |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| riding | goofy | seat | 352 | 1.36 | 0.85 | 1.36 | 0.85 | 0.78 |  |
| riding | goofy | innerThighs | 161 | 1.68 | 0.91 | 1.68 | 0.91 | 0.93 |  |
| riding | goofy | fly | 241 | 1.53 | 0.90 | 1.53 | 0.90 | 0.63 |  |
| riding | goofy | hem | 194 | 1.13 | 0.89 | 8.48 | 0.97 | 0.89 | 7 |
| riding | goofy | named | 3 | 1.68 | 1.50 | 1.68 | 1.50 | - |  |
| crouch | goofy | seat | 352 | 1.95 | 0.62 | 1.95 | 0.62 | 0.73 |  |
| crouch | goofy | innerThighs | 161 | 2.54 | 0.71 | 2.54 | 0.71 | 0.72 |  |
| crouch | goofy | fly | 241 | 2.12 | 0.73 | 2.12 | 0.73 | 0.40 |  |
| crouch | goofy | hem | 194 | 1.23 | 0.68 | 7.24 | 0.81 | 0.67 | 21 |
| crouch | goofy | named | 3 | 2.54 | 2.17 | 2.54 | 2.17 | - |  |
| pop | goofy | seat | 352 | 2.06 | 0.61 | 2.06 | 0.61 | 0.73 |  |
| pop | goofy | innerThighs | 161 | 3.18 | 0.74 | 3.18 | 0.74 | 0.73 |  |
| pop | goofy | fly | 241 | 2.24 | 0.71 | 2.24 | 0.71 | 0.43 |  |
| pop | goofy | hem | 194 | 1.27 | 0.68 | 6.91 | 0.78 | 0.67 | 8 |
| pop | goofy | named | 3 | 3.18 | 1.94 | 3.18 | 1.94 | - |  |
| tuck | goofy | seat | 352 | 2.45 | 0.56 | 2.45 | 0.56 | 0.55 |  |
| tuck | goofy | innerThighs | 161 | 3.74 | 0.62 | 3.73 | 0.62 | 0.47 |  |
| tuck | goofy | fly | 241 | 2.72 | 0.53 | 2.72 | 0.53 | 0.44 |  |
| tuck | goofy | hem | 194 | 1.34 | 0.60 | 6.69 | 0.60 | 0.55 | 17 |
| tuck | goofy | named | 3 | 3.74 | 3.04 | 3.73 | 3.04 | - |  |
| catch | goofy | seat | 352 | 1.94 | 0.57 | 1.94 | 0.57 | 0.74 |  |
| catch | goofy | innerThighs | 161 | 2.55 | 0.70 | 2.55 | 0.70 | 0.64 |  |
| catch | goofy | fly | 241 | 2.12 | 0.63 | 2.12 | 0.63 | 0.33 |  |
| catch | goofy | hem | 194 | 1.18 | 0.68 | 7.04 | 0.77 | 0.66 | 15 |
| catch | goofy | named | 3 | 2.55 | 2.10 | 2.55 | 2.10 | - |  |
| touchdown | goofy | seat | 352 | 2.12 | 0.54 | 2.12 | 0.54 | 0.79 |  |
| touchdown | goofy | innerThighs | 161 | 2.92 | 0.65 | 2.92 | 0.65 | 0.55 |  |
| touchdown | goofy | fly | 241 | 2.44 | 0.62 | 2.44 | 0.62 | 0.52 |  |
| touchdown | goofy | hem | 194 | 1.26 | 0.61 | 6.57 | 0.70 | 0.59 | 10 |
| touchdown | goofy | named | 3 | 2.92 | 2.40 | 2.92 | 2.40 | - |  |
| recovery | goofy | seat | 352 | 1.23 | 0.88 | 1.23 | 0.88 | 0.95 |  |
| recovery | goofy | innerThighs | 161 | 1.41 | 0.94 | 1.41 | 0.94 | 0.94 |  |
| recovery | goofy | fly | 241 | 1.30 | 0.91 | 1.30 | 0.91 | 0.63 |  |
| recovery | goofy | hem | 194 | 1.02 | 0.90 | 8.33 | 0.96 | 0.88 | 7 |
| recovery | goofy | named | 3 | 1.41 | 1.29 | 1.41 | 1.29 | - |  |
| riding | regular | seat | 352 | 1.35 | 0.83 | 1.35 | 0.83 | 0.79 |  |
| riding | regular | innerThighs | 161 | 1.71 | 0.85 | 1.71 | 0.85 | 0.83 |  |
| riding | regular | fly | 241 | 1.60 | 0.83 | 1.60 | 0.83 | 0.81 |  |
| riding | regular | hem | 194 | 1.13 | 0.89 | 8.46 | 0.97 | 0.89 | 5 |
| riding | regular | named | 3 | 1.71 | 1.35 | 1.71 | 1.35 | - |  |
| crouch | regular | seat | 352 | 1.96 | 0.61 | 1.96 | 0.61 | 0.77 |  |
| crouch | regular | innerThighs | 161 | 2.58 | 0.71 | 2.58 | 0.71 | 0.74 |  |
| crouch | regular | fly | 241 | 2.37 | 0.65 | 2.37 | 0.65 | 0.22 |  |
| crouch | regular | hem | 194 | 1.27 | 0.70 | 6.95 | 0.83 | 0.69 | 9 |
| crouch | regular | named | 3 | 2.58 | 2.06 | 2.58 | 2.06 | - |  |
| pop | regular | seat | 352 | 2.07 | 0.60 | 2.07 | 0.60 | 0.68 |  |
| pop | regular | innerThighs | 161 | 3.22 | 0.64 | 3.22 | 0.64 | 0.71 |  |
| pop | regular | fly | 241 | 2.76 | 0.74 | 2.76 | 0.74 | 0.40 |  |
| pop | regular | hem | 194 | 1.34 | 0.67 | 7.64 | 0.76 | 0.62 | 17 |
| pop | regular | named | 3 | 3.22 | 1.67 | 3.22 | 1.67 | - |  |
| tuck | regular | seat | 352 | 2.51 | 0.58 | 2.51 | 0.58 | 0.51 |  |
| tuck | regular | innerThighs | 161 | 3.79 | 0.65 | 3.79 | 0.65 | 0.79 |  |
| tuck | regular | fly | 241 | 3.07 | 0.54 | 3.07 | 0.54 | 0.42 |  |
| tuck | regular | hem | 194 | 1.38 | 0.63 | 6.45 | 0.64 | 0.54 | 14 |
| tuck | regular | named | 3 | 3.79 | 2.70 | 3.79 | 2.70 | - |  |
| catch | regular | seat | 352 | 1.93 | 0.57 | 1.93 | 0.57 | 0.76 |  |
| catch | regular | innerThighs | 161 | 2.55 | 0.70 | 2.55 | 0.70 | 0.65 |  |
| catch | regular | fly | 241 | 2.15 | 0.61 | 2.15 | 0.61 | 0.36 |  |
| catch | regular | hem | 194 | 1.19 | 0.69 | 6.99 | 0.78 | 0.67 | 20 |
| catch | regular | named | 3 | 2.55 | 2.10 | 2.55 | 2.10 | - |  |
| touchdown | regular | seat | 352 | 2.12 | 0.54 | 2.12 | 0.54 | 0.79 |  |
| touchdown | regular | innerThighs | 161 | 2.95 | 0.65 | 2.95 | 0.65 | 0.55 |  |
| touchdown | regular | fly | 241 | 2.50 | 0.60 | 2.50 | 0.60 | 0.56 |  |
| touchdown | regular | hem | 194 | 1.28 | 0.62 | 6.54 | 0.71 | 0.59 | 11 |
| touchdown | regular | named | 3 | 2.95 | 2.37 | 2.95 | 2.37 | - |  |
| recovery | regular | seat | 352 | 1.23 | 0.88 | 1.23 | 0.88 | 0.95 |  |
| recovery | regular | innerThighs | 161 | 1.41 | 0.93 | 1.41 | 0.93 | 0.94 |  |
| recovery | regular | fly | 241 | 1.28 | 0.92 | 1.28 | 0.92 | 0.60 |  |
| recovery | regular | hem | 194 | 1.01 | 0.87 | 8.55 | 0.95 | 0.87 | 5 |
| recovery | regular | named | 3 | 1.41 | 1.25 | 1.41 | 1.25 | - |  |
