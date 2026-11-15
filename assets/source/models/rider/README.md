# The detailed rider's source (ADR-94)

`rider-source.glb` is the High tier's rider before the game fits it: a
MakeHuman character, built in Blender by `make_rider.py`, joined into one
mesh with one texture atlas. `npm run assets` reads it, fits it onto the
game's 19-bone rider (`src/asset/riderFit.ts`) and writes
`public/models/rider-high.glb`. The built GLB is never edited by hand; change
the script and rebuild both.

## Licence

Everything in `rider-source.glb` is CC0 (public domain dedication,
https://creativecommons.org/publicdomain/zero/1.0/legalcode). Nothing needs
crediting, but it is listed here so anyone can check:

| Part | MakeHuman asset | Licence (from the asset's own file) |
| --- | --- | --- |
| Body | MPFB 2.0.18's base mesh and phenotype targets | CC0 (MPFB's bundled assets) |
| Skin | `skins/young_caucasian_male` | CC0, released September 2020 |
| Shirt and jeans | `clothes/male_casualsuit06` (its logo removed, the shirt tinted in the game) | CC0, released September 2020 |
| Hair (loaded for the fit, then dropped: the hair is a buzz cut painted into the skin since ADR-99) | `hair/short02` | CC0, released September 2020 |
| Eyes, brows, lashes | `eyes/low-poly`, `eyebrows/eyebrow001`, `eyelashes/eyelashes01` | CC0, released September 2020 |
| Beanie | made by `make_rider.py` | this project's own |

The assets come from the MakeHuman system assets pack
(`makehuman_system_assets_cc0.zip`, https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html),
whose every asset is marked CC0. MPFB's code is GPL; none of it is in this
file or in the game, only what it made.

## Rebuilding

1. Blender 4.4 with the MPFB 2.0.18 extension (from extensions.blender.org,
   installed with `blender --command extension install-file -r user_default -e <zip>`).
2. The system assets pack, unzipped into MPFB's user data folder
   (`.../extensions/.user/user_default/mpfb/data`).
3. From the repo root: `blender -b --python assets/source/models/rider/make_rider.py`.
   It prints the vertex and triangle counts, and writes `rider-hem.json`
   beside the source: the tee's hem band, column by column, which
   `scripts/lib/riderHem.test.ts` checks (ADR-101). `RIDER_DEBUG_BLEND=<path>`
   also saves the scene before export, to look at. Checked on 2026-11-13: the
   unchanged script reproduced the committed source byte for byte.
4. `npm run assets -- riderHigh`, then `npm run assets:check`.

Look A was chosen by the owner on 2026-11-13: a young man, short hair under
(a buzz cut since ADR-99, painted into the skin's picture) a knit beanie with a folded cuff, a plain tee and jeans. The game's own shoes
go on over the ankles (the body has no feet).
