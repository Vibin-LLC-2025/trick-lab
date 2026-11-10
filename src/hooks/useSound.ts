import { useEffect, useRef } from 'react';
import { audioContext } from '../audio/context';
import type { SoundPlayer } from '../audio/player';
import { rollMotion } from '../scene/rollState';
import { useTrickStore } from '../store';
import { catchIn, rollSound } from '../store/sound';

/**
 * The player's chunk (ADR-73): downloaded the first time sound is on, once
 * per page. The one place that imports it, so the bundler keeps it a single
 * chunk of its own (the sound check gets it from here too).
 */
let loading: Promise<typeof import('../audio/player')> | null = null;
export const loadSound = () => (loading ??= import('../audio/player'));
const loadPlayer = () => loadSound().then((m) => m.soundPlayer());

/**
 * Plays the store's sound cues while sound is on (ADR-58, ADR-73). Subscribes
 * to the store outside React's render, so a cue set inside a click or a key
 * press (the sound switch, Pop) plays inside that user gesture, which
 * browsers require before audio may start.
 * - The player and its recordings are downloaded only once sound is on: on
 *   the switch's press (whose gesture makes the audio context at once, in
 *   audio/context.ts, so the player finds it running), or at mount when sound
 *   was saved on. Turning sound on plays the pop, so the student hears what
 *   they turned on.
 * - Turning it off silences everything still queued or rolling.
 * - Each cue plays once (by its nonce), at the speed in use, so the board's
 *   sounds follow slow motion; the landing's cue comes when the slowed flight
 *   lands.
 * - The timing bar (ADR-65) starts its tone and ticks inside the press that
 *   started it, and they are cut when it is released or dropped.
 * - The catch is scheduled from the flight's timing whenever a flight starts,
 *   resumes, pauses or changes speed (catchIn in store/sound.ts), and the
 *   rolling sound follows the store's roll (rollSound), reading the speed
 *   FlightDriver last wrote. Neither is touched per frame.
 * With sound saved on, the page's first click or key unlocks the audio too,
 * so a first cue from a timer (the computer's own turn) never has to start it
 * outside a gesture. A player can be passed in (tests); otherwise the page's
 * own is loaded.
 */
export function useSound(injected?: SoundPlayer) {
  const soundOn = useTrickStore((s) => s.soundOn);
  const player = useRef<SoundPlayer | null>(injected ?? null);

  useEffect(() => {
    const store = useTrickStore;
    const roll = (p: SoundPlayer) => {
      const s = store.getState();
      p.roll(rollSound(s), s.rate, () => rollMotion);
    };
    const catchUp = (p: SoundPlayer) => {
      const s = store.getState();
      p.catchIn(catchIn(s, store.playhead), s.rate);
    };
    /** Runs `fn` with the player now, or once its chunk has arrived. */
    const withPlayer = (fn: (p: SoundPlayer) => void) => {
      if (player.current) fn(player.current);
      else
        void loadPlayer().then((p) => {
          player.current = p;
          if (store.getState().soundOn) fn(p);
        });
    };
    if (store.getState().soundOn) withPlayer(() => {});
    let heard = store.getState().soundCue?.nonce ?? 0;
    return store.subscribe((s, prev) => {
      if (s.soundOn && !prev.soundOn) {
        audioContext();
        withPlayer((p) => {
          p.unlock();
          p.play('pop', 1);
          roll(p);
          catchUp(p);
        });
      } else if (!s.soundOn && prev.soundOn) player.current?.stop();
      const p = player.current;
      if (p && s.soundOn) {
        if (s.pendingPop !== prev.pendingPop) {
          if (!s.pendingPop) p.stopBar();
          else p.bar();
        }
        if (rollSound(s) !== rollSound(prev) || (s.rate !== prev.rate && rollSound(s) !== 'off')) roll(p);
        if (s.status !== prev.status || s.flightId !== prev.flightId || s.rate !== prev.rate) catchUp(p);
      } else if (p && s.pendingPop !== prev.pendingPop && !s.pendingPop) p.stopBar();
      const cue = s.soundCue;
      if (!cue || cue.nonce === heard) return;
      heard = cue.nonce;
      if (p && s.soundOn) p.play(cue.kind, s.rate);
    });
  }, []);

  useEffect(() => {
    if (!soundOn) return;
    const unlock = () => {
      audioContext();
      player.current?.unlock();
    };
    const options = { capture: true, once: true } as const;
    window.addEventListener('pointerdown', unlock, options);
    window.addEventListener('keydown', unlock, options);
    return () => {
      window.removeEventListener('pointerdown', unlock, options);
      window.removeEventListener('keydown', unlock, options);
    };
  }, [soundOn]);
}
