// Opening Settings in the top bar (ADR-89), for the UI tests: the game's
// switches, the camera, sound, the theme and the shortcuts live in its panel.
import { act, fireEvent, screen } from '@testing-library/react';

/** Opens the Settings panel if it is closed, and returns it. */
export function openSettings(): HTMLElement {
  const button = screen.getByRole('button', { name: 'Settings' });
  if (button.getAttribute('aria-expanded') !== 'true') act(() => void fireEvent.click(button));
  return screen.getByRole('group', { name: 'Settings' });
}
