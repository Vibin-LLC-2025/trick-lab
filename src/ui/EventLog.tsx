import { useEffect, useRef } from 'react';
import { useTrickStore } from '../store';
import { buildExport, exportFilename } from '../store/export';

/** The panel renders only the latest rows so DOM size stays flat in long sessions. Export has everything. */
export const LOG_PANEL_ROWS = 200;

function download() {
  const s = useTrickStore.getState();
  const at = new Date();
  const blob = new Blob([JSON.stringify(buildExport(s, at), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = exportFilename(at);
  a.click();
  // Revoke on the next tick so the click has started the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function EventLog() {
  const events = useTrickStore((s) => s.events);
  const scroller = useRef<HTMLDivElement>(null);
  const shown = events.length > LOG_PANEL_ROWS ? events.slice(-LOG_PANEL_ROWS) : events;

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events.length]);

  return (
    <section className="panel" aria-labelledby="eventlog-heading">
      <div className="panel__head">
        <h2 id="eventlog-heading" className="panel__title">
          Event log <span className="panel__count">{events.length}</span>
        </h2>
        <button type="button" className="btn btn--ghost btn--sm" onClick={download} disabled={events.length === 0}>
          Download JSON
        </button>
      </div>
      {events.length > LOG_PANEL_ROWS && (
        <p className="panel__note">
          Showing the latest {LOG_PANEL_ROWS} of {events.length} events. The download has all of them.
        </p>
      )}
      {/* Focusable so keyboard users can scroll it. */}
      <div className="eventlog" ref={scroller} tabIndex={0} role="region" aria-label="Event log entries">
        <table>
          <thead>
            <tr>
              <th scope="col">t (ms)</th>
              <th scope="col">Type</th>
              <th scope="col">Payload</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((e) => {
              const payload = JSON.stringify(e.payload);
              // One line per row; the title carries what the ellipsis clips, the download has everything.
              return (
                <tr key={e.id} className="eventlog__row">
                  <td className="eventlog__t">{e.t}</td>
                  <td className="eventlog__type" title={e.type}>
                    {e.type}
                  </td>
                  <td title={payload}>{payload}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
