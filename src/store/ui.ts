import type { StateCreator } from 'zustand';
import type { BoardDetail, Theme, TrickState, UiSlice } from './types';

export const THEME_KEY = 'trick-lab.theme';
export const BOARD_DETAIL_KEY = 'trick-lab.board-detail';

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

/** The board detail is not needed before first paint, so it is read straight from storage. */
export function readBoardDetail(): BoardDetail {
  try {
    return localStorage.getItem(BOARD_DETAIL_KEY) === 'low' ? 'low' : 'high';
  } catch {
    return 'high';
  }
}

function saveBoardDetail(detail: BoardDetail) {
  try {
    localStorage.setItem(BOARD_DETAIL_KEY, detail);
  } catch {
    // Blocked storage: the choice still applies for this session.
  }
}

export const createUiSlice: StateCreator<TrickState, [], [], UiSlice> = (set, get) => {
  let nonce = 0;
  return {
    perfVisible: false,
    shortcutsOpen: false,
    theme: readTheme(),
    reducedMotion: false,
    announcement: { message: '', nonce: 0 },
    focusRequest: null,
    viewResetNonce: 0,
    boardDetail: readBoardDetail(),
    boardAssetFailed: false,

    togglePerf: () => set((s) => ({ perfVisible: !s.perfVisible })),
    setShortcutsOpen: (open) => set({ shortcutsOpen: open }),
    toggleTheme: () => {
      const theme: Theme = get().theme === 'dark' ? 'light' : 'dark';
      applyTheme(theme);
      set({ theme });
      get().announce(theme === 'light' ? 'Light theme.' : 'Dark theme.');
    },
    setReducedMotion: (reducedMotion) => set({ reducedMotion }),
    resetView: () => {
      set((s) => ({ viewResetNonce: s.viewResetNonce + 1 }));
      get().announce('Camera view reset.');
    },
    setBoardDetail: (boardDetail) => {
      if (get().boardDetail === boardDetail) return;
      saveBoardDetail(boardDetail);
      set({ boardDetail });
      get().announce(boardDetail === 'low' ? 'Board detail low: simple board.' : 'Board detail high: full model.');
    },
    setBoardAssetFailed: () => {
      if (get().boardAssetFailed) return;
      set({ boardAssetFailed: true });
      get().announce('The board model did not load. Showing the simple board.');
    },
    announce: (message) => set({ announcement: { message, nonce: ++nonce } }),
    requestFocus: (target) => set({ focusRequest: { ...target, nonce: ++nonce } }),
  };
};
