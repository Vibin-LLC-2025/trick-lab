import { describe, expect, it } from 'vitest';
import { createTrickStore } from '.';
import { buildExport, exportFilename } from './export';

/** Isolated store with a clock that advances 10 ms per read. */
function makeStore() {
  let t = 1000;
  return createTrickStore(() => (t += 10));
}

const types = (s: ReturnType<typeof makeStore>) => s.getState().events.map((e) => e.type);
const said = (s: ReturnType<typeof makeStore>) => s.getState().announcement.message;

describe('inputs', () => {
  it('starts at the brief defaults', () => {
    const s = makeStore().getState();
    expect([s.pop, s.flick, s.scoop]).toEqual([0.35, 0, 0]);
    expect(s.status).toBe('idle');
  });

  it('applies a preset, logs it and announces it', () => {
    const store = makeStore();
    store.getState().applyPreset('360-flip');
    const s = store.getState();
    expect([s.pop, s.flick, s.scoop]).toEqual([0.35, 1.9, 1.9]);
    expect(s.activePreset).toBe('360-flip');
    expect(s.events.at(-1)).toMatchObject({ type: 'preset.applied', payload: { preset: '360-flip', flick: 1.9 } });
    expect(said(store)).toBe(
      '360 flip preset applied: pop 0.35 meters, flick 1.9 revolutions per second, scoop 1.9 revolutions per second.',
    );
  });

  it('setInput snaps, logs input.changed and clears the active preset; no-ops are not logged', () => {
    const store = makeStore();
    store.getState().applyPreset('kickflip');
    store.getState().setInput('pop', 0.2000001);
    store.getState().setInput('pop', 0.2);
    const s = store.getState();
    expect(s.pop).toBe(0.2);
    expect(s.activePreset).toBeNull();
    expect(types(store)).toEqual(['preset.applied', 'input.changed']);
    expect(s.events[1]!.payload).toMatchObject({ input: 'pop', value: 0.2, valueText: '0.20 meters' });
  });
});

describe('pop and resolve', () => {
  it('pop starts playback; land resolves, logs and scores the objective', () => {
    const store = makeStore();
    store.getState().applyPreset('kickflip');
    store.getState().popTrick();
    let s = store.getState();
    expect(s.status).toBe('playing');
    expect(s.progress).toBe(0);
    expect(s.flight?.rollTotal).toBeCloseTo(365.4, 1);
    expect(s.result).toBeNull();
    expect(s.events.at(-1)).toMatchObject({ type: 'trick.popped', payload: { flick: 1.9, preset: 'kickflip' } });

    store.getState().land();
    s = store.getState();
    expect(s.status).toBe('done');
    expect(s.progress).toBe(1);
    expect(s.result).toMatchObject({ id: 'kickflip', landed: true });
    expect(s.completed).toEqual(['kickflip']);
    expect(types(store)).toEqual(['preset.applied', 'trick.popped', 'trick.resolved', 'objective.completed']);
    expect(s.events[2]!.payload).toMatchObject({ trick: 'kickflip', landed: true, rollTotal: 365.4, airtime: 0.534 });
    expect(said(store)).toBe(
      'Kickflip landed. 365 degrees of flip, 0 degrees of shove, 0.53 seconds in the air. ' +
        'Objective complete: Land a kickflip. 1 of 4 objectives done.',
    );
  });

  it('land is idempotent and a second landing of the same trick scores nothing new', () => {
    const store = makeStore();
    store.getState().applyPreset('kickflip');
    store.getState().popTrick();
    store.getState().land();
    store.getState().land();
    store.getState().popTrick();
    store.getState().land();
    expect(types(store).filter((t) => t === 'trick.resolved')).toHaveLength(2);
    expect(types(store).filter((t) => t === 'objective.completed')).toHaveLength(1);
  });

  it('a miss announces the failing axis and scores nothing', () => {
    const store = makeStore();
    store.getState().applyPreset('kickflip');
    store.getState().setInput('pop', 0.15);
    store.getState().popTrick();
    store.getState().land();
    expect(store.getState().result).toMatchObject({ landed: false, outcome: 'under-rotated', failedAxis: 'flip' });
    expect(store.getState().completed).toEqual([]);
    expect(said(store)).toMatch(/^Kickflip not landed: flip under-rotated by 121 degrees\./);
  });

  it('pop is refused while the board is in the air', () => {
    const store = makeStore();
    store.getState().popTrick();
    store.getState().popTrick();
    expect(types(store).filter((t) => t === 'trick.popped')).toHaveLength(1);
    expect(said(store)).toBe('The board is still in the air.');
  });

  it('under reduced motion pop resolves instantly at the final pose', () => {
    const store = makeStore();
    store.getState().setReducedMotion(true);
    store.getState().applyPreset('pop-shove-it');
    store.getState().popTrick();
    const s = store.getState();
    expect(s.status).toBe('done');
    expect(s.progress).toBe(1);
    expect(s.result?.id).toBe('pop-shove-it');
    expect(said(store)).toMatch(/^Popped with pop 0\.35 meters.*Pop shove-it landed\. 0 degrees of flip, 173 degrees of shove/);
  });

  it('all four presets complete all four objectives', () => {
    const store = makeStore();
    for (const id of ['kickflip', 'pop-shove-it', 'varial-flip', '360-flip'] as const) {
      store.getState().applyPreset(id);
      store.getState().popTrick();
      store.getState().land();
    }
    expect(store.getState().completed).toEqual(['kickflip', 'pop-shove-it', 'varial-flip', '360-flip']);
    expect(said(store)).toMatch(/4 of 4 objectives done\.$/);
  });
});

