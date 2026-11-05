// Composes the whole board as one BufferGeometry per material, in the PARTS
// order, so each part is one glTF mesh and one draw call (7.1).
import type { BufferGeometry } from 'three';
import { buildDeck } from './deck';
import { buildBolts, buildTruck, buildWheels, mergeUntextured, tint } from './hardware';
import { HARDWARE_DETAIL, PARTS, TRUCK, type DetailLevel, type PartName } from './spec';

export interface BoardBuild {
  parts: Record<PartName, BufferGeometry>;
  /** Zero-area triangles dropped at the deck spine tips (reported, not hidden). */
  droppedTriangles: number;
}

const WHITE = [1, 1, 1] as const;

/** Builds the board at a detail level (medium is board.glb, high board-high.glb). */
export function buildBoard(level: DetailLevel = 'medium'): BoardBuild {
  const det = HARDWARE_DETAIL[level];
  const deck = buildDeck(level);
  const nose = buildTruck(1, det);
  const tail = buildTruck(-1, det);
  // The steel group carries a vertex colour: 1 (the steel itself) on the
  // kingpins, axles, nuts and washers, TRUCK.bolts.tint on the bolt heads,
  // so the countersunk bolts read dark without an eighth material (ADR-38).
  const steel = [...nose.steel, ...tail.steel].map((g) => tint(g, WHITE));
  const bolts = buildBolts(det).map((g) => tint(g, TRUCK.bolts.tint));
  const parts: Record<PartName, BufferGeometry> = {
    Deck_Grip: deck.groups.grip,
    Deck_Wood: deck.groups.wood,
    Deck_Graphic: deck.groups.graphic,
    Truck_Aluminium: mergeUntextured([...nose.aluminium, ...tail.aluminium]),
    Truck_Steel: mergeUntextured([...steel, ...bolts]),
    Truck_Bushings: mergeUntextured([...nose.bushing, ...tail.bushing]),
    Wheels: buildWheels(det),
  };
  return { parts, droppedTriangles: deck.droppedTriangles };
}

export const triangleCount = (g: BufferGeometry) => (g.index ? g.index.count : g.getAttribute('position').count) / 3;

export function boardTriangles(build: BoardBuild): Record<PartName, number> {
  return Object.fromEntries(PARTS.map((p) => [p.node, triangleCount(build.parts[p.node])])) as Record<PartName, number>;
}
