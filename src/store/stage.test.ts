// The clear part of the stage (ADR-86): the layout arithmetic and the store's one action for it.
import { describe, expect, it } from 'vitest';
import { CLEAR_GAP, clearArea, FULL_STAGE, MIN_CLEAR, sameArea, type PageRect } from './stage';
import { createTrickStore } from './index';

const rect = (left: number, top: number, right: number, bottom: number): PageRect => ({ left, top, right, bottom });
/** The game screen at 1440 x 900 as measured on 2026-11-11: the stage, the turn card, the letters, the last trick and the tray. */
const STAGE = rect(9, 59, 1431, 891);
const TURN = rect(21, 71, 361, 441);
const SCORE = rect(1119, 71, 1419, 377);
const LAST = rect(1119, 385, 1419, 470);
const TRAY = rect(200, 731, 1240, 879);

describe('the clear part of the stage (ADR-86)', () => {
  it('is the whole stage with nothing over it', () => {
    expect(clearArea(STAGE, [])).toEqual(FULL_STAGE);
  });

  it('is cut by each cover from its own side, with a gap, as fractions of the stage', () => {
    const a = clearArea(STAGE, [
      { side: 'left', rect: TURN },
      { side: 'right', rect: SCORE },
      { side: 'right', rect: LAST },
      { side: 'bottom', rect: TRAY },
    ]);
    const w = STAGE.right - STAGE.left;
    const h = STAGE.bottom - STAGE.top;
    expect(a.left).toBeCloseTo((TURN.right + CLEAR_GAP - STAGE.left) / w, 4);
    expect(a.right).toBeCloseTo((SCORE.left - CLEAR_GAP - STAGE.left) / w, 4);
    expect(a.top).toBe(0);
    expect(a.bottom).toBeCloseTo((TRAY.top - CLEAR_GAP - STAGE.top) / h, 4);
  });

  it("never moves when a card grows or shrinks: a side card cuts by its side only, whatever its height", () => {
    const short = clearArea(STAGE, [{ side: 'left', rect: { ...TURN, bottom: 200 } }, { side: 'bottom', rect: TRAY }]);
    const tall = clearArea(STAGE, [{ side: 'left', rect: { ...TURN, bottom: 700 } }, { side: 'bottom', rect: TRAY }]);
    expect(sameArea(short, tall)).toBe(true);
  });

  it('ignores a cover that is not over the stage (a panel scrolled away, one with no box)', () => {
    expect(clearArea(STAGE, [{ side: 'bottom', rect: rect(0, 900, 390, 1000) }])).toEqual(FULL_STAGE);
    expect(clearArea(STAGE, [{ side: 'left', rect: rect(0, 0, 0, 0) }])).toEqual(FULL_STAGE);
  });

  it('falls back to the whole stage when what is left would be a sliver, or there is no stage', () => {
    const narrow = clearArea(STAGE, [
      { side: 'left', rect: rect(9, 59, 9 + 1422 * 0.45, 300) },
      { side: 'right', rect: rect(1431 - 1422 * 0.45, 59, 1431, 300) },
    ]);
    expect(1 - 2 * 0.45).toBeLessThan(MIN_CLEAR);
    expect(narrow).toEqual(FULL_STAGE);
    expect(clearArea(rect(0, 0, 0, 0), [{ side: 'bottom', rect: TRAY }])).toEqual(FULL_STAGE);
  });

  it('rounds, so a sub-pixel wobble is no change', () => {
    const a = clearArea(STAGE, [{ side: 'bottom', rect: TRAY }]);
    const b = clearArea(STAGE, [{ side: 'bottom', rect: { ...TRAY, top: TRAY.top + 0.001 } }]);
    expect(sameArea(a, b)).toBe(true);
  });
});

describe('setStageClear', () => {
  it('holds the measurement, never logs it, and keeps the same object while nothing changed', () => {
    const store = createTrickStore();
    expect(store.getState().stageClear).toBeNull();
    const a = clearArea(STAGE, [{ side: 'bottom', rect: TRAY }]);
    store.getState().setStageClear(a);
    expect(store.getState().stageClear).toBe(a);
    let changes = 0;
    const stop = store.subscribe(() => changes++);
    store.getState().setStageClear({ ...a });
    expect(changes).toBe(0);
    expect(store.getState().stageClear).toBe(a);
    store.getState().setStageClear(null);
    expect(changes).toBe(1);
    stop();
    expect(store.getState().events).toEqual([]);
  });
});
