// The sky dome's geometry (ADR-52): vertex colours, no texture, so it costs
// one draw call and no texture memory on every tier. Rings of the sky's
// gradient (sky.ts skyRgb) from below the horizon to the zenith, then the
// faint city (skylineBlocks) as flat-roofed quads drawn last in the same
// geometry, slightly inside the sky, so with depth writes off they cover it.
// Built per theme, in code, at mount; FlightDriver never touches it.
import * as THREE from 'three';
import type { Theme } from '../store';
import { ART } from './artDirection';
import { cityRgb, skylineBlocks, skyRgb, type Rgb } from './sky';

const D = ART.sky.dome;
const deg = THREE.MathUtils.DEG2RAD;

/** A point on the dome at an elevation and azimuth (degrees), at `radius`; azimuth 0 is +Z, turning toward +X. */
function onDome(out: number[], elevation: number, azimuth: number, radius: number) {
  const e = elevation * deg;
  const a = azimuth * deg;
  out.push(radius * Math.cos(e) * Math.sin(a), radius * Math.sin(e), radius * Math.cos(e) * Math.cos(a));
}

/** sRGB bytes to the linear working space vertex colours use. */
const color = new THREE.Color();
function pushRgb(out: number[], rgb: Rgb) {
  color.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, THREE.SRGBColorSpace);
  out.push(color.r, color.g, color.b);
}

export function skyDomeGeometry(theme: Theme): THREE.BufferGeometry {
  const position: number[] = [];
  const colors: number[] = [];
  const index: number[] = [];
  const n = D.azimuthSegments;
  // The sky: one vertex per ring and azimuth step, the gradient between rings.
  for (const elevation of D.rings) {
    for (let i = 0; i <= n; i++) {
      onDome(position, elevation, (i / n) * 360, D.radius);
      pushRgb(colors, skyRgb(theme, elevation));
    }
  }
  const row = n + 1;
  for (let r = 0; r < D.rings.length - 1; r++) {
    for (let i = 0; i < n; i++) {
      const a = r * row + i;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  // The city: a quad per block (two where it has a setback), just inside the sky.
  const inner = D.radius * ART.sky.skyline.radius;
  const quad = (from: number, to: number, roof: number) => {
    const base = position.length / 3;
    onDome(position, 0, from, inner);
    onDome(position, 0, to, inner);
    onDome(position, roof, from, inner);
    onDome(position, roof, to, inner);
    pushRgb(colors, cityRgb(theme, 0));
    pushRgb(colors, cityRgb(theme, 0));
    pushRgb(colors, cityRgb(theme, roof));
    pushRgb(colors, cityRgb(theme, roof));
    index.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  };
  for (const b of skylineBlocks()) {
    const mid = b.start + b.width / 2;
    quad(b.start, mid, b.height);
    quad(mid, b.start + b.width, b.height * b.setback);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(index);
  return g;
}
