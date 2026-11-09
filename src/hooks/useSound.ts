import { useEffect } from 'react';
import { soundPlayer, type SoundPlayer } from '../audio/player';
import { useTrickStore } from '../store';

/**
 * Plays the store's sound cues while sound is on (ADR-58). Subscribes to the
 * store outside React's render, so a cue set inside a click or a key press
 * (the sound switch, Pop) plays inside that user gesture, which browsers
 * require before audio may start. Turning sound on unlocks the audio and
 * plays the pop, so the student hears what they turned on. Each cue plays
 * once (by its nonce), at the speed in use, so the board's sounds follow
 * slow motion; the landing's cue comes when the slowed flight lands.
 */
export function useSound(player: SoundPlayer = soundPlayer()) {
  useEffect(() => {
    let heard = useTrickStore.getState().soundCue?.nonce ?? 0;
    return useTrickStore.subscribe((s, prev) => {
      if (s.soundOn && !prev.soundOn) {
        player.unlock();
        player.play('pop', 1);
      }
      const cue = s.soundCue;
      if (!cue || cue.nonce === heard) return;
      heard = cue.nonce;
      if (s.soundOn) player.play(cue.kind, s.rate);
    });
  }, [player]);
}
