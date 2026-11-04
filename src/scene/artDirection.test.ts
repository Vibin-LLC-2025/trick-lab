import { describe, expect, it } from 'vitest';
import tokens from '../styles/tokens.css?raw';
import { REST_Y, WHEEL } from '../asset/spec';
import { ART, SCENE_BG } from './artDirection';

/** Body of the first rule whose selector matches exactly, e.g. `:root` or `:root[data-theme="dark"]`. */
function ruleBody(css: string, selector: string): string | undefined {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(css)?.[1];
}

const sceneBg = (body: string | undefined) => /--scene-bg:\s*(#[0-9a-f]{6})/i.exec(body ?? '')?.[1]?.toLowerCase();

describe('scene background per theme', () => {
  it('light (:root) --scene-bg equals the light clear color', () => {
    expect(sceneBg(ruleBody(tokens, ':root')), 'tokens.css :root should define --scene-bg').toBe(SCENE_BG.light);
  });

  it('dark (:root[data-theme="dark"]) --scene-bg equals the dark clear color', () => {
    expect(
      sceneBg(ruleBody(tokens, ':root[data-theme="dark"]')),
      'tokens.css :root[data-theme="dark"] should define --scene-bg',
    ).toBe(SCENE_BG.dark);
  });

  it('the scene reads its clear colors from the same constant', () => {
    expect(ART.clearColor).toBe(SCENE_BG);
  });
});

describe('rest height (realistic board pass)', () => {
  it('rests both detail levels with their wheels on the pad', () => {
    const B = ART.board;
    expect(B.restY).toBe(REST_Y);
    // GLB wheels: centre -0.05775, radius 0.0265 (src/asset/spec.ts, tested against the built geometry).
    expect(B.restY + WHEEL.centerY - WHEEL.radius).toBeCloseTo(0, 9);
    // Primitive board (fallback and Low): its own DESIGN.md section 2 numbers, lifted by primitiveLift.
    expect(B.restY + B.primitiveLift + B.wheels.y - B.wheels.radius).toBeCloseTo(0, 9);
  });

  it('frames the longer nose and the board at any roll at the top of a 0.6 m pop', () => {
    expect(ART.camera.fit.reach).toBeGreaterThan(0.4095);
    const outerWheelEdge = Math.hypot(WHEEL.centerZ + WHEEL.width / 2, REST_Y);
    expect(ART.camera.fit.top - (REST_Y + 0.6)).toBeGreaterThan(outerWheelEdge);
  });
});
