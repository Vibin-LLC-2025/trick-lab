import { useEffect, useState } from 'react';
import { useTrickStore } from '../store';
import { perfStats } from '../scene/perfStats';

type Snapshot = typeof perfStats;

/**
 * Developer overlay, toggled with p. Polls perfStats twice a second only while visible. Shown in
 * the lab only, where its switch and its key are (ADR-45); it comes back on return there.
 */
export function PerfBadge() {
  const visible = useTrickStore((s) => s.perfVisible && s.screen === 'lab');
  const [snap, setSnap] = useState<Snapshot | null>(null);

  useEffect(() => {
    if (!visible) return;
    const tick = () => setSnap({ ...perfStats });
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 500);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [visible]);

  return (
    <div className="perf-badge" hidden={!visible} aria-label="Performance stats">
      {snap && (
        <>
          <span>{snap.renderMs.toFixed(2)} ms render</span>
          <span>{snap.drawCalls} calls</span>
          <span>{(snap.triangles / 1000).toFixed(1)}k tris</span>
          <span>{snap.geometries} geo</span>
          <span>{snap.frames} frames</span>
        </>
      )}
    </div>
  );
}
