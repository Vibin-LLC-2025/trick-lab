// What the game's sliders say before a pop (ADR-83): the landing zones on the
// flick and scoop sliders, and the one forecast line under them. Selectors
// over the store, memoized on the values they read, so a component that
// subscribes re-renders only when the answer changes. Components never
// recognize tricks (rule 1): the sim does, here.
import { forecastText } from '../sim/format';
import { popStyle, SKATE_LEVELS, turnOf, type SkateCall } from '../sim/skate';
import { landingZones, zonePlace, type ZoneKey, type ZonePlace, type Zones } from '../sim/zones';
import type { TrickState } from './types';

type ForecastState = Pick<TrickState, 'screen' | 'skate' | 'pop' | 'flick' | 'scoop' | 'popMode'>;

/** The game sets the player's sliders for each trick: Easy and Normal on the timing bar, never Hard, never Exact (ADR-83). */
export const assistOn = (s: Pick<TrickState, 'skate' | 'popMode'>) => popStyle(s.skate.level, s.popMode === 'timed') === 'assisted';

/** On the game screen, the player's go: the sliders are theirs to read. */
const playersGo = (s: ForecastState) => s.screen === 'skate' && turnOf(s.skate) === 'you';

/** The trick the player has to do now, or null (the computer's go, no call yet, no game, the lab). */
const trickToDo = (s: ForecastState): SkateCall | null => (playersGo(s) ? s.skate.call : null);

/** The zones are drawn on Easy and Normal, in either way of popping, whenever the player has a trick to do; never on Hard. */
const zonesOn = (s: ForecastState) => trickToDo(s) !== null && SKATE_LEVELS[s.skate.level].assist;

let zonesKey = '';
let zonesLast: Zones | null = null;

/** The landing zones on the flick and scoop sliders, or null where none are drawn. The same object while nothing it reads changes. */
export function sliderZones(s: ForecastState): Zones | null {
  const call = zonesOn(s) ? trickToDo(s) : null;
  if (!call) return null;
  const key = `${call.id}|${s.pop}`;
  if (key !== zonesKey) {
    zonesKey = key;
    zonesLast = landingZones(call, s.pop);
  }
  return zonesLast;
}

/** Where a slider's value is against its zone (said in its aria-valuetext), or null where no zone is drawn or it is outside. */
export function sliderPlace(s: ForecastState, key: ZoneKey): ZonePlace {
  const call = zonesOn(s) ? trickToDo(s) : null;
  return call ? zonePlace(key, call, s.pop, s[key]) : null;
}

let forecastKey = '';
let forecastLast: string | null = null;

/**
 * The forecast under the game's sliders: what they make if the pop is timed
 * right, against the trick to do (forecastText). On the player's go on the
 * game screen, at every level and in either way of popping; null otherwise.
 */
export function sliderForecast(s: ForecastState): string | null {
  if (!playersGo(s)) return null;
  const call = s.skate.call;
  const cleanOnly = SKATE_LEVELS[s.skate.level].cleanOnly;
  const key = `${call?.id ?? ''}|${cleanOnly}|${s.pop}|${s.flick}|${s.scoop}`;
  if (key !== forecastKey) {
    forecastKey = key;
    forecastLast = forecastText({ pop: s.pop, flick: s.flick, scoop: s.scoop }, call, cleanOnly);
  }
  return forecastLast;
}
