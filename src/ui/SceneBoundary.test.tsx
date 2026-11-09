import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// jsdom has no WebGL, so the real TrickScene cannot run here (ui.test.tsx stubs
// it for the same reason). Each test swaps in a stand-in for the lazy scene
// module that fails the way the real one can in a browser: the chunk import
// rejects (offline, blocked), or rendering throws (no WebGL context, a lost
// context, a renderer error that R3F rethrows into the DOM tree). The modules
// are reset per test because React keeps a lazy component's rejected import
// for the life of the module, and App's lazy() is created at module load.
// The app, the boundary and the store are the real ones.

type Scene = () => object | Promise<object>;

async function boot(scene: Scene) {
  vi.resetModules();
  vi.doMock('../scene/TrickScene', scene);
  const { App } = await import('./App');
  const { useTrickStore } = await import('../store');
  const { SCENE_UNAVAILABLE_TEXT } = await import('./SceneBoundary');
  const user = userEvent.setup();
  render(<App />);
  return { user, useTrickStore, SCENE_UNAVAILABLE_TEXT };
}

const announcer = () => document.getElementById('announcer')!;
const description = () => document.getElementById('scene-description')!;
const note = () => screen.findByRole('note', { name: '3D view unavailable' });
const FAILED = 'The 3D view stopped working. Tricks now resolve at once; the timeline, readouts and results still work.';

let warn: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  localStorage.clear();
  // The store reads its screen from the hash when it is created: these are the lab's tests (ADR-45),
  // with the timeline's section open (ADR-47).
  window.history.replaceState(null, '', '#/lab');
  localStorage.setItem('trick-lab.lab-folds', JSON.stringify(['replay', 'numbers']));
  document.documentElement.dataset.theme = 'dark';
  // React reports a caught error on console.error, the boundary on console.warn; keep the run quiet.
  error = vi.spyOn(console, 'error').mockImplementation(() => {});
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  error.mockRestore();
  warn.mockRestore();
  vi.doUnmock('../scene/TrickScene');
});

/** Pop a preset by keyboard and check it resolved at once and scored once. */
async function popResolvesAtOnce(app: Awaited<ReturnType<typeof boot>>, key: string, trick: string) {
  await app.user.keyboard(key);
  await app.user.click(screen.getByRole('button', { name: 'Pop' }));
  const s = app.useTrickStore.getState();
  expect(s.status).toBe('done');
  expect(s.result?.id).toBe(trick);
  expect(screen.getByLabelText(/^Timeline/)).toBeEnabled();
  expect(description()).toHaveTextContent('Skateboard back on the pad at its landing pose.');
}

const count = (app: Awaited<ReturnType<typeof boot>>, type: string) =>
  app.useTrickStore.getState().events.filter((e) => e.type === type).length;

describe('scene failure boundary', () => {
  it('a rejected scene import shows the note and keeps the lab working', async () => {
    const app = await boot(() => {
      throw new Error('Failed to fetch dynamically imported module');
    });
    expect(await note()).toHaveTextContent(app.SCENE_UNAVAILABLE_TEXT);
    expect(app.useTrickStore.getState().sceneUnavailable).toBe(true);
    expect(announcer()).toHaveTextContent(FAILED);
    // The rest of the app is still mounted and named.
    expect(screen.getByRole('region', { name: '3D skateboard view' })).toHaveAttribute('aria-describedby', 'scene-description');
    expect(screen.getByRole('main', { name: 'Setup' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Results' })).toBeInTheDocument();

    await popResolvesAtOnce(app, '1', 'kickflip');
    expect(announcer()).toHaveTextContent(/^Popped with .*Kickflip landed clean..*Objective complete: Land a kickflip\./);
    expect(count(app, 'trick.resolved')).toBe(1);
    expect(count(app, 'objective.completed')).toBe(1);
    expect(warn).toHaveBeenCalled();
  });

  it('a scene that throws while rendering is caught the same way, once', async () => {
    const app = await boot(() => ({
      default: () => {
        throw new Error('Error creating WebGL context.');
      },
    }));
    await note();
    expect(announcer()).toHaveTextContent(FAILED);
    const nonce = app.useTrickStore.getState().announcement.nonce;
    // A second report of the same failure says nothing more.
    act(() => app.useTrickStore.getState().setSceneUnavailable());
    expect(app.useTrickStore.getState().announcement.nonce).toBe(nonce);

    // Keyboard only: preset, then Space pops; each pop resolves at once and scores once.
    await app.user.keyboard('3');
    await app.user.keyboard(' ');
    expect(app.useTrickStore.getState().status).toBe('done');
    await app.user.keyboard(' ');
    expect(count(app, 'trick.resolved')).toBe(2);
    expect(count(app, 'objective.completed')).toBe(1);
    expect(app.useTrickStore.getState().completed).toEqual(['pop-shove-it']);
  });

  it('a failure mid-flight resolves the trick once, in one announcement with the failure', async () => {
    const app = await boot(async () => {
      const { useTrickStore } = await import('../store');
      return {
        default: function CrashOnPlay() {
          // A renderer that dies once the board starts to move (a lost WebGL context).
          if (useTrickStore((s) => s.status === 'playing')) throw new Error('WebGL context lost');
          return <div data-testid="scene-stub" />;
        },
      };
    });
    await screen.findByTestId('scene-stub');
    await app.user.keyboard('1');
    await app.user.keyboard(' ');
    await note();
    const s = app.useTrickStore.getState();
    expect(s.status).toBe('done');
    expect(s.result?.id).toBe('kickflip');
    expect(announcer()).toHaveTextContent(new RegExp(`^${FAILED.replace(/[.;]/g, '\\$&')} Kickflip landed clean...*Objective complete: Land a kickflip\\.`));
    expect(count(app, 'trick.resolved')).toBe(1);
    expect(count(app, 'objective.completed')).toBe(1);
    // The Results panel shows the outcome, and the next pop resolves at once.
    expect(screen.getByText('Kickflip landed clean')).toBeInTheDocument();
    await popResolvesAtOnce(app, '1', 'kickflip');
    expect(count(app, 'trick.resolved')).toBe(2);
    expect(count(app, 'objective.completed')).toBe(1);
  });
});
