import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useTrickStore } from '../store';
import { App } from './App';

// WebGL does not exist in jsdom. Everything else below is the real app and the real store.
vi.mock('../scene/TrickScene', () => ({ default: () => <div data-testid="scene-stub" /> }));

const game = () => screen.getByRole('main', { name: 'Game' });
const state = () => useTrickStore.getState();
const slider = (name: RegExp) => screen.getByRole('slider', { name });
const zones = (el: HTMLElement) => el.closest('.field__track')!.querySelectorAll<HTMLElement>('.field__zone');

/** A game on a level, the player up first and past the coin flip, by keyboard. */
async function playerUp(level: 'easy' | 'normal' | 'hard') {
  useTrickStore.setState({ skate: { ...state().skate, level } });
  const user = userEvent.setup();
  render(<App />);
  await screen.findByTestId('scene-stub');
  within(game()).getByRole('button', { name: 'Start game' }).focus();
  await user.keyboard('{Enter}');
  await user.keyboard('{Enter}');
  return user;
}

beforeEach(() => {
  useTrickStore.setState(useTrickStore.getInitialState(), true);
  useTrickStore.setState({ screen: 'skate', skateAuto: false, skateTaught: true });
  localStorage.clear();
  // 0.25 wins the coin flip for the player.
  vi.spyOn(Math, 'random').mockReturnValue(0.25);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the game's sliders (ADR-83)", () => {
  it('on Normal: the call sets them, the zones are drawn, the value says where it is, and the forecast describes every slider', async () => {
    const user = await playerUp('normal');
    // Before the call: no zones, and the forecast says what the sliders make on their own.
    expect(document.querySelectorAll('.field__zone')).toHaveLength(0);
    expect(slider(/^Flick/)).toHaveAccessibleDescription('This makes: ollie, clean.');

    await user.selectOptions(within(game()).getByLabelText('Call your trick'), 'kickflip');
    const flick = slider(/^Flick/);
    expect(flick).toHaveValue('1.9');
    expect(flick).toHaveAttribute('aria-valuetext', '1.9 revolutions per second, kickflip, clean');
    expect(slider(/^Scoop/)).toHaveAttribute('aria-valuetext', '0 revolutions per second, clean');
    for (const name of [/^Pop/, /^Flick/, /^Scoop/]) expect(slider(name)).toHaveAccessibleDescription('This makes: kickflip, clean.');
    // The flick and the scoop each have a landing zone and a clean part, decorative; pop has none.
    expect(zones(flick)).toHaveLength(2);
    expect(zones(slider(/^Scoop/))).toHaveLength(2);
    expect(zones(slider(/^Pop/))).toHaveLength(0);
    for (const z of zones(flick)) expect(z).toHaveAttribute('aria-hidden', 'true');
    const [land, clean] = zones(flick);
    expect(Number(land!.style.getPropertyValue('--zone-from'))).toBeLessThan(Number(clean!.style.getPropertyValue('--zone-from')));
    expect(clean).toHaveClass('field__zone--clean');
    // The forecast is plain text next to the sliders: not a live region.
    const forecast = document.getElementById('skate-forecast')!;
    expect(forecast.closest('[aria-live], [role="status"]')).toBeNull();

    // Off the clean stop, then out of the zone.
    fireEvent.change(flick, { target: { value: '1.8' } });
    expect(flick).toHaveAttribute('aria-valuetext', '1.8 revolutions per second, kickflip, in the landing zone');
    expect(forecast).toHaveTextContent('This makes: kickflip, sketchy: 14 degrees short on the flip.');
    fireEvent.change(flick, { target: { value: '1.7' } });
    expect(flick).toHaveAttribute('aria-valuetext', '1.7 revolutions per second, kickflip');
    expect(forecast).toHaveTextContent('This makes: a bail: 33 degrees short on the flip.');
    // Pop moves the zone: from 0.45 m the same turn needs less flick.
    const before = Number(land!.style.getPropertyValue('--zone-from'));
    fireEvent.change(slider(/^Pop/), { target: { value: '0.45' } });
    expect(Number(zones(flick)[0]!.style.getPropertyValue('--zone-from'))).toBeLessThan(before);
    expect(flick).toHaveAttribute('aria-valuetext', '1.7 revolutions per second, kickflip, in the landing zone');
    // Not announced on its own: only the call was.
    expect(document.getElementById('announcer')).toHaveTextContent(/^You called a kickflip\. Land it and the computer has to copy it\. Sliders set for a kickflip\.$/);
  });

  it('on Easy too, and the turn card is the trick and one line: no word guide', async () => {
    const user = await playerUp('easy');
    await user.selectOptions(within(game()).getByLabelText('Call your trick'), 'kickflip');
    expect(zones(slider(/^Flick/))).toHaveLength(2);
    expect(within(game()).queryByText('How to kickflip')).toBeNull();
    expect(within(game()).getByText('Land it and the computer has to copy it: press Get ready, then Pop! in the green band.')).toBeInTheDocument();
  });

  it('on Hard: no zones and no set sliders, the word guide stays, and the forecast still says what they make', async () => {
    const user = await playerUp('hard');
    await user.selectOptions(within(game()).getByLabelText('Call your trick'), 'kickflip');
    expect(state().flick).toBe(0);
    expect(document.querySelectorAll('.field__zone')).toHaveLength(0);
    expect(slider(/^Flick/)).toHaveAttribute('aria-valuetext', '0 revolutions per second');
    expect(within(game()).getByText('How to kickflip')).toBeInTheDocument();
    expect(slider(/^Flick/)).toHaveAccessibleDescription('This makes: ollie, not the kickflip you need.');
    fireEvent.change(slider(/^Flick/), { target: { value: '1.8' } });
    expect(slider(/^Flick/)).toHaveAccessibleDescription('This makes: kickflip, sketchy: 14 degrees short on the flip. Only clean counts on Hard.');
  });

  it('in Exact on Normal: the zones and the forecast, but nothing is set and the word guide stays', async () => {
    useTrickStore.setState({ popMode: 'exact' });
    const user = await playerUp('normal');
    await user.selectOptions(within(game()).getByLabelText('Call your trick'), 'kickflip');
    expect(state().flick).toBe(0);
    expect(zones(slider(/^Flick/))).toHaveLength(2);
    expect(within(game()).getByText('How to kickflip')).toBeInTheDocument();
    expect(within(game()).getByRole('button', { name: 'Pop' })).toBeInTheDocument();
  });

  it('the lab keeps its sliders as they were: no zones, no forecast, the plain spoken value', async () => {
    useTrickStore.setState({ screen: 'lab' });
    render(<App />);
    await screen.findByTestId('scene-stub');
    fireEvent.change(slider(/^Flick/), { target: { value: '1.9' } });
    expect(document.querySelectorAll('.field__zone')).toHaveLength(0);
    expect(document.getElementById('skate-forecast')).toBeNull();
    expect(slider(/^Flick/)).toHaveAttribute('aria-valuetext', '1.9 revolutions per second, kickflip');
    expect(slider(/^Flick/)).not.toHaveAttribute('aria-describedby');
  });
});
