// The slider guides (ADR-82): when the three arrows round the board are on
// screen. Pure; the scene draws them (GuideArrows.tsx) and the sliders show
// their colours by the same rule.
import { turnOf } from '../sim/skate';
import { effectiveQuality } from './quality';
import type { TrickState } from './types';

/**
 * On the game screen, on the player's turn, with the board at rest on the pad
 * and nothing popped yet (the go before cleared by Continue, ADR-80), on
 * Medium and High (Low gets no new features, ADR-62). A running timing bar
 * keeps them: the sliders it took are the ones they show.
 */
export const guidesShown = (s: Pick<TrickState, 'screen' | 'skate' | 'flight' | 'status' | 'quality' | 'boardAssetFailed'>) =>
  s.screen === 'skate' && turnOf(s.skate) === 'you' && s.flight === null && s.status === 'idle' && effectiveQuality(s) !== 'low';
