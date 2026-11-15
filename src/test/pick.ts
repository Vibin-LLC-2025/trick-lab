// Calling a trick in the game's picker (ADR-88), for the UI tests: the open
// list's trick button by name, opening the list with "Change trick" first
// when a trick is already called. Plain DOM, so it works with user-event
// and with fake timers (fireEvent) alike.
import { act, fireEvent, screen, within } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';

const game = () => screen.getByRole('main', { name: 'Game' });

/** The picker's list of tricks, or null while it is folded. */
export const pickList = () => within(game()).queryByRole('group', { name: 'Call your trick' });

function trickButton(name: string) {
  if (!pickList()) fireEvent.click(within(game()).getByRole('button', { name: 'Change trick' }));
  return within(pickList()!).getByRole('button', { name });
}

/** Calls `name` (the trick's name as shown, "Kickflip") with a real click. */
export async function pickTrick(user: ReturnType<typeof userEvent.setup>, name: string) {
  if (!pickList()) await user.click(within(game()).getByRole('button', { name: 'Change trick' }));
  await user.click(within(pickList()!).getByRole('button', { name }));
}

/** The same, at once (for tests on fake timers). */
export const pickTrickNow = (name: string) => act(() => void fireEvent.click(trickButton(name)));
