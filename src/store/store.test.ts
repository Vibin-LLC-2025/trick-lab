import { describe, expect, it, vi } from 'vitest';
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
      '360 flip preset applied: pop 0.35 meters, kickflip flick 1.9 revolutions per second, backside scoop 1.9 revolutions per second.',
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
    expect(s.events[2]!.payload).toMatchObject({ trick: 'kickflip', landed: true, grade: 'clean', rollTotal: 365.4, airtime: 0.534 });
    expect(said(store)).toBe(
      'Kickflip landed clean. 365 degrees of kickflip, 0 degrees of shove, 0.53 seconds in the air. ' +
        'Objective complete: Land a kickflip. 1 of 7 objectives done.',
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
    expect(said(store)).toMatch(/^Popped with pop 0\.35 meters.*Pop shove-it landed clean. 0 degrees of flip, 173 degrees of backside shove/);
  });

  it('all seven presets complete all seven objectives', () => {
    const store = makeStore();
    const ids = ['kickflip', 'heelflip', 'pop-shove-it', 'frontside-pop-shove-it', 'varial-flip', 'varial-heelflip', '360-flip'] as const;
    for (const id of ids) {
      store.getState().applyPreset(id);
      store.getState().popTrick();
      store.getState().land();
    }
    expect(store.getState().completed).toEqual([...ids]);
    expect(said(store)).toMatch(/7 of 7 objectives done\.$/);
  });

  it('a mirror preset applies signed inputs, logs them and announces the directions (ADR-30)', () => {
    const store = makeStore();
    store.getState().applyPreset('varial-heelflip');
    const s = store.getState();
    expect([s.pop, s.flick, s.scoop]).toEqual([0.35, -1.9, -0.9]);
    expect(s.events.at(-1)).toMatchObject({ type: 'preset.applied', payload: { preset: 'varial-heelflip', flick: -1.9, scoop: -0.9 } });
    expect(said(store)).toBe(
      'Varial heelflip preset applied: pop 0.35 meters, heelflip flick 1.9 revolutions per second, frontside scoop 0.9 revolutions per second.',
    );
    store.getState().popTrick();
    store.getState().land();
    expect(store.getState().result).toMatchObject({ id: 'varial-heelflip', landed: true, flips: -1, halfShoves: -1 });
    expect(store.getState().events.find((e) => e.type === 'trick.resolved')!.payload).toMatchObject({ rollTotal: -365.4, yawTotal: -173.1 });
    expect(said(store)).toBe(
      'Varial heelflip landed clean. 365 degrees of heelflip, 173 degrees of frontside shove, 0.53 seconds in the air. ' +
        'Objective complete: Land a varial heelflip. 1 of 7 objectives done.',
    );
  });

  it('setInput snaps negative values to the grid and never stores -0', () => {
    const store = makeStore();
    store.getState().setInput('flick', -1.94);
    expect(store.getState().flick).toBe(-1.9);
    expect(store.getState().events.at(-1)).toMatchObject({ payload: { input: 'flick', value: -1.9, valueText: '1.9 revolutions per second, heelflip' } });
    store.getState().setInput('scoop', -0.04);
    expect(Object.is(store.getState().scoop, 0)).toBe(true);
    store.getState().setInput('scoop', -9);
    expect(store.getState().scoop).toBe(-3);
  });
});

// ADR-57: a landed trick in the lab is the student's to celebrate; the store marks it, once per landing.
describe('the celebration (lab)', () => {
  it('marks each landed trick with a new nonce and its name, and never a bail; logs and announces nothing more', () => {
    const store = makeStore();
    expect(store.getState().celebration).toBeNull();
    store.getState().applyPreset('kickflip');
    store.getState().popTrick();
    expect(store.getState().celebration).toBeNull();
    store.getState().land();
    expect(store.getState().celebration).toEqual({ nonce: 1, trick: 'Kickflip', clean: true });
    expect(types(store)).toEqual(['preset.applied', 'trick.popped', 'trick.resolved', 'objective.completed']);
    store.getState().popTrick();
    store.getState().land();
    expect(store.getState().celebration).toEqual({ nonce: 2, trick: 'Kickflip', clean: true });
    // Too low a pop bails: no celebration.
    store.getState().setInput('pop', 0.15);
    store.getState().popTrick();
    store.getState().land();
    expect(store.getState().result?.landed).toBe(false);
    expect(store.getState().celebration?.nonce).toBe(2);
  });
});

