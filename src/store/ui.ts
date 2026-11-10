import type { StateCreator } from 'zustand';
import { MODEL_DECK } from '../asset/deckSpec';
import { isStance } from '../sim/feet';
import { DECK_KEY, deckAnnouncement, deckFailedAnnouncement, deckFrom } from './deck';
import { GAME_VIEW_ANNOUNCEMENT, GAME_VIEW_KEY, gameViewFrom, INSTANT_REPLAY_KEY, instantReplayFrom } from './replay';
import { animates, inFlight } from './playback';
import { readPref, savePref } from './prefs';
import { capQuality, detectQuality, effectiveQuality, isQuality } from './quality';
import { lowerTier, PACE, ranChoppy } from './pace';
import type { CameraView, LabFold, Quality, Screen, Stance, Theme, TrickState, UiSlice } from './types';

export const THEME_KEY = 'trick-lab.theme';
export const QUALITY_KEY = 'trick-lab.quality';
/** The tier an automatic step-down moved to (ADR-59): the device's pick is capped at it on later visits. */
export const QUALITY_STEP_KEY = 'trick-lab.quality-step';
/** The pre-tier setting (ADR-15); read once so an earlier "Low" choice survives the upgrade. */
export const LEGACY_DETAIL_KEY = 'trick-lab.board-detail';
export const FEET_KEY = 'trick-lab.feet';
/** The rider's legs (ADR-37). */
export const LEGS_KEY = 'trick-lab.legs';
/** Foot trails (the identifier still says paths; see types.ts). */
export const PATHS_KEY = 'trick-lab.foot-trails';
export const STANCE_KEY = 'trick-lab.stance';
export const CUES_KEY = 'trick-lab.motion-cues';
/** Motion blur on High (ADR-51). */
export const MOTION_BLUR_KEY = 'trick-lab.motion-blur';
/** Sound effects (ADR-58): 'on', or off when absent. */
export const SOUND_KEY = 'trick-lab.sound';
/** The camera preset (ADR-38). */
export const CAMERA_VIEW_KEY = 'trick-lab.camera-view';
/** The welcome screen's preview, paused or not (ADR-45). */
export const PREVIEW_KEY = 'trick-lab.preview';
/** The lab's open sections (ADR-47), as a JSON list of their ids. */
export const LAB_FOLDS_KEY = 'trick-lab.lab-folds';

export const SCREENS: readonly Screen[] = ['home', 'skate', 'lab'];

export const LAB_FOLDS: readonly LabFold[] = ['replay', 'view', 'numbers', 'feet', 'objectives', 'log'];

/** All closed, but any saved as open. A broken or foreign value counts as nothing saved. */
export function readLabFolds(): Record<LabFold, boolean> {
  const folds = Object.fromEntries(LAB_FOLDS.map((f) => [f, false])) as Record<LabFold, boolean>;
  try {
    const saved: unknown = JSON.parse(readPref(LAB_FOLDS_KEY) ?? '[]');
    if (Array.isArray(saved)) for (const f of saved) if (LAB_FOLDS.includes(f as LabFold)) folds[f as LabFold] = true;
  } catch {
    // Not JSON: start closed.
  }
  return folds;
}
const HASHES: Record<Screen, string> = { home: '', skate: '#/skate', lab: '#/lab' };

/** The URL hash for a screen (ADR-45): none for home, #/skate and #/lab. */
export const screenHash = (screen: Screen) => HASHES[screen];

/** The screen a URL hash asks for; anything unknown is home. */
export const screenFromHash = (hash: string): Screen => SCREENS.find((s) => s !== 'home' && HASHES[s] === hash) ?? 'home';

const readScreen = (): Screen => (typeof window === 'undefined' ? 'home' : screenFromHash(window.location.hash));

type PreviewState = Pick<TrickState, 'screen' | 'reducedMotion' | 'sceneUnavailable' | 'quality' | 'boardAssetFailed' | 'previewPaused'>;

/**
 * Whether the welcome screen's preview could play (ADR-45): on the home
 * screen, with motion allowed and a 3D view, and not on the Low tier, where
 * it holds one still pose so a low-end device never renders continuously.
 * Where it could, the student can pause it (PreviewToggle).
 */
export const previewCanPlay = (s: Omit<PreviewState, 'previewPaused'>) => s.screen === 'home' && animates(s) && effectiveQuality(s) !== 'low';

/** Whether the preview plays now: it could, and the student has not paused it. The frameloop is "always" only then. */
export const previewAnimates = (s: PreviewState) => previewCanPlay(s) && !s.previewPaused;

/** index.html applies the saved theme before first paint; the store starts from what it set. */
function readTheme(): Theme {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage can be blocked (private mode, managed Chromebooks); the theme still applies.
  }
}

const read = readPref;
const save = savePref;

