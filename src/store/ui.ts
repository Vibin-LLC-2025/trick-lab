import type { StateCreator } from 'zustand';
import { isStance } from '../sim/feet';
import { animates, inFlight } from './playback';
import { readPref, savePref } from './prefs';
import { detectQuality, effectiveQuality, isQuality } from './quality';
import type { CameraView, Quality, Screen, Stance, Theme, TrickState, UiSlice } from './types';

export const THEME_KEY = 'trick-lab.theme';
export const QUALITY_KEY = 'trick-lab.quality';
/** The pre-tier setting (ADR-15); read once so an earlier "Low" choice survives the upgrade. */
export const LEGACY_DETAIL_KEY = 'trick-lab.board-detail';
export const FEET_KEY = 'trick-lab.feet';
/** The rider's legs (ADR-37). */
export const LEGS_KEY = 'trick-lab.legs';
/** Foot trails (the identifier still says paths; see types.ts). */
export const PATHS_KEY = 'trick-lab.foot-trails';
export const STANCE_KEY = 'trick-lab.stance';
export const CUES_KEY = 'trick-lab.motion-cues';
/** The camera preset (ADR-38). */
export const CAMERA_VIEW_KEY = 'trick-lab.camera-view';
/** The welcome screen's preview, paused or not (ADR-45). */
export const PREVIEW_KEY = 'trick-lab.preview';

export const SCREENS: readonly Screen[] = ['home', 'skate', 'lab'];
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
  return { quality: detectQuality(), qualityAuto: true };
}

export const readFeetVisible = (): boolean => read(FEET_KEY) !== 'off';
/** Legs are on until the student switches them off (ADR-37). */
export const readLegsVisible = (): boolean => read(LEGS_KEY) !== 'off';
/** Foot trails are off until the student switches them on. */
export const readFootPathsVisible = (): boolean => read(PATHS_KEY) === 'on';
/** Motion cues are on until the student switches them off (ADR-26). */
export const readMotionCuesVisible = (): boolean => read(CUES_KEY) !== 'off';
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

/** Opens the one announcement when the motion preference turns on mid-flight (ADR-6). */
export const REDUCED_MOTION_LEAD = 'Reduced motion on: the board goes straight to its landing.';
/** The one announcement when the 3D view fails (SceneBoundary); the result follows it if a trick was in the air. */
export const SCENE_UNAVAILABLE_ANNOUNCEMENT =
  'The 3D view stopped working. Tricks now resolve at once; the timeline, readouts and results still work.';

export const createUiSlice: StateCreator<TrickState, [], [], UiSlice> = (set, get) => {
  let nonce = 0;
  return {
    screen: readScreen(),
    previewPaused: read(PREVIEW_KEY) === 'paused',
    perfVisible: false,
    shortcutsOpen: false,
    theme: readTheme(),
    reducedMotion: false,
    announcement: { message: '', nonce: 0 },
    focusRequest: null,
    viewResetNonce: 0,
    cameraView: readCameraView(),
    ...readQuality(),
    boardAssetFailed: false,
    sceneUnavailable: false,
    feetVisible: readFeetVisible(),
    legsVisible: readLegsVisible(),
    footPathsVisible: readFootPathsVisible(),
    stance: readStance(),
    motionCuesVisible: readMotionCuesVisible(),

    setScreen: (screen) => {
      const s = get();
      if (s.screen === screen) return;
      // Leaving the game ends it, logged as quit when it was in play (ADR-45), before
      // any landing below, so a trick in the air can no longer score in it.
      if (s.screen === 'skate' && s.skate.phase !== 'off') s.quitSkate();
      // A scrub gesture still open (its timeline is about to unmount) is committed, so its event is not lost.
      get().commitScrub();
      // A trick in the air lands now, as under reduced motion (ADR-6), so no
      // screen inherits a flight it has no controls to finish.
      if (inFlight(get())) get().land();
      set({ screen, shortcutsOpen: false, skateLeave: null });
      get().requestFocus({ kind: 'screen-heading' });
    },
    togglePreview: () => {
      const previewPaused = !get().previewPaused;
      save(PREVIEW_KEY, previewPaused ? 'paused' : 'on');
      set({ previewPaused });
      get().announce(previewPaused ? 'Preview paused.' : 'Preview playing.');
    },
    togglePerf: () => set((s) => ({ perfVisible: !s.perfVisible })),
    setShortcutsOpen: (open) => set({ shortcutsOpen: open }),
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
    setQuality: (quality) => {
      if (get().quality === quality && !get().qualityAuto) return;
      save(QUALITY_KEY, quality);
      set({ quality, qualityAuto: false });
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
      // One announcement: the failure, then the result if a trick was in the air.
      if (inFlight(get())) get().land(SCENE_UNAVAILABLE_ANNOUNCEMENT);
      else get().announce(SCENE_UNAVAILABLE_ANNOUNCEMENT);
    },
    announce: (message) => set({ announcement: { message, nonce: ++nonce } }),
    requestFocus: (target) => set({ focusRequest: { ...target, nonce: ++nonce } }),
  };
};
