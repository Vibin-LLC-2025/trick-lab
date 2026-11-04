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
    expect(flick).toHaveAttribute('aria-valuetext', '1.9 revolutions per second');
    expect(useTrickStore.getState().events.map((e) => e.type)).toEqual(['input.changed', 'input.changed']);
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
    expect(announcer()).toHaveTextContent('Popped with pop 0.35 meters, flick 1.9 revolutions per second');
    expect(screen.getByText('In the air')).toBeInTheDocument();
    expect(timeline()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Pop' })).toHaveAttribute('aria-disabled', 'true');

    landNow();
    expect(announcer()).toHaveTextContent(
      'Kickflip landed. 365 degrees of flip, 0 degrees of shove, 0.53 seconds in the air. Objective complete: Land a kickflip. 1 of 4 objectives done.',
    );
    expect(screen.getByText('Kickflip landed')).toBeInTheDocument();
    expect(screen.getByText('365 deg flip, 0 deg shove, 0.53 s in the air.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Objectives 1 of 4' })).toBeInTheDocument();
    expect(document.querySelectorAll('.objective--done')).toHaveLength(1);
    const telemetry = screen.getByRole('region', { name: 'Telemetry' });
    expect(within(telemetry).getByText('365°')).toBeInTheDocument();
    expect(within(telemetry).getByText('landed')).toHaveClass('telemetry__v--good');
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
    await user.keyboard('4');
    fireEvent.change(screen.getByRole('slider', { name: /^Pop/ }), { target: { value: '0.15' } });
    await user.click(screen.getByRole('button', { name: 'Pop' }));
    landNow();
    expect(announcer()).toHaveTextContent(/not landed: flip under-rotated by 121 degrees/);
    expect(document.querySelector('.outcome--bailed')).not.toBeNull();
    expect(document.querySelectorAll('.objective--done')).toHaveLength(0);
  });

  it('Space keeps its native meaning on sliders and buttons', async () => {
    const user = await setup();
    screen.getByRole('slider', { name: /^Scoop/ }).focus();
    await user.keyboard(' ');
    expect(useTrickStore.getState().status).toBe('idle');

    // Space on the slow-motion toggle presses the toggle, it does not pop.
    const slow = screen.getByRole('button', { name: /^Slow motion/ });
    slow.focus();
    await user.keyboard(' ');
    expect(slow).toHaveAttribute('aria-pressed', 'true');
    expect(useTrickStore.getState().status).toBe('idle');
  });

  it('s toggles slow motion, p the perf badge, t the theme', async () => {
    const user = await setup();
    await user.keyboard('s');
    expect(useTrickStore.getState().rate).toBe(0.25);
    expect(screen.getByRole('button', { name: /^Slow motion/ })).toHaveTextContent('0.25x');

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
    await user.keyboard('2');
    await user.keyboard(' ');

    expect(useTrickStore.getState().status).toBe('done');
    expect(announcer()).toHaveTextContent(/Popped with .* Pop shove-it landed\. 0 degrees of flip, 173 degrees of shove/);
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

describe('board detail control', () => {
  const group = () => screen.getByRole('group', { name: 'Board detail' });
  const radio = (name: 'High' | 'Low') => within(group()).getByRole('radio', { name });

  it('is a named radio group with a hint, High checked by default', async () => {
    await setup();
    expect(group()).toHaveAccessibleDescription('Low uses the simple board. Faster on Chromebooks.');
    expect(radio('High')).toBeChecked();
    expect(radio('Low')).not.toBeChecked();
  });

  it('arrow keys switch the detail, persist it and announce it, without logging or popping', async () => {
    const user = await setup();
    act(() => radio('High').focus());
    await user.keyboard('{ArrowRight}');
    expect(radio('Low')).toBeChecked();
    expect(radio('Low')).toHaveFocus();
    expect(useTrickStore.getState().boardDetail).toBe('low');
    expect(localStorage.getItem('trick-lab.board-detail')).toBe('low');
    expect(announcer()).toHaveTextContent('Board detail low: simple board.');
    // Space keeps its native meaning on a radio: no pop.
    await user.keyboard(' ');
    expect(useTrickStore.getState().status).toBe('idle');
    await user.keyboard('{ArrowLeft}');
    expect(radio('High')).toBeChecked();
    expect(useTrickStore.getState().boardDetail).toBe('high');
    expect(useTrickStore.getState().events).toEqual([]);
  });

  it('clicking a label selects its option', async () => {
    const user = await setup();
    await user.click(screen.getByText('Low'));
    expect(radio('Low')).toBeChecked();
  });

  it('is disabled and shows Low if the model failed to load', async () => {
    await setup();
    act(() => useTrickStore.getState().setBoardAssetFailed());
    expect(radio('Low')).toBeChecked();
    expect(radio('High')).toBeDisabled();
    expect(radio('Low')).toBeDisabled();
    expect(announcer()).toHaveTextContent('The board model did not load. Showing the simple board.');
  });
});