describe('playback controls', () => {
  it('syncProgress only applies while playing and is not logged', () => {
    const store = makeStore();
    store.getState().syncProgress(0.5);
    expect(store.getState().progress).toBe(0);
    store.getState().popTrick();
    store.getState().syncProgress(0.4);
    expect(store.getState().progress).toBe(0.4);
    expect(types(store)).toEqual(['trick.popped']);
  });

  it('pause and resume toggle status; slow motion toggles rate', () => {
    const store = makeStore();
    store.getState().popTrick();
    store.getState().togglePause();
    expect(store.getState().status).toBe('paused');
    store.getState().togglePause();
    expect(store.getState().status).toBe('playing');
    store.getState().toggleSlowMotion();
    expect(store.getState().rate).toBe(0.25);
    store.getState().toggleSlowMotion();
    expect(store.getState().rate).toBe(1);
  });

  it('scrubbing pauses a playing flight and logs one event per gesture', () => {
    const store = makeStore();
    store.getState().popTrick();
    store.getState().syncProgress(0.3);
    store.getState().scrub(0.31);
    store.getState().scrub(0.4);
    store.getState().scrub(0.55);
    expect(store.getState().status).toBe('paused');
    store.getState().commitScrub();
    store.getState().commitScrub();
    const scrubs = store.getState().events.filter((e) => e.type === 'playback.scrubbed');
    expect(scrubs).toHaveLength(1);
    expect(scrubs[0]!.payload).toEqual({ from: 30, to: 55 });
  });

  it('scrubbing a landed flight keeps it done; scrubbing with no flight does nothing', () => {
    const store = makeStore();
    store.getState().scrub(0.5);
    expect(store.getState().progress).toBe(0);
    store.getState().popTrick();
    store.getState().land();
    store.getState().scrub(0.25);
    expect(store.getState().status).toBe('done');
    expect(store.getState().progress).toBe(0.25);
  });
});

describe('event log and reset', () => {
  it('events carry ids and ms since session start', () => {
    const store = makeStore();
    store.getState().applyPreset('kickflip');
    store.getState().popTrick();
    const [a, b] = store.getState().events;
    expect(a!.id).toBe('e1');
    expect(b!.id).toBe('e2');
    expect(b!.t).toBeGreaterThan(a!.t);
  });

  it('reset clears inputs, pose and objectives, keeps the log and requests focus on the setup heading', () => {
    const store = makeStore();
    store.getState().applyPreset('varial-flip');
    store.getState().toggleSlowMotion();
    store.getState().popTrick();
    store.getState().land();
    const before = store.getState().events.length;
    store.getState().resetSession();
    const s = store.getState();
    expect([s.pop, s.flick, s.scoop]).toEqual([0.35, 0, 0]);
    expect(s.status).toBe('idle');
    expect(s.flight).toBeNull();
    expect(s.result).toBeNull();
    expect(s.rate).toBe(1);
    expect(s.completed).toEqual([]);
    expect(s.events).toHaveLength(before + 1);
    expect(s.events.at(-1)!.type).toBe('session.reset');
    expect(s.focusRequest).toMatchObject({ kind: 'setup-heading' });
    expect(said(store)).toMatch(/^Reset\./);
  });

  it('export contains every event, not just the panel window', () => {
    const store = makeStore();
    for (let i = 0; i < 260; i++) store.getState().setInput('flick', (i % 30) / 10 + 0.1);
    const out = buildExport(store.getState(), new Date('2026-11-04T12:00:00Z'));
    expect(out.events.length).toBe(store.getState().events.length);
    expect(out.events.length).toBeGreaterThan(200);
    expect(out.schema).toBe('trick-lab.events/1');
    expect(exportFilename(new Date('2026-11-04T12:00:00Z'))).toBe('trick-lab-events-2026-11-04.json');
  });
});

describe('board detail (ui slice)', () => {
  it('defaults to high, persists a change like the theme, announces it and logs nothing', () => {
    localStorage.clear();
    const store = makeStore();
    expect(store.getState().boardDetail).toBe('high');
    store.getState().setBoardDetail('low');
    expect(store.getState().boardDetail).toBe('low');
    expect(localStorage.getItem('trick-lab.board-detail')).toBe('low');
    expect(said(store)).toBe('Board detail low: simple board.');
    expect(store.getState().events).toEqual([]);
    store.getState().setBoardDetail('high');
    expect(localStorage.getItem('trick-lab.board-detail')).toBe('high');
    expect(said(store)).toBe('Board detail high: full model.');
  });

  it('starts from the saved choice', () => {
    localStorage.setItem('trick-lab.board-detail', 'low');
    expect(makeStore().getState().boardDetail).toBe('low');
    localStorage.setItem('trick-lab.board-detail', 'nonsense');
    expect(makeStore().getState().boardDetail).toBe('high');
    localStorage.clear();
  });

  it('survives a session reset (it is a view preference, not lab state)', () => {
    const store = makeStore();
    store.getState().setBoardDetail('low');
    store.getState().resetSession();
    expect(store.getState().boardDetail).toBe('low');
    localStorage.clear();
  });

  it('records a failed model load once, without logging', () => {
    const store = makeStore();
    store.getState().setBoardAssetFailed();
    store.getState().setBoardAssetFailed();
    expect(store.getState().boardAssetFailed).toBe(true);
    expect(said(store)).toBe('The board model did not load. Showing the simple board.');
    expect(store.getState().announcement.nonce).toBe(1);
    expect(store.getState().events).toEqual([]);
  });
});
