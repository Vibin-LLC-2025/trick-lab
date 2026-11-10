// The board seen end on (step 13, ADR-68): its outline across the long axis,
// as points (y, z) in the board's rest frame, and from it how high the deck
// centre sits when the board rests on the pad at a roll with no pitch. A
// bailed board falls over its own edge on this rule, so its lowest point is
// on the pad the whole way down (tested against the built boards).
//
// The outline is the convex hull of both built boards (Medium and High)
// seen end on, half of it (z >= 0), pasted here because src/sim may not
// import src/asset (rule 11); boardSection.test.ts rebuilds it from the
// boards and fails if they drift apart by more than 0.1 mm. Pure, no
// allocation after import.
import { BOARD } from './boardVolume';

/** Half the end-on hull, [y, z] in the board's rest frame, from the wheel's bottom round the rail and over the kicks to the centreline. */
export const SECTION_HALF: readonly (readonly [number, number])[] = [
  [-0.08425, 0.087],
  [-0.0842, 0.088],
  [-0.08385, 0.0895],
  [-0.08325, 0.091],
  [-0.08205, 0.093],
  [-0.08125, 0.0935],
  [-0.06395, 0.101],
  [-0.06175, 0.1015],
  [0.00905, 0.10209],
  [0.0103, 0.102],
  [0.0137, 0.1012],
  [0.01486, 0.10072],
  [0.01552, 0.1002],
  [0.01581, 0.0999],
  [0.02166, 0.09326],
  [0.02234, 0.09243],
  [0.02305, 0.0915],
  [0.02378, 0.09048],
  [0.02518, 0.08842],
  [0.02595, 0.08723],
  [0.02675, 0.08594],
  [0.02756, 0.08456],
  [0.02838, 0.08309],
  [0.02921, 0.08152],
  [0.03006, 0.07986],
  [0.03091, 0.07812],
  [0.03176, 0.07628],
  [0.0326, 0.07435],
  [0.03345, 0.07234],
  [0.03429, 0.07023],
  [0.03522, 0.06778],
  [0.03592, 0.06578],
  [0.03681, 0.06318],
  [0.03832, 0.05826],
  [0.03971, 0.05303],
  [0.04098, 0.04751],
  [0.04162, 0.04427],
  [0.04209, 0.04171],
  [0.04215, 0.04136],
  [0.04264, 0.03838],
  [0.0431, 0.03534],
  [0.04351, 0.03223],
  [0.04387, 0.02905],
  [0.04419, 0.0258],
  [0.04447, 0.02248],
  [0.04471, 0.01909],
  [0.04489, 0.01561],
  [0.04504, 0.01203],
  [0.04514, 0.00833],
  [0.0452, 0.00444],
  [0.04522, 0],
];

/** Flat [y0, z0, y1, z1, ...]: the half hull and its mirror across the centreline. */
export const SECTION: Float64Array = Float64Array.from(SECTION_HALF.flatMap(([y, z]) => [y, z, y, -z]));

const D2R = Math.PI / 180;

/**
 * How far the deck centre sits above its rest height when the board rests on
 * the pad rolled by `roll` degrees, level along its length: minus the lowest
 * point of the section turned by the roll, less the rest height. 0 with the
 * wheels down; about 1.7 cm up on a rail; about 3.9 cm down upside down (on
 * the kicks). Either way of rolling gives the same height: the section is
 * symmetric.
 */
export function contactRise(roll: number): number {
  const c = Math.cos(roll * D2R);
  const s = Math.sin(roll * D2R);
  let lowest = Infinity;
  for (let i = 0; i < SECTION.length; i += 2) {
    const y = SECTION[i]! * c - SECTION[i + 1]! * s;
    if (y < lowest) lowest = y;
  }
  const rise = -lowest - BOARD.restY;
  // Below a micrometre is rounding with the wheels down, so a level board stays exactly at rest.
  return Math.abs(rise) < 1e-6 ? 0 : rise;
}

/** The nearest roll the board rests at by itself: wheels down, on a rail, or upside down (a multiple of 90 degrees). */
export const restingRoll = (roll: number) => Math.round(roll / 90) * 90 + 0;
