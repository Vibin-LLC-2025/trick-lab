// Who is on the board, shown on the feet (step 16, ADR-71): on the
// computer's go its shoes' soles and laces take ART.computer.shoe. The board's
// deck is the other half (BoardModel, deckSwap.ts). Called from effects when
// the rider changes, never per frame.
import { BufferAttribute, Color, type BufferGeometry } from 'three';
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

/** Each rider's colours by region (ART.rider), linear, made once. */
const OUTFITS = {
  player: ART.rider.player.map((c) => new Color(c)),
  computer: ART.rider.computer.map((c) => new Color(c)),
};

/**
 * Paints the rider's mesh (ADR-85) for whose go it is: each vertex its
 * region's colour (the `_region` attribute rider.glb carries) in the
 * player's outfit or the computer's, into the geometry's colour attribute,
 * made the first time. The geometry belongs to the model cache; painting it
 * again puts the other outfit on, and it is freed with the model. Called from
 * effects when the rider changes, never per frame.
 */
export function dressRider(geometry: BufferGeometry, computer: boolean) {
  const region = geometry.getAttribute('_region');
  if (!region) return;
  let color = geometry.getAttribute('color') as BufferAttribute | undefined;
  if (!color) {
    color = new BufferAttribute(new Float32Array(region.count * 3), 3);
    geometry.setAttribute('color', color);
  }
  const outfit = computer ? OUTFITS.computer : OUTFITS.player;
  for (let i = 0; i < region.count; i++) {
    const c = outfit[region.getX(i)] ?? outfit[0]!;
    color.setXYZ(i, c.r, c.g, c.b);
  }
  color.needsUpdate = true;
}
