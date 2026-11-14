import type { StateCreator } from 'zustand';
import { DEFAULT_INPUTS, presetById, snapInput, type InputKey } from '../sim/tricks';
import { describeInputs, INPUT_NAMES, valueText } from '../sim/format';
import { skateActive } from '../sim/skate';
import type { InputsSlice, TrickState } from './types';

export const initialInputs = () => ({ ...DEFAULT_INPUTS, activePreset: null });

export const createInputsSlice: StateCreator<TrickState, [], [], InputsSlice> = (set, get) => ({
  ...initialInputs(),

  // Not announced: the slider's own aria-valuetext already speaks the value.
  setInput: (key: InputKey, value: number) => {
    const next = snapInput(key, value);
    if (get()[key] === next) return;
    set({ [key]: next, activePreset: null } as Pick<InputsSlice, InputKey | 'activePreset'>);
    // A slider moved while the bar runs is the setup the release pops (2026-11-13): the bar used to keep the setup
    // from Get ready, so the forecast said one trick and a release in the band made another.
    const pending = get().pendingPop;
    if (pending) set({ pendingPop: { ...pending, intended: { ...pending.intended, [key]: next } } });
    get().log('input.changed', { input: key, label: INPUT_NAMES[key], value: next, valueText: valueText(key, next) });
    // The first game's walk-through says its next prompt when the setup is reached (ADR-66).
    get().lessonMoved();
  },

  applyPreset: (id) => {
    // A preset would give the answer away in a game of SKATE (ADR-43).
    if (skateActive(get().skate)) {
      get().announce('Presets are off during a game of SKATE. Set the sliders yourself.');
      return;
    }
    const preset = presetById(id);
    set({ ...preset.inputs, activePreset: id });
    get().log('preset.applied', { preset: id, ...preset.inputs });
    get().announce(`${preset.label} preset applied: ${describeInputs(preset.inputs)}.`);
  },
});
