// Composes the whole board as one BufferGeometry per material, in the PARTS
// order, so each part is one glTF mesh and one draw call (7.1).
import type { BufferGeometry } from 'three';
import { buildDeck } from './deck';
import { buildBolts, buildTruck, buildWheels, mergeUntextured } from './hardware';
import { HARDWARE_DETAIL, PARTS, type DetailLevel, type PartName } from './spec';

export interface BoardBuild {
  parts: Record<PartName, BufferGeometry>;
  /** Zero-area triangles dropped at the deck spine tips (reported, not hidden). */
  droppedTriangles: number;
}

/** Builds the board at a detail level (medium is the original GLB, byte for byte). */
export function buildBoard(level: DetailLevel = 'medium'): BoardBuild {
  const det = HARDWARE_DETAIL[level];
  const deck = buildDeck(level);
  const nose = buildTruck(1, det);
  const tail = buildTruck(-1, det);
  const parts: Record<PartName, BufferGeometry> = {
    Deck_Grip: deck.groups.grip,
    Deck_Wood: deck.groups.wood,
    Deck_Graphic: deck.groups.graphic,
    Truck_Aluminium: mergeUntextured([...nose.aluminium, ...tail.aluminium]),
    Truck_Steel: mergeUntextured([...nose.steel, ...tail.steel, ...buildBolts(det)]),
    Truck_Bushings: mergeUntextured([...nose.bushing, ...tail.bushing]),
    Wheels: buildWheels(det),
  };
  return { parts, droppedTriangles: deck.droppedTriangles };
}

export const triangleCount = (g: BufferGeometry) => (g.index ? g.index.count : g.getAttribute('position').count) / 3;

export function boardTriangles(build: BoardBuild): Record<PartName, number> {
  return Object.fromEntries(PARTS.map((p) => [p.node, triangleCount(build.parts[p.node])])) as Record<PartName, number>;
}
