import { hasRecords, RECORD_TRICKS, recordCounts, useTrickStore } from '../store';
import { ConfirmDialog } from './ConfirmDialog';

const STATE = { clean: 'Clean', sketchy: 'Landed' } as const;

/**
 * The trick list on the welcome screen (ADR-64, DESIGN.md 12.4): every named
 * trick, the ollie included, with what the player has done with it on this
 * device. Landed and clean are said in words ("Landed", "Clean", "Not yet"),
 * never by colour alone, and a landed trick's title gives the day it was
 * first landed. "Clear records" asks first.
 */
export function TrickList() {
  const records = useTrickStore((s) => s.records);
  const clear = useTrickStore((s) => s.requestClearRecords);
  const { landed, clean, of } = recordCounts(records);
  const any = hasRecords(records);
  return (
    <section className="tricks" aria-labelledby="tricks-heading">
      <div className="tricks__head">
        <h2 id="tricks-heading" className="tricks__title">
          Your tricks
        </h2>
        <p className="tricks__count">
          {landed} of {of} landed, {clean} clean
        </p>
      </div>
      <ul className="tricks__grid">
        {RECORD_TRICKS.map((t) => {
          const r = records.tricks[t.id];
          return (
            <li key={t.id} className={`tricks__item${r ? ` tricks__item--${r.best === 'clean' ? 'clean' : 'landed'}` : ''}`}>
              <span className="tricks__name" title={t.name}>
                {t.name}
              </span>
              <span className="tricks__state" title={r ? `First landed ${r.first}` : undefined}>
                {r ? STATE[r.best] : 'Not yet'}
                {r && <span className="visually-hidden">, first landed {r.first}</span>}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="tricks__foot">
        <p className="tricks__count">Kept on this device.</p>
        {/* aria-disabled, not disabled: the button stays focusable and says why it does nothing. */}
        <button type="button" className="btn btn--ghost btn--sm" aria-haspopup="dialog" aria-disabled={!any || undefined} onClick={clear}>
          Clear records
        </button>
      </div>
    </section>
  );
}

/** Asks before the records are cleared (ADR-64). */
export function ClearRecordsDialog() {
  const open = useTrickStore((s) => s.recordsClearAsked);
  const confirm = useTrickStore((s) => s.confirmClearRecords);
  const cancel = useTrickStore((s) => s.cancelClearRecords);
  return (
    <ConfirmDialog
      id="clear-records"
      open={open}
      title="Clear your records?"
      text="Your landed tricks, your games won and lost, and your run of wins on this device are cleared. This cannot be undone."
      keep="Keep records"
      go="Clear records"
      onKeep={cancel}
      onGo={confirm}
    />
  );
}
