import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useTrickStore } from '../store';
import { App } from './App';
import { KEY_SCRUB_SETTLE_MS } from './Playback';

// WebGL does not exist in jsdom. Everything else below is the real app and the real store.
vi.mock('../scene/TrickScene', () => ({ default: () => <div data-testid="scene-stub" /> }));

const announcer = () => document.getElementById('announcer')!;
const description = () => document.getElementById('scene-description')!;
const timeline = () => screen.getByLabelText(/^Timeline/) as HTMLInputElement;
const presetButton = (name: string) => screen.getByRole('button', { name });

/** Stands in for FlightDriver, which is inside the stubbed canvas: the board reached progress 1. */
const landNow = () => act(() => useTrickStore.getState().land());

function mockReducedMotion(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: matches && query.includes('reduce'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
}

async function setup() {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByTestId('scene-stub');
  return user;
}

beforeEach(() => {
  useTrickStore.setState(useTrickStore.getInitialState(), true);
  document.documentElement.dataset.theme = 'dark';
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('trick lab UI', () => {
  it('renders the canvas stub behind a text description', async () => {
    await setup();
    expect(screen.getByRole('region', { name: '3D skateboard view' })).toHaveAttribute(
      'aria-describedby',
      'scene-description',
    );
    expect(description()).toHaveTextContent('Skateboard resting flat on a concrete pad, grip side up.');
    expect(description()).toHaveTextContent('Flick rolls the grip toward the heel side');
    expect(description()).toHaveTextContent('clockwise seen from above');
    expect(description()).toHaveTextContent('pop 0.35 meters, flick 0 revolutions per second');
  });

  it('sliders are labelled native ranges with spoken units', async () => {
    await setup();
    const pop = screen.getByRole('slider', { name: /^Pop/ });
    expect(pop).toHaveAttribute('aria-valuetext', '0.35 meters');
    fireEvent.change(pop, { target: { value: '0.2' } });
    expect(pop).toHaveAttribute('aria-valuetext', '0.20 meters');
    const flick = screen.getByRole('slider', { name: /^Flick/ });
    fireEvent.change(flick, { target: { value: '1.9' } });
    expect(flick).toHaveAttribute('aria-valuetext', '1.9 revolutions per second, kickflip');
    expect(useTrickStore.getState().events.map((e) => e.type)).toEqual(['input.changed', 'input.changed']);
  });

  it('centres the signed rate sliders on 0 and names the direction with the value (ADR-30)', async () => {
    await setup();
    const flick = screen.getByRole('slider', { name: /^Flick/ });
    const scoop = screen.getByRole('slider', { name: /^Scoop/ });
    for (const s of [flick, scoop]) {
      expect(s).toHaveAttribute('min', '-3');
      expect(s).toHaveAttribute('max', '3');
      expect(s).toHaveAttribute('step', '0.1');
      expect(s).toHaveValue('0');
    }
    expect(flick).toHaveAccessibleName(/right for a kickflip, left for a heelflip/);
    expect(scoop).toHaveAccessibleName(/right for backside, left for frontside/);
    const readout = (s: HTMLElement) => s.closest('.field')!.querySelector('.field__value')!;
    expect(readout(flick)).toHaveTextContent(/^0\.0rev\/s$/);
    fireEvent.change(flick, { target: { value: '-1.9' } });
    expect(flick).toHaveAttribute('aria-valuetext', '1.9 revolutions per second, heelflip');
    expect(readout(flick)).toHaveTextContent(/^1\.9rev\/s heelflip$/);
    fireEvent.change(scoop, { target: { value: '-0.9' } });
    expect(scoop).toHaveAttribute('aria-valuetext', '0.9 revolutions per second, frontside');
    expect(readout(scoop).querySelector('.field__unit')).toHaveTextContent('rev/s frontside');
    fireEvent.change(scoop, { target: { value: '0.9' } });
    expect(readout(scoop).querySelector('.field__unit')).toHaveTextContent('rev/s backside');
    expect(useTrickStore.getState().scoop).toBe(0.9);
  });

  it('keys 1 to 7 apply the seven presets in order; the objectives start at 0 of 7', async () => {
    const user = await setup();
    expect(screen.getByRole('heading', { name: 'Objectives 0 of 7' })).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Trick presets' })).getAllByRole('button')).toHaveLength(7);
    const labels = ['Kickflip', 'Heelflip', 'Pop shove-it', 'Frontside shove-it', 'Varial flip', 'Varial heelflip', '360 flip'];
    for (const [i, label] of labels.entries()) {
      await user.keyboard(String(i + 1));
      expect(presetButton(label)).toHaveAttribute('aria-pressed', 'true');
      expect(presetButton(label)).toHaveAttribute('aria-keyshortcuts', String(i + 1));
      expect(announcer()).toHaveTextContent(`${label} preset applied`);
    }
    // 8 was the 360 flip until ADR-41 (2026-11-05) removed the hardflip; it is no shortcut now.
    await user.keyboard('8');
    expect(presetButton('360 flip')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('slider', { name: /^Scoop/ })).toHaveValue('1.9');
    await user.keyboard('2');
    expect(screen.getByRole('slider', { name: /^Flick/ })).toHaveValue('-1.9');
    expect(screen.getByRole('slider', { name: /^Scoop/ })).toHaveValue('0');
  });

  it('a heelflip reads its direction in the outcome strip and the card', async () => {
    const user = await setup();
    await user.keyboard('6');
    await user.click(screen.getByRole('button', { name: 'Pop' }));
    landNow();
    const outcome = screen.getByRole('region', { name: 'Outcome' });
    expect(within(outcome).getByText('Varial heelflip landed')).toHaveClass('outcome__name');
    expect(within(outcome).getByText('365 deg heelflip, 173 deg frontside shove, 0.53 s in the air.')).toBeInTheDocument();
    const values = [...outcome.querySelectorAll('.telemetry__v')].map((v) => v.textContent);
    // The fifth row (ADR-36, 2026-11-05): the board's spin rate in the air, between the ramp-up and the catch.
    expect(values).toEqual(['0.53 s', '0.35 m', '365° heelflip', '173° frontside', '3.2 rev/s flip, 1.4 rev/s shove in the air']);
    expect(within(outcome).getByText('frontside')).toHaveClass('telemetry__dir');
    expect(screen.getByRole('heading', { name: 'Objectives 1 of 7' })).toBeInTheDocument();
  });

  it('key 1 applies the kickflip preset, Space pops, and landing scores the objective', async () => {
    const user = await setup();
    await user.keyboard('1');
    expect(presetButton('Kickflip')).toHaveAttribute('aria-pressed', 'true');
    expect(presetButton('Kickflip')).toHaveClass('preset--active');
    expect(screen.getByRole('slider', { name: /^Flick/ })).toHaveValue('1.9');
    expect(announcer()).toHaveTextContent('Kickflip preset applied');

    await user.keyboard(' ');
    expect(useTrickStore.getState().status).toBe('playing');
    expect(announcer()).toHaveTextContent('Popped with pop 0.35 meters, kickflip flick 1.9 revolutions per second');
    expect(screen.getByText('In the air')).toBeInTheDocument();
    // The air spin reads the flight from the pop (ADR-36); the totals wait for the landing.
    expect(screen.getByText('Air spin').closest('.telemetry__row')).toHaveTextContent(/^Air spin3\.2 rev\/s flip in the air$/);
    expect(timeline()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Pop' })).toHaveAttribute('aria-disabled', 'true');

    landNow();
    expect(announcer()).toHaveTextContent(
      'Kickflip landed. 365 degrees of kickflip, 0 degrees of shove, 0.53 seconds in the air. Objective complete: Land a kickflip. 1 of 7 objectives done.',
    );
    expect(screen.getByText('Kickflip landed')).toBeInTheDocument();
    expect(screen.getByText('365 deg kickflip, 0 deg shove, 0.53 s in the air.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Objectives 1 of 7' })).toBeInTheDocument();
    expect(document.querySelectorAll('.objective--done')).toHaveLength(1);
    // The outcome headline names the trick; the strip below gives the numbers and marks no axis.
    const outcome = screen.getByRole('region', { name: 'Outcome' });
    expect(within(outcome).getByText('Kickflip landed')).toHaveClass('outcome__name');
    expect(within(outcome).getByText('365°', { exact: false }).closest('.telemetry__v')).toHaveTextContent('365° kickflip');
    expect(within(outcome).getByText('0.53 s')).toBeInTheDocument();
    expect(outcome.querySelector('.telemetry__v--bad')).toBeNull();
  });

  it('clicking a preset keeps focus on it; resolving a trick does not move focus', async () => {
    const user = await setup();
    await user.click(presetButton('Varial flip'));
    expect(presetButton('Varial flip')).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Pop' }));
    landNow();
    expect(screen.getByRole('button', { name: 'Pop' })).toHaveFocus();
    expect(announcer()).toHaveTextContent('Varial flip landed.');
  });

  it('a low pop is not landed and says which axis and by how much', async () => {
    const user = await setup();
    await user.keyboard('7');
    fireEvent.change(screen.getByRole('slider', { name: /^Pop/ }), { target: { value: '0.15' } });
    await user.click(screen.getByRole('button', { name: 'Pop' }));
    landNow();
    expect(announcer()).toHaveTextContent(/not landed: flip under-rotated by 121 degrees/);
    expect(document.querySelector('.outcome--bailed')).not.toBeNull();
    // The axis that missed is marked in the strip, in text as well as style.
    const missed = document.querySelectorAll('.telemetry__v--bad');
    expect(missed).toHaveLength(1);
    expect(missed[0]).toHaveTextContent(/^239° kickflip, off target$/);
    expect(missed[0]!.closest('.telemetry__row')).toHaveTextContent(/^Flip/);
    expect(document.querySelectorAll('.objective--done')).toHaveLength(0);
  });

  it('Space keeps its native meaning on sliders and buttons', async () => {
    const user = await setup();
    screen.getByRole('slider', { name: /^Scoop/ }).focus();
    await user.keyboard(' ');
    expect(useTrickStore.getState().status).toBe('idle');

    // Space on the speed slider does not pop either.
    screen.getByRole('slider', { name: /^Speed/ }).focus();
    await user.keyboard(' ');
    expect(useTrickStore.getState().status).toBe('idle');
  });

  it('the speed slider moves by stops with the keyboard and stays live while the board is in the air', async () => {
    const user = await setup();
    const speed = screen.getByRole('slider', { name: /^Speed/ });
    expect(speed).toHaveAttribute('aria-valuetext', 'normal speed');
    await user.click(screen.getByRole('button', { name: 'Pop' }));
    expect(useTrickStore.getState().status).toBe('playing');
    expect(speed).toBeEnabled();
    // jsdom has no native range keys; fire what the browser fires (one stop per arrow, Home, End).
    expect(speed).toHaveAttribute('max', '13');
    expect(speed).toHaveValue('10');
    fireEvent.change(speed, { target: { value: '8' } });
    expect(useTrickStore.getState().rate).toBe(0.6);
    expect(speed).toHaveAttribute('aria-valuetext', '0.6 times speed');
    expect(screen.getByText('0.6x')).toBeInTheDocument();
    fireEvent.change(speed, { target: { value: '0' } });
    expect(useTrickStore.getState().rate).toBe(0.05);
    fireEvent.change(speed, { target: { value: '13' } });
    expect(useTrickStore.getState().rate).toBe(2);
    expect(useTrickStore.getState().status).toBe('playing');
    expect(useTrickStore.getState().events.map((e) => e.type)).toEqual(['trick.popped']);
  });

  it('s toggles slow motion, [ and ] step the speed, p the perf badge, t the theme', async () => {
    const user = await setup();
    await user.keyboard('s');
    expect(useTrickStore.getState().rate).toBe(0.25);
    expect(screen.getByRole('slider', { name: /^Speed/ })).toHaveAttribute('aria-valuetext', '0.25 times speed');
    await user.keyboard('[['); // user-event: a doubled bracket types one
    expect(useTrickStore.getState().rate).toBe(0.2);
    expect(announcer()).toHaveTextContent('0.2 times speed.');
    await user.keyboard(']]');
    expect(useTrickStore.getState().rate).toBe(0.3);

    const badge = document.querySelector('.perf-badge')!;
    expect(badge).toHaveAttribute('hidden');
    await user.keyboard('p');
    expect(badge).not.toHaveAttribute('hidden');

    await user.keyboard('t');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('trick-lab.theme')).toBe('light');
  });

  it('r resets inputs, keeps the log and moves focus to the setup heading', async () => {
    const user = await setup();
    await user.keyboard('3');
    await user.keyboard('r');
    expect(screen.getByRole('heading', { name: 'Setup' })).toHaveFocus();
    expect(screen.getByRole('slider', { name: /^Flick/ })).toHaveValue('0');
    expect(announcer()).toHaveTextContent(/^Reset\./);
    const log = screen.getByRole('region', { name: 'Event log entries' });
    expect(within(log).getByText('preset.applied')).toBeInTheDocument();
    expect(within(log).getByText('session.reset')).toBeInTheDocument();
  });

  it('? opens the shortcuts dialog, and shortcuts are not hijacked while it is open', async () => {
    const user = await setup();
    await user.keyboard('?');
    const dialog = document.querySelector('dialog.shortcuts') as HTMLElement;
    expect(dialog).toHaveAttribute('open');
    await user.keyboard('1');
    await user.keyboard(' ');
    expect(useTrickStore.getState().activePreset).toBeNull();
    expect(useTrickStore.getState().status).toBe('idle');
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(dialog).not.toHaveAttribute('open');
    await user.keyboard('1');
    expect(useTrickStore.getState().activePreset).toBe('kickflip');
  });

  it('theme toggle button writes data-theme on :root and persists it', async () => {
    const user = await setup();
    const toggle = screen.getByRole('button', { name: 'Light theme' });
    await user.click(toggle);
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('trick-lab.theme')).toBe('light');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await user.click(toggle);
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('the event log panel shows the latest 200 rows', async () => {
    await setup();
    act(() => {
      for (let i = 0; i < 230; i++) useTrickStore.getState().setInput('scoop', i % 2 === 0 ? 1 : 2);
    });
    const log = screen.getByRole('region', { name: 'Event log entries' });
    expect(log.querySelectorAll('tbody tr')).toHaveLength(200);
    expect(screen.getByText('Showing the latest 200 of 230 events. The download has all of them.')).toBeInTheDocument();
  });
});

describe('reduced motion', () => {
  it('pop resolves at once, the board is at its final pose, and the timeline scrubs', async () => {
    mockReducedMotion(true);
    const user = await setup();
    expect(useTrickStore.getState().reducedMotion).toBe(true);
    await user.keyboard('3');
    await user.keyboard(' ');

    expect(useTrickStore.getState().status).toBe('done');
    expect(announcer()).toHaveTextContent(/Popped with .* Pop shove-it landed\. 0 degrees of flip, 173 degrees of backside shove/);
    expect(announcer()).toHaveTextContent('Objective complete: Land a pop shove-it.');
    expect(description()).toHaveTextContent('Skateboard back on the pad at its landing pose.');

    const range = timeline();
    expect(range).toBeEnabled();
    expect(range).toHaveValue('100');
    fireEvent.change(range, { target: { value: '40' } });
    fireEvent.change(range, { target: { value: '45' } });
    fireEvent.blur(range);
    expect(range).toHaveAttribute('aria-valuetext', '45 percent of flight');
    expect(description()).toHaveTextContent('Skateboard frozen at 45 percent of the flight.');
    const scrubs = useTrickStore.getState().events.filter((e) => e.type === 'playback.scrubbed');
    expect(scrubs).toHaveLength(1);
    expect(scrubs[0]!.payload).toEqual({ from: 100, to: 45 });
  });
});

describe('timeline keyboard scrub', () => {
  it('a run of arrow keys logs one playback.scrubbed event once the keys settle', async () => {
    mockReducedMotion(true);
    const user = await setup();
    await user.keyboard('1');
    await user.keyboard(' ');
    const range = timeline();
    range.focus();
    // jsdom has no native range keys; fire what the browser fires per arrow press.
    for (let v = 0; v <= 5; v++) {
      fireEvent.change(range, { target: { value: String(v) } });
      fireEvent.keyUp(range, { key: 'ArrowRight' });
    }
    expect(range).toHaveValue('5');
    const scrubs = () => useTrickStore.getState().events.filter((e) => e.type === 'playback.scrubbed');
    // Still inside the settle window: nothing logged yet.
    expect(scrubs()).toHaveLength(0);
    await act(() => new Promise((r) => setTimeout(r, KEY_SCRUB_SETTLE_MS + 50)));
    expect(scrubs()).toHaveLength(1);
    expect(scrubs()[0]!.payload).toEqual({ from: 100, to: 5 });
  });
});

describe('quality control', () => {
  const group = () => screen.getByRole('group', { name: 'Quality' });
  const radio = (name: 'High' | 'Medium' | 'Low') => within(group()).getByRole('radio', { name });

  it('is a named radio group with a hint; in jsdom the device pick is Medium and the hint says so', async () => {
    await setup();
    expect(group()).toHaveAccessibleDescription(/^Picked for this device\. High adds shoes, shadows and a finer board\./);
    expect(radio('Medium')).toBeChecked();
    expect(radio('High')).not.toBeChecked();
    expect(radio('Low')).not.toBeChecked();
  });

  it('arrow keys switch the tier, persist it and announce it, without logging or popping', async () => {
    const user = await setup();
    act(() => radio('Medium').focus());
    await user.keyboard('{ArrowRight}');
    expect(radio('Low')).toBeChecked();
    expect(radio('Low')).toHaveFocus();
    expect(useTrickStore.getState().quality).toBe('low');
    expect(useTrickStore.getState().qualityAuto).toBe(false);
    expect(localStorage.getItem('trick-lab.quality')).toBe('low');
    expect(announcer()).toHaveTextContent('Quality low: simple board. Fastest.');
    expect(group()).toHaveAccessibleDescription(/^High adds shoes/);
    // Space keeps its native meaning on a radio: no pop.
    await user.keyboard(' ');
    expect(useTrickStore.getState().status).toBe('idle');
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(radio('High')).toBeChecked();
    expect(useTrickStore.getState().quality).toBe('high');
    expect(announcer()).toHaveTextContent('Quality high: detailed board, shoes and shadows.');
    expect(useTrickStore.getState().events).toEqual([]);
  });

  it('clicking a label selects its option', async () => {
    const user = await setup();
    await user.click(screen.getByText('Low'));
    expect(radio('Low')).toBeChecked();
  });

  it('is disabled above Low and shows Low if a model failed to load', async () => {
    await setup();
    act(() => useTrickStore.getState().setBoardAssetFailed());
    expect(radio('Low')).toBeChecked();
    expect(radio('High')).toBeDisabled();
    expect(radio('Medium')).toBeDisabled();
    expect(radio('Low')).not.toBeDisabled();
    expect(announcer()).toHaveTextContent('The board model did not load. Showing the simple board.');
  });
});

describe('camera preset control (ADR-38)', () => {
  const group = () => screen.getByRole('group', { name: 'Camera' });
  const radio = (name: 'Rider' | 'Detail') => within(group()).getByRole('radio', { name });

  it('is a named radio group with a hint, Rider first and checked by default, before Stance', async () => {
    await setup();
    expect(group()).toHaveAccessibleDescription(
      'Rider: looking down from above your heels. Detail: low and to the side, to see the deck, trucks and soles.',
    );
    const radios = within(group()).getAllByRole('radio');
    expect(radios.map((r) => (r as HTMLInputElement).value)).toEqual(['rider', 'detail']);
    expect(radio('Rider')).toBeChecked();
    const stance = screen.getByRole('group', { name: 'Stance' });
    expect(group().compareDocumentPosition(stance) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('Tab reaches the checked option and an arrow key switches it, persisted, announced, not logged; Reset view keeps it', async () => {
    const user = await setup();
    act(() => screen.getByRole('button', { name: 'Perf badge' }).focus());
    await user.tab();
    expect(radio('Rider')).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(radio('Detail')).toBeChecked();
    expect(radio('Detail')).toHaveFocus();
    expect(useTrickStore.getState().cameraView).toBe('detail');
    expect(localStorage.getItem('trick-lab.camera-view')).toBe('detail');
    expect(announcer()).toHaveTextContent('Detail view: low three-quarter view from the heel side.');
    // Space keeps its native meaning on a radio: no pop.
    await user.keyboard(' ');
    expect(useTrickStore.getState().status).toBe('idle');
    // Reset view returns the camera to the chosen preset; the choice stays.
    await user.click(screen.getByRole('button', { name: 'Reset view' }));
    expect(radio('Detail')).toBeChecked();
    expect(announcer()).toHaveTextContent('Camera view reset.');
    radio('Detail').focus();
    await user.keyboard('{ArrowLeft}');
    expect(radio('Rider')).toBeChecked();
    expect(announcer()).toHaveTextContent("Rider's view: looking down from above the heels.");
    expect(useTrickStore.getState().events).toEqual([]);
  });

  it('clicking a label selects its option', async () => {
    const user = await setup();
    await user.click(screen.getByText('Detail'));
    expect(radio('Detail')).toBeChecked();
  });
});

describe('stance control (ADR-25)', () => {
  const group = () => screen.getByRole('group', { name: 'Stance' });
  const radio = (name: 'Goofy' | 'Regular') => within(group()).getByRole('radio', { name });

  it('is a named radio group with a hint, Goofy first and checked by default', async () => {
    await setup();
    expect(group()).toHaveAccessibleDescription(
      'Goofy: right foot forward, nose on the right. Regular: left foot forward, nose on the left.',
    );
    const radios = within(group()).getAllByRole('radio');
    expect(radios.map((r) => (r as HTMLInputElement).value)).toEqual(['goofy', 'regular']);
    expect(radio('Goofy')).toBeChecked();
    expect(description()).toHaveTextContent('Goofy stance, nose to the right, heel side toward the camera.');
  });

  it('Tab reaches the checked option and an arrow key switches it, persisted, announced, described, not logged', async () => {
    const user = await setup();
    // The View switches come first; the last one is the perf badge. Changed
    // on purpose with ADR-38 (2026-11-05): the Camera group now sits between
    // the switches and Stance, so the second Tab reaches Goofy.
    act(() => screen.getByRole('button', { name: 'Perf badge' }).focus());
    await user.tab();
    await user.tab();
    expect(radio('Goofy')).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(radio('Regular')).toBeChecked();
    expect(radio('Regular')).toHaveFocus();
    expect(useTrickStore.getState().stance).toBe('regular');
    expect(localStorage.getItem('trick-lab.stance')).toBe('regular');
    expect(announcer()).toHaveTextContent('Regular stance: left foot forward, nose on the left.');
    expect(description()).toHaveTextContent('Regular stance, nose to the left, heel side toward the camera.');
    expect(description()).toHaveTextContent('Flick rolls the grip toward the heel side');
    // Space keeps its native meaning on a radio: no pop.
    await user.keyboard(' ');
    expect(useTrickStore.getState().status).toBe('idle');
    await user.keyboard('{ArrowLeft}');
    expect(radio('Goofy')).toBeChecked();
    expect(announcer()).toHaveTextContent('Goofy stance: right foot forward, nose on the right.');
    expect(description()).toHaveTextContent('Goofy stance');
    expect(useTrickStore.getState().events).toEqual([]);
  });

  it('clicking a label selects its option', async () => {
    const user = await setup();
    await user.click(screen.getByText('Regular'));
    expect(radio('Regular')).toBeChecked();
    expect(description()).toHaveTextContent('nose to the left');
  });
});

describe('feet', () => {
  const button = () => screen.getByRole('button', { name: 'Show feet' });

  it('is a pressed toggle, on by default, persisted and announced, never logged', async () => {
    const user = await setup();
    expect(button()).toHaveAttribute('aria-pressed', 'true');
    expect(description()).toHaveTextContent('Front foot across the board just behind the front bolts; back foot on its ball across the tail, heel up.');
    await user.click(button());
    expect(button()).toHaveAttribute('aria-pressed', 'false');
    expect(localStorage.getItem('trick-lab.feet')).toBe('off');
    expect(announcer()).toHaveTextContent('Feet hidden.');
    expect(description()).not.toHaveTextContent('Front foot');
    expect(useTrickStore.getState().events).toEqual([]);
    await user.click(button());
    expect(description()).toHaveTextContent('Front foot across the board');
  });

  it('describes the stance from the inputs, then the flight', async () => {
    const user = await setup();
    await user.click(presetButton('Kickflip'));
    expect(description()).toHaveTextContent('turned 42 degrees toward the nose with the heel over the heel-side edge; back foot on its ball across the tail, heel up.');
    // Focus is on the preset button, where Space is native, so pop through the store.
    act(() => useTrickStore.getState().popTrick());
    expect(description()).toHaveTextContent('Feet in the air above the board.');
    landNow();
    expect(description()).toHaveTextContent('Feet landed on the bolts.');
  });
});

// ADR-37 (2026-11-05): the legs, a view preference next to Feet.
describe('legs', () => {
  const button = () => screen.getByRole('button', { name: 'Show legs' });

  it('is pressed by default, hides and shows the legs in the description, persisted and announced, never logged', async () => {
    const user = await setup();
    expect(button()).toHaveAttribute('aria-pressed', 'true');
    expect(button()).toHaveTextContent('Legs');
    expect(description()).toHaveTextContent('Legs crouched, knees bent, ready to pop.');
    await user.click(button());
    expect(button()).toHaveAttribute('aria-pressed', 'false');
    expect(useTrickStore.getState().legsVisible).toBe(false);
    expect(localStorage.getItem('trick-lab.legs')).toBe('off');
    expect(announcer()).toHaveTextContent('Legs hidden.');
    expect(description()).not.toHaveTextContent('Legs crouched');
    await user.click(button());
    expect(localStorage.getItem('trick-lab.legs')).toBe('on');
    expect(announcer()).toHaveTextContent('Legs shown.');
    expect(useTrickStore.getState().events).toEqual([]);
  });

  it('is reached by Tab from the Feet switch and switched with Space, which does not pop', async () => {
    const user = await setup();
    screen.getByRole('button', { name: 'Show feet' }).focus();
    await user.tab();
    expect(button()).toHaveFocus();
    await user.keyboard(' ');
    expect(button()).toHaveAttribute('aria-pressed', 'false');
    expect(announcer()).toHaveTextContent('Legs hidden.');
    expect(useTrickStore.getState().status).toBe('idle');
  });

  it('has no switch while the feet are hidden, and keeps its setting for when they come back', async () => {
    const user = await setup();
    await user.click(button());
    await user.click(screen.getByRole('button', { name: 'Show feet' }));
    expect(screen.queryByRole('button', { name: 'Show legs' })).toBeNull();
    expect(description()).not.toHaveTextContent('Legs');
    expect(description()).not.toHaveTextContent('Knees');
    await user.click(screen.getByRole('button', { name: 'Show feet' }));
    expect(button()).toHaveAttribute('aria-pressed', 'false');
  });

  it('follows the flight in the description: tucked in the air, absorbing the landing', async () => {
    const user = await setup();
    await user.click(presetButton('Kickflip'));
    act(() => useTrickStore.getState().popTrick());
    act(() => useTrickStore.getState().scrub(0.4));
    expect(description()).toHaveTextContent('Knees tucked up in the air.');
    landNow();
    expect(description()).toHaveTextContent('Knees bent, absorbing the landing.');
  });
});

describe('foot trails', () => {
  const button = () => screen.getByRole('button', { name: 'Show foot trails' });

  it('starts unpressed, then shows, persists and announces the trails, never logged', async () => {
    const user = await setup();
    expect(button()).toHaveAttribute('aria-pressed', 'false');
    await user.click(button());
    expect(button()).toHaveAttribute('aria-pressed', 'true');
    expect(useTrickStore.getState().footPathsVisible).toBe(true);
    expect(localStorage.getItem('trick-lab.foot-trails')).toBe('on');
    expect(announcer()).toHaveTextContent('Foot trails shown.');
    await user.click(button());
    expect(button()).toHaveAttribute('aria-pressed', 'false');
    expect(localStorage.getItem('trick-lab.foot-trails')).toBe('off');
    expect(announcer()).toHaveTextContent('Foot trails hidden.');
    expect(useTrickStore.getState().events).toEqual([]);
  });

  it('can be switched on from the keyboard', async () => {
    const user = await setup();
    button().focus();
    await user.keyboard('{Enter}');
    expect(button()).toHaveAttribute('aria-pressed', 'true');
    await user.keyboard(' ');
    expect(button()).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('motion cues', () => {
  const button = () => screen.getByRole('button', { name: 'Show motion cues' });

  it('starts pressed, then hides, persists and announces the cues, never logged', async () => {
    const user = await setup();
    expect(button()).toHaveAttribute('aria-pressed', 'true');
    expect(button()).toHaveTextContent('Motion cues');
    await user.click(button());
    expect(button()).toHaveAttribute('aria-pressed', 'false');
    expect(useTrickStore.getState().motionCuesVisible).toBe(false);
    expect(localStorage.getItem('trick-lab.motion-cues')).toBe('off');
    expect(announcer()).toHaveTextContent('Motion cues hidden.');
    await user.click(button());
    expect(button()).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem('trick-lab.motion-cues')).toBe('on');
    expect(announcer()).toHaveTextContent('Motion cues shown.');
    expect(useTrickStore.getState().events).toEqual([]);
  });

  it('can be switched from the keyboard, and Space on it does not pop', async () => {
    const user = await setup();
    button().focus();
    await user.keyboard('{Enter}');
    expect(button()).toHaveAttribute('aria-pressed', 'false');
    await user.keyboard(' ');
    expect(button()).toHaveAttribute('aria-pressed', 'true');
    expect(useTrickStore.getState().status).toBe('idle');
  });
});

describe('foot motion panel', () => {
  const panel = () => screen.getByRole('region', { name: 'Foot motion' });
  const items = () => within(panel()).getAllByRole('listitem');

  it('lists the steps for the live inputs and follows a preset', async () => {
    const user = await setup();
    expect(items()[0]).toHaveTextContent('Back foot');
    expect(items()[0]).toHaveTextContent('snaps the tail down');
    await user.click(presetButton('Kickflip'));
    expect(within(panel()).getByText(/flicks forward, out and up off the heel-side corner of the nose, 19 cm/)).toBeInTheDocument();
    expect(panel()).not.toHaveTextContent(', now');
  });

  it('marks the steps under the playhead while the trick plays and when scrubbed', async () => {
    const user = await setup();
    await user.click(presetButton('Kickflip'));
    await user.click(screen.getByRole('button', { name: 'Pop' }));
    act(() => useTrickStore.getState().syncProgress(0.1));
    const now = () => items().filter((li) => li.classList.contains('foot-step--now')).map((li) => li.textContent);
    expect(now().join(' ')).toMatch(/flicks/);
    expect(now().join(' ')).toMatch(/, now/);
    landNow();
    expect(now()).toHaveLength(1);
    expect(now()[0]).toMatch(/land on the grip/);
  });
});

/** A prefers-reduced-motion query whose answer the test can change, firing the change event like a browser. */
function liveReducedMotion() {
  let reduced = false;
  const listeners = new Set<() => void>();
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      get matches() {
        return reduced && query.includes('reduce');
      },
      media: query,
      addEventListener: (_type: string, l: () => void) => listeners.add(l),
      removeEventListener: (_type: string, l: () => void) => listeners.delete(l),
    })),
  );
  return (next: boolean) =>
    act(() => {
      reduced = next;
      for (const l of listeners) l();
    });
}

describe('reduced motion turned on mid-flight (ADR-6)', () => {
  const resolved = () => useTrickStore.getState().events.filter((e) => e.type === 'trick.resolved');

  it('a playing flight resolves at once, announced once with the result, and the timeline scrubs', async () => {
    const setReduced = liveReducedMotion();
    const user = await setup();
    await user.keyboard('1');
    await user.keyboard(' ');
    expect(useTrickStore.getState().status).toBe('playing');
    setReduced(true);
    expect(useTrickStore.getState().status).toBe('done');
    expect(announcer()).toHaveTextContent(/^Reduced motion on: the board goes straight to its landing\. Kickflip landed\..*Objective complete: Land a kickflip\./);
    expect(description()).toHaveTextContent('Skateboard back on the pad at its landing pose.');
    expect(timeline()).toBeEnabled();
    // FlightDriver's land() arriving late changes nothing.
    landNow();
    expect(resolved()).toHaveLength(1);
    expect(useTrickStore.getState().completed).toEqual(['kickflip']);
  });

  it('a paused flight resolves too, and Resume is gone rather than playing', async () => {
    const setReduced = liveReducedMotion();
    const user = await setup();
    await user.keyboard(' ');
    await user.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
    setReduced(true);
    expect(useTrickStore.getState().status).toBe('done');
    expect(screen.queryByRole('button', { name: 'Resume' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Pause' }));
    expect(useTrickStore.getState().status).toBe('done');
    expect(resolved()).toHaveLength(1);
    // The next pop resolves at once with one combined announcement. (Focus is on a button, where Space presses it.)
    await user.click(screen.getByRole('button', { name: 'Pop' }));
    expect(useTrickStore.getState().status).toBe('done');
    expect(announcer()).toHaveTextContent(/^Popped with .*Ollie landed\./);
    expect(resolved()).toHaveLength(2);
  });
});

describe('scene description while the board is in the air (audit fix, 2026-11-04)', () => {
  it('says it is waiting to land, playing, paused, and on a second pop after a landed trick', async () => {
    const user = await setup();
    expect(description()).toHaveTextContent('No trick popped yet.');
    await user.keyboard('1');
    await user.keyboard(' ');
    expect(description()).toHaveTextContent('Waiting for this trick to land.');
    expect(description()).not.toHaveTextContent('No trick popped yet.');
    await user.click(screen.getByRole('button', { name: 'Pause' }));
    expect(description()).toHaveTextContent('Waiting for this trick to land.');
    await user.click(screen.getByRole('button', { name: 'Resume' }));
    landNow();
    expect(description()).toHaveTextContent('Last trick: Kickflip landed.');
    await user.click(screen.getByRole('button', { name: 'Pop' }));
    expect(description()).toHaveTextContent('Waiting for this trick to land.');
    expect(description()).not.toHaveTextContent('Last trick');
  });
});

describe('effective quality (ADR-15)', () => {
  it('a failed model shows Low without overwriting the saved tier', async () => {
    localStorage.setItem('trick-lab.quality', 'high');
    useTrickStore.setState({ quality: 'high', qualityAuto: false });
    await setup();
    const group = screen.getByRole('group', { name: 'Quality' });
    expect(within(group).getByRole('radio', { name: 'High' })).toBeChecked();
    act(() => useTrickStore.getState().setBoardAssetFailed());
    expect(within(group).getByRole('radio', { name: 'Low' })).toBeChecked();
    expect(useTrickStore.getState().quality).toBe('high');
    expect(localStorage.getItem('trick-lab.quality')).toBe('high');
  });
});
