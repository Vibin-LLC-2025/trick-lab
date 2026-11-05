import { useEffect, useRef } from 'react';
import { useTrickStore } from '../store';

const SHORTCUTS: [string[], string][] = [
  [['Tab'], 'Move through presets, sliders, playback and results'],
  // One key cap for the range (an en-dash, as for any numeric range) so the eight keys do not widen the key column.
  [['1–8'], 'Apply presets 1 to 8, in order: kickflip, heelflip, pop shove-it, frontside shove-it, varial flip, varial heelflip, hardflip, 360 flip'],
  [['Space'], 'Pop (when focus is not on a slider or button, where Space keeps its usual job)'],
  [['←', '→'], 'Move the focused slider; on the timeline, 1 percent'],
  [['Page Up', 'Page Down'], 'On the timeline, 10 percent'],
  [['s'], 'Slow motion on or off (back to the last slow speed)'],
  [['[', ']'], 'One speed step slower or faster, also while the board is in the air'],
  [['r'], 'Reset inputs, board and objectives (the event log is kept)'],
  [['t'], 'Light or dark theme'],
  [['p'], 'Show or hide the performance badge'],
  [['?'], 'Open this dialog'],
  [['Esc'], 'Close this dialog'],
];

/** Native modal <dialog>: the browser traps focus, handles Esc and restores focus on close. */
export function ShortcutsDialog() {
  const open = useTrickStore((s) => s.shortcutsOpen);
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
        {SHORTCUTS.map(([keys, what]) => (
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
