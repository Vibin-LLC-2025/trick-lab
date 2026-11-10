import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useTrickStore } from '../store';
import { localDate, RECORDS_KEY } from '../store/records';
import { App } from './App';

// WebGL does not exist in jsdom. Everything else below is the real app and the real store.
vi.mock('../scene/TrickScene', () => ({ default: () => <div data-testid="scene-stub" /> }));

const announcer = () => document.querySelector('.visually-hidden[aria-live="polite"]')!;
const list = () => screen.getByRole('region', { name: 'Your tricks' });
const row = (name: string) => within(list()).getByText(name, { selector: '.tricks__name' }).closest('li')!;

async function setup() {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByTestId('scene-stub');
  return user;
}

/** The player lands these slider values in the lab's own store actions. */
function land(flick: number, scoop = 0) {
  act(() => {
    const s = useTrickStore.getState();
    s.setInput('flick', flick);
    s.setInput('scoop', scoop);
    s.popTrick();
    useTrickStore.getState().land();
  });
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  localStorage.clear();
  useTrickStore.setState(useTrickStore.getInitialState(), true);
  useTrickStore.setState({ screen: 'home' });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the trick list on the welcome screen (ADR-64)', () => {
  it('lists every named trick, the ollie included, all "Not yet" at first', async () => {
    await setup();
    const items = within(list()).getAllByRole('listitem');
    expect(items).toHaveLength(16);
    expect(items[0]).toHaveTextContent('Ollie');
    for (const li of items) expect(li).toHaveTextContent('Not yet');
    expect(list()).toHaveTextContent('0 of 16 landed, 0 clean');
    expect(list()).toHaveTextContent('Kept on this device.');
  });

  it('says landed and clean in words, with the day of the first landing, and the count follows', async () => {
    await setup();
    // A kickflip 25 degrees past: landed, sketchy. Then a clean pop shove-it.
    land(2);
    land(0, 0.9);
    expect(row('Kickflip')).toHaveTextContent('Landed');
    expect(row('Kickflip')).toHaveClass('tricks__item--landed');
    expect(row('Pop shove-it')).toHaveTextContent('Clean');
    expect(row('Pop shove-it')).toHaveClass('tricks__item--clean');
    expect(row('Pop shove-it')).toHaveTextContent(`, first landed ${localDate()}`);
    expect(row('Heelflip')).toHaveTextContent('Not yet');
    expect(row('Heelflip').className).toBe('tricks__item');
    expect(list()).toHaveTextContent('2 of 16 landed, 1 clean');
    // A clean kickflip lifts its grade.
    land(1.9);
    expect(row('Kickflip')).toHaveTextContent('Clean');
    expect(list()).toHaveTextContent('2 of 16 landed, 2 clean');
  });

  it('"Clear records" asks first, by keyboard: Keep records is the default, and clearing is announced', async () => {
    const user = await setup();
    const clear = within(list()).getByRole('button', { name: 'Clear records' });
    // Nothing to clear yet: the button says so and opens nothing.
    expect(clear).toHaveAttribute('aria-disabled', 'true');
    clear.focus();
    await user.keyboard('{Enter}');
    expect(announcer()).toHaveTextContent('There are no records to clear yet.');
    expect(screen.queryByRole('dialog')).toBeNull();

    land(1.9);
    expect(clear).not.toHaveAttribute('aria-disabled');
    await user.keyboard('{Enter}');
    const dialog = screen.getByRole('dialog', { name: 'Clear your records?' });
    expect(dialog).toHaveAccessibleDescription(/Your landed tricks, your games won and lost/);
    // The safe choice comes first.
    const buttons = within(dialog).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['Keep records', 'Clear records']);
    await user.click(buttons[0]!);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(row('Kickflip')).toHaveTextContent('Clean');

    await user.click(clear);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Clear records' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(row('Kickflip')).toHaveTextContent('Not yet');
    expect(list()).toHaveTextContent('0 of 16 landed, 0 clean');
    expect(announcer()).toHaveTextContent('Records cleared.');
    expect(JSON.parse(localStorage.getItem(RECORDS_KEY)!)).toMatchObject({ v: 1, tricks: {}, streak: 0 });
    // Never part of the event log.
    expect(useTrickStore.getState().events.some((e) => e.type.includes('record'))).toBe(false);
  });

  it('the game screen says the record against the level picked, once there is one', async () => {
    await setup();
    act(() => {
      const s = useTrickStore.getState();
      s.noteGame('normal', true);
      s.noteGame('normal', true);
      s.noteGame('normal', false);
      s.noteGame('normal', true);
      s.noteGame('normal', true);
      s.setScreen('skate');
    });
    const game = screen.getByRole('main', { name: 'Game' });
    expect(game).toHaveTextContent('Against Normal, all time: won 4, lost 1. You are on a run of 2 wins.');
    // No games against Hard yet: nothing to say.
    act(() => useTrickStore.getState().setSkateLevel('hard'));
    expect(game).not.toHaveTextContent('all time');
  });
});
