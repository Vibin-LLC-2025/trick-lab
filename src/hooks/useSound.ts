import { useEffect } from 'react';
import { soundPlayer, type SoundPlayer } from '../audio/player';
import { useTrickStore } from '../store';

/**
 * Plays the store's sound cues while sound is on (ADR-58). Subscribes to the
 * store outside React's render, so a cue set inside a click or a key press
 * (the sound switch, Pop) plays inside that user gesture, which browsers
 * require before audio may start. Turning sound on unlocks the audio and
 * plays the pop, so the student hears what they turned on; turning it off
 * silences what is still queued (a letter and a jingle after a landing).
 * Each cue plays once (by its nonce), at the speed in use, so the board's
 * sounds follow slow motion; the landing's cue comes when the slowed flight
 * lands. With sound saved on, the page's first click or key unlocks the
 * audio too, so a first cue from a timer (the computer's own turn) never has
 * to start it outside a gesture. The timing bar (ADR-65) is heard the same
 * way: when the store starts one its tone and ticks start, inside the press
 * that started it, and they are cut when it is released or dropped.
 */
export function useSound(player: SoundPlayer = soundPlayer()) {
  const soundOn = useTrickStore((s) => s.soundOn);

  useEffect(() => {
    let heard = useTrickStore.getState().soundCue?.nonce ?? 0;
    return useTrickStore.subscribe((s, prev) => {
      if (s.soundOn && !prev.soundOn) {
        player.unlock();
        player.play('pop', 1);
      } else if (!s.soundOn && prev.soundOn) player.stop();
      if (s.pendingPop !== prev.pendingPop) {
        if (!s.pendingPop) player.stopBar();
        else if (s.soundOn) player.bar();
      }
      const cue = s.soundCue;
      if (!cue || cue.nonce === heard) return;
      heard = cue.nonce;
      if (s.soundOn) player.play(cue.kind, s.rate);
    });
  }, [player]);

  useEffect(() => {
    if (!soundOn) return;
    const unlock = () => player.unlock();
    const options = { capture: true, once: true } as const;
    window.addEventListener('pointerdown', unlock, options);
    window.addEventListener('keydown', unlock, options);
    return () => {
      window.removeEventListener('pointerdown', unlock, options);
      window.removeEventListener('keydown', unlock, options);
    };
  }, [soundOn, player]);
}
