import { useTrickStore } from '../store';
import { TrickList } from './Tricks';
import { ShortcutsButton, SoundToggle, ThemeToggle } from './Utilities';

/**
 * The welcome screen (ADR-45, DESIGN.md 12): the title, what the app is, and
 * the two ways in. The live preview plays in the stage beside it. Each
 * choice is one button whose name is its title and whose description is its
 * line of text, so a screen reader hears both without a long name.
 */
export function Home() {
  const setScreen = useTrickStore((s) => s.setScreen);
  return (
    <main className="home" aria-labelledby="screen-heading">
      <p className="home__eyebrow">A skateboard physics lab</p>
      {/* Focus target when the student comes back here (tabIndex -1: focusable by script, not in tab order). */}
      <h1 id="screen-heading" className="home__title" tabIndex={-1}>
        Trick Lab
      </h1>
      <p className="home__lede">
        Pop, flick and scoop a skateboard and watch real physics turn it under the rider&apos;s feet. Learn the tricks, then take on the
        computer.
      </p>
      <div className="home__choices">
        <button
          type="button"
          className="choice choice--primary"
          aria-labelledby="choice-skate-title"
          aria-describedby="choice-skate-text"
          onClick={() => setScreen('skate')}
        >
          <span className="choice__title" id="choice-skate-title">
            Play a game of SKATE
          </span>
          <span className="choice__text" id="choice-skate-text">
            Take turns with the computer. Land its tricks or take a letter. Spell SKATE and you lose.
          </span>
        </button>
        <button
          type="button"
          className="choice"
          aria-labelledby="choice-lab-title"
          aria-describedby="choice-lab-text"
          onClick={() => setScreen('lab')}
        >
          <span className="choice__title" id="choice-lab-title">
            Practice in the lab
          </span>
          <span className="choice__text" id="choice-lab-text">
            Try any trick at your own pace, in slow motion, and see what each foot does.
          </span>
        </button>
      </div>
      <TrickList />
      <div className="home__utilities">
        <p className="home__hint">Works with a keyboard and a screen reader.</p>
        <ShortcutsButton label="Keyboard shortcuts" />
        <ThemeToggle />
        <SoundToggle />
      </div>
    </main>
  );
}