// ADR-58: sound is off until turned on; the store asks for each sound when it happens.
describe('sound', () => {
  it('starts off, turns on and off, saved and announced, never logged', () => {
    localStorage.clear();
    const store = makeStore();
    expect(store.getState().soundOn).toBe(false);
    store.getState().toggleSound();
    expect(store.getState().soundOn).toBe(true);
    expect(localStorage.getItem('trick-lab.sound')).toBe('on');
    expect(store.getState().announcement.message).toBe('Sound on.');
    expect(makeStore().getState().soundOn).toBe(true);
    store.getState().toggleSound();
    expect(localStorage.getItem('trick-lab.sound')).toBe('off');
    expect(store.getState().announcement.message).toBe('Sound off.');
    expect(store.getState().events).toEqual([]);
    localStorage.clear();
  });

  it('asks for the pop when the board pops and the landing or the bail when it lands, whether or not sound is on', () => {
    const store = makeStore();
    const kinds: string[] = [];
    store.subscribe((s, prev) => {
      if (s.soundCue && s.soundCue !== prev.soundCue) kinds.push(s.soundCue.kind);
    });
    store.getState().applyPreset('kickflip');
    store.getState().popTrick();
    expect(kinds).toEqual(['pop']);
    store.getState().land();
    expect(kinds).toEqual(['pop', 'land']);
    store.getState().setInput('pop', 0.15);
    store.getState().popTrick();
    store.getState().land();
    expect(kinds).toEqual(['pop', 'land', 'pop', 'bail']);
    expect(store.getState().soundCue?.nonce).toBe(4);
    // A refused pop (still in the air) asks for nothing.
    store.getState().setInput('pop', 0.35);
    store.getState().popTrick();
    store.getState().popTrick();
    expect(kinds).toEqual(['pop', 'land', 'pop', 'bail', 'pop']);
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

  it('speed snaps to a stop, applies mid-flight, and s returns to the last slow speed', () => {
    const store = makeStore();
    store.getState().popTrick();
    store.getState().setRate(0.11);
    expect(store.getState().rate).toBe(0.1);
    expect(store.getState().status).toBe('playing');
    store.getState().setRate(1.5);
    expect(store.getState().rate).toBe(1.5);
    expect(store.getState().slowRate).toBe(0.1);
    store.getState().toggleSlowMotion();
    expect(store.getState().rate).toBe(0.1);
    expect(said(store)).toBe('Slow motion on, 0.1 times speed.');
    store.getState().toggleSlowMotion();
    expect(store.getState().rate).toBe(1);
    expect(said(store)).toBe('Slow motion off, normal speed.');
    expect(types(store)).toEqual(['trick.popped']);
  });

  it('stepRate moves one stop, announces it, and stops at the ends', () => {
    const store = makeStore();
    store.getState().stepRate(-1);
    expect(store.getState().rate).toBe(0.75);
    expect(said(store)).toBe('0.75 times speed.');
    for (let i = 0; i < 20; i++) store.getState().stepRate(-1);
    expect(store.getState().rate).toBe(0.05);
    expect(said(store)).toBe('Already the slowest, 0.05 times speed.');
    for (let i = 0; i < 20; i++) store.getState().stepRate(1);
    expect(store.getState().rate).toBe(2);
    expect(said(store)).toBe('Already the fastest, 2 times speed.');
    store.getState().setRate(1);
    store.getState().stepRate(1);
    expect(said(store)).toBe('1.25 times speed.');
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
    expect(out.schema).toBe('trick-lab.events/2');
    expect(exportFilename(new Date('2026-11-04T12:00:00Z'))).toBe('trick-lab-events-2026-11-04.json');
  });
});

describe('quality and feet (ui slice)', () => {
  it('auto-picks a tier when nothing is saved (medium in jsdom, which has no WebGL and no device hints)', () => {
    localStorage.clear();
    const s = makeStore().getState();
    expect(s.quality).toBe('medium');
    expect(s.qualityAuto).toBe(true);
    expect(s.feetVisible).toBe(true);
  });

  it('persists a chosen tier like the theme, announces it and logs nothing', () => {
    localStorage.clear();
    const store = makeStore();
    store.getState().setQuality('low');
    expect(store.getState().quality).toBe('low');
    expect(store.getState().qualityAuto).toBe(false);
    expect(localStorage.getItem('trick-lab.quality')).toBe('low');
    expect(said(store)).toBe('Quality low: simple board. Fastest.');
    expect(store.getState().events).toEqual([]);
    store.getState().setQuality('high');
    expect(localStorage.getItem('trick-lab.quality')).toBe('high');
    expect(said(store)).toBe('Quality high: detailed board, shoes and shadows.');
    store.getState().setQuality('medium');
    expect(said(store)).toBe('Quality medium: detailed board, no shadows.');
  });

  it('confirming the auto-picked tier makes it a saved choice', () => {
    localStorage.clear();
    const store = makeStore();
    store.getState().setQuality('medium');
    expect(store.getState().qualityAuto).toBe(false);
    expect(localStorage.getItem('trick-lab.quality')).toBe('medium');
  });

  it('starts from the saved choice, or a legacy Low board detail, and ignores nonsense', () => {
    localStorage.setItem('trick-lab.quality', 'low');
    expect(makeStore().getState()).toMatchObject({ quality: 'low', qualityAuto: false });
    localStorage.setItem('trick-lab.quality', 'nonsense');
    expect(makeStore().getState().qualityAuto).toBe(true);
    localStorage.clear();
    localStorage.setItem('trick-lab.board-detail', 'low');
    expect(makeStore().getState()).toMatchObject({ quality: 'low', qualityAuto: false });
    localStorage.clear();
    localStorage.setItem('trick-lab.board-detail', 'high');
    expect(makeStore().getState().qualityAuto).toBe(true);
    localStorage.clear();
  });

  it('toggles the feet, persists and announces it, without logging', () => {
    localStorage.clear();
    const store = makeStore();
    store.getState().toggleFeet();
    expect(store.getState().feetVisible).toBe(false);
    expect(localStorage.getItem('trick-lab.feet')).toBe('off');
    expect(said(store)).toBe('Feet hidden.');
    store.getState().toggleFeet();
    expect(store.getState().feetVisible).toBe(true);
    expect(said(store)).toBe('Feet shown.');
    expect(store.getState().events).toEqual([]);
    localStorage.setItem('trick-lab.feet', 'off');
    expect(makeStore().getState().feetVisible).toBe(false);
    localStorage.clear();
  });

  it('shows the legs by default on High and Medium, hides them on Low; switching persists and announces it, without logging (ADR-37, ADR-70)', () => {
    localStorage.clear();
    for (const [quality, shown] of [['high', true], ['medium', true], ['low', false]] as const) {
      localStorage.setItem('trick-lab.quality', quality);
      expect(makeStore().getState().legsVisible, quality).toBe(shown);
    }
    localStorage.setItem('trick-lab.quality', 'high');
    const store = makeStore();
    store.getState().toggleLegs();
    expect(store.getState().legsVisible).toBe(false);
    expect(localStorage.getItem('trick-lab.legs')).toBe('off');
    expect(said(store)).toBe('Legs hidden.');
    store.getState().toggleLegs();
    expect(store.getState().legsVisible).toBe(true);
    expect(localStorage.getItem('trick-lab.legs')).toBe('on');
    expect(said(store)).toBe('Legs shown.');
    expect(store.getState().events).toEqual([]);
    // A saved choice wins on every level.
    localStorage.setItem('trick-lab.quality', 'low');
    expect(makeStore().getState().legsVisible).toBe(true);
    localStorage.setItem('trick-lab.legs', 'off');
    localStorage.setItem('trick-lab.quality', 'high');
    expect(makeStore().getState().legsVisible).toBe(false);
    // Anything else is no choice.
    localStorage.setItem('trick-lab.legs', 'nonsense');
    expect(makeStore().getState().legsVisible).toBe(true);
    localStorage.clear();
  });

  it('moves legs nobody chose with the quality level, by hand or by the step-down, and leaves a chosen setting alone (ADR-70)', () => {
    localStorage.clear();
    localStorage.setItem('trick-lab.quality', 'medium');
    const store = makeStore();
    expect(store.getState().legsVisible).toBe(true);
    store.getState().setQuality('low');
    expect(store.getState().legsVisible).toBe(false);
    store.getState().setQuality('high');
    expect(store.getState().legsVisible).toBe(true);
    // Chosen: it stays whatever the level.
    store.getState().toggleLegs();
    store.getState().setQuality('medium');
    expect(store.getState().legsVisible).toBe(false);
    store.getState().toggleLegs();
    store.getState().setQuality('low');
    expect(store.getState().legsVisible).toBe(true);
    expect(store.getState().events).toEqual([]);
    localStorage.clear();
  });

  it('turns motion blur on by default; the switch persists and announces it, without logging (ADR-51)', () => {
    localStorage.clear();
    const store = makeStore();
    expect(store.getState().motionBlur).toBe(true);
    store.getState().toggleMotionBlur();
    expect(store.getState().motionBlur).toBe(false);
    expect(localStorage.getItem('trick-lab.motion-blur')).toBe('off');
    expect(said(store)).toBe('Motion blur off.');
    store.getState().toggleMotionBlur();
    expect(store.getState().motionBlur).toBe(true);
    expect(localStorage.getItem('trick-lab.motion-blur')).toBe('on');
    expect(said(store)).toBe('Motion blur on.');
    expect(store.getState().events).toEqual([]);
    localStorage.setItem('trick-lab.motion-blur', 'off');
    expect(makeStore().getState().motionBlur).toBe(false);
    localStorage.setItem('trick-lab.motion-blur', 'nonsense');
    expect(makeStore().getState().motionBlur).toBe(true);
    localStorage.clear();
  });

  it('hides the foot trails by default; showing them persists and announces it, without logging', () => {
    localStorage.clear();
    const store = makeStore();
    expect(store.getState().footPathsVisible).toBe(false);
    store.getState().toggleFootPaths();
    expect(store.getState().footPathsVisible).toBe(true);
    expect(localStorage.getItem('trick-lab.foot-trails')).toBe('on');
    expect(said(store)).toBe('Foot trails shown.');
    store.getState().toggleFootPaths();
    expect(store.getState().footPathsVisible).toBe(false);
    expect(localStorage.getItem('trick-lab.foot-trails')).toBe('off');
    expect(said(store)).toBe('Foot trails hidden.');
    expect(store.getState().events).toEqual([]);
    localStorage.clear();
  });

  it('shows the motion cues by default; hiding them persists and announces it, without logging', () => {
    localStorage.clear();
    const store = makeStore();
    expect(store.getState().motionCuesVisible).toBe(true);
    store.getState().toggleMotionCues();
    expect(store.getState().motionCuesVisible).toBe(false);
    expect(localStorage.getItem('trick-lab.motion-cues')).toBe('off');
    expect(said(store)).toBe('Motion cues hidden.');
    store.getState().toggleMotionCues();
    expect(store.getState().motionCuesVisible).toBe(true);
    expect(localStorage.getItem('trick-lab.motion-cues')).toBe('on');
    expect(said(store)).toBe('Motion cues shown.');
    expect(store.getState().events).toEqual([]);
    expect(makeStore().getState().motionCuesVisible).toBe(true);
    localStorage.setItem('trick-lab.motion-cues', 'off');
    expect(makeStore().getState().motionCuesVisible).toBe(false);
    localStorage.clear();
  });

  it('keeps saved foot trails on across a reload, and ignores the old key and nonsense', () => {
    localStorage.clear();
    makeStore().getState().toggleFootPaths();
    expect(makeStore().getState().footPathsVisible).toBe(true);
    localStorage.setItem('trick-lab.foot-trails', 'nonsense');
    expect(makeStore().getState().footPathsVisible).toBe(false);
    localStorage.clear();
    localStorage.setItem('trick-lab.foot-paths', 'on');
    expect(makeStore().getState().footPathsVisible).toBe(false);
    localStorage.clear();
  });

  it('survives a session reset (view preferences, not lab state)', () => {
    const store = makeStore();
    store.getState().setQuality('low');
    store.getState().toggleFeet();
    store.getState().toggleLegs();
    store.getState().resetSession();
    expect(store.getState().quality).toBe('low');
    expect(store.getState().feetVisible).toBe(false);
    expect(store.getState().legsVisible).toBe(true);
    localStorage.clear();
  });

  it('starts goofy; switching stance persists, announces, logs nothing and no-ops when unchanged (ADR-25)', () => {
    localStorage.clear();
    const store = makeStore();
    expect(store.getState().stance).toBe('goofy');
    store.getState().setStance('goofy');
    expect(store.getState().announcement.nonce).toBe(0);
    expect(localStorage.getItem('trick-lab.stance')).toBeNull();
    store.getState().setStance('regular');
    expect(store.getState().stance).toBe('regular');
    expect(localStorage.getItem('trick-lab.stance')).toBe('regular');
    expect(said(store)).toBe('Regular stance: left foot forward, nose on the left.');
    store.getState().setStance('goofy');
    expect(localStorage.getItem('trick-lab.stance')).toBe('goofy');
    expect(said(store)).toBe('Goofy stance: right foot forward, nose on the right.');
    expect(store.getState().events).toEqual([]);
    localStorage.clear();
  });

  it('keeps a saved stance across a fresh store and a session reset, out of the export, and ignores nonsense', () => {
    localStorage.clear();
    const store = makeStore();
    store.getState().setStance('regular');
    expect(makeStore().getState().stance).toBe('regular');
    store.getState().resetSession();
    expect(store.getState().stance).toBe('regular');
    expect(JSON.stringify(buildExport(store.getState(), new Date('2026-11-04T12:00:00Z')))).not.toContain('regular');
    expect(types(store)).toEqual(['session.reset']);
    localStorage.setItem('trick-lab.stance', 'mongo');
    expect(makeStore().getState().stance).toBe('goofy');
    localStorage.clear();
  });

  it('starts goofy when storage is blocked, and still switches for the session', () => {
    // jsdom storage cannot be blocked for real, so make it throw the way a managed Chromebook's does.
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      const store = makeStore();
      expect(store.getState().stance).toBe('goofy');
      store.getState().setStance('regular');
      expect(store.getState().stance).toBe('regular');
    } finally {
      get.mockRestore();
      setSpy.mockRestore();
    }
  });

  it('starts in the rider view; switching the camera preset persists, announces, logs nothing and no-ops when unchanged (ADR-38)', () => {
    localStorage.clear();
    const store = makeStore();
    expect(store.getState().cameraView).toBe('rider');
    store.getState().setCameraView('rider');
    expect(store.getState().announcement.nonce).toBe(0);
    expect(localStorage.getItem('trick-lab.camera-view')).toBeNull();
    store.getState().setCameraView('detail');
    expect(store.getState().cameraView).toBe('detail');
    expect(localStorage.getItem('trick-lab.camera-view')).toBe('detail');
    expect(said(store)).toBe('Detail view: low three-quarter view from the heel side.');
    // Reset view keeps the preset: SceneCamera returns to it (cameraPlacement.test.ts).
    store.getState().resetView();
    expect(store.getState().cameraView).toBe('detail');
    store.getState().setCameraView('rider');
    expect(localStorage.getItem('trick-lab.camera-view')).toBe('rider');
    expect(said(store)).toBe("Rider's view: looking down from above the heels.");
    expect(store.getState().events).toEqual([]);
    localStorage.clear();
  });

  it('keeps a saved camera preset across a fresh store and a session reset, out of the export, and ignores nonsense', () => {
    localStorage.clear();
    const store = makeStore();
    store.getState().setCameraView('detail');
    expect(makeStore().getState().cameraView).toBe('detail');
    store.getState().resetSession();
    expect(store.getState().cameraView).toBe('detail');
    const exported = JSON.stringify(buildExport(store.getState(), new Date('2026-11-05T12:00:00Z')));
    expect(exported).not.toContain('cameraView');
    expect(exported).not.toContain('detail');
    expect(types(store)).toEqual(['session.reset']);
    localStorage.setItem('trick-lab.camera-view', 'drone');
    expect(makeStore().getState().cameraView).toBe('rider');
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

describe('live playhead (audit fix, 2026-11-04)', () => {
  /** What FlightDriver does every frame: advance the playhead without telling the store. */
  const drive = (store: ReturnType<typeof makeStore>, progress: number) => {
    store.playhead.progress = progress;
  };

  it('each store has its own playhead, owned by no flight until the first pop', () => {
    const a = makeStore();
    const b = makeStore();
    expect(a.playhead).not.toBe(b.playhead);
    expect(a.playhead).toEqual({ flightId: -1, progress: 0 });
    a.getState().popTrick();
    b.getState().popTrick();
    // Same flightId in both stores, still separate cursors.
    expect(a.getState().flightId).toBe(b.getState().flightId);
    drive(a, 0.6);
    b.getState().togglePause();
    expect(b.getState().progress).toBe(0);
    a.getState().togglePause();
    expect(a.getState().progress).toBe(0.6);
  });

  it('pause freezes where the board is, before the first 100 ms commit reached the store', () => {
    const store = makeStore();
    store.getState().popTrick();
    expect(store.playhead).toEqual({ flightId: store.getState().flightId, progress: 0 });
    drive(store, 0.07);
    expect(store.getState().progress).toBe(0);
    store.getState().togglePause();
    expect(store.getState().status).toBe('paused');
    expect(store.getState().progress).toBe(0.07);
    // Resume carries on from the same place; nothing went backwards.
    store.getState().togglePause();
    expect(store.getState().status).toBe('playing');
    expect(store.playhead.progress).toBe(0.07);
  });

  it('pause after a 10 Hz commit still uses the newer live value', () => {
    const store = makeStore();
    store.getState().popTrick();
    store.getState().syncProgress(0.3);
    expect(store.playhead.progress).toBe(0.3);
    drive(store, 0.36);
    store.getState().togglePause();
    expect(store.getState().progress).toBe(0.36);
  });

  it('a scrub starts from the live playhead and the explicit destination wins', () => {
    const store = makeStore();
    store.getState().popTrick();
    store.getState().syncProgress(0.2);
    drive(store, 0.34);
    store.getState().scrub(0.55);
    expect(store.getState().status).toBe('paused');
    expect(store.getState().progress).toBe(0.55);
    expect(store.playhead.progress).toBe(0.55);
    store.getState().scrub(0.6);
    store.getState().commitScrub();
    const scrubs = store.getState().events.filter((e) => e.type === 'playback.scrubbed');
    expect(scrubs.map((e) => e.payload)).toEqual([{ from: 34, to: 60 }]);
    // A second gesture on the paused flight starts where the first ended.
    store.getState().scrub(0.1);
    store.getState().commitScrub();
    expect(store.getState().events.at(-1)!.payload).toEqual({ from: 60, to: 10 });
  });

  it('a new pop and a reset ignore a stale playhead', () => {
    const store = makeStore();
    store.getState().popTrick();
    drive(store, 0.7);
    store.getState().land();
    expect(store.playhead.progress).toBe(1);
    // Second pop, no frame yet: pause is at the start, not at the old flight's place.
    store.getState().popTrick();
    expect(store.playhead).toEqual({ flightId: store.getState().flightId, progress: 0 });
    store.getState().togglePause();
    expect(store.getState().progress).toBe(0);

    store.getState().resetSession();
    expect(store.playhead).toEqual({ flightId: -1, progress: 0 });
    store.getState().popTrick();
    store.getState().togglePause();
    expect(store.getState().progress).toBe(0);
  });

  it('a playhead left on another flight is never read', () => {
    const store = makeStore();
    store.getState().popTrick();
    store.getState().syncProgress(0.25);
    store.playhead.flightId = store.getState().flightId - 1;
    store.playhead.progress = 0.9;
    store.getState().togglePause();
    expect(store.getState().progress).toBe(0.25);
  });
});

describe('motion turned off mid-flight (ADR-6)', () => {
  it('reduced motion while playing resolves once through the landing, with one announcement', () => {
    const store = makeStore();
    store.getState().applyPreset('kickflip');
    store.getState().popTrick();
    store.getState().setReducedMotion(true);
    const s = store.getState();
    expect(s.status).toBe('done');
    expect(s.progress).toBe(1);
    expect(s.result?.id).toBe('kickflip');
    expect(said(store)).toBe(
      'Reduced motion on: the board goes straight to its landing. Kickflip landed clean. 365 degrees of kickflip, 0 degrees of shove, 0.53 seconds in the air. ' +
        'Objective complete: Land a kickflip. 1 of 7 objectives done.',
    );
    const nonce = s.announcement.nonce;
    // Repeating the preference, or the driver's late land(), resolves nothing again.
    store.getState().setReducedMotion(true);
    store.getState().land();
    expect(store.getState().announcement.nonce).toBe(nonce);
    expect(types(store)).toEqual(['preset.applied', 'trick.popped', 'trick.resolved', 'objective.completed']);
  });

  it('reduced motion while paused resolves too; an idle store is left alone', () => {
    const store = makeStore();
    store.getState().popTrick();
    store.getState().togglePause();
    store.getState().setReducedMotion(true);
    expect(store.getState().status).toBe('done');
    expect(types(store).filter((t) => t === 'trick.resolved')).toHaveLength(1);
    // Turning it off never starts anything.
    store.getState().setReducedMotion(false);
    expect(store.getState().status).toBe('done');

    const idle = makeStore();
    idle.getState().setReducedMotion(true);
    expect(idle.getState().status).toBe('idle');
    expect(idle.getState().announcement.nonce).toBe(0);
  });

  it('a reduced-motion pop keeps its single combined announcement', () => {
    const store = makeStore();
    store.getState().setReducedMotion(true);
    store.getState().popTrick();
    expect(said(store)).toMatch(/^Popped with pop 0\.35 meters.*Ollie landed clean./);
    expect(store.getState().announcement.nonce).toBe(1);
  });

  it('Resume never plays while the animation is unavailable; it resolves instead', () => {
    for (const off of ['reduced', 'scene'] as const) {
      const store = makeStore();
      store.getState().popTrick();
      store.getState().togglePause();
      // Set the flag without its action, to reach a paused flight that cannot animate.
      store.setState(off === 'reduced' ? { reducedMotion: true } : { sceneUnavailable: true });
      store.getState().togglePause();
      expect(store.getState().status).toBe('done');
      expect(types(store).filter((t) => t === 'trick.resolved')).toHaveLength(1);
    }
  });
});

describe('scene unavailable (SceneBoundary)', () => {
  it('announces once without logging when nothing is in the air', () => {
    const store = makeStore();
    store.getState().setSceneUnavailable();
    store.getState().setSceneUnavailable();
    expect(store.getState().sceneUnavailable).toBe(true);
    expect(said(store)).toBe('The 3D view stopped working. Tricks now resolve at once; the timeline, readouts and results still work.');
    expect(store.getState().announcement.nonce).toBe(1);
    expect(store.getState().events).toEqual([]);
  });

  it('mid-flight it resolves the trick once, in the same announcement as the failure', () => {
    const store = makeStore();
    store.getState().applyPreset('pop-shove-it');
    store.getState().popTrick();
    store.getState().setSceneUnavailable();
    expect(store.getState().status).toBe('done');
    expect(said(store)).toMatch(/^The 3D view stopped working\. .* Pop shove-it landed clean. .*Objective complete: Land a pop shove-it\./);
    store.getState().setSceneUnavailable();
    store.getState().land();
    expect(types(store).filter((t) => t === 'trick.resolved')).toHaveLength(1);
  });

  it('later pops resolve at once and score once; reset keeps the flag (the view is still gone)', () => {
    const store = makeStore();
    store.getState().setSceneUnavailable();
    store.getState().applyPreset('kickflip');
    store.getState().popTrick();
    expect(store.getState().status).toBe('done');
    expect(store.getState().completed).toEqual(['kickflip']);
    expect(said(store)).toMatch(/^Popped with .*Kickflip landed clean..*1 of 7 objectives done\.$/);
    store.getState().scrub(0.4);
    expect(store.getState().progress).toBe(0.4);
    store.getState().resetSession();
    expect(store.getState().sceneUnavailable).toBe(true);
    store.getState().popTrick();
    expect(store.getState().status).toBe('done');
    expect(types(store).filter((t) => t === 'trick.resolved')).toHaveLength(2);
  });
});
