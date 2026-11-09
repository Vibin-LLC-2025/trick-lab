import { useEffect, useRef } from 'react';
import { useTrickStore, type Screen } from '../store';

const ALL: readonly Screen[] = ['home', 'skate', 'lab'];
const PLAY: readonly Screen[] = ['skate', 'lab'];
const LAB: readonly Screen[] = ['lab'];

/** Each shortcut and the screens it works on (ADR-45; App's SCREEN_KEYS is the keyboard side of the same list). */
const SHORTCUTS: [string[], string, readonly Screen[]][] = [
  [['Tab'], 'Move through the controls', ALL],
  // One key cap for the range (an en-dash, as for any numeric range) so the seven keys do not widen the key column.
  [['1–7'], 'Apply presets 1 to 7, in order: kickflip, heelflip, pop shove-it, frontside shove-it, varial flip, varial heelflip, 360 flip', LAB],
  [['Space'], "Pop, or the computer's go in a game of SKATE (when focus is not on a slider or button, where Space keeps its usual job)", PLAY],
  [['←', '→'], 'Move the focused slider; on the timeline, 1 percent', PLAY],
  [['Page Up', 'Page Down'], 'On the timeline, 10 percent', LAB],
  [['s'], 'Slow motion on or off (back to the last slow speed)', PLAY],
  [['[', ']'], 'One speed step slower or faster, also while the board is in the air', LAB],
  [['r'], 'Reset inputs, board and objectives (the event log is kept)', LAB],
  [['t'], 'Light or dark theme', ALL],
  [['p'], 'Show or hide the performance badge', LAB],
  [['?'], 'Open this dialog', ALL],
  [['Esc'], 'Close this dialog', ALL],
];

/** Native modal <dialog>: the browser traps focus, handles Esc and restores focus on close. */
export function ShortcutsDialog() {
  const open = useTrickStore((s) => s.shortcutsOpen);
  const screen = useTrickStore((s) => s.screen);
  const setOpen = useTrickStore((s) => s.setShortcutsOpen);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    // jsdom lacks showModal/close; fall back to the open attribute.
    if (open && !d.open) {
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
    } else if (!open && d.open) {
      if (typeof d.close === 'function') d.close();
      else d.removeAttribute('open');
    }
  }, [open]);

  return (
    <dialog ref={ref} className="shortcuts" aria-labelledby="shortcuts-title" onClose={() => setOpen(false)}>
      <h2 id="shortcuts-title">Keyboard shortcuts</h2>
      <dl>
        {SHORTCUTS.filter(([, , on]) => on.includes(screen)).map(([keys, what]) => (
          <div key={what}>
            <dt>
              {keys.map((k) => (
                <kbd key={k}>{k}</kbd>
              ))}
            </dt>
            <dd>{what}</dd>
          </div>
        ))}
      </dl>
      <button type="button" className="btn btn--primary" onClick={() => setOpen(false)}>
        Close
      </button>
    </dialog>
  );
}
