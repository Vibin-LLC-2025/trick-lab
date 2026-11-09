import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createTrickStore, useTrickStore } from '../store';
import { App } from './App';

// WebGL does not exist in jsdom. Everything else below is the real app and the real store.
vi.mock('../scene/TrickScene', () => ({ default: () => <div data-testid="scene-stub" /> }));

const toggle = (name: RegExp) => screen.getByRole('button', { name, expanded: false });

async function setup() {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByTestId('scene-stub');
  return user;
}

beforeEach(() => {
  localStorage.clear();
  useTrickStore.setState(useTrickStore.getInitialState(), true);
  useTrickStore.setState({ screen: 'lab' });
});

afterEach(() => {
  localStorage.clear();
});

describe('the lab, tidied (ADR-47)', () => {
  it('shows presets, sliders, Pop and the outcome up front; everything else is a closed section', async () => {
    await setup();
    expect(screen.getByRole('group', { name: 'Trick presets' })).toBeInTheDocument();
    expect(screen.getAllByRole('slider')).toHaveLength(3); // pop, flick, scoop: not speed or the timeline
    expect(screen.getByRole('button', { name: 'Pop' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Outcome' })).toHaveTextContent('Set the board up and pop');

    for (const name of [/^Speed and timeline$/, /^View$/, /^Flight numbers$/, /^Foot motion$/, /^Objectives 0 of 7$/, /^Event log 0$/]) {
      const button = toggle(name);
      expect(button).toHaveAttribute('aria-expanded', 'false');
      // Each button is a heading's, so heading navigation still finds the section.
      expect(button.closest('h2, h3')).not.toBeNull();
      expect(document.getElementById(button.getAttribute('aria-controls')!)).toHaveAttribute('hidden');
    }
    expect(screen.queryByText('Airtime')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Event log entries' })).toBeNull();
    // The header actions stay: the log downloads closed, and the view resets closed.
    expect(screen.getByRole('button', { name: 'Download JSON' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reset view' })).toBeInTheDocument();
  });

  it('opens and closes a section by keyboard, and remembers it', async () => {
    const user = await setup();
    const feet = toggle(/^Foot motion$/);
    feet.focus();
    await user.keyboard('{Enter}');
    expect(feet).toHaveAttribute('aria-expanded', 'true');
    expect(within(screen.getByRole('region', { name: 'Foot motion' })).getAllByRole('listitem').length).toBeGreaterThan(0);
    // The legend shows with the steps.
    expect(screen.getByText('Front')).toBeInTheDocument();
    expect(localStorage.getItem('trick-lab.lab-folds')).toBe('["feet"]');
    // Not logged, and Space on the button is the button's own, not a pop.
    await user.keyboard(' ');
    expect(feet).toHaveAttribute('aria-expanded', 'false');
    expect(useTrickStore.getState().events).toEqual([]);
    expect(useTrickStore.getState().flight).toBeNull();

    await user.keyboard('{Enter}');
    expect(createTrickStore().getState().labFolds).toMatchObject({ feet: true, log: false });
  });

  it('a closed section still counts: objectives and the log update their buttons', async () => {
    const user = await setup();
    await user.keyboard('1 ');
    act(() => useTrickStore.getState().land());
    expect(screen.getByRole('button', { name: 'Objectives 1 of 7', expanded: false })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Event log \d+$/, expanded: false })).not.toHaveTextContent('Event log 0');
    expect(screen.getByRole('button', { name: 'Download JSON' })).toBeEnabled();
  });

  it('closing the timeline in the middle of a keyboard scrub still logs the scrub', async () => {
    const user = await setup();
    await user.keyboard('1 ');
    act(() => useTrickStore.getState().land());
    await user.click(toggle(/^Speed and timeline$/));
    const timeline = screen.getByLabelText(/^Timeline/);
    timeline.focus();
    // jsdom has no native range keys; fire what the browser fires for two Left presses.
    for (const v of [99, 98]) {
      fireEvent.change(timeline, { target: { value: String(v) } });
      fireEvent.keyUp(timeline, { key: 'ArrowLeft' });
    }
    expect(useTrickStore.getState().events.at(-1)?.type).not.toBe('playback.scrubbed');
    // Close it before the keys settle: the timeline unmounts with its gesture open.
    act(() => useTrickStore.getState().toggleLabFold('replay'));
    expect(screen.queryByLabelText(/^Timeline/)).toBeNull();
    expect(useTrickStore.getState().events.at(-1)).toMatchObject({ type: 'playback.scrubbed', payload: { from: 100, to: 98 } });
  });

  it('a saved value that is not a list of sections is ignored', () => {
    localStorage.setItem('trick-lab.lab-folds', '{"feet": true}');
    expect(Object.values(createTrickStore().getState().labFolds).every((open) => !open)).toBe(true);
    localStorage.setItem('trick-lab.lab-folds', 'not json');
    expect(Object.values(createTrickStore().getState().labFolds).every((open) => !open)).toBe(true);
    localStorage.setItem('trick-lab.lab-folds', '["log", "nonsense"]');
    expect(createTrickStore().getState().labFolds).toEqual({ replay: false, view: false, numbers: false, feet: false, objectives: false, log: true });
  });
});