/**
 * The saved tier wins; a legacy "Low" board detail becomes Low; otherwise the
 * device picks (ADR-16). Not needed before first paint, so read straight from storage.
 */
export function readQuality(): { quality: Quality; qualityAuto: boolean } {
  const saved = read(QUALITY_KEY);
  if (isQuality(saved)) return { quality: saved, qualityAuto: false };
  if (read(LEGACY_DETAIL_KEY) === 'low') return { quality: 'low', qualityAuto: false };
  // The device's pick, no higher than a step-down on an earlier visit (ADR-59).
  return { quality: capQuality(detectQuality(), read(QUALITY_STEP_KEY)), qualityAuto: true };
}

export const readFeetVisible = (): boolean => read(FEET_KEY) !== 'off';
/**
 * The legs (ADR-37): a saved choice wins. Without one they follow the
 * quality level: on with High and Medium, off on Low (ADR-70; off everywhere
 * from ADR-48 until then), and they change with it.
 */
export const legsByDefault = (quality: Quality): boolean => quality !== 'low';
export const readLegsVisible = (quality: Quality): boolean => {
  const saved = read(LEGS_KEY);
  return saved === 'on' ? true : saved === 'off' ? false : legsByDefault(quality);
};
/** Foot trails are off until the student switches them on. */
export const readFootPathsVisible = (): boolean => read(PATHS_KEY) === 'on';
/** Motion cues are on until the student switches them off (ADR-26). */
export const readMotionCuesVisible = (): boolean => read(CUES_KEY) !== 'off';
/** Motion blur is on until the student switches it off (ADR-51). */
export const readMotionBlur = (): boolean => read(MOTION_BLUR_KEY) !== 'off';

/** Off unless the student turned it on (ADR-58). */
export const readSoundOn = (): boolean => read(SOUND_KEY) === 'on';
/** Goofy unless regular was saved (ADR-25). */
export const readStance = (): Stance => {
  const saved = read(STANCE_KEY);
  return isStance(saved) ? saved : 'goofy';
};

export const CAMERA_VIEWS: readonly CameraView[] = ['rider', 'detail'];
export const isCameraView = (v: unknown): v is CameraView => CAMERA_VIEWS.includes(v as CameraView);
/** The rider's view unless the detail view was saved (ADR-38). */
export const readCameraView = (): CameraView => {
  const saved = read(CAMERA_VIEW_KEY);
  return isCameraView(saved) ? saved : 'rider';
};

export const CAMERA_VIEW_ANNOUNCEMENT: Record<CameraView, string> = {
  rider: "Rider's view: looking down from above the heels.",
  detail: 'Detail view: low three-quarter view from the heel side.',
};

export const STANCE_ANNOUNCEMENT: Record<Stance, string> = {
  goofy: 'Goofy stance: right foot forward, nose on the right.',
  regular: 'Regular stance: left foot forward, nose on the left.',
};

export const QUALITY_ANNOUNCEMENT: Record<Quality, string> = {
  high: 'Quality high: detailed board, shoes and shadows.',
  medium: 'Quality medium: detailed board, no shadows.',
  low: 'Quality low: simple board. Fastest.',
};

/** Said when tricks ran choppy and the tier stepped down by itself (ADR-59). */
export const STEP_DOWN_ANNOUNCEMENT: Record<Exclude<Quality, 'high'>, string> = {
  medium: 'Tricks were running slowly on this device, so quality is now medium. You can change it in View.',
  low: 'Tricks were running slowly on this device, so quality is now low. You can change it in View.',
};

/** Opens the one announcement when the motion preference turns on mid-flight (ADR-6). */
export const REDUCED_MOTION_LEAD = 'Reduced motion on: the board goes straight to its landing.';
/** The one announcement when the 3D view fails (SceneBoundary); the result follows it if a trick was in the air. */
export const SCENE_UNAVAILABLE_ANNOUNCEMENT =
  'The 3D view stopped working. Tricks now resolve at once; the timeline, readouts and results still work.';

