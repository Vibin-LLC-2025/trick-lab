import { useEffect, useState } from 'react';
import { audioContext } from '../audio/context';
import { loadSound } from '../hooks/useSound';
import type { SoundPlayer } from '../audio/player';
import type { RecordedKind } from '../audio/soundSpec';
import type { SoundName } from '../audio/sounds';
import { DEFAULT_SLOW } from '../store/speed';

/** Every sound, for the arrival count. */
const SOUND_ORDER: readonly SoundName[] = ['pop', 'catch', 'land', 'bail'];
/** The rest, after the recorded impacts. */
const SYNTH_ONLY: readonly SoundName[] = ['sketchy', 'letter', 'win', 'lose'];
const NAMES: Record<SoundName, string> = {
  pop: 'Pop',
  catch: 'Catch',
  land: 'Landing',
  sketchy: 'Sketchy landing (landing and scuff)',
  bail: 'Bail',
  letter: 'Letter',
  win: 'Win',
  lose: 'Lose',
};
/** Slow motion at the lab's default slow speed. */
const SLOW = DEFAULT_SLOW;

/**
 * The sound check (step 18, ADR-73): under `?debug` in the lab, every sound
 * with a Play button for each take and for its synthesized version, at
 * normal speed and in slow motion, so each can be heard alone. Its own chunk;
 * it loads the player the way useSound does (one chunk, loaded once), and
 * plays whether or not the Sound switch is on, since every press is a
 * gesture of its own.
 */
export default function SoundCheck() {
  // The player and the spec come together from the player's chunk, so nothing here is shared with it statically.
  const [loaded, setLoaded] = useState<{ player: SoundPlayer; kinds: readonly RecordedKind[]; takes: Record<RecordedKind, readonly unknown[]> } | null>(null);
  const player = loaded?.player ?? null;
  const [, setArrived] = useState(0);
  useEffect(() => {
    let live = true;
    void loadSound().then((m) => live && setLoaded({ player: m.soundPlayer(), kinds: m.RECORDED_KINDS, takes: m.TAKES }));
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (!player) return;
    // Count the takes again once the recordings have had a moment to arrive.
    const id = setInterval(() => setArrived(SOUND_ORDER.reduce((n, k) => n + player.takes(k), 0)), 500);
    return () => clearInterval(id);
  }, [player]);
  if (!loaded || !player) return null;
  const RECORDED_KINDS = loaded.kinds;
  const TAKES = loaded.takes;
  const play = (kind: SoundName, take: number | null, rate: number) => {
    audioContext();
    player.unlock();
    player.audition(kind, take, rate);
  };
  const row = (kind: SoundName) => {
    // A sketchy landing plays the landing's takes, with the scuff over them.
    const recording: RecordedKind | null = kind === 'sketchy' ? 'land' : (RECORDED_KINDS as readonly SoundName[]).includes(kind) ? (kind as RecordedKind) : null;
    const takes = recording ? TAKES[recording].length : 0;
    return (
      <li key={kind}>
        <h3 className="fold__heading fold__heading--sub">{NAMES[kind]}</h3>
        {[1, SLOW].map((rate) => (
          <p key={rate}>
            {rate === 1 ? 'Normal speed: ' : `Slow motion (${rate}x): `}
            {Array.from({ length: takes }, (_, i) => (
              <button key={i} type="button" className="btn btn--ghost btn--sm" onClick={() => play(kind, i, rate)}>
                Take {i + 1}
              </button>
            ))}
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => play(kind, null, rate)}>
              Synthesized
            </button>
          </p>
        ))}
      </li>
    );
  };
  return (
    <section className="panel" aria-labelledby="sound-check-heading">
      <div className="panel__head">
        <h2 id="sound-check-heading" className="panel__title">
          Sound check
        </h2>
      </div>
      <p>
        Every sound alone. Recordings arrived: {RECORDED_KINDS.map((k) => `${NAMES[k]} ${player.takes(k)} of ${TAKES[k].length}`).join(', ')}. A take that has not arrived plays the synthesized version.
      </p>
      <ul>
        {RECORDED_KINDS.map(row)}
        {SYNTH_ONLY.map(row)}
      </ul>
    </section>
  );
}
