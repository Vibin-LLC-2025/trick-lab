// The page's one AudioContext (ADR-58, ADR-73). Small on purpose: it is in
// the first page download, while the player and its sounds are a chunk of
// their own, downloaded when sound is first turned on. Browsers only let an
// AudioContext run after a user gesture, and the player's chunk may still be
// on its way during the gesture that turned sound on, so useSound makes or
// resumes the context here, inside that gesture, and the player picks it up.

let ctx: AudioContext | null | undefined;

/** Makes the context on first use (null where there is no Web Audio, as in jsdom) and resumes it if the browser holds it. */
export function audioContext(): AudioContext | null {
  if (ctx === undefined || ctx?.state === 'closed') {
    const Ctor =
      typeof window === 'undefined' ? undefined : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    ctx = Ctor ? new Ctor() : null;
  }
  if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => {});
  return ctx;
}