export const createUiSlice: StateCreator<TrickState, [], [], UiSlice> = (set, get) => {
  let nonce = 0;
  const quality = readQuality();
  return {
    screen: readScreen(),
    previewPaused: read(PREVIEW_KEY) === 'paused',
    labFolds: readLabFolds(),
    perfVisible: false,
    shortcutsOpen: false,
    theme: readTheme(),
    reducedMotion: false,
    announcement: { message: '', nonce: 0 },
    focusRequest: null,
    viewResetNonce: 0,
    cameraView: readCameraView(),
    gameView: gameViewFrom(read(GAME_VIEW_KEY)),
    instantReplay: instantReplayFrom(read(INSTANT_REPLAY_KEY)),
    ...quality,
    paces: [],
    paceJudged: false,
    paceSource: null,
    boardAssetFailed: false,
    sceneUnavailable: false,
    stageReady: false,
    celebration: null,
    soundOn: readSoundOn(),
    soundCue: null,
    deck: deckFrom(read(DECK_KEY)),
    deckBefore: deckFrom(read(DECK_KEY)),
    feetVisible: readFeetVisible(),
    legsVisible: readLegsVisible(quality.quality),
    footPathsVisible: readFootPathsVisible(),
    stance: readStance(),
    motionCuesVisible: readMotionCuesVisible(),
    motionBlur: readMotionBlur(),

    setScreen: (screen) => {
      const s = get();
      if (s.screen === screen) return;
      // Leaving the game ends it, logged as quit when it was in play (ADR-45), before
      // any landing below, so a trick in the air can no longer score in it.
      if (s.screen === 'skate' && s.skate.phase !== 'off') s.quitSkate();
      // A timing bar still running goes with the screen (ADR-65); quitting the game above has already dropped and said it.
      else s.cancelPop();
      // A scrub gesture still open (its timeline is about to unmount) is committed, so its event is not lost.
      get().commitScrub();
      // A trick in the air lands now, as under reduced motion (ADR-6), so no
      // screen inherits a flight it has no controls to finish.
      if (inFlight(get())) get().land();
      // The game's roll ends with its screen (ADR-67): the lab stays on the spot, and shows no landing of its own (ADR-68).
      get().stopRoll();
      set({ screen, shortcutsOpen: false, skateLeave: null, landing: 'none', replay: 'none' });
      get().requestFocus({ kind: 'screen-heading' });
    },
    togglePreview: () => {
      const previewPaused = !get().previewPaused;
      save(PREVIEW_KEY, previewPaused ? 'paused' : 'on');
      set({ previewPaused });
      get().announce(previewPaused ? 'Preview paused.' : 'Preview playing.');
    },
    toggleLabFold: (fold) => {
      const labFolds = { ...get().labFolds, [fold]: !get().labFolds[fold] };
      save(LAB_FOLDS_KEY, JSON.stringify(LAB_FOLDS.filter((f) => labFolds[f])));
      set({ labFolds });
    },
    togglePerf: () => set((s) => ({ perfVisible: !s.perfVisible })),
    setShortcutsOpen: (open) => {
      // A dialog opening drops a running timing bar (ADR-65), and ends a replay (ADR-72).
      if (open) {
        get().cancelPop();
        set({ replay: 'none' });
      }
      set({ shortcutsOpen: open });
    },
    toggleTheme: () => {
      const theme: Theme = get().theme === 'dark' ? 'light' : 'dark';
      applyTheme(theme);
      set({ theme });
      get().announce(theme === 'light' ? 'Light theme.' : 'Dark theme.');
    },
    setReducedMotion: (reducedMotion) => {
      if (get().reducedMotion === reducedMotion) return;
      set({ reducedMotion });
      // Live change (ADR-6): a flight playing or paused stops animating and
      // resolves now, through the same path as a landing, once.
      if (reducedMotion && inFlight(get())) get().land(REDUCED_MOTION_LEAD);
      // Under reduced motion the board pops on the spot (ADR-67), and a landing shows its end at once (ADR-68).
      if (reducedMotion) {
        get().stopRoll();
        get().endLanding();
        // No replay plays under reduced motion (ADR-72).
        set({ replay: 'none' });
      }
    },
    resetView: () => {
      set((s) => ({ viewResetNonce: s.viewResetNonce + 1 }));
      get().announce('Camera view reset.');
    },
    setCameraView: (cameraView) => {
      if (get().cameraView === cameraView) return;
      save(CAMERA_VIEW_KEY, cameraView);
      set({ cameraView });
      get().announce(CAMERA_VIEW_ANNOUNCEMENT[cameraView]);
    },
    setGameView: (gameView) => {
      if (get().gameView === gameView) return;
      save(GAME_VIEW_KEY, gameView);
      set({ gameView });
      get().announce(GAME_VIEW_ANNOUNCEMENT[gameView]);
    },
    toggleInstantReplay: () => {
      const instantReplay = !get().instantReplay;
      save(INSTANT_REPLAY_KEY, instantReplay ? 'on' : 'off');
      set({ instantReplay });
      if (!instantReplay) get().endReplay();
      get().announce(instantReplay ? 'Instant replay on.' : 'Instant replay off.');
    },
    setQuality: (quality) => {
      if (get().quality === quality && !get().qualityAuto) return;
      save(QUALITY_KEY, quality);
      // The 3D view is rebuilt: a landing in play goes to its end (ADR-68).
      get().endLanding();
      // Legs nobody chose follow the level (ADR-70).
      set({ quality, qualityAuto: false, legsVisible: readLegsVisible(quality) });
      get().announce(QUALITY_ANNOUNCEMENT[quality]);
    },
    toggleFeet: () => {
      const feetVisible = !get().feetVisible;
      save(FEET_KEY, feetVisible ? 'on' : 'off');
      set({ feetVisible });
      get().announce(feetVisible ? 'Feet shown.' : 'Feet hidden.');
    },
    toggleLegs: () => {
      const legsVisible = !get().legsVisible;
      save(LEGS_KEY, legsVisible ? 'on' : 'off');
      set({ legsVisible });
      get().announce(legsVisible ? 'Legs shown.' : 'Legs hidden.');
    },

    toggleFootPaths: () => {
      const footPathsVisible = !get().footPathsVisible;
      save(PATHS_KEY, footPathsVisible ? 'on' : 'off');
      set({ footPathsVisible });
      get().announce(footPathsVisible ? 'Foot trails shown.' : 'Foot trails hidden.');
    },
    toggleMotionCues: () => {
      const motionCuesVisible = !get().motionCuesVisible;
      save(CUES_KEY, motionCuesVisible ? 'on' : 'off');
      set({ motionCuesVisible });
      get().announce(motionCuesVisible ? 'Motion cues shown.' : 'Motion cues hidden.');
    },
    toggleMotionBlur: () => {
      const motionBlur = !get().motionBlur;
      save(MOTION_BLUR_KEY, motionBlur ? 'on' : 'off');
      set({ motionBlur });
      get().announce(motionBlur ? 'Motion blur on.' : 'Motion blur off.');
    },
    setStance: (stance) => {
      if (get().stance === stance) return;
      save(STANCE_KEY, stance);
      set({ stance });
      get().announce(STANCE_ANNOUNCEMENT[stance]);
    },
    setBoardAssetFailed: () => {
      if (get().boardAssetFailed) return;
      set({ boardAssetFailed: true });
      get().announce('The board model did not load. Showing the simple board.');
    },
    setSceneUnavailable: () => {
      if (get().sceneUnavailable) return;
      set({ sceneUnavailable: true });
      // No view is left to bring a rolling board to a stop (ADR-67), or to play a landing out (ADR-68).
      get().stopRoll();
      get().endLanding();
      set({ replay: 'none' });
      // One announcement: the failure, then the result if a trick was in the air.
      if (inFlight(get())) get().land(SCENE_UNAVAILABLE_ANNOUNCEMENT);
      else get().announce(SCENE_UNAVAILABLE_ANNOUNCEMENT);
    },
    noteTrickPace: (ms) => {
      const s = get();
      // Only the device's own pick is corrected; a tier the student chose is theirs.
      if (!s.qualityAuto || s.boardAssetFailed || s.paceJudged) return null;
      const lower = lowerTier(s.quality);
      if (!lower) return null;
      const paces = [...s.paces, ms];
      if (paces.length < PACE.tricks) {
        set({ paces });
        return null;
      }
      if (!ranChoppy(paces)) {
        set({ paces, paceJudged: true });
        return null;
      }
      save(QUALITY_STEP_KEY, lower);
      // The 3D view is rebuilt on the lower level: the landing just begun goes to its end (ADR-68).
      get().endLanding();
      set({ quality: lower, paces: [], paceJudged: false, legsVisible: readLegsVisible(lower) });
      return STEP_DOWN_ANNOUNCEMENT[lower as Exclude<Quality, 'high'>];
    },
    setPaceSource: (paceSource) => set({ paceSource }),
    setStageReady: () => {
      if (!get().stageReady) set({ stageReady: true });
    },
    celebrate: (trick, clean) => set({ celebration: { nonce: (get().celebration?.nonce ?? 0) + 1, trick, clean } }),
    setDeck: (deck) => {
      const before = get().deck;
      if (before === deck) return;
      save(DECK_KEY, deck);
      set({ deck, deckBefore: before });
      get().announce(deckAnnouncement(deck));
    },
    deckFailed: (deck) => {
      const s = get();
      if (s.deck !== deck) return;
      const kept = s.deckBefore !== deck ? s.deckBefore : MODEL_DECK;
      save(DECK_KEY, kept);
      set({ deck: kept, deckBefore: kept });
      s.announce(deckFailedAnnouncement(deck, kept));
    },
    toggleSound: () => {
      const soundOn = !get().soundOn;
      save(SOUND_KEY, soundOn ? 'on' : 'off');
      set({ soundOn });
      get().announce(soundOn ? 'Sound on.' : 'Sound off.');
    },
    cue: (kind) => set({ soundCue: { nonce: (get().soundCue?.nonce ?? 0) + 1, kind } }),
    announce: (message) => set({ announcement: { message, nonce: ++nonce } }),
    requestFocus: (target) => set({ focusRequest: { ...target, nonce: ++nonce } }),
  };
};
