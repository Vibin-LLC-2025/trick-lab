// Who is on the board, shown on the feet (step 16, ADR-71): on the
// computer's go its shoes' soles and laces take ART.computer.shoe. The board's
// deck is the other half (BoardModel, deckSwap.ts). Called from effects when
// the rider changes, never per frame.
import { Color } from 'three';
import { ART } from './artDirection';

const COMPUTER = new Color(ART.computer.shoe);
/** Each material's own colour, kept the first time it is dressed. */
const own = new WeakMap<object, Color>();

/** Puts the computer's colour on a shoe material, or its own back. */
export function dressShoe(material: { color: Color }, computer: boolean) {
  let mine = own.get(material);
  if (!mine) {
    mine = material.color.clone();
    own.set(material, mine);
  }
  material.color.copy(computer ? COMPUTER : mine);
}
