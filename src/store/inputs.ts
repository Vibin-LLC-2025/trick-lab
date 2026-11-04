import type { StateCreator } from 'zustand';
import { DEFAULT_INPUTS, presetById, snapInput, type InputKey } from '../sim/tricks';
import { describeInputs, INPUT_NAMES, valueText } from '../sim/format';
import type { InputsSlice, TrickState } from './types';

export const initialInputs = () => ({ ...DEFAULT_INPUTS, activePreset: null });

export const createInputsSlice: StateCreator<TrickState, [], [], InputsSlice> = (set, get) => ({
  ...initialInputs(),

  // Not announced: the slider's own aria-valuetext already speaks the value.
  setInput: (key: InputKey, value: number) => {
    const next = snapInput(key, value);
    if (get()[key] === next) return;
    set({ [key]: next, activePreset: null } as Pick<InputsSlice, InputKey | 'activePreset'>);
    get().log('input.changed', { input: key, label: INPUT_NAMES[key], value: next, valueText: valueText(key, next) });
  },

  applyPreset: (id) => {
    const preset = presetById(id);
    set({ ...preset.inputs, activePreset: id });
    get().log('preset.applied', { preset: id, ...preset.inputs });
    get().announce(`${preset.label} preset applied: ${describeInputs(preset.inputs)}.`);
  },
});
